-- Event-form data model: explicit booking state/scope, typed journey details,
-- per-traveler journey allocations, and atomic hotel milestones.
-- Safe to re-run after 202609130007_relative_event_timing.sql.

begin;

do $migration$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'booking_reservation_state') then
    create type public.booking_reservation_state as enum ('planned', 'walk_up', 'booked');
  end if;
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'participant_scope') then
    create type public.participant_scope as enum ('everyone', 'selected');
  end if;
end
$migration$;

do $migration$
declare
  had_reservation_state boolean;
  had_participant_scope boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'reservation_state'
  ) into had_reservation_state;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'participant_scope'
  ) into had_participant_scope;

  alter table public.bookings
    add column if not exists reservation_state public.booking_reservation_state not null default 'booked',
    add column if not exists participant_scope public.participant_scope not null default 'everyone';

  -- Removed travelers must not influence the one-time legacy scope inference.
  -- Keep these deletes outside the first-run branches so rerunning the
  -- migration repairs stale assignment rows left by an interrupted removal.
  delete from public.booking_travelers assignment
  using public.travelers traveler
  where assignment.traveler_id = traveler.id
    and traveler.removed_at is not null;
  delete from public.itinerary_participants assignment
  using public.travelers traveler
  where assignment.traveler_id = traveler.id
    and traveler.removed_at is not null;

  if not had_reservation_state then
    update public.bookings set reservation_state = 'booked';
  end if;
  if not had_participant_scope then
    update public.bookings booking
    set participant_scope = case
      when not exists (
        select 1 from public.booking_travelers assignment where assignment.booking_id = booking.id
      ) then 'everyone'::public.participant_scope
      -- Before participant_scope existed, the UI represented Everyone by
      -- inserting every active traveler. A selected-all state was not
      -- distinguishable, so migrate that legacy shape back to Everyone.
      when exists (
        select 1 from public.travelers traveler
        where traveler.trip_id = booking.trip_id and traveler.removed_at is null
      ) and not exists (
        select 1 from public.travelers traveler
        where traveler.trip_id = booking.trip_id and traveler.removed_at is null
          and not exists (
            select 1 from public.booking_travelers assignment
            where assignment.booking_id = booking.id and assignment.traveler_id = traveler.id
          )
      ) then 'everyone'::public.participant_scope
      else 'selected'::public.participant_scope
    end;

    -- The legacy event form represented Everyone by inserting every active
    -- traveler on the timeline item, including items without a booking.
    -- Canonicalize that ambiguous legacy shape once; after this column exists,
    -- a selected-all list is allowed to remain an intentional Selected scope.
    update public.itinerary_items item
    set applies_to_all_travelers = true
    where not item.applies_to_all_travelers
      and exists (
        select 1 from public.travelers traveler
        where traveler.trip_id = item.trip_id and traveler.removed_at is null
      )
      and not exists (
        select 1 from public.travelers traveler
        where traveler.trip_id = item.trip_id and traveler.removed_at is null
          and not exists (
            select 1 from public.itinerary_participants assignment
            where assignment.itinerary_item_id = item.id and assignment.traveler_id = traveler.id
          )
      );
  end if;

  -- Keep this cleanup idempotent so rerunning the migration also repairs a
  -- previously interrupted client-side scope change.
  delete from public.booking_travelers assignment
  using public.bookings booking
  where assignment.booking_id = booking.id and booking.participant_scope = 'everyone';

  -- Everyone is represented only by the parent flag after migration. Keep
  -- this cleanup rerunnable so a previously interrupted scope change repairs.
  delete from public.itinerary_participants assignment
  using public.itinerary_items item
  where assignment.itinerary_item_id = item.id and item.applies_to_all_travelers;
end
$migration$;

alter table public.journey_legs
  alter column operator_name drop not null,
  alter column scheduled_arrival_at drop not null,
  add column if not exists details jsonb not null default '{}'::jsonb;

update public.journey_legs
set details = case
  when mode = 'cab' then '{"kind":"cab","ride_type":"local"}'::jsonb
  else jsonb_build_object('kind', mode::text)
end
where details = '{}'::jsonb;

alter table public.journey_legs alter column details drop default;

alter table public.journey_legs drop constraint if exists journey_schedule_order;
alter table public.journey_legs add constraint journey_schedule_order
  check (scheduled_arrival_at is null or scheduled_arrival_at > scheduled_departure_at);

create or replace function public.valid_journey_leg_details(requested_mode public.journey_mode, requested_details jsonb)
returns boolean language plpgsql immutable set search_path = public as $function$
declare
  allowed_keys text[];
  text_keys text[];
  key_name text;
  vehicle jsonb;
