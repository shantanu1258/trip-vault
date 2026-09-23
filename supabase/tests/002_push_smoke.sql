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
  cost_id uuid := gen_random_uuid(); booking_id uuid := gen_random_uuid();
  snapshot jsonb;
  early_flight uuid := gen_random_uuid(); early_bus uuid := gen_random_uuid();
  early_job uuid;
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
      (now() at time zone 'UTC')::date + 7,'UTC','upcoming',owner_id);
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
  select change_details into snapshot from public.push_jobs where id=event_job;
  if snapshot->>'action' is distinct from 'created' or snapshot->>'item_title' is distinct from 'Push event' then
    raise exception 'Created event facts missing';
  end if;
  update public.itinerary_items set title='Renamed event', notes='Do not expose this note' where id=event_id;
  select change_details into snapshot from public.push_jobs where entity_id=event_id and kind='event'
    and subscription_id=recipient_device and change_details->>'action'='updated' order by created_at desc limit 1;
  if snapshot->'before'->>'title' is distinct from 'Push event' or snapshot->'after'->>'title' is distinct from 'Renamed event'
    or not (snapshot->'changed_fields' ? 'notes') or snapshot::text like '%Do not expose%' then
    raise exception 'Updated event snapshot incorrect or private note leaked';
  end if;
  if (select change_details->>'item_title' from public.push_jobs where id=event_job) is distinct from 'Push event' then
    raise exception 'Earlier notification was rewritten by later edit';
  end if;
  select count(*) into job_count from public.push_jobs where entity_id=event_id;
  update public.itinerary_items set sort_key='sort-only' where id=event_id;
  if (select count(*) from public.push_jobs where entity_id=event_id) <> job_count then
    raise exception 'Ordering-only update sent a notification';
  end if;

  insert into public.trip_costs(id,trip_id,title,amount_minor,currency_code,created_by)
    values(cost_id,fixture_trip_id,'Airport taxi',80000,'INR',owner_id);
  update public.trip_costs set amount_minor=95000,payment_status='paid' where id=cost_id;
  select change_details into snapshot from public.push_jobs where entity_id=cost_id
    and subscription_id=recipient_device and change_details->>'action'='updated';
  if snapshot->'before'->>'amount_minor' is distinct from '80000' or snapshot->'after'->>'amount_minor' is distinct from '95000'
    or snapshot->'after'->>'payment_status' is distinct from 'paid' then raise exception 'Expense diff incorrect'; end if;
  insert into public.bookings(id,trip_id,type,title,created_by)
    values(booking_id,fixture_trip_id,'activity','Museum booking',owner_id);
  update public.bookings set reference_code='Private reference', details='{"secret":"Private detail"}' where id=booking_id;
  select change_details into snapshot from public.push_jobs where entity_id=booking_id
    and subscription_id=recipient_device and kind='booking';
  if snapshot is null or not (snapshot->'changed_fields' ? 'reference_code')
    or snapshot::text like '%Private%' then raise exception 'Booking diff missing or private values leaked'; end if;

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
  insert into public.itinerary_items(id,trip_id,title,event_type,starts_at,timezone,created_by)
    values(early_flight,fixture_trip_id,'Upcoming flight','flight',now() + interval '5 days','Asia/Kolkata',owner_id),
      (early_bus,fixture_trip_id,'Upcoming bus','bus',now() + interval '5 days' + interval '1 minute','UTC',owner_id);
  perform public.claim_push_jobs();
  select id into early_job from public.push_jobs where entity_id=early_flight and kind='reminder' and subscription_id=recipient_device;
  if early_job is null or (select change_details->>'reminder_stage' from public.push_jobs where id=early_job) <> 'five_days' then
    raise exception 'Five-day flight reminder missing';
  end if;
  if exists(select 1 from public.push_jobs where entity_id=early_bus and kind='reminder') then raise exception 'Early reminder sent before five-day window'; end if;
  update public.itinerary_items set starts_at=now() + interval '4 days 23 hours' where id=early_bus;
  perform public.claim_push_jobs();
  if not exists(select 1 from public.push_jobs where entity_id=early_bus and kind='reminder') then raise exception 'Bus catch-up reminder missing'; end if;
  select count(*) into job_count from public.push_jobs where entity_id in (early_flight,early_bus) and kind='reminder';
  perform public.claim_push_jobs();
  if (select count(*) from public.push_jobs where entity_id in (early_flight,early_bus) and kind='reminder') <> job_count then raise exception 'Duplicate five-day reminders'; end if;
  update public.push_subscriptions set reminders=false where id=recipient_device;
  if public.push_job_is_allowed(early_job) then raise exception 'Reminder opt-out ignored'; end if;
  update public.push_subscriptions set reminders=true where id=recipient_device;
  update public.itinerary_items set event_status='skipped' where id=early_flight;
  if public.push_job_is_allowed(early_job) then raise exception 'Skipped flight still eligible'; end if;
  update public.itinerary_items set event_status='planned',event_type='activity' where id=early_flight;
  if public.push_job_is_allowed(early_job) then raise exception 'Non-journey early reminder eligible'; end if;
  update public.itinerary_items set event_type='flight',starts_at=now() + interval '30 minutes' where id=early_flight;
  if public.push_job_is_allowed(early_job) then raise exception 'Rescheduled early reminder survived'; end if;
  perform public.claim_push_jobs();
  if not exists(select 1 from public.push_jobs where entity_id=early_flight and kind='reminder' and change_details->>'reminder_stage'='one_hour') then
    raise exception 'Early reminder suppressed the one-hour reminder';
  end if;
  update public.itinerary_items set starts_at=now() + interval '4 days' where id=early_bus;
  perform public.claim_push_jobs();
  if exists(select 1 from public.push_jobs where entity_id=early_bus and kind='reminder' and status in ('pending','sending')) then
    raise exception 'Late five-day reminder still sendable';
  end if;
  update public.itinerary_items set starts_at = original_start + interval '2 hours' where id=event_id;
  if public.push_job_is_allowed(reminder_job) then raise exception 'Stale reminder survived reschedule'; end if;
  update public.itinerary_items set deleted_at=now() where id=event_id;
  if public.push_job_is_allowed(event_job) then raise exception 'Deleted event remained eligible'; end if;
  update public.itinerary_items set deleted_at=null where id=event_id;
  if not exists(select 1 from public.push_jobs where entity_id=event_id and change_details->>'action'='restored') then
    raise exception 'Restored event was not distinguished from creation';
  end if;

  if exists(select 1 from public.prepare_test_push(owner_id, recipient_device)) then raise exception 'Test send can target another user'; end if;
  if not exists(select 1 from public.prepare_test_push(recipient_id, recipient_device)) then raise exception 'Owner test rejected'; end if;
  if exists(select 1 from public.prepare_test_push(recipient_id, recipient_device)) then raise exception 'Test-send rate limit missing'; end if;
end $$;
rollback;
