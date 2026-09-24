-- Add 48-hour heads-ups for flights, trains, buses, ferries and cabs.
-- Requires 202609230002_journey_early_reminders.sql. Safe to reapply.
-- Keeps existing five-day flight/bus and one-hour reminders and preference.
begin;

create or replace function public.push_job_is_allowed(p_job_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.push_jobs j
    join public.push_subscriptions s on s.id = j.subscription_id
    join public.trip_members m on m.user_id = s.user_id and m.trip_id = j.trip_id and m.status = 'active'
    join public.trips t on t.id = j.trip_id and t.deleted_at is null and t.status <> 'archived'
    where j.id = p_job_id and j.expires_at > now()
      and case when j.kind = 'cost' then s.cost_changes when j.kind in ('event','booking') then s.event_changes else s.reminders end
      and case when j.kind = 'cost' then exists (
        select 1 from public.trip_costs c where c.id = j.entity_id and c.trip_id = j.trip_id and c.deleted_at is null
      ) when j.kind = 'booking' then exists (
        select 1 from public.bookings b where b.id = j.entity_id and b.trip_id = j.trip_id and b.deleted_at is null
      ) else exists (
        select 1 from public.itinerary_items i where i.id = j.entity_id and i.trip_id = j.trip_id and i.deleted_at is null
          and (j.kind <> 'reminder' or (
            i.starts_at = j.expected_start and i.starts_at > now() and not i.is_all_day
            and i.event_status not in ('done','cancelled','skipped')
            and (i.timing_mode = 'exact' or (i.timing_mode = 'relative' and i.has_explicit_start_time))
            and (coalesce(j.change_details->>'reminder_stage','one_hour') <> 'five_days'
              or (i.event_type in ('flight','bus') and i.event_type::text = j.change_details->>'event_type'
                and i.starts_at > now() + interval '4 days'
                and i.starts_at <= now() + interval '5 days'))
            and (coalesce(j.change_details->>'reminder_stage','one_hour') <> 'forty_eight_hours'
              or (i.event_type in ('flight','train','bus','ferry','cab')
                and i.event_type::text = j.change_details->>'event_type'
                and i.starts_at > now() + interval '24 hours'
                and i.starts_at <= now() + interval '48 hours'))
          ))
      ) end
  );
$$;
revoke all on function public.push_job_is_allowed(uuid) from public, anon, authenticated;
grant execute on function public.push_job_is_allowed(uuid) to service_role;

create or replace function public.claim_push_jobs() returns setof public.push_jobs
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Keep the existing one-hour occurrence key, so previously sent reminders never repeat.
  -- Separate stage keys deduplicate each heads-up per departure and device.
  -- Both early stages expire after 24 hours; never deliver stale catch-ups.
  insert into public.push_jobs(subscription_id,trip_id,entity_id,kind,occurrence,expected_start,expires_at,change_details)
  select s.id, i.trip_id, i.id, 'reminder',
    case stage.name when 'one_hour' then 'reminder:'
      when 'five_days' then 'reminder:five-days:' else 'reminder:48-hours:' end || i.id || ':' || i.starts_at,
    i.starts_at,
    case stage.name when 'one_hour' then i.starts_at
      when 'five_days' then i.starts_at - interval '4 days'
      else i.starts_at - interval '24 hours' end,
    jsonb_build_object('reminder_stage', stage.name, 'item_title', left(i.title,160),
      'trip_title', left(t.title,160), 'event_type', i.event_type,
      'after', jsonb_build_object('starts_at', i.starts_at, 'timezone', i.timezone,
        'timing_mode', i.timing_mode, 'has_explicit_start_time', i.has_explicit_start_time))
  from public.itinerary_items i
  join public.trips t on t.id = i.trip_id and t.deleted_at is null and t.status <> 'archived'
  join public.trip_members m on m.trip_id = i.trip_id and m.status = 'active'
  join public.push_subscriptions s on s.user_id = m.user_id and s.reminders
  cross join (values ('one_hour'), ('five_days'), ('forty_eight_hours')) stage(name)
  where i.deleted_at is null and not i.is_all_day and i.event_status not in ('done','cancelled','skipped')
    and (i.timing_mode = 'exact' or (i.timing_mode = 'relative' and i.has_explicit_start_time))
    and ((stage.name = 'one_hour' and i.starts_at > now() and i.starts_at <= now() + interval '1 hour')
      or (stage.name = 'five_days' and i.event_type in ('flight','bus')
        and i.starts_at > now() + interval '4 days' and i.starts_at <= now() + interval '5 days')
      or (stage.name = 'forty_eight_hours' and i.event_type in ('flight','train','bus','ferry','cab')
        and i.starts_at > now() + interval '24 hours' and i.starts_at <= now() + interval '48 hours'))
  on conflict (subscription_id, occurrence) do nothing;

  update public.push_jobs set status = 'cancelled', finished_at = now()
    where status in ('pending','sending') and not public.push_job_is_allowed(id);
  update public.push_jobs set status = 'failed', finished_at = now()
    where status = 'sending' and attempts >= 5 and leased_at < now() - interval '5 minutes';
  delete from public.push_jobs where expires_at < now() - interval '30 days';
  return query
  with candidates as (
    select id from public.push_jobs where attempts < 5 and available_at <= now()
      and (status = 'pending' or (status = 'sending' and leased_at < now() - interval '5 minutes'))
    order by available_at for update skip locked limit 20
  )
  update public.push_jobs j set status = 'sending', attempts = attempts + 1,
    leased_at = now(), lease_token = gen_random_uuid()
  from candidates c where j.id = c.id returning j.*;
end $$;
revoke all on function public.claim_push_jobs() from public, anon, authenticated;
grant execute on function public.claim_push_jobs() to service_role;
notify pgrst, 'reload schema';
commit;