begin
  if requested_details is null or jsonb_typeof(requested_details) <> 'object' then return false; end if;
  if requested_details->>'kind' is distinct from requested_mode::text then return false; end if;

  if requested_mode = 'train' then
    allowed_keys := array['kind','train_name','booked_from_name','booked_from_code','travel_class','quota','booking_status','current_status'];
    text_keys := allowed_keys;
  elsif requested_mode = 'bus' then
    allowed_keys := array['kind','bus_class_or_layout','shared_ticket_number','boarding_point_details','dropoff_point_details'];
    text_keys := allowed_keys;
  elsif requested_mode = 'ferry' then
    allowed_keys := array['kind','direction','ticket_timing','seating','seller_reference','operator_reference','accommodation','vessel_name','departure_gate','baggage_allowance','related_sailing_id','vehicle'];
    text_keys := array['kind','direction','ticket_timing','seating','seller_reference','operator_reference','accommodation','vessel_name','departure_gate','baggage_allowance','related_sailing_id'];
    if requested_details ? 'direction' and requested_details->>'direction' not in ('one_way','outbound','return') then return false; end if;
    if requested_details ? 'ticket_timing' and requested_details->>'ticket_timing' not in ('fixed','open_date','open_return') then return false; end if;
    if requested_details ? 'seating' and requested_details->>'seating' not in ('free','assigned','unknown') then return false; end if;
    if requested_details ? 'vehicle' then
      vehicle := requested_details->'vehicle';
      if jsonb_typeof(vehicle) <> 'object' then return false; end if;
      if exists (select 1 from jsonb_object_keys(vehicle) as vehicle_keys(vehicle_key) where vehicle_keys.vehicle_key <> all(array['type','registration','length_cm','height_cm'])) then return false; end if;
      foreach key_name in array array['type','registration'] loop
        if vehicle ? key_name and jsonb_typeof(vehicle->key_name) <> 'string' then return false; end if;
      end loop;
      if vehicle ? 'length_cm' and (jsonb_typeof(vehicle->'length_cm') <> 'number' or (vehicle->>'length_cm')::numeric < 0) then return false; end if;
      if vehicle ? 'height_cm' and (jsonb_typeof(vehicle->'height_cm') <> 'number' or (vehicle->>'height_cm')::numeric < 0) then return false; end if;
    end if;
  elsif requested_mode = 'cab' then
    allowed_keys := array['kind','ride_type','cross_border','linked_flight_leg_id','pickup_buffer_minutes','luggage_count','pickup_instructions','vehicle_class','driver_name','driver_phone','vehicle_registration','trip_shape','return_at','package_duration_minutes','final_dropoff'];
    text_keys := array['kind','ride_type','linked_flight_leg_id','pickup_instructions','vehicle_class','driver_name','driver_phone','vehicle_registration','trip_shape','return_at','final_dropoff'];
    if requested_details->>'ride_type' is null or requested_details->>'ride_type' not in ('local','airport_transfer','outstation','hourly') then return false; end if;
    if requested_details ? 'cross_border' and jsonb_typeof(requested_details->'cross_border') <> 'boolean' then return false; end if;
    if requested_details ? 'trip_shape' and requested_details->>'trip_shape' not in ('one_way','round_trip') then return false; end if;
    foreach key_name in array array['pickup_buffer_minutes','luggage_count','package_duration_minutes'] loop
      if requested_details ? key_name and (jsonb_typeof(requested_details->key_name) <> 'number' or (requested_details->>key_name)::numeric < 0) then return false; end if;
    end loop;
  else
    return false;
  end if;

  if exists (select 1 from jsonb_object_keys(requested_details) as supplied_keys(supplied_key) where supplied_keys.supplied_key <> all(allowed_keys)) then return false; end if;
  foreach key_name in array text_keys loop
    if requested_details ? key_name and jsonb_typeof(requested_details->key_name) <> 'string' then return false; end if;
  end loop;
  if requested_mode = 'cab' and requested_details ? 'linked_flight_leg_id' and public.safe_uuid(requested_details->>'linked_flight_leg_id') is null then return false; end if;
  return true;
exception when others then
  return false;
end
$function$;

alter table public.journey_legs drop constraint if exists journey_leg_details_shape;
alter table public.journey_legs add constraint journey_leg_details_shape
  check (public.valid_journey_leg_details(mode, details));

create table if not exists public.journey_leg_travelers (
  journey_leg_id uuid not null references public.journey_legs(id) on delete cascade,
  traveler_id uuid not null references public.travelers(id) on delete cascade,
  seat_or_berth text,
  coach_or_cabin text,
  passenger_reference text,
  updated_at timestamptz not null default now(),
  primary key (journey_leg_id, traveler_id)
);

