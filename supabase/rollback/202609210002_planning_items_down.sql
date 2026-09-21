-- MANUAL ROLLBACK for 202609210002_planning_items.sql.
-- This permanently removes every saved Planning agenda item. It does not
-- remove first-class timeline events that were promoted from those items.

begin;

do $publication$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'planning_items'
  ) then
    alter publication supabase_realtime drop table public.planning_items;
  end if;
end
$publication$;

do $triggers$
begin
  if to_regclass('public.planning_items') is not null then
    drop trigger if exists planning_item_context on public.planning_items;
    drop trigger if exists set_updated_at on public.planning_items;
    drop trigger if exists increment_entity_version on public.planning_items;
  end if;
end
$triggers$;
drop function if exists public.enforce_planning_item_context();
drop table if exists public.planning_items;

commit;

notify pgrst, 'reload schema';

do $rollback_status$
begin
  raise notice 'Trip Vault Planning items rolled back. Promoted timeline events were preserved.';
end
$rollback_status$;
