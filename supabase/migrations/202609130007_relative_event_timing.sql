-- Preserve before/after ordering while allowing an event to gain a real start
-- time, end time, or planned duration independently.

begin;

do $migration$
declare
  had_explicit_start_column boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'itinerary_items'
      and column_name = 'has_explicit_start_time'
  ) into had_explicit_start_column;

  alter table public.itinerary_items
    add column if not exists has_explicit_start_time boolean not null default true;

  -- Rows created before this migration used starts_at only as the non-null
  -- ordering fallback for flexible timing modes. Do this conversion only when
  -- the column is first introduced so rerunning the setup never erases a real
  -- start time later added to a relative event.
  if not had_explicit_start_column then
    update public.itinerary_items
    set has_explicit_start_time = false
    where timing_mode in ('relative', 'date_only', 'all_day', 'unscheduled');
  end if;
end;
$migration$;

alter table public.itinerary_items
  alter column has_explicit_start_time set default true;
update public.itinerary_items
set has_explicit_start_time = case
  when timing_mode in ('date_only', 'all_day', 'unscheduled') then false
  else true
end
where has_explicit_start_time is null;
alter table public.itinerary_items
  alter column has_explicit_start_time set not null;

alter table public.itinerary_items
  add column if not exists duration_minutes integer;

-- Exact events already carrying an end can expose their duration immediately
-- when the interval can be represented without losing precision.
update public.itinerary_items
set duration_minutes = (extract(epoch from (ends_at - starts_at)) / 60)::integer
where duration_minutes is null
  and has_explicit_start_time
  and timing_mode in ('exact', 'relative')
  and ends_at > starts_at
  and mod(extract(epoch from (ends_at - starts_at)), 60) = 0
  and extract(epoch from (ends_at - starts_at)) / 60 <= 2147483647;

-- Older rows were allowed to store a zero-length range. Treat that as an
-- unknown end rather than leaving a value that the stricter trigger rejects.
update public.itinerary_items
set ends_at = null,
    duration_minutes = null
where has_explicit_start_time
  and timing_mode in ('exact', 'relative')
  and ends_at = starts_at;

-- Flexible modes never own an end timestamp. Relative events may retain a
-- duration even when their actual start is still unknown.
update public.itinerary_items
set ends_at = null,
    duration_minutes = case when timing_mode = 'relative' then duration_minutes else null end
where not has_explicit_start_time;

update public.itinerary_items
set has_explicit_start_time = true
where timing_mode = 'exact' and not has_explicit_start_time;

update public.itinerary_items
set has_explicit_start_time = false,
    ends_at = null,
    duration_minutes = null
where timing_mode in ('date_only', 'all_day', 'unscheduled');

-- Make a rerun safe even if a partially applied client previously wrote an
-- invalid duration before this constraint existed.
update public.itinerary_items
set duration_minutes = null
where duration_minutes <= 0;

alter table public.itinerary_items
  drop constraint if exists itinerary_duration_minutes_positive;
alter table public.itinerary_items
  add constraint itinerary_duration_minutes_positive
  check (duration_minutes is null or duration_minutes > 0);

alter table public.itinerary_items
  drop constraint if exists itinerary_timing_precision_check;
alter table public.itinerary_items
  add constraint itinerary_timing_precision_check
  check (
    (
      (timing_mode = 'exact' and has_explicit_start_time)
      or timing_mode = 'relative'
      or (
        timing_mode in ('date_only', 'all_day', 'unscheduled')
        and not has_explicit_start_time
      )
    )
    and (has_explicit_start_time or ends_at is null)
    and (timing_mode in ('exact', 'relative') or duration_minutes is null)
  );

alter table public.itinerary_items
  drop constraint if exists itinerary_duration_consistency_check;
alter table public.itinerary_items
  add constraint itinerary_duration_consistency_check
  check (
    ends_at is null
    or duration_minutes is null
    or ends_at = starts_at + make_interval(mins => duration_minutes)
  );

create or replace function public.enforce_itinerary_trip_dates()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  trip_row public.trips%rowtype;
  anchor_row public.itinerary_items%rowtype;
  local_start date;
  local_end date;
  duration_seconds numeric;
