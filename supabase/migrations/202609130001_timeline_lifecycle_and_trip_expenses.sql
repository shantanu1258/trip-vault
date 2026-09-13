-- Trip timeline lifecycle, flexible timing, trip-scoped expense sharing, and
-- an owner-only permanent deletion RPC for clearing test trips.

begin;

alter table public.itinerary_items add column if not exists timing_mode text not null default 'exact';
alter table public.itinerary_items add column if not exists scheduled_date date;
alter table public.itinerary_items add column if not exists anchor_itinerary_item_id uuid references public.itinerary_items(id) on delete set null;
alter table public.itinerary_items add column if not exists relative_position text;
alter table public.itinerary_items add column if not exists event_status text not null default 'planned';
alter table public.itinerary_items drop constraint if exists itinerary_timing_mode_check;
alter table public.itinerary_items add constraint itinerary_timing_mode_check check (timing_mode in ('exact', 'date_only', 'all_day', 'relative', 'unscheduled'));
alter table public.itinerary_items drop constraint if exists itinerary_relative_position_check;
alter table public.itinerary_items add constraint itinerary_relative_position_check check (
  (timing_mode = 'relative' and anchor_itinerary_item_id is not null and relative_position in ('before', 'after'))
  or (timing_mode <> 'relative' and anchor_itinerary_item_id is null and relative_position is null)
);
alter table public.itinerary_items drop constraint if exists itinerary_event_status_check;
alter table public.itinerary_items add constraint itinerary_event_status_check check (event_status in ('planned', 'done', 'skipped', 'cancelled'));

update public.itinerary_items
set timing_mode = case when coalesce(is_all_day, false) then 'all_day' else 'exact' end,
    scheduled_date = (starts_at at time zone timezone)::date
where scheduled_date is null;

alter table public.trip_costs add column if not exists paid_by_traveler_id uuid references public.travelers(id) on delete set null;

create table if not exists public.trip_cost_participants (
  cost_id uuid not null references public.trip_costs(id) on delete cascade,
  traveler_id uuid not null references public.travelers(id) on delete cascade,
  share_amount_minor bigint check (share_amount_minor is null or share_amount_minor >= 0),
  updated_at timestamptz not null default now(),
  primary key (cost_id, traveler_id)
);

create or replace function public.enforce_itinerary_trip_dates()
returns trigger language plpgsql security definer set search_path = public as $$
declare trip_row public.trips%rowtype; anchor_row public.itinerary_items%rowtype; local_start date; local_end date;
begin
  select * into trip_row from public.trips where id = new.trip_id and deleted_at is null;
  if not found then raise exception 'Trip is unavailable'; end if;
  if new.timing_mode = 'relative' then
    select * into anchor_row from public.itinerary_items where id = new.anchor_itinerary_item_id and trip_id = new.trip_id and deleted_at is null;
    if not found or anchor_row.timing_mode in ('relative', 'unscheduled') then raise exception 'Choose a dated event from this trip as the before/after anchor'; end if;
    new.starts_at := anchor_row.starts_at;
    new.scheduled_date := coalesce(anchor_row.scheduled_date, (anchor_row.starts_at at time zone anchor_row.timezone)::date);
    new.ends_at := null;
  elsif new.timing_mode = 'unscheduled' then
    new.scheduled_date := null;
    new.ends_at := null;
  else
    local_start := coalesce(new.scheduled_date, (new.starts_at at time zone new.timezone)::date);
    local_end := case when new.ends_at is null then local_start else (new.ends_at at time zone new.timezone)::date end;
    if local_start < trip_row.start_date or local_start > trip_row.end_date or local_end < trip_row.start_date or local_end > trip_row.end_date then
      raise exception 'Event dates must stay between % and %', trip_row.start_date, trip_row.end_date;
    end if;
    new.scheduled_date := local_start;
  end if;
  return new;
end;
$$;

drop trigger if exists itinerary_trip_date_bounds on public.itinerary_items;
create trigger itinerary_trip_date_bounds before insert or update of trip_id, starts_at, ends_at, timezone, timing_mode, scheduled_date, anchor_itinerary_item_id, relative_position on public.itinerary_items
for each row execute function public.enforce_itinerary_trip_dates();

create or replace function public.enforce_trip_contains_itinerary()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1
    from public.itinerary_items item
    where item.trip_id = new.id
      and item.deleted_at is null
      and item.timing_mode <> 'unscheduled'
      and (
        coalesce(item.scheduled_date, (item.starts_at at time zone item.timezone)::date) < new.start_date
        or coalesce(item.scheduled_date, (item.starts_at at time zone item.timezone)::date) > new.end_date
        or (item.ends_at is not null and (item.ends_at at time zone item.timezone)::date not between new.start_date and new.end_date)
      )
  ) then
    raise exception 'Move or archive timeline items outside the new trip dates first';
  end if;
  return new;
