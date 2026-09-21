begin;

do $test$
begin
  if to_regclass('public.activity_moments') is null then
    raise exception 'activity_moments table is missing';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'trip_costs'
      and column_name = 'activity_moment_id'
  ) then
    raise exception 'trip_costs.activity_moment_id is missing';
  end if;
end
$test$;

rollback;