begin
  select * into trip_row
  from public.trips
  where id = new.trip_id and deleted_at is null;
  if not found then raise exception 'Trip is unavailable'; end if;

  if new.timing_mode = 'relative' then
    select * into anchor_row
    from public.itinerary_items
    where id = new.anchor_itinerary_item_id
      and id <> new.id
      and trip_id = new.trip_id
      and deleted_at is null;
    if not found or anchor_row.timing_mode in ('relative', 'unscheduled') then
      raise exception 'Choose a dated, non-relative event from this trip as the before/after anchor';
    end if;

    if not new.has_explicit_start_time then
      if new.ends_at is not null then
        raise exception 'Add a start time before adding an end time';
      end if;
      new.starts_at := anchor_row.starts_at;
      new.scheduled_date := coalesce(
        anchor_row.scheduled_date,
        (anchor_row.starts_at at time zone anchor_row.timezone)::date
      );
      new.timezone := anchor_row.timezone;
      new.ends_at := null;
      -- duration_minutes intentionally remains independent of an actual start.
    end if;
  elsif new.timing_mode = 'exact' then
    new.has_explicit_start_time := true;
  else
    new.has_explicit_start_time := false;
    if new.ends_at is not null then
      raise exception 'Add a start time before adding an end time';
    end if;
    new.ends_at := null;
    new.duration_minutes := null;
    if new.timing_mode = 'unscheduled' then
      new.scheduled_date := null;
      return new;
    end if;
  end if;

  if new.timing_mode in ('exact', 'relative') and new.has_explicit_start_time then
    if new.duration_minutes is not null and new.duration_minutes <= 0 then
      raise exception 'Duration must be a positive number of minutes';
    end if;

    if new.ends_at is null and new.duration_minutes is not null then
      new.ends_at := new.starts_at + make_interval(mins => new.duration_minutes);
    elsif new.ends_at is not null and new.duration_minutes is null then
      duration_seconds := extract(epoch from (new.ends_at - new.starts_at));
      if duration_seconds <= 0 then
        raise exception 'End time must be after start time';
      end if;
      if mod(duration_seconds, 60) <> 0 then
        raise exception 'Duration must resolve to whole minutes';
      end if;
      if duration_seconds / 60 > 2147483647 then
        raise exception 'Duration is too large';
      end if;
      new.duration_minutes := (duration_seconds / 60)::integer;
    elsif new.ends_at is not null
      and new.ends_at is distinct from new.starts_at + make_interval(mins => new.duration_minutes) then
      raise exception 'End time and duration do not match';
    end if;

    if new.ends_at is not null and new.ends_at <= new.starts_at then
      raise exception 'End time must be after start time';
    end if;

    local_start := (new.starts_at at time zone new.timezone)::date;
    local_end := case
      when new.ends_at is null then local_start
      else (new.ends_at at time zone new.timezone)::date
    end;
    new.scheduled_date := local_start;
  elsif new.timing_mode = 'relative' then
    local_start := new.scheduled_date;
    local_end := local_start;
  else
    local_start := coalesce(
      new.scheduled_date,
      (new.starts_at at time zone new.timezone)::date
    );
    local_end := local_start;
    new.scheduled_date := local_start;
  end if;

  if local_start < trip_row.start_date
    or local_start > trip_row.end_date
    or local_end < trip_row.start_date
    or local_end > trip_row.end_date then
    raise exception 'Event dates must stay between % and %', trip_row.start_date, trip_row.end_date;
  end if;

  return new;
end;
$$;

drop trigger if exists itinerary_trip_date_bounds on public.itinerary_items;
create trigger itinerary_trip_date_bounds
before insert or update of
  trip_id, starts_at, ends_at, timezone, timing_mode, scheduled_date,
  anchor_itinerary_item_id, relative_position, has_explicit_start_time,
  duration_minutes
on public.itinerary_items
for each row execute function public.enforce_itinerary_trip_dates();

create or replace function public.propagate_relative_anchor_timing()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if exists (
    select 1
    from public.itinerary_items dependent
    where dependent.anchor_itinerary_item_id = new.id
      and dependent.timing_mode = 'relative'
      and dependent.deleted_at is null
  ) and (
    new.trip_id is distinct from old.trip_id
    or new.deleted_at is not null
    or new.timing_mode in ('relative', 'unscheduled')
  ) then
    raise exception 'Move, archive, or re-anchor dependent events before changing this anchor';
  end if;

  update public.itinerary_items dependent
  set starts_at = new.starts_at,
      scheduled_date = coalesce(
        new.scheduled_date,
        (new.starts_at at time zone new.timezone)::date
      ),
      timezone = new.timezone
  where dependent.anchor_itinerary_item_id = new.id
    and dependent.timing_mode = 'relative'
    and not dependent.has_explicit_start_time
    and dependent.deleted_at is null
    and (
      dependent.starts_at is distinct from new.starts_at
      or dependent.scheduled_date is distinct from coalesce(
        new.scheduled_date,
        (new.starts_at at time zone new.timezone)::date
      )
      or dependent.timezone is distinct from new.timezone
    );

  return null;
end;
$$;

drop trigger if exists itinerary_propagate_relative_anchor_timing on public.itinerary_items;
create trigger itinerary_propagate_relative_anchor_timing
after update of trip_id, starts_at, scheduled_date, timezone, timing_mode, deleted_at
on public.itinerary_items
for each row execute function public.propagate_relative_anchor_timing();

revoke all on function public.enforce_itinerary_trip_dates() from public, anon, authenticated;
revoke all on function public.propagate_relative_anchor_timing() from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';