create index if not exists journey_leg_travelers_traveler_idx
  on public.journey_leg_travelers (traveler_id, journey_leg_id);

drop trigger if exists set_updated_at on public.journey_leg_travelers;
create trigger set_updated_at before update on public.journey_leg_travelers
for each row execute function public.set_updated_at();

create or replace function public.enforce_assignment_trip()
returns trigger language plpgsql security definer set search_path = public as $function$
declare parent_trip uuid; traveler_trip uuid; parent_booking_id uuid; booking_scope public.participant_scope;
begin
  select trip_id into traveler_trip from public.travelers where id = new.traveler_id and removed_at is null;
  if tg_table_name = 'booking_travelers' then select trip_id into parent_trip from public.bookings where id = new.booking_id and deleted_at is null;
  elsif tg_table_name = 'itinerary_participants' then select trip_id into parent_trip from public.itinerary_items where id = new.itinerary_item_id and deleted_at is null;
  elsif tg_table_name = 'requirement_assignees' then select trip_id into parent_trip from public.trip_requirements where id = new.requirement_id and deleted_at is null;
  elsif tg_table_name = 'flight_leg_travelers' then select b.trip_id, b.id, b.participant_scope into parent_trip, parent_booking_id, booking_scope from public.flight_legs f join public.bookings b on b.id = f.booking_id where f.id = new.flight_leg_id and f.deleted_at is null and b.deleted_at is null;
  elsif tg_table_name = 'journey_leg_travelers' then select b.trip_id, b.id, b.participant_scope into parent_trip, parent_booking_id, booking_scope from public.journey_legs j join public.bookings b on b.id = j.booking_id where j.id = new.journey_leg_id and j.deleted_at is null and b.deleted_at is null;
  end if;
  if parent_trip is null or traveler_trip is null or parent_trip <> traveler_trip then raise exception 'Assigned traveler must belong to the same trip'; end if;
  if parent_booking_id is not null and booking_scope = 'selected' and not exists (
    select 1 from public.booking_travelers assignment
    where assignment.booking_id = parent_booking_id and assignment.traveler_id = new.traveler_id
  ) then
    raise exception 'Leg traveler must be included in the booking';
  end if;
  return new;
end
$function$;

drop trigger if exists journey_leg_traveler_same_trip on public.journey_leg_travelers;
create trigger journey_leg_traveler_same_trip before insert or update on public.journey_leg_travelers
for each row execute function public.enforce_assignment_trip();

create or replace function public.enforce_explicit_participant_row()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  if tg_table_name = 'booking_travelers' and not exists (
    select 1 from public.bookings booking where booking.id = new.booking_id and booking.participant_scope = 'selected'
  ) then
    raise exception 'Booking traveler rows require Selected scope';
  elsif tg_table_name = 'itinerary_participants' and not exists (
    select 1 from public.itinerary_items item where item.id = new.itinerary_item_id and not item.applies_to_all_travelers
  ) then
    raise exception 'Itinerary participant rows require Selected scope';
  end if;
  return new;
end
$function$;

drop trigger if exists booking_traveler_explicit_scope on public.booking_travelers;
create trigger booking_traveler_explicit_scope before insert or update on public.booking_travelers
for each row execute function public.enforce_explicit_participant_row();
drop trigger if exists itinerary_participant_explicit_scope on public.itinerary_participants;
create trigger itinerary_participant_explicit_scope before insert or update on public.itinerary_participants
for each row execute function public.enforce_explicit_participant_row();

-- A caller with direct table access must not be able to leave an Everyone
-- parent with explicit assignment rows. Canonicalize the transition inside
-- the parent statement so older clients that update the flag before deleting
-- child rows remain safe rather than committing a contradictory state.
create or replace function public.canonicalize_parent_participant_scope()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  if tg_table_name = 'bookings' and new.participant_scope = 'everyone' then
    delete from public.booking_travelers assignment
    where assignment.booking_id = new.id;
    delete from public.flight_leg_travelers allocation
    using public.flight_legs leg
    where allocation.flight_leg_id = leg.id and leg.booking_id = new.id;
    delete from public.journey_leg_travelers allocation
    using public.journey_legs leg
    where allocation.journey_leg_id = leg.id and leg.booking_id = new.id;
  elsif tg_table_name = 'itinerary_items' and new.applies_to_all_travelers then
    delete from public.itinerary_participants assignment
    where assignment.itinerary_item_id = new.id;
  end if;
  return new;
end
$function$;

