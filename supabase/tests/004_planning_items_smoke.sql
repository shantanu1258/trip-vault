-- Run after the complete setup. This verifies the reversible
-- Planning-item data boundary without creating any persistent records.

begin;

do $$
begin
  if to_regclass('public.planning_items') is null then
    raise exception 'Planning items table is missing';
  end if;
  if not exists (
    select 1
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'planning_items'
      and relation.relrowsecurity
  ) then
    raise exception 'Planning items RLS is not enabled';
  end if;
  if exists (
    select required.policyname
    from (values ('planning_items_read'), ('planning_items_write')) as required(policyname)
    where not exists (
      select 1
      from pg_policies policy
      where policy.schemaname = 'public'
        and policy.tablename = 'planning_items'
        and policy.policyname = required.policyname
    )
  ) then
    raise exception 'Planning item read/write policies are incomplete';
  end if;
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.planning_items'::regclass
      and tgname = 'planning_item_context'
      and not tgisinternal
  ) then
    raise exception 'Planning item same-trip/type validation is missing';
  end if;
  if to_regprocedure('public.enforce_planning_item_context()') is null then
    raise exception 'Planning item validation function is missing';
  end if;
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'planning_items'
  ) then
    raise exception 'Planning items are missing from Realtime';
  end if;
  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.planning_items'::regclass
      and constraint_row.conname = 'planning_item_promotion_shape'
  ) then
    raise exception 'Planning item promoted-link shape is not enforced';
  end if;
end;
$$;

select 'Trip Vault Planning items smoke test passed' as result;

rollback;
