-- Add ordered stops to a cab journey. A stop may link to a normal timeline
-- event, while trip costs may point at the stop for stop-specific payments.

begin;

create table if not exists public.cab_stops (
  id uuid primary key default gen_random_uuid(),
  journey_leg_id uuid not null references public.journey_legs(id) on delete cascade,
  stop_order integer not null check (stop_order >= 0),
  title text not null check (char_length(trim(title)) between 1 and 160),
  location jsonb,
  arrives_at timestamptz,
  departs_at timestamptz,
  timezone text not null,
  notes text,
  linked_itinerary_item_id uuid references public.itinerary_items(id) on delete set null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint cab_stop_location_shape check (location is null or jsonb_typeof(location) = 'object'),
  constraint cab_stop_time_order check (
    arrives_at is null or departs_at is null or departs_at >= arrives_at
  )
);

alter table public.trip_costs
  add column if not exists cab_stop_id uuid references public.cab_stops(id) on delete set null;

create unique index if not exists cab_stops_active_order_unique
  on public.cab_stops (journey_leg_id, stop_order)
  where deleted_at is null;
create index if not exists cab_stops_active_leg_order_idx
  on public.cab_stops (journey_leg_id, stop_order, id)
  where deleted_at is null;
create index if not exists trip_costs_cab_stop_idx
  on public.trip_costs (cab_stop_id)
  where cab_stop_id is not null and deleted_at is null;

create or replace function public.enforce_cab_stop_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  target_trip_id uuid;
  target_mode text;
begin
  select booking.trip_id, leg.mode::text
  into target_trip_id, target_mode
  from public.journey_legs leg
  join public.bookings booking on booking.id = leg.booking_id
  where leg.id = new.journey_leg_id
    and leg.deleted_at is null
    and booking.deleted_at is null;

  if target_trip_id is null or target_mode <> 'cab' then
    raise exception 'Cab stops must belong to an active cab journey';
  end if;
  if not public.valid_iana_timezone(new.timezone) then
    raise exception 'Choose a valid stop time zone';
  end if;
  if new.linked_itinerary_item_id is not null and not exists (
    select 1
    from public.itinerary_items item
    where item.id = new.linked_itinerary_item_id
      and item.trip_id = target_trip_id
      and item.deleted_at is null
  ) then
    raise exception 'A linked stop event must belong to the same trip';
  end if;
  return new;
end
$function$;

drop trigger if exists cab_stop_context on public.cab_stops;
create trigger cab_stop_context
before insert or update of journey_leg_id, timezone, linked_itinerary_item_id
on public.cab_stops
for each row execute function public.enforce_cab_stop_context();

create or replace function public.enforce_trip_cost_cab_stop()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if new.cab_stop_id is not null and not exists (
    select 1
    from public.cab_stops stop
    join public.journey_legs leg on leg.id = stop.journey_leg_id
    join public.bookings booking on booking.id = leg.booking_id
    where stop.id = new.cab_stop_id
      and stop.deleted_at is null
      and leg.deleted_at is null
      and booking.deleted_at is null
      and booking.trip_id = new.trip_id
  ) then
    raise exception 'A cab-stop cost must belong to the same trip';
  end if;
  return new;
end
$function$;

drop trigger if exists trip_cost_cab_stop on public.trip_costs;
create trigger trip_cost_cab_stop
before insert or update of cab_stop_id, trip_id
on public.trip_costs
for each row execute function public.enforce_trip_cost_cab_stop();

drop trigger if exists set_updated_at on public.cab_stops;
create trigger set_updated_at
before update on public.cab_stops
for each row execute function public.set_updated_at();

drop trigger if exists increment_entity_version on public.cab_stops;
create trigger increment_entity_version
before update on public.cab_stops
for each row execute function public.increment_entity_version();

alter table public.cab_stops enable row level security;

revoke all on public.cab_stops from anon, authenticated;
grant select, insert, update, delete on public.cab_stops to authenticated;
grant all on public.cab_stops to service_role;

drop policy if exists cab_stops_read on public.cab_stops;
create policy cab_stops_read on public.cab_stops
for select to authenticated
using (
  exists (
    select 1
    from public.journey_legs leg
    join public.bookings booking on booking.id = leg.booking_id
    where leg.id = journey_leg_id
      and public.is_trip_member(booking.trip_id)
  )
);

drop policy if exists cab_stops_write on public.cab_stops;
create policy cab_stops_write on public.cab_stops
for all to authenticated
using (
  exists (
    select 1
    from public.journey_legs leg
    join public.bookings booking on booking.id = leg.booking_id
    where leg.id = journey_leg_id
      and public.can_edit_trip(booking.trip_id)
  )
)
with check (
  exists (
    select 1
    from public.journey_legs leg
    join public.bookings booking on booking.id = leg.booking_id
    where leg.id = journey_leg_id
      and public.can_edit_trip(booking.trip_id)
  )
);

commit;

notify pgrst, 'reload schema';

do $migration_status$
begin
  raise notice 'Trip Vault 202609170002 applied: ordered cab stops, linked timeline events, and stop-specific trip costs are ready.';
end
$migration_status$;
