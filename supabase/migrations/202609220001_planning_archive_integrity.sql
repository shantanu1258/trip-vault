-- Follow-up to Planning / Activity Moments. No records are deleted by installation.
-- Preserve optional links during archive deletion and validate Moment cost parents.
begin;

create or replace function public.enforce_planning_item_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  target_trip_id uuid;
begin
  -- FK cleanup must remain possible when either event is archived. Clearing a
  -- link also clears its promotion timestamp to preserve the shape constraint.
  if tg_op = 'UPDATE' and old.linked_itinerary_item_id is not null
    and new.linked_itinerary_item_id is null
    and new.planning_event_id = old.planning_event_id
    and new.timezone = old.timezone then
    new.promoted_at := null;
    return new;
  end if;
  select item.trip_id
  into target_trip_id
  from public.itinerary_items item
  where item.id = new.planning_event_id
    and item.event_type::text = 'preparation'
    and item.deleted_at is null;

  if target_trip_id is null then
    raise exception 'Planning items must belong to an active Planning event';
  end if;
  if not public.valid_iana_timezone(new.timezone) then
    raise exception 'Choose a valid planning-item time zone';
  end if;
  if new.linked_itinerary_item_id = new.planning_event_id then
    raise exception 'A Planning event cannot promote an item into itself';
  end if;
  if new.linked_itinerary_item_id is not null and not exists (
    select 1
    from public.itinerary_items linked
    where linked.id = new.linked_itinerary_item_id
      and linked.trip_id = target_trip_id
      and linked.deleted_at is null
  ) then
    raise exception 'A promoted event must belong to the same trip';
  end if;
  return new;
end
$function$;


create or replace function public.enforce_activity_moment_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  target_trip_id uuid;
begin
  -- Deleting a source plan must not delete or invalidate an archived Moment.
  if tg_op = 'UPDATE' and old.source_planning_item_id is not null
    and new.source_planning_item_id is null
    and new.itinerary_item_id = old.itinerary_item_id
    and new.timezone = old.timezone then
    return new;
  end if;
  select item.trip_id
  into target_trip_id
  from public.itinerary_items item
  where item.id = new.itinerary_item_id
    and item.event_type::text = 'activity'
    and item.deleted_at is null;

  if target_trip_id is null then
    raise exception 'Activity Moments must belong to an active activity event';
  end if;
  if not public.valid_iana_timezone(new.timezone) then
    raise exception 'Choose a valid Moment time zone';
  end if;
  if new.source_planning_item_id is not null and not exists (
    select 1
    from public.planning_items plan_item
    join public.itinerary_items plan
      on plan.id = plan_item.planning_event_id
    where plan_item.id = new.source_planning_item_id
      and plan_item.deleted_at is null
      and plan.trip_id = target_trip_id
      and plan.deleted_at is null
  ) then
    raise exception 'A source plan item must belong to the same trip';
  end if;
  return new;
end
$function$;


create or replace function public.enforce_trip_cost_activity_moment()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if new.activity_moment_id is not null and not exists (
    select 1
    from public.activity_moments moment
    join public.itinerary_items item on item.id = moment.itinerary_item_id
    where moment.id = new.activity_moment_id
      and moment.deleted_at is null
      and item.deleted_at is null
      and item.trip_id = new.trip_id
      and (new.itinerary_item_id is null or new.itinerary_item_id = item.id)
      and new.booking_id is null
      and new.cab_stop_id is null
  ) then
    raise exception 'An activity-Moment cost must match its parent activity and trip';
  end if;
  return new;
end
$function$;


drop trigger if exists trip_cost_activity_moment on public.trip_costs;
create trigger trip_cost_activity_moment
before insert or update of activity_moment_id, trip_id, itinerary_item_id, booking_id, cab_stop_id
on public.trip_costs
for each row execute function public.enforce_trip_cost_activity_moment();

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
      set itinerary_item_id = null, booking_id = null, cab_stop_id = null, activity_moment_id = null
      where trip_id = requested_trip_id and
        (itinerary_item_id = any(target_events) or booking_id = target_booking
          or activity_moment_id in (
            select id from public.activity_moments where itinerary_item_id = any(target_events)
          ));
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

-- Swap adjacent rows atomically; three independent HTTP updates could leave
-- an item at its temporary position after a disconnect or concurrent edit.
create or replace function public.reorder_agenda_items(
  requested_table text, requested_parent_id uuid,
  first_item_id uuid, second_item_id uuid,
  first_version integer default null, second_version integer default null
) returns void language plpgsql security definer set search_path = public as $function$
declare
  parent_column text;
  order_column text;
  expected_type text;
  parent_trip uuid;
  first_order integer;
  second_order integer;
  first_current_version integer;
  second_current_version integer;
  temporary_order integer;
  between_items boolean;
begin
  if requested_table = 'planning_items' then
    parent_column := 'planning_event_id'; order_column := 'item_order'; expected_type := 'preparation';
  elsif requested_table = 'activity_moments' then
    parent_column := 'itinerary_item_id'; order_column := 'moment_order'; expected_type := 'activity';
  else
    raise exception 'Unsupported agenda type';
  end if;
  select trip_id into parent_trip from public.itinerary_items
    where id = requested_parent_id and event_type::text = expected_type and deleted_at is null
    for update;
  if parent_trip is null or auth.uid() is null or not public.can_edit_trip(parent_trip) then
    raise exception 'You cannot reorder this agenda';
  end if;
  if first_item_id = second_item_id then raise exception 'Choose two different agenda items'; end if;
  execute format('select %I, version from public.%I where id=$1 and %I=$2 and deleted_at is null for update', order_column, requested_table, parent_column)
    into first_order, first_current_version using first_item_id, requested_parent_id;
  execute format('select %I, version from public.%I where id=$1 and %I=$2 and deleted_at is null for update', order_column, requested_table, parent_column)
    into second_order, second_current_version using second_item_id, requested_parent_id;
  if first_order is null or second_order is null
    or (first_version is not null and first_version <> first_current_version)
    or (second_version is not null and second_version <> second_current_version) then
    raise exception 'This agenda changed on another device. Refresh and retry';
  end if;
  execute format('select exists(select 1 from public.%I where %I=$1 and deleted_at is null and %I > $2 and %I < $3)', requested_table, parent_column, order_column, order_column)
    into between_items using requested_parent_id, least(first_order,second_order), greatest(first_order,second_order);
  if between_items then raise exception 'These items are no longer adjacent. Refresh and retry'; end if;
  execute format('select coalesce(max(%I),0)+1 from public.%I where %I=$1 and deleted_at is null', order_column, requested_table, parent_column)
    into temporary_order using requested_parent_id;
  execute format('update public.%I set %I=$1 where id=$2', requested_table, order_column) using temporary_order, first_item_id;
  execute format('update public.%I set %I=$1 where id=$2', requested_table, order_column) using first_order, second_item_id;
  execute format('update public.%I set %I=$1 where id=$2', requested_table, order_column) using second_order, first_item_id;
end;
$function$;
revoke all on function public.reorder_agenda_items(text, uuid, uuid, uuid, integer, integer) from public, anon;
grant execute on function public.reorder_agenda_items(text, uuid, uuid, uuid, integer, integer) to authenticated;

commit;
notify pgrst, 'reload schema';