drop trigger if exists booking_parent_participant_scope on public.bookings;
create trigger booking_parent_participant_scope before update of participant_scope on public.bookings
for each row execute function public.canonicalize_parent_participant_scope();
drop trigger if exists itinerary_parent_participant_scope on public.itinerary_items;
create trigger itinerary_parent_participant_scope before update of applies_to_all_travelers on public.itinerary_items
for each row execute function public.canonicalize_parent_participant_scope();


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

  -- Per-leg allocations contain traveler-specific private details. Keep rows
  -- only for travelers who remain explicitly selected; switching to Everyone
  -- intentionally clears every allocation instead of retaining stale seats or
  -- passenger references from the previous selected roster.
  delete from public.flight_leg_travelers allocation
  using public.flight_legs leg
  where allocation.flight_leg_id = leg.id
    and leg.booking_id = requested_booking_id
    and (requested_scope = 'everyone' or allocation.traveler_id <> all(selected_traveler_ids));
  delete from public.journey_leg_travelers allocation
  using public.journey_legs leg
  where allocation.journey_leg_id = leg.id
    and leg.booking_id = requested_booking_id
    and (requested_scope = 'everyone' or allocation.traveler_id <> all(selected_traveler_ids));

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

revoke all on function public.sync_booking_participants(uuid, public.participant_scope, uuid[], uuid, integer) from public, anon;
grant execute on function public.sync_booking_participants(uuid, public.participant_scope, uuid[], uuid, integer) to authenticated, service_role;


alter table public.journey_leg_travelers enable row level security;
revoke all on public.journey_leg_travelers from anon, authenticated;
grant select, insert, update, delete on public.journey_leg_travelers to authenticated;
grant all on public.journey_leg_travelers to service_role;

drop policy if exists journey_leg_travelers_read on public.journey_leg_travelers;
create policy journey_leg_travelers_read on public.journey_leg_travelers for select to authenticated using (
  exists (
    select 1 from public.journey_legs leg join public.bookings booking on booking.id = leg.booking_id
    where leg.id = journey_leg_id and public.is_trip_member(booking.trip_id)
  )
);
drop policy if exists journey_leg_travelers_write on public.journey_leg_travelers;
create policy journey_leg_travelers_write on public.journey_leg_travelers for all to authenticated using (
  exists (
    select 1 from public.journey_legs leg join public.bookings booking on booking.id = leg.booking_id
    where leg.id = journey_leg_id and public.can_edit_trip(booking.trip_id)
  )
) with check (
  exists (
    select 1 from public.journey_legs leg join public.bookings booking on booking.id = leg.booking_id
    where leg.id = journey_leg_id and public.can_edit_trip(booking.trip_id)
  )
);

