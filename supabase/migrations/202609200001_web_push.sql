-- Apply after the existing Trip Vault migrations. This does NOT enable Cron.
begin;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) < 2048),
  p256dh text not null,
  auth text not null,
  event_changes boolean not null default true,
  cost_changes boolean not null default true,
  reminders boolean not null default true,
  last_test_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;
grant update(event_changes, cost_changes, reminders) on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;
create policy push_device_owner on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.push_jobs (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  entity_id uuid not null,
  kind text not null check (kind in ('event', 'booking', 'cost', 'reminder')),
  occurrence text not null,
  expected_start timestamptz,
  status text not null default 'pending' check (status in ('pending','sending','sent','cancelled','failed')),
  available_at timestamptz not null default now(),
  expires_at timestamptz not null,
  attempts integer not null default 0,
  lease_token uuid,
  leased_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique(subscription_id, occurrence)
);
create index push_jobs_due on public.push_jobs(available_at) where status in ('pending','sending');
alter table public.push_jobs enable row level security;
revoke all on public.push_jobs from anon, authenticated;
grant all on public.push_jobs to service_role;

create function public.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare result uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  -- Limit abuse and reject arbitrary/private-network endpoints. The sender repeats this check.
  if p_endpoint is null or length(p_endpoint) >= 2048 or
    p_endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)/' or
    p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{87}=?$' or
    p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{22}={0,2}$' then
    raise exception 'Invalid browser push subscription';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  if (select count(*) from public.push_subscriptions where user_id = auth.uid()) >= 10 then
    raise exception 'Device limit reached. Disable notifications on an old device first.';
  end if;
  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth)
    values(auth.uid(), p_endpoint, p_p256dh, p_auth) returning id into result;
  return result;
end $$;
revoke all on function public.register_push_subscription(text,text,text) from public, anon;
grant execute on function public.register_push_subscription(text,text,text) to authenticated;

-- No browser can insert jobs or choose another recipient. Source writes are governed
-- by their existing RLS. All current event/cost rows are readable by active trip members.
create function public.queue_trip_push_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare category text := case when tg_table_name = 'trip_costs' then 'cost'
  when tg_table_name = 'bookings' then 'booking' else 'event' end;
begin
  if new.deleted_at is not null then return new; end if;
  if tg_op = 'UPDATE' and
    (to_jsonb(new) - array['version','updated_at','sort_key']) =
    (to_jsonb(old) - array['version','updated_at','sort_key']) then return new; end if;
  insert into public.push_jobs(subscription_id,trip_id,entity_id,kind,occurrence,expires_at)
  select s.id, new.trip_id, new.id, category,
    category || ':' || new.id || ':' || new.version || ':' || new.updated_at,
    now() + interval '24 hours'
  from public.push_subscriptions s
  join public.trip_members m on m.user_id = s.user_id and m.trip_id = new.trip_id and m.status = 'active'
  join public.trips t on t.id = new.trip_id and t.deleted_at is null and t.status <> 'archived'
  where s.user_id is distinct from coalesce(auth.uid(), new.created_by)
    and case when category = 'cost' then s.cost_changes else s.event_changes end
  on conflict (subscription_id, occurrence) do nothing;
  return new;
end $$;
revoke all on function public.queue_trip_push_change() from public, anon, authenticated;
create trigger push_itinerary_change after insert or update on public.itinerary_items
  for each row execute function public.queue_trip_push_change();
create trigger push_cost_change after insert or update on public.trip_costs
  for each row execute function public.queue_trip_push_change();
-- Creation already queues the corresponding itinerary event; subsequent booking
-- detail changes (reference, contact, rooms, etc.) open the booking directly.
create trigger push_booking_change after update on public.bookings
  for each row execute function public.queue_trip_push_change();

create function public.push_job_is_allowed(p_job_id uuid) returns boolean
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
            and i.event_status not in ('done','cancelled')
            and (i.timing_mode = 'exact' or (i.timing_mode = 'relative' and i.has_explicit_start_time))
          ))
      ) end
  );
$$;
revoke all on function public.push_job_is_allowed(uuid) from public, anon, authenticated;
grant execute on function public.push_job_is_allowed(uuid) to service_role;

create function public.claim_push_jobs() returns setof public.push_jobs
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Reminders are derived from the latest synced schedule, not stale client timers.
  -- No all-day/date-only/inferred-time reminders. One notification per start occurrence/device.
  insert into public.push_jobs(subscription_id,trip_id,entity_id,kind,occurrence,expected_start,expires_at)
  select s.id, i.trip_id, i.id, 'reminder', 'reminder:' || i.id || ':' || i.starts_at, i.starts_at, i.starts_at
  from public.itinerary_items i
  join public.trips t on t.id = i.trip_id and t.deleted_at is null and t.status <> 'archived'
  join public.trip_members m on m.trip_id = i.trip_id and m.status = 'active'
  join public.push_subscriptions s on s.user_id = m.user_id and s.reminders
  where i.deleted_at is null and not i.is_all_day and i.event_status not in ('done','cancelled')
    and (i.timing_mode = 'exact' or (i.timing_mode = 'relative' and i.has_explicit_start_time))
    and i.starts_at > now() and i.starts_at <= now() + interval '1 hour'
  on conflict (subscription_id, occurrence) do nothing;

  update public.push_jobs set status = 'cancelled', finished_at = now()
    where status in ('pending','sending') and not public.push_job_is_allowed(id);
  update public.push_jobs set status = 'failed', finished_at = now()
    where status = 'sending' and attempts >= 5 and leased_at < now() - interval '5 minutes';
  -- Keep a bounded delivery history; old expired reminders cannot be regenerated.
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

create function public.finish_push_job(p_id uuid, p_lease uuid, p_result text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_result not in ('sent','retry','failed','cancelled') then raise exception 'Invalid result'; end if;
  update public.push_jobs set
    status = case when p_result = 'retry' and attempts < 5 then 'pending'
      when p_result = 'retry' then 'failed' else p_result end,
    available_at = now() + make_interval(secs => least(900, (30 * power(2, attempts))::integer)),
    finished_at = case when p_result = 'retry' and attempts < 5 then null else now() end
  where id = p_id and lease_token = p_lease and status = 'sending';
end $$;
revoke all on function public.finish_push_job(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.finish_push_job(uuid,uuid,text) to service_role;

-- Rate-limit test sends atomically. This function is only called after server JWT verification.
create function public.prepare_test_push(p_user uuid, p_subscription uuid)
returns setof public.push_subscriptions language sql security definer set search_path = public, pg_temp as $$
  update public.push_subscriptions set last_test_at = now()
  where id = p_subscription and user_id = p_user
    and (last_test_at is null or last_test_at < now() - interval '1 minute') returning *;
$$;
revoke all on function public.prepare_test_push(uuid,uuid) from public, anon, authenticated;
grant execute on function public.prepare_test_push(uuid,uuid) to service_role;

commit;
