-- Isolated test database only. Rolls back all fixtures; never sends HTTP.
begin;
do $$
declare
  actor uuid := gen_random_uuid(); trip uuid := gen_random_uuid();
  device uuid; item uuid; job uuid; journey text; status_value text;
  departure timestamptz := now() + interval '48 hours';
begin
  insert into auth.users(id,email) values(actor, actor || '@48-hour-test.invalid');
  insert into public.trips(id,title,start_date,end_date,primary_timezone,status,created_by)
    values(trip,'Reminder fixture',current_date,current_date+7,'UTC','upcoming',actor);
  insert into public.trip_members(trip_id,user_id,role,status,added_by)
    values(trip,actor,'owner','active',actor) on conflict do nothing;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  device := public.register_push_subscription('https://fcm.googleapis.com/test/' || actor,repeat('a',87),repeat('b',22));

  foreach journey in array array['flight','train','bus','ferry','cab'] loop
    item := gen_random_uuid();
    insert into public.itinerary_items(id,trip_id,title,event_type,starts_at,timezone,created_by)
      values(item,trip,'Upcoming ' || journey,journey::public.timeline_event_type,departure + interval '1 second','Asia/Kolkata',actor);
    perform public.claim_push_jobs();
    if exists(select 1 from public.push_jobs where entity_id=item and kind='reminder') then
      raise exception '48-hour reminder sent too early for %',journey;
    end if;
    update public.itinerary_items set starts_at=departure where id=item;
    perform public.claim_push_jobs();
    select id into job from public.push_jobs where entity_id=item and kind='reminder' and subscription_id=device;
    if job is null or not public.push_job_is_allowed(job)
      or (select change_details->>'reminder_stage' from public.push_jobs where id=job) is distinct from 'forty_eight_hours'
      or (select expires_at from public.push_jobs where id=job) <> departure - interval '24 hours' then
      raise exception '48-hour reminder missing or incorrect for %',journey;
    end if;
    update public.push_jobs set status='sent',finished_at=now() where id=job;
    perform public.claim_push_jobs();
    if (select count(*) from public.push_jobs where entity_id=item and kind='reminder') <> 1 then
      raise exception 'Repeated 48-hour reminder for %',journey;
    end if;
    update public.push_subscriptions set reminders=false where id=device;
    if public.push_job_is_allowed(job) then raise exception 'Reminder opt-out ignored'; end if;
    update public.push_subscriptions set reminders=true where id=device;
    update public.trip_members set status='removed' where trip_id=trip and user_id=actor;
    if public.push_job_is_allowed(job) then raise exception 'Removed membership ignored'; end if;
    update public.trip_members set status='active' where trip_id=trip and user_id=actor;
    foreach status_value in array array['done','cancelled','skipped'] loop
      update public.itinerary_items set event_status=status_value where id=item;
      if public.push_job_is_allowed(job) then raise exception 'Inactive event remained eligible'; end if;
    end loop;
    update public.itinerary_items set event_status='planned',event_type='activity' where id=item;
    if public.push_job_is_allowed(job) then raise exception 'Non-travel event remained eligible'; end if;
    update public.itinerary_items set event_type=journey::public.timeline_event_type,is_all_day=true where id=item;
    if public.push_job_is_allowed(job) then raise exception 'All-day event remained eligible'; end if;
    update public.itinerary_items set is_all_day=false,starts_at=departure - interval '1 hour' where id=item;
    if public.push_job_is_allowed(job) then raise exception 'Rescheduled reminder survived'; end if;
    perform public.claim_push_jobs();
    if not exists(select 1 from public.push_jobs where entity_id=item and expected_start=departure - interval '1 hour' and kind='reminder') then
      raise exception 'Catch-up reminder missing';
    end if;
    update public.itinerary_items set starts_at=now() + interval '24 hours' where id=item;
    perform public.claim_push_jobs();
    if exists(select 1 from public.push_jobs where entity_id=item and kind='reminder' and status in ('pending','sending')) then
      raise exception 'Expired 48-hour reminder survived';
    end if;
    update public.itinerary_items set starts_at=now() + interval '30 minutes' where id=item;
    perform public.claim_push_jobs();
    if not exists(select 1 from public.push_jobs where entity_id=item and kind='reminder' and change_details->>'reminder_stage'='one_hour') then
      raise exception '48-hour reminder suppressed one-hour stage';
    end if;
  end loop;

  insert into public.itinerary_items(trip_id,title,event_type,starts_at,timezone,created_by)
    values(trip,'Not a journey','activity',departure,'UTC',actor);
  perform public.claim_push_jobs();
  if exists(select 1 from public.push_jobs j join public.itinerary_items i on i.id=j.entity_id
    where i.trip_id=trip and i.event_type='activity' and j.kind='reminder') then
    raise exception '48-hour stage included a non-travel event';
  end if;
end $$;
rollback;
