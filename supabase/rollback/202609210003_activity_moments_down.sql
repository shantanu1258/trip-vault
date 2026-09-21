-- MANUAL ROLLBACK for 202609210003_activity_moments.sql.
-- Activity events and their ordinary event costs remain. Saved Moments are removed.

begin;

do $publication$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'activity_moments'
  ) then
    alter publication supabase_realtime drop table public.activity_moments;
  end if;
end
$publication$;

drop trigger if exists trip_cost_activity_moment on public.trip_costs;
drop function if exists public.enforce_trip_cost_activity_moment();

do $triggers$
begin
  if to_regclass('public.activity_moments') is not null then
    drop trigger if exists activity_moment_context on public.activity_moments;
    drop trigger if exists set_updated_at on public.activity_moments;
    drop trigger if exists increment_entity_version on public.activity_moments;
  end if;
end
$triggers$;
drop function if exists public.enforce_activity_moment_context();

update public.trip_costs set activity_moment_id = null
where activity_moment_id is not null;

alter table public.trip_costs
  drop constraint if exists trip_cost_single_association;
alter table public.trip_costs add constraint trip_cost_single_association check (
  document_id is null or
  (booking_id is null and itinerary_item_id is null and cab_stop_id is null)
);

alter table public.trip_costs drop column if exists activity_moment_id;
drop table if exists public.activity_moments;

commit;

notify pgrst, 'reload schema';

do $rollback_status$
begin
  raise notice 'Trip Vault activity Moments rolled back. Activity events were preserved.';
end
$rollback_status$;
