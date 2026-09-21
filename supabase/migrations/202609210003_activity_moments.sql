-- Ordered "Moments" inside an activity. A Moment is intentionally smaller than
-- a timeline event, while still supporting its own place, timing, notes, and cost.

begin;

create table if not exists public.activity_moments (
  id uuid primary key default gen_random_uuid(),
  itinerary_item_id uuid not null references public.itinerary_items(id) on delete cascade,
  moment_order integer not null check (moment_order >= 0),
  title text not null check (char_length(trim(title)) between 1 and 160),
  location jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text not null,
  notes text,
  source_planning_item_id uuid references public.planning_items(id) on delete set null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint activity_moment_location_shape check (
    location is null or jsonb_typeof(location) = 'object'
  ),
  constraint activity_moment_time_order check (
    starts_at is null or ends_at is null or ends_at >= starts_at
  )
);

alter table public.trip_costs
  add column if not exists activity_moment_id uuid
  references public.activity_moments(id) on delete set null;

alter table public.trip_costs
  drop constraint if exists trip_cost_single_association;
alter table public.trip_costs add constraint trip_cost_single_association check (
  document_id is null or
  (
    booking_id is null
    and itinerary_item_id is null
    and cab_stop_id is null
    and activity_moment_id is null
  )
);

create unique index if not exists activity_moments_active_order_unique
  on public.activity_moments (itinerary_item_id, moment_order)
  where deleted_at is null;
create index if not exists activity_moments_active_event_order_idx
  on public.activity_moments (itinerary_item_id, moment_order, id)
  where deleted_at is null;
create unique index if not exists activity_moments_source_plan_unique
  on public.activity_moments (source_planning_item_id)
  where source_planning_item_id is not null and deleted_at is null;
create index if not exists trip_costs_activity_moment_idx
  on public.trip_costs (activity_moment_id)
  where activity_moment_id is not null and deleted_at is null;

create or replace function public.enforce_activity_moment_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  target_trip_id uuid;
begin
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

drop trigger if exists activity_moment_context on public.activity_moments;
create trigger activity_moment_context
before insert or update of itinerary_item_id, timezone, source_planning_item_id
on public.activity_moments
for each row execute function public.enforce_activity_moment_context();

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
  ) then
    raise exception 'An activity-Moment cost must belong to the same trip';
  end if;
  return new;
end
$function$;

drop trigger if exists trip_cost_activity_moment on public.trip_costs;
create trigger trip_cost_activity_moment
before insert or update of activity_moment_id, trip_id
on public.trip_costs
for each row execute function public.enforce_trip_cost_activity_moment();

drop trigger if exists set_updated_at on public.activity_moments;
create trigger set_updated_at
before update on public.activity_moments
for each row execute function public.set_updated_at();

drop trigger if exists increment_entity_version on public.activity_moments;
create trigger increment_entity_version
before update on public.activity_moments
for each row execute function public.increment_entity_version();

alter table public.activity_moments enable row level security;

revoke all on public.activity_moments from anon, authenticated;
grant select, insert, update, delete on public.activity_moments to authenticated;
grant all on public.activity_moments to service_role;

drop policy if exists activity_moments_read on public.activity_moments;
create policy activity_moments_read on public.activity_moments
for select to authenticated
using (
  exists (
    select 1
    from public.itinerary_items item
    where item.id = itinerary_item_id
      and item.deleted_at is null
      and public.is_trip_member(item.trip_id)
  )
);

drop policy if exists activity_moments_write on public.activity_moments;
create policy activity_moments_write on public.activity_moments
for all to authenticated
using (
  exists (
    select 1
    from public.itinerary_items item
    where item.id = itinerary_item_id
      and item.deleted_at is null
      and public.can_edit_trip(item.trip_id)
  )
)
with check (
  exists (
    select 1
    from public.itinerary_items item
    where item.id = itinerary_item_id
      and item.event_type::text = 'activity'
      and item.deleted_at is null
      and public.can_edit_trip(item.trip_id)
  )
);

do $publication$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'activity_moments'
  ) then
    alter publication supabase_realtime add table public.activity_moments;
  end if;
end
$publication$;

commit;

notify pgrst, 'reload schema';

do $migration_status$
begin
  raise notice 'Trip Vault 202609210003 applied: ordered activity Moments and Moment costs are ready.';
end
$migration_status$;