end;
$$;

drop trigger if exists trip_date_bounds_include_itinerary on public.trips;
create trigger trip_date_bounds_include_itinerary before update of start_date, end_date on public.trips
for each row execute function public.enforce_trip_contains_itinerary();

create or replace function public.enforce_cost_participant_trip()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.trip_costs cost join public.travelers traveler on traveler.id = new.traveler_id
    where cost.id = new.cost_id and traveler.trip_id = cost.trip_id and traveler.removed_at is null
  ) then raise exception 'Cost participant must belong to the same trip'; end if;
  return new;
end;
$$;

drop trigger if exists cost_participant_same_trip on public.trip_cost_participants;
create trigger cost_participant_same_trip before insert or update on public.trip_cost_participants
for each row execute function public.enforce_cost_participant_trip();

create or replace function public.enforce_cost_payer_trip()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.paid_by_traveler_id is not null and not exists (
    select 1 from public.travelers traveler where traveler.id = new.paid_by_traveler_id and traveler.trip_id = new.trip_id and traveler.removed_at is null
  ) then raise exception 'Cost payer must belong to the same trip'; end if;
  return new;
end;
$$;

drop trigger if exists cost_payer_same_trip on public.trip_costs;
create trigger cost_payer_same_trip before insert or update of trip_id, paid_by_traveler_id on public.trip_costs
for each row execute function public.enforce_cost_payer_trip();

create or replace function public.archive_trip_item(requested_itinerary_item_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare item public.itinerary_items%rowtype; archived_at timestamptz := now();
begin
  select * into item from public.itinerary_items where id = requested_itinerary_item_id and deleted_at is null;
  if not found or not public.can_edit_trip(item.trip_id) then raise exception 'Timeline item cannot be archived'; end if;
  if item.booking_id is null then
    update public.itinerary_items set deleted_at = archived_at where id = item.id;
  else
    update public.bookings set deleted_at = archived_at where id = item.booking_id;
    update public.itinerary_items set deleted_at = archived_at where booking_id = item.booking_id and deleted_at is null;
  end if;
end;
$$;

create or replace function public.restore_trip_item(requested_itinerary_item_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare item public.itinerary_items%rowtype;
begin
  select * into item from public.itinerary_items where id = requested_itinerary_item_id;
  if not found or not public.can_edit_trip(item.trip_id) then raise exception 'Timeline item cannot be restored'; end if;
  if item.booking_id is null then
    update public.itinerary_items set deleted_at = null where id = item.id;
  else
    update public.bookings set deleted_at = null where id = item.booking_id;
    update public.itinerary_items set deleted_at = null where booking_id = item.booking_id;
  end if;
end;
$$;

create or replace function public.delete_trip_permanently(requested_trip_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_trip_owner(requested_trip_id) then raise exception 'Only the trip owner can permanently delete this trip'; end if;
  delete from public.trips where id = requested_trip_id;
end;
$$;

alter table public.trip_cost_participants enable row level security;
revoke all on public.trip_cost_participants from anon, authenticated;
grant select, insert, update, delete on public.trip_cost_participants to authenticated;
grant all on public.trip_cost_participants to service_role;
drop policy if exists cost_participants_read on public.trip_cost_participants;
create policy cost_participants_read on public.trip_cost_participants for select to authenticated using (
  exists (select 1 from public.trip_costs cost where cost.id = cost_id and public.is_trip_member(cost.trip_id))
);
drop policy if exists cost_participants_write on public.trip_cost_participants;
create policy cost_participants_write on public.trip_cost_participants for all to authenticated using (
  exists (select 1 from public.trip_costs cost where cost.id = cost_id and public.can_edit_trip(cost.trip_id))
) with check (
  exists (select 1 from public.trip_costs cost where cost.id = cost_id and public.can_edit_trip(cost.trip_id))
);

revoke all on function public.enforce_itinerary_trip_dates(), public.enforce_trip_contains_itinerary(), public.enforce_cost_participant_trip(), public.enforce_cost_payer_trip() from public, anon, authenticated;
revoke all on function public.archive_trip_item(uuid), public.restore_trip_item(uuid), public.delete_trip_permanently(uuid) from public, anon;
grant execute on function public.archive_trip_item(uuid), public.restore_trip_item(uuid), public.delete_trip_permanently(uuid) to authenticated;

commit;
notify pgrst, 'reload schema';
