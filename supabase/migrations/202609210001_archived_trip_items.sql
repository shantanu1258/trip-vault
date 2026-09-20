-- Explicit, permission-checked deletion of already archived trip items only.
-- Does not delete any existing data when this migration is applied.
begin;

create or replace function public.delete_archived_trip_item(
  requested_trip_id uuid,
  requested_item_id uuid,
  requested_kind text
) returns void language plpgsql security definer set search_path = public as $function$
declare
  item public.itinerary_items%rowtype;
  target_booking uuid;
  target_events uuid[];
  affected integer;
begin
  if auth.uid() is null or not public.can_edit_trip(requested_trip_id) then
    raise exception 'You cannot delete items from this trip';
  end if;

  if requested_kind = 'task' then
    delete from public.trip_requirements
    where id = requested_item_id and trip_id = requested_trip_id and deleted_at is not null;
  elsif requested_kind = 'note' then
    delete from public.notes
    where id = requested_item_id and trip_id = requested_trip_id and deleted_at is not null;
  elsif requested_kind = 'cost' then
    delete from public.trip_costs
    where id = requested_item_id and trip_id = requested_trip_id and deleted_at is not null;
  elsif requested_kind in ('event', 'booking') then
    select * into item from public.itinerary_items
      where id = requested_item_id and trip_id = requested_trip_id and deleted_at is not null
      for update;
    if not found then raise exception 'This item is no longer archived. Refresh the archive'; end if;
    if requested_kind = 'booking' then
      target_booking := item.booking_id;
      perform 1 from public.bookings
        where id = target_booking and trip_id = requested_trip_id and deleted_at is not null
        for update;
      if not found then raise exception 'This booking is not archived. Refresh the archive'; end if;
      perform 1 from public.itinerary_items where booking_id = target_booking for update;
      if exists (select 1 from public.itinerary_items
        where booking_id = target_booking and (deleted_at is null or trip_id <> requested_trip_id)) then
        raise exception 'Archive every event in this booking before deleting it';
      end if;
      select array_agg(id) into target_events from public.itinerary_items where booking_id = target_booking;
    else
      if item.booking_id is not null then raise exception 'Delete this item through its archived booking'; end if;
      target_events := array[item.id];
    end if;

    -- Never cascade-delete tasks or silently remove their scheduling anchor.
    if exists (select 1 from public.trip_requirements where anchor_itinerary_item_id = any(target_events))
      or exists (select 1 from public.itinerary_items where anchor_itinerary_item_id = any(target_events)) then
      raise exception 'Other tasks or events are scheduled relative to this item. Restore and unlink them before deleting it';
    end if;

    -- Clear all association columns together before FK actions fire. Otherwise
    -- the cost association guard can reject the remaining archived booking/event.
    update public.trip_costs
      set itinerary_item_id = null, booking_id = null, cab_stop_id = null
      where trip_id = requested_trip_id and
        (itinerary_item_id = any(target_events) or booking_id = target_booking);
    delete from public.itinerary_items where id = any(target_events);
    if target_booking is not null then
      -- Clear these together so document relationship guards never observe a
      -- leg whose parent booking has just been deleted during a cascade.
      update public.documents set booking_id = null, flight_leg_id = null, journey_leg_id = null
        where trip_id = requested_trip_id and (booking_id = target_booking
          or flight_leg_id in (select id from public.flight_legs where booking_id = target_booking)
          or journey_leg_id in (select id from public.journey_legs where booking_id = target_booking));
      -- Documents and costs survive; their nullable FKs are cleared by Postgres.
      delete from public.bookings where id = target_booking and trip_id = requested_trip_id;
    end if;
    return;
  else
    raise exception 'Unsupported archived item type';
  end if;
  get diagnostics affected = row_count;
  if affected = 0 then raise exception 'This item is no longer archived. Refresh the archive'; end if;
end;
$function$;

revoke all on function public.delete_archived_trip_item(uuid, uuid, text) from public, anon;
grant execute on function public.delete_archived_trip_item(uuid, uuid, text) to authenticated;

commit;
