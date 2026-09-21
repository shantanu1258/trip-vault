-- Ordered agenda items for a Planning (internally: preparation) timeline event.
-- Items may remain lightweight or link to a promoted first-class timeline event.

begin;

create table if not exists public.planning_items (
  id uuid primary key default gen_random_uuid(),
  planning_event_id uuid not null references public.itinerary_items(id) on delete cascade,
  item_order integer not null check (item_order >= 0),
  kind text not null check (kind in ('place', 'meal', 'activity', 'transport', 'free_time', 'note')),
  title text not null check (char_length(trim(title)) between 1 and 160),
  location jsonb,
  starts_at timestamptz,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  timezone text not null,
  notes text,
  linked_itinerary_item_id uuid references public.itinerary_items(id) on delete set null,
  promoted_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint planning_item_location_shape check (
    location is null or jsonb_typeof(location) = 'object'
  ),
  constraint planning_item_promotion_shape check (
    (linked_itinerary_item_id is null and promoted_at is null)
    or linked_itinerary_item_id is not null
  )
);

create unique index if not exists planning_items_active_order_unique
  on public.planning_items (planning_event_id, item_order)
  where deleted_at is null;
create index if not exists planning_items_active_event_order_idx
  on public.planning_items (planning_event_id, item_order, id)
  where deleted_at is null;
create index if not exists planning_items_linked_event_idx
  on public.planning_items (linked_itinerary_item_id)
  where linked_itinerary_item_id is not null and deleted_at is null;

create or replace function public.enforce_planning_item_context()
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

drop trigger if exists planning_item_context on public.planning_items;
create trigger planning_item_context
before insert or update of planning_event_id, timezone, linked_itinerary_item_id
on public.planning_items
for each row execute function public.enforce_planning_item_context();

drop trigger if exists set_updated_at on public.planning_items;
create trigger set_updated_at
before update on public.planning_items
for each row execute function public.set_updated_at();

drop trigger if exists increment_entity_version on public.planning_items;
create trigger increment_entity_version
before update on public.planning_items
for each row execute function public.increment_entity_version();

alter table public.planning_items enable row level security;

revoke all on public.planning_items from anon, authenticated;
grant select, insert, update, delete on public.planning_items to authenticated;
grant all on public.planning_items to service_role;

drop policy if exists planning_items_read on public.planning_items;
create policy planning_items_read on public.planning_items
for select to authenticated
using (
  exists (
    select 1
    from public.itinerary_items item
    where item.id = planning_event_id
      and item.deleted_at is null
      and public.is_trip_member(item.trip_id)
  )
);

drop policy if exists planning_items_write on public.planning_items;
create policy planning_items_write on public.planning_items
for all to authenticated
using (
  exists (
    select 1
    from public.itinerary_items item
    where item.id = planning_event_id
      and item.deleted_at is null
      and public.can_edit_trip(item.trip_id)
  )
)
with check (
  exists (
    select 1
    from public.itinerary_items item
    where item.id = planning_event_id
      and item.event_type::text = 'preparation'
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
      and tablename = 'planning_items'
  ) then
    alter publication supabase_realtime add table public.planning_items;
  end if;
end
$publication$;

commit;

notify pgrst, 'reload schema';

do $migration_status$
begin
  raise notice 'Trip Vault 202609210002 applied: ordered Planning items and promoted-event links are ready.';
end
$migration_status$;
