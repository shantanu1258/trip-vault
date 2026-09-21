-- Activity bookings and their timeline events share one local clock/schedule.
begin;

create or replace function public.sync_activity_event_booking_timing()
returns trigger language plpgsql security definer set search_path = public as $$
declare timed boolean;
begin
  if new.event_type::text <> 'activity'
    or new.booking_id is null or new.deleted_at is not null then return new; end if;
  timed := coalesce(new.timing_mode::text, 'exact') = 'exact'
    or (new.timing_mode::text = 'relative' and new.has_explicit_start_time);
  update public.bookings b set source_timezone = new.timezone,
    start_at = case when timed then new.starts_at else null end,
    end_at = case when timed then new.ends_at else null end
  where b.id = new.booking_id and b.trip_id = new.trip_id and b.type::text = 'activity'
    and b.deleted_at is null
    and (b.source_timezone is distinct from new.timezone
      or b.start_at is distinct from (case when timed then new.starts_at else null end)
      or b.end_at is distinct from (case when timed then new.ends_at else null end));
  return new;
end $$;

create or replace function public.sync_activity_booking_event_timing()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.type::text <> 'activity' or new.deleted_at is not null then return new; end if;
  if new.source_timezone is null or not public.valid_iana_timezone(new.source_timezone) then
    raise exception 'Choose a valid activity time zone';
  end if;
  if new.start_at is null and old.start_at is not null and exists (
    select 1 from public.itinerary_items i where i.booking_id = new.id and i.trip_id = new.trip_id
      and i.event_type::text = 'activity' and i.deleted_at is null
      and (coalesce(i.timing_mode::text, 'exact') = 'exact' or i.has_explicit_start_time)
  ) then
    raise exception 'Change the activity event to remove its scheduled time';
  end if;
  update public.itinerary_items i set
    timezone = new.source_timezone,
    starts_at = coalesce(new.start_at, i.starts_at),
    ends_at = case when new.start_at is not null then new.end_at else i.ends_at end,
    timing_mode = case when new.start_at is not null and i.timing_mode::text <> 'relative'
      then 'exact' else i.timing_mode end,
    has_explicit_start_time = case when new.start_at is not null then true else i.has_explicit_start_time end,
    is_all_day = case when new.start_at is not null then false else i.is_all_day end,
    scheduled_date = case when new.start_at is not null then (new.start_at at time zone new.source_timezone)::date else i.scheduled_date end,
    duration_minutes = case when new.start_at is not null then
      case when new.end_at is not null then round(extract(epoch from (new.end_at - new.start_at))/60)::integer else null end
      else i.duration_minutes end
  where i.booking_id = new.id and i.trip_id = new.trip_id and i.event_type::text = 'activity'
    and i.deleted_at is null
    and (i.timezone is distinct from new.source_timezone or (new.start_at is not null and
      (i.starts_at is distinct from new.start_at or i.ends_at is distinct from new.end_at
        or not coalesce(i.has_explicit_start_time,false))));
  return new;
end $$;

drop trigger if exists activity_event_booking_timing on public.itinerary_items;
create trigger activity_event_booking_timing
after insert or update of booking_id, timezone, starts_at, ends_at, timing_mode, has_explicit_start_time
on public.itinerary_items for each row execute function public.sync_activity_event_booking_timing();

drop trigger if exists activity_booking_event_timing on public.bookings;
create trigger activity_booking_event_timing
after update of source_timezone, start_at, end_at on public.bookings
for each row execute function public.sync_activity_booking_event_timing();

-- Align existing one-to-one activity bookings with the event (the initial source
-- of truth). Leave ambiguous multi-event bookings and archived records untouched.
with source as (
  select i.*, count(*) over (partition by i.booking_id) as linked_count
  from public.itinerary_items i where i.event_type::text = 'activity'
    and i.booking_id is not null and i.deleted_at is null
)
update public.itinerary_items i set timezone = i.timezone
from source s where i.id = s.id and s.linked_count = 1 and exists (
  select 1 from public.bookings b where b.id = i.booking_id and b.trip_id = i.trip_id
    and b.type::text = 'activity' and b.deleted_at is null and (
      b.source_timezone is distinct from i.timezone
      or b.start_at is distinct from (case when i.timing_mode::text = 'exact'
        or (i.timing_mode::text = 'relative' and i.has_explicit_start_time) then i.starts_at else null end)
      or b.end_at is distinct from (case when i.timing_mode::text = 'exact'
        or (i.timing_mode::text = 'relative' and i.has_explicit_start_time) then i.ends_at else null end)
    )
);

revoke all on function public.sync_activity_event_booking_timing() from public, anon, authenticated;
revoke all on function public.sync_activity_booking_event_timing() from public, anon, authenticated;
commit;
notify pgrst, 'reload schema';