create or replace function public.save_hotel_stay(
  requested_booking jsonb,
  requested_traveler_ids uuid[] default '{}',
  requested_milestones jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare
  actor uuid := auth.uid();
  target_booking_id uuid := public.safe_uuid(requested_booking->>'id');
  target_trip_id uuid := public.safe_uuid(requested_booking->>'trip_id');
  check_in_id uuid;
  check_out_id uuid;
  check_in_at timestamptz;
  check_out_at timestamptz;
  source_zone text;
  title_value text;
  reservation_value public.booking_reservation_state;
  scope_value public.participant_scope;
  expected_version integer;
  existing_booking public.bookings%rowtype;
  selected_traveler_id uuid;
begin
  if actor is null then raise exception 'Sign in before saving a hotel'; end if;
  if target_booking_id is null or target_trip_id is null or not public.can_edit_trip(target_trip_id) then raise exception 'Hotel cannot be saved'; end if;
  title_value := trim(coalesce(requested_booking->>'title', ''));
  check_in_at := (requested_booking->>'start_at')::timestamptz;
  check_out_at := (requested_booking->>'end_at')::timestamptz;
  source_zone := requested_booking->>'source_timezone';
  if title_value = '' or check_out_at <= check_in_at then raise exception 'Hotel checkout must be after check-in'; end if;
  if not public.valid_iana_timezone(source_zone) then raise exception 'Use a valid hotel timezone'; end if;
  if coalesce(jsonb_typeof(requested_booking->'details'), 'object') <> 'object' then raise exception 'Hotel details must be an object'; end if;
  if coalesce(requested_booking->>'reservation_state', 'booked') not in ('planned','walk_up','booked') then raise exception 'Invalid hotel reservation state'; end if;
  if coalesce(requested_booking->>'participant_scope', case when cardinality(requested_traveler_ids) > 0 then 'selected' else 'everyone' end) not in ('everyone','selected') then raise exception 'Invalid participant scope'; end if;
  reservation_value := coalesce(requested_booking->>'reservation_state', 'booked')::public.booking_reservation_state;
  scope_value := coalesce(requested_booking->>'participant_scope', case when cardinality(requested_traveler_ids) > 0 then 'selected' else 'everyone' end)::public.participant_scope;
  if scope_value = 'everyone' and cardinality(requested_traveler_ids) <> 0 then raise exception 'Everyone cannot contain selected travelers'; end if;
  if scope_value = 'selected' and cardinality(requested_traveler_ids) = 0 then raise exception 'Select at least one traveler'; end if;
  foreach selected_traveler_id in array requested_traveler_ids loop
    if not exists (select 1 from public.travelers traveler where traveler.id = selected_traveler_id and traveler.trip_id = target_trip_id and traveler.removed_at is null) then raise exception 'Selected traveler must belong to the trip'; end if;
  end loop;

  select * into existing_booking from public.bookings booking where booking.id = target_booking_id for update;
  if found then
    if existing_booking.trip_id <> target_trip_id or existing_booking.type::text <> 'hotel' or existing_booking.deleted_at is not null then raise exception 'Hotel cannot be updated'; end if;
    expected_version := nullif(requested_booking->>'version', '')::integer;
    if expected_version is not null and existing_booking.version <> expected_version then raise exception 'version_conflict'; end if;
    update public.bookings set
      title = title_value, provider = nullif(trim(requested_booking->>'provider'), ''),
      reference_code = nullif(trim(requested_booking->>'reference_code'), ''),
      start_at = check_in_at, end_at = check_out_at, source_timezone = source_zone,
      location = nullif(requested_booking->'location', 'null'::jsonb), details = coalesce(requested_booking->'details', '{}'::jsonb),
      reservation_state = reservation_value, participant_scope = scope_value,
      journey_scope = null, booked_via_name = nullif(trim(requested_booking->>'booked_via_name'), ''),
      booked_via_url = nullif(trim(requested_booking->>'booked_via_url'), ''),
      booking_vendor_catalog_key = nullif(trim(requested_booking->>'booking_vendor_catalog_key'), ''),
      contact_name = nullif(trim(requested_booking->>'contact_name'), ''), contact_phone = nullif(trim(requested_booking->>'contact_phone'), '')
    where id = target_booking_id;
  else
    insert into public.bookings (
      id, trip_id, type, title, provider, reference_code, start_at, end_at, source_timezone,
      location, details, reservation_state, participant_scope, booked_via_name, booked_via_url,
      booking_vendor_catalog_key, contact_name, contact_phone, created_by
    ) values (
      target_booking_id, target_trip_id, 'hotel', title_value, nullif(trim(requested_booking->>'provider'), ''),
      nullif(trim(requested_booking->>'reference_code'), ''), check_in_at, check_out_at, source_zone,
      nullif(requested_booking->'location', 'null'::jsonb), coalesce(requested_booking->'details', '{}'::jsonb),
      reservation_value, scope_value, nullif(trim(requested_booking->>'booked_via_name'), ''),
      nullif(trim(requested_booking->>'booked_via_url'), ''), nullif(trim(requested_booking->>'booking_vendor_catalog_key'), ''),
      nullif(trim(requested_booking->>'contact_name'), ''), nullif(trim(requested_booking->>'contact_phone'), ''), actor
    );
  end if;

  delete from public.booking_travelers assignment where assignment.booking_id = target_booking_id;
  if scope_value = 'selected' then
    insert into public.booking_travelers (booking_id, traveler_id)
    select target_booking_id, selected_id from unnest(requested_traveler_ids) selected_id
    on conflict do nothing;
  end if;

  select item.id into check_in_id from public.itinerary_items item where item.booking_id = target_booking_id and item.event_type = 'hotel_check_in' and item.deleted_at is null for update;
  select item.id into check_out_id from public.itinerary_items item where item.booking_id = target_booking_id and item.event_type = 'hotel_check_out' and item.deleted_at is null for update;
  -- Milestone identifiers are server-owned. This prevents a caller from using
  -- SECURITY DEFINER to update an unrelated itinerary row through ON CONFLICT.
  check_in_id := coalesce(check_in_id, gen_random_uuid());
  check_out_id := coalesce(check_out_id, gen_random_uuid());

  insert into public.itinerary_items (
    id, trip_id, booking_id, title, event_type, starts_at, ends_at, timezone, location, notes,
    applies_to_all_travelers, is_all_day, timing_mode, scheduled_date, has_explicit_start_time,
    event_status, sort_key, created_by, deleted_at
  ) values
    (check_in_id, target_trip_id, target_booking_id, left(title_value, 148) || ' · Check in', 'hotel_check_in', check_in_at, null, source_zone,
     nullif(requested_booking->'location', 'null'::jsonb), requested_booking->>'notes', scope_value = 'everyone', false,
     case when coalesce((requested_milestones->>'check_in_has_time')::boolean, true) then 'exact'::public.event_timing_mode else 'date_only'::public.event_timing_mode end,
     case when coalesce((requested_milestones->>'check_in_has_time')::boolean, true) then null else (check_in_at at time zone source_zone)::date end,
     coalesce((requested_milestones->>'check_in_has_time')::boolean, true), 'planned', check_in_at::text || ':' || check_in_id::text, actor, null),
    (check_out_id, target_trip_id, target_booking_id, left(title_value, 148) || ' · Check out', 'hotel_check_out', check_out_at, null, source_zone,
     nullif(requested_booking->'location', 'null'::jsonb), requested_booking->>'notes', scope_value = 'everyone', false,
     case when coalesce((requested_milestones->>'check_out_has_time')::boolean, true) then 'exact'::public.event_timing_mode else 'date_only'::public.event_timing_mode end,
     case when coalesce((requested_milestones->>'check_out_has_time')::boolean, true) then null else (check_out_at at time zone source_zone)::date end,
     coalesce((requested_milestones->>'check_out_has_time')::boolean, true), 'planned', check_out_at::text || ':' || check_out_id::text, actor, null)
  on conflict (id) do update set
    title = excluded.title, starts_at = excluded.starts_at, ends_at = null, timezone = excluded.timezone,
    location = excluded.location, notes = excluded.notes, applies_to_all_travelers = excluded.applies_to_all_travelers,
    timing_mode = excluded.timing_mode, scheduled_date = excluded.scheduled_date,
    has_explicit_start_time = excluded.has_explicit_start_time, sort_key = excluded.sort_key, deleted_at = null;

  delete from public.itinerary_participants where itinerary_item_id in (check_in_id, check_out_id);
  if scope_value = 'selected' then
    insert into public.itinerary_participants (itinerary_item_id, traveler_id)
    select milestone_id, selected_id
    from unnest(array[check_in_id, check_out_id]) milestone_id
    cross join unnest(requested_traveler_ids) selected_id
    on conflict do nothing;
  end if;

  return jsonb_build_object('booking_id', target_booking_id, 'check_in_id', check_in_id, 'check_out_id', check_out_id);
end
$function$;

-- Edit one non-flight journey leg and derive its parent booking/timeline
-- summary in the same transaction. The client intentionally does not queue
-- this operation offline because partial route edits would make three views
-- disagree about the next event. Adjacent legs are locked and validated so a
-- one-leg edit cannot break the route or chronology of a connection.
create or replace function public.save_journey_leg(
  requested_leg_id uuid,
  requested_leg jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare
  actor uuid := auth.uid();
  target_leg public.journey_legs%rowtype;
  target_booking public.bookings%rowtype;
  previous_leg public.journey_legs%rowtype;
  next_leg public.journey_legs%rowtype;
  first_journey_leg public.journey_legs%rowtype;
  last_journey_leg public.journey_legs%rowtype;
  departure_at timestamptz;
  arrival_at timestamptz;
  boarding_time timestamptz;
  boarding_lead integer;
  origin_zone text;
  destination_zone text;
  origin_value text;
  destination_value text;
  detail_value jsonb;
  expected_version integer;
  provider_value text;
  saved_leg jsonb;
  saved_booking jsonb;
  saved_itinerary jsonb;
begin
  if actor is null then raise exception 'Sign in before editing a journey'; end if;
  if requested_leg is null or jsonb_typeof(requested_leg) <> 'object' then raise exception 'Journey details must be an object'; end if;

  -- Lock order invariant: resolve and lock the parent booking first.
  select booking.* into target_booking
  from public.bookings booking
  where booking.id = (
    select journey.booking_id
    from public.journey_legs journey
    where journey.id = requested_leg_id and journey.deleted_at is null
  )
    and booking.deleted_at is null
  for update;
  if not found then raise exception 'Journey leg was not found'; end if;
  if not public.can_edit_trip(target_booking.trip_id) then
    raise exception 'Journey leg cannot be changed';
  end if;

  -- Lock order invariant: every editor next locks all active route legs in
  -- deterministic segment/id order before reading its target or neighbors.
  perform journey.id
  from public.journey_legs journey
  where journey.booking_id = target_booking.id and journey.deleted_at is null
  order by journey.segment_order, journey.id
  for update;

  select journey.* into target_leg
  from public.journey_legs journey
  where journey.id = requested_leg_id
    and journey.booking_id = target_booking.id
    and journey.deleted_at is null;
  if not found then raise exception 'Journey leg was not found'; end if;
  if target_booking.type::text <> target_leg.mode::text then
    raise exception 'Journey leg cannot be changed';
  end if;

  select journey.* into previous_leg
  from public.journey_legs journey
  where journey.booking_id = target_leg.booking_id
    and journey.deleted_at is null
    and journey.segment_order < target_leg.segment_order
  order by journey.segment_order desc
  limit 1;

  select journey.* into next_leg
  from public.journey_legs journey
  where journey.booking_id = target_leg.booking_id
    and journey.deleted_at is null
    and journey.segment_order > target_leg.segment_order
  order by journey.segment_order
  limit 1;

  expected_version := nullif(requested_leg->>'version', '')::integer;
  if expected_version is not null and target_leg.version <> expected_version then raise exception 'version_conflict'; end if;

  origin_value := trim(coalesce(requested_leg->>'origin_name', ''));
  destination_value := trim(coalesce(requested_leg->>'destination_name', ''));
  departure_at := nullif(requested_leg->>'scheduled_departure_at', '')::timestamptz;
  arrival_at := nullif(requested_leg->>'scheduled_arrival_at', '')::timestamptz;
  boarding_time := nullif(requested_leg->>'boarding_at', '')::timestamptz;
  origin_zone := trim(coalesce(requested_leg->>'origin_timezone', ''));
  destination_zone := trim(coalesce(requested_leg->>'destination_timezone', ''));
  detail_value := requested_leg->'details';

  if origin_value = '' or destination_value = '' or departure_at is null then raise exception 'Departure, destination, and departure time are required'; end if;
  if not public.valid_iana_timezone(origin_zone) or not public.valid_iana_timezone(destination_zone) then raise exception 'Use valid journey time zones'; end if;
  if arrival_at is not null and arrival_at <= departure_at then raise exception 'Journey arrival must be after departure'; end if;
  if boarding_time is not null and boarding_time > departure_at then raise exception 'Boarding cannot be after departure'; end if;
  if requested_leg->>'boarding_lead_minutes' is not null then
    if requested_leg->>'boarding_lead_minutes' !~ '^\d+$' then raise exception 'Boarding reminder must be a whole number'; end if;
    boarding_lead := (requested_leg->>'boarding_lead_minutes')::integer;
    if boarding_lead < 0 or boarding_lead > 360 then raise exception 'Boarding reminder must be between 0 and 360 minutes'; end if;
  end if;
  if not public.valid_journey_leg_details(target_leg.mode, detail_value) then raise exception 'Invalid journey ticket details'; end if;
  if nullif(requested_leg->>'origin_country_code', '') is not null and upper(requested_leg->>'origin_country_code') !~ '^[A-Z]{2}$' then raise exception 'Invalid departure country code'; end if;
  if nullif(requested_leg->>'destination_country_code', '') is not null and upper(requested_leg->>'destination_country_code') !~ '^[A-Z]{2}$' then raise exception 'Invalid destination country code'; end if;

  if previous_leg.id is not null then
    if nullif(trim(previous_leg.destination_code), '') is not null
      and nullif(trim(requested_leg->>'origin_code'), '') is not null then
      if upper(trim(previous_leg.destination_code)) <> upper(trim(requested_leg->>'origin_code')) then
        raise exception 'Edited departure must match the previous leg destination';
      end if;
    elsif lower(regexp_replace(trim(coalesce(previous_leg.destination_name, '')), '[[:space:]]+', ' ', 'g'))
      <> lower(regexp_replace(origin_value, '[[:space:]]+', ' ', 'g')) then
      raise exception 'Edited departure must match the previous leg destination';
    end if;
    if previous_leg.destination_timezone is distinct from origin_zone then
      raise exception 'Edited departure time zone must match the previous leg destination time zone';
    end if;
    if previous_leg.scheduled_arrival_at is not null and departure_at <= previous_leg.scheduled_arrival_at then
      raise exception 'Edited departure must be after the previous leg arrives';
    end if;
  end if;

  if next_leg.id is not null then
    if nullif(trim(requested_leg->>'destination_code'), '') is not null
      and nullif(trim(next_leg.origin_code), '') is not null then
      if upper(trim(requested_leg->>'destination_code')) <> upper(trim(next_leg.origin_code)) then
        raise exception 'Edited destination must match the next leg origin';
      end if;
    elsif lower(regexp_replace(destination_value, '[[:space:]]+', ' ', 'g'))
      <> lower(regexp_replace(trim(coalesce(next_leg.origin_name, '')), '[[:space:]]+', ' ', 'g')) then
      raise exception 'Edited destination must match the next leg origin';
    end if;
    if destination_zone is distinct from next_leg.origin_timezone then
      raise exception 'Edited destination time zone must match the next leg origin time zone';
    end if;
    if arrival_at is not null and next_leg.scheduled_departure_at <= arrival_at then
      raise exception 'Next leg must depart after the edited leg arrives';
    end if;
  end if;

  update public.journey_legs journey set
    operator_name = nullif(trim(requested_leg->>'operator_name'), ''),
    service_number = nullif(trim(requested_leg->>'service_number'), ''),
    origin_code = nullif(upper(trim(requested_leg->>'origin_code')), ''),
    origin_name = origin_value,
    origin_country_code = nullif(upper(trim(requested_leg->>'origin_country_code')), ''),
    origin_timezone = origin_zone,
    destination_code = nullif(upper(trim(requested_leg->>'destination_code')), ''),
    destination_name = destination_value,
    destination_country_code = nullif(upper(trim(requested_leg->>'destination_country_code')), ''),
    destination_timezone = destination_zone,
    scheduled_departure_at = departure_at,
    scheduled_arrival_at = arrival_at,
    boarding_at = boarding_time,
    boarding_lead_minutes = boarding_lead,
    departure_platform = nullif(trim(requested_leg->>'departure_platform'), ''),
    arrival_platform = nullif(trim(requested_leg->>'arrival_platform'), ''),
    details = detail_value
  where journey.id = requested_leg_id;

  select journey.* into first_journey_leg
  from public.journey_legs journey
  where journey.booking_id = target_booking.id and journey.deleted_at is null
  order by journey.segment_order
  limit 1;
  select journey.* into last_journey_leg
  from public.journey_legs journey
  where journey.booking_id = target_booking.id and journey.deleted_at is null
  order by journey.segment_order desc
  limit 1;
  select string_agg(operator.operator_name, ' / ' order by operator.first_segment)
  into provider_value
  from (
    select journey.operator_name, min(journey.segment_order) as first_segment
    from public.journey_legs journey
    where journey.booking_id = target_booking.id
      and journey.deleted_at is null
      and nullif(trim(journey.operator_name), '') is not null
    group by journey.operator_name
  ) operator;

  update public.bookings booking set
    provider = provider_value,
    start_at = first_journey_leg.scheduled_departure_at,
    end_at = last_journey_leg.scheduled_arrival_at,
    source_timezone = first_journey_leg.origin_timezone
  where booking.id = target_booking.id;

  update public.itinerary_items item set
    starts_at = first_journey_leg.scheduled_departure_at,
    ends_at = last_journey_leg.scheduled_arrival_at,
    timezone = first_journey_leg.origin_timezone,
    timing_mode = 'exact',
    scheduled_date = null,
    anchor_itinerary_item_id = null,
    relative_position = null,
    is_all_day = false,
    has_explicit_start_time = true,
    sort_key = first_journey_leg.scheduled_departure_at::text || ':' || item.id::text
  where item.booking_id = target_booking.id and item.deleted_at is null;

  select to_jsonb(journey) into saved_leg from public.journey_legs journey where journey.id = requested_leg_id;
  select to_jsonb(booking) into saved_booking from public.bookings booking where booking.id = target_booking.id;
  select coalesce(jsonb_agg(to_jsonb(item) order by item.starts_at, item.sort_key, item.id), '[]'::jsonb)
  into saved_itinerary
  from public.itinerary_items item
  where item.booking_id = target_booking.id and item.deleted_at is null;
  return jsonb_build_object('leg', saved_leg, 'booking', saved_booking, 'itinerary_items', saved_itinerary);
end
$function$;

revoke all on function public.valid_journey_leg_details(public.journey_mode, jsonb) from public, anon;
revoke all on function public.enforce_explicit_participant_row() from public, anon, authenticated;
revoke all on function public.canonicalize_parent_participant_scope() from public, anon, authenticated;
revoke all on function public.save_hotel_stay(jsonb, uuid[], jsonb) from public, anon;
revoke all on function public.save_journey_leg(uuid, jsonb) from public, anon;
grant execute on function public.valid_journey_leg_details(public.journey_mode, jsonb) to authenticated, service_role;
grant execute on function public.save_hotel_stay(jsonb, uuid[], jsonb) to authenticated;
grant execute on function public.save_journey_leg(uuid, jsonb) to authenticated;

do $migration$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'journey_leg_travelers'
  ) then
    alter publication supabase_realtime add table public.journey_leg_travelers;
  end if;
end
$migration$;

commit;

notify pgrst, 'reload schema';
