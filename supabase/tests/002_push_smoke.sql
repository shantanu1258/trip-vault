-- Run with the SQL Editor on an ISOLATED TEST PROJECT after the application
-- complete setup. Never enables Cron or sends HTTP.
-- All fixture users, records, jobs, and claim changes roll back.
begin;
do $$
declare
  owner_id uuid := gen_random_uuid(); recipient_id uuid := gen_random_uuid();
  fixture_trip_id uuid := gen_random_uuid(); event_id uuid := gen_random_uuid();
  owner_device uuid; recipient_device uuid; event_job uuid; reminder_job uuid;
  original_start timestamptz := now() + interval '30 minutes';
  job_count integer;
begin
  if has_table_privilege('authenticated','public.push_jobs','INSERT') or
    has_table_privilege('anon','public.push_subscriptions','SELECT') or
    has_column_privilege('authenticated','public.push_subscriptions','user_id','UPDATE') or
    has_column_privilege('authenticated','public.push_subscriptions','endpoint','UPDATE') or
    has_function_privilege('authenticated','public.claim_push_jobs()','EXECUTE') or
    has_function_privilege('anon','public.register_push_subscription(text,text,text)','EXECUTE') or
    has_function_privilege('authenticated','public.prepare_test_push(uuid,uuid)','EXECUTE') then
    raise exception 'Push privilege boundary is not enforced';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.push_subscriptions'::regclass) or
    not (select relrowsecurity from pg_class where oid='public.push_jobs'::regclass) then
    raise exception 'Push tables must have RLS';
  end if;

  insert into auth.users(id,email) values
    (owner_id, owner_id || '@push-test.invalid'), (recipient_id, recipient_id || '@push-test.invalid');
  insert into public.trips(id,title,start_date,end_date,primary_timezone,status,created_by)
    values(fixture_trip_id,'Push fixture',(now() at time zone 'UTC')::date,
      (now() at time zone 'UTC')::date + 2,'UTC','upcoming',owner_id);
  insert into public.trip_members(trip_id,user_id,role,status,added_by)
    values(fixture_trip_id,owner_id,'owner','active',owner_id), (fixture_trip_id,recipient_id,'viewer','active',owner_id)
    on conflict do nothing;

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  owner_device := public.register_push_subscription('https://fcm.googleapis.com/test/' || owner_id,
    repeat('a',87), repeat('b',22));
  perform set_config('request.jwt.claim.sub', recipient_id::text, true);
  recipient_device := public.register_push_subscription('https://fcm.googleapis.com/test/' || recipient_id,
    repeat('a',87), repeat('b',22));

  -- Execute the owner policy as an authenticated user, not as the SQL Editor role.
  execute 'set local role authenticated';
  if (select count(*) from public.push_subscriptions) <> 1 then raise exception 'Another user device leaked through RLS'; end if;
  delete from public.push_subscriptions where id = owner_device;
  if found then raise exception 'Another user device could be deleted'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  insert into public.itinerary_items(id,trip_id,title,event_type,starts_at,timezone,created_by)
    values(event_id,fixture_trip_id,'Push event','activity',original_start,'UTC',owner_id);
  select id into event_job from public.push_jobs where entity_id = event_id and kind = 'event' and subscription_id = recipient_device;
  if event_job is null then raise exception 'Change did not queue for another member'; end if;
  if exists(select 1 from public.push_jobs where entity_id = event_id and kind = 'event' and subscription_id = owner_device) then
    raise exception 'Change notification sent back to its author';
  end if;
  if not public.push_job_is_allowed(event_job) then raise exception 'Authorized job rejected'; end if;
  update public.push_subscriptions set event_changes=false where id=recipient_device;
  if public.push_job_is_allowed(event_job) then raise exception 'Opt-out ignored'; end if;
  update public.push_subscriptions set event_changes=true where id=recipient_device;
  update public.trip_members set status='removed' where user_id=recipient_id and trip_members.trip_id=fixture_trip_id;
  if public.push_job_is_allowed(event_job) then raise exception 'Membership removal ignored'; end if;
  update public.trip_members set status='active' where user_id=recipient_id and trip_members.trip_id=fixture_trip_id;

  perform public.claim_push_jobs();
  select id into reminder_job from public.push_jobs where entity_id=event_id and kind='reminder' and subscription_id=recipient_device;
  if reminder_job is null then raise exception 'Timed reminder not derived'; end if;
  select count(*) into job_count from public.push_jobs where entity_id=event_id;
  perform public.claim_push_jobs();
  if (select count(*) from public.push_jobs where entity_id=event_id) <> job_count then raise exception 'Duplicate reminder occurrence'; end if;
  update public.itinerary_items set starts_at = original_start + interval '2 hours' where id=event_id;
  if public.push_job_is_allowed(reminder_job) then raise exception 'Stale reminder survived reschedule'; end if;
  update public.itinerary_items set deleted_at=now() where id=event_id;
  if public.push_job_is_allowed(event_job) then raise exception 'Deleted event remained eligible'; end if;

  if exists(select 1 from public.prepare_test_push(owner_id, recipient_device)) then raise exception 'Test send can target another user'; end if;
  if not exists(select 1 from public.prepare_test_push(recipient_id, recipient_device)) then raise exception 'Owner test rejected'; end if;
  if exists(select 1 from public.prepare_test_push(recipient_id, recipient_device)) then raise exception 'Test-send rate limit missing'; end if;
end $$;
rollback;
