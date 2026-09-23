-- Existing projects: run this migration, not the complete fresh-setup installer.
-- Requires existing Web Push tables/RPCs. Safe to reapply; sends no notifications.
-- Redeploy push-dispatch and the frontend worker after applying this migration.
begin;

alter table public.push_jobs add column if not exists change_details jsonb;

create or replace function public.queue_trip_push_change() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  category text := case when tg_table_name = 'trip_costs' then 'cost'
    when tg_table_name = 'bookings' then 'booking' else 'event' end;
  current_row jsonb := to_jsonb(new);
  previous_row jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  changed_fields jsonb;
  before_values jsonb;
  after_values jsonb;
  allowed_keys text[] := array['title','amount_minor','currency_code','payment_status','category',
    'starts_at','ends_at','timezone','start_at','end_at','source_timezone',
    'event_status','reservation_state','timing_mode','has_explicit_start_time','is_all_day'];
begin
  if new.deleted_at is not null then return new; end if;
  select coalesce(jsonb_agg(key order by key), '[]'::jsonb) into changed_fields
    from jsonb_each(current_row)
    where key <> all(array['version','updated_at','updated_by','sort_key'])
      and value is distinct from previous_row -> key;
  if tg_op = 'UPDATE' and changed_fields = '[]'::jsonb then return new; end if;

  -- Capture the change when it happens, not a later row state at dispatch time.
  -- Never copy notes, references, contact information or arbitrary booking JSON.
  select coalesce(jsonb_object_agg(key,value), '{}'::jsonb) into before_values
    from jsonb_each(previous_row) where key = any(allowed_keys);
  select coalesce(jsonb_object_agg(key,value), '{}'::jsonb) into after_values
    from jsonb_each(current_row) where key = any(allowed_keys);

  insert into public.push_jobs(subscription_id,trip_id,entity_id,kind,occurrence,expires_at,change_details)
  select s.id, new.trip_id, new.id, category,
    category || ':' || new.id || ':' || new.version || ':' || new.updated_at,
    now() + interval '24 hours',
    jsonb_build_object('action', case when tg_op = 'INSERT' then 'created'
      when previous_row ->> 'deleted_at' is not null then 'restored' else 'updated' end,
      'item_title', left(new.title,160), 'trip_title', left(t.title,160),
      'changed_fields', changed_fields, 'before', before_values, 'after', after_values)
  from public.push_subscriptions s
  join public.trip_members m on m.user_id = s.user_id and m.trip_id = new.trip_id and m.status = 'active'
  join public.trips t on t.id = new.trip_id and t.deleted_at is null and t.status <> 'archived'
  where s.user_id is distinct from coalesce(auth.uid(), new.created_by)
    and case when category = 'cost' then s.cost_changes else s.event_changes end
  on conflict (subscription_id, occurrence) do nothing;
  return new;
end $$;
revoke all on function public.queue_trip_push_change() from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
