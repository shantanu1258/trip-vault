-- Preserve per-traveler seat and passenger details when a booking uses
-- Everyone scope. Everyone removes redundant participant assignment rows; it
-- does not make a traveler's leg allocation stale.

begin;

create or replace function public.canonicalize_parent_participant_scope()
returns trigger language plpgsql security definer set search_path = public as $function$
declare
  row_data jsonb := to_jsonb(new);
begin
  -- bookings and itinerary_items have different composite row types. Read
  -- table-specific fields from JSON so PostgreSQL never tries to resolve
  -- NEW.participant_scope on itinerary_items (or the inverse field on bookings).
  if tg_table_name = 'bookings' then
    if coalesce(row_data->>'participant_scope', '') = 'everyone' then
      -- Everyone has no explicit participant rows, but its travelers may still
      -- have seats, boarding details, and passenger references on individual
      -- legs. Those allocations remain valid and must survive the scope change.
      delete from public.booking_travelers assignment
      where assignment.booking_id = new.id;
    end if;
  elsif tg_table_name = 'itinerary_items' then
    if coalesce((row_data->>'applies_to_all_travelers')::boolean, false) then
      delete from public.itinerary_participants assignment
      where assignment.itinerary_item_id = new.id;
    end if;
  else
    raise exception 'Unexpected participant-scope parent trigger table: %', tg_table_name;
  end if;
  return new;
end
$function$;

create or replace function public.sync_booking_participants(
  requested_booking_id uuid,
  requested_scope public.participant_scope,
  requested_traveler_ids uuid[] default '{}',
  requested_itinerary_item_id uuid default null,
  requested_itinerary_version integer default null
)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare
  actor uuid := auth.uid();
  target_trip_id uuid;
  selected_traveler_ids uuid[];
  linked_item public.itinerary_items%rowtype;
  saved_booking jsonb;
  saved_itinerary jsonb;
begin
  if actor is null then raise exception 'Sign in before changing booking travelers'; end if;

  select booking.trip_id into target_trip_id
  from public.bookings booking
  where booking.id = requested_booking_id and booking.deleted_at is null
  for update;
  if not found or not public.can_edit_trip(target_trip_id) then
    raise exception 'Booking travelers cannot be changed';
  end if;

  select coalesce(array_agg(distinct selected.selected_id), '{}'::uuid[])
  into selected_traveler_ids
  from unnest(coalesce(requested_traveler_ids, '{}'::uuid[])) as selected(selected_id)
  where selected.selected_id is not null;

  if requested_scope = 'everyone' and cardinality(selected_traveler_ids) <> 0 then
    raise exception 'Everyone cannot contain selected travelers';
  end if;
  if requested_scope = 'selected' and cardinality(selected_traveler_ids) = 0 then
    raise exception 'Select at least one traveler';
  end if;
  if exists (
    select 1 from unnest(selected_traveler_ids) as selected(selected_id)
    where not exists (
      select 1 from public.travelers traveler
      where traveler.id = selected.selected_id
        and traveler.trip_id = target_trip_id
        and traveler.removed_at is null
    )
  ) then
    raise exception 'Selected traveler must belong to the trip';
  end if;

  if requested_itinerary_item_id is not null then
    select item.* into linked_item
    from public.itinerary_items item
    where item.id = requested_itinerary_item_id and item.deleted_at is null
    for update;
    if not found
      or linked_item.trip_id <> target_trip_id
      or (linked_item.booking_id is not null and linked_item.booking_id <> requested_booking_id) then
      raise exception 'This event cannot be attached to the booking';
    end if;
    if requested_itinerary_version is not null and linked_item.version <> requested_itinerary_version then
      raise exception 'version_conflict';
    end if;
    update public.itinerary_items
    set booking_id = requested_booking_id,
        applies_to_all_travelers = requested_scope = 'everyone'
    where id = requested_itinerary_item_id;
  end if;

  perform item.id
  from public.itinerary_items item
  where item.booking_id = requested_booking_id
  for update;

  -- Selected scope permits allocations only for travelers who remain on its
  -- explicit roster. Everyone includes all active trip travelers, so changing
  -- to or re-saving Everyone must preserve their per-leg details.
  delete from public.flight_leg_travelers allocation
  using public.flight_legs leg
  where allocation.flight_leg_id = leg.id
    and leg.booking_id = requested_booking_id
    and requested_scope = 'selected'
    and allocation.traveler_id <> all(selected_traveler_ids);
  delete from public.journey_leg_travelers allocation
  using public.journey_legs leg
  where allocation.journey_leg_id = leg.id
    and leg.booking_id = requested_booking_id
    and requested_scope = 'selected'
    and allocation.traveler_id <> all(selected_traveler_ids);

  delete from public.booking_travelers assignment
  where assignment.booking_id = requested_booking_id;
  update public.bookings booking
  set participant_scope = requested_scope
  where booking.id = requested_booking_id
    and booking.participant_scope is distinct from requested_scope;
  if requested_scope = 'selected' then
    insert into public.booking_travelers (booking_id, traveler_id)
    select requested_booking_id, selected.selected_id
    from unnest(selected_traveler_ids) as selected(selected_id);
  end if;

  delete from public.itinerary_participants assignment
  where assignment.itinerary_item_id in (
    select item.id from public.itinerary_items item
    where item.booking_id = requested_booking_id
  );
  update public.itinerary_items item
  set applies_to_all_travelers = requested_scope = 'everyone'
  where item.booking_id = requested_booking_id
    and item.applies_to_all_travelers is distinct from (requested_scope = 'everyone');

  if requested_scope = 'selected' then
    insert into public.itinerary_participants (itinerary_item_id, traveler_id)
    select item.id, selected.selected_id
    from public.itinerary_items item
    cross join unnest(selected_traveler_ids) as selected(selected_id)
    where item.booking_id = requested_booking_id;
  end if;

  select to_jsonb(booking) into saved_booking
  from public.bookings booking
  where booking.id = requested_booking_id;
  select coalesce(jsonb_agg(to_jsonb(item) order by item.starts_at, item.sort_key, item.id), '[]'::jsonb)
  into saved_itinerary
  from public.itinerary_items item
  where item.booking_id = requested_booking_id;

  return jsonb_build_object('booking', saved_booking, 'itinerary_items', saved_itinerary);
end
$function$;

revoke all on function public.canonicalize_parent_participant_scope() from public, anon, authenticated;
revoke all on function public.sync_booking_participants(uuid, public.participant_scope, uuid[], uuid, integer) from public, anon;
grant execute on function public.sync_booking_participants(uuid, public.participant_scope, uuid[], uuid, integer) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
