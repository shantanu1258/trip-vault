-- Run after the complete setup in an isolated test project. No persistent writes.
begin;
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='account_document_uploads' and column_name='personal_title')
    or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='trip_costs' and column_name='document_id')
    or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='trip_costs' and column_name='activity_moment_id') then
    raise exception 'Missing personal Vault or expense-document/Moment association columns';
  end if;
  if to_regprocedure('public.detach_booking_document(uuid,uuid)') is null
    or to_regprocedure('public.delete_archived_trip_item(uuid,uuid,text)') is null
    or to_regprocedure('public.reorder_agenda_items(text,uuid,uuid,uuid,integer,integer)') is null then
    raise exception 'Missing current unlink, archive or agenda-ordering RPC';
  end if;
  if has_function_privilege('anon','public.detach_booking_document(uuid,uuid)','EXECUTE')
    or not has_function_privilege('authenticated','public.detach_booking_document(uuid,uuid)','EXECUTE') then
    raise exception 'Booking-document detach privilege boundary is incorrect';
  end if;
  if not exists(select 1 from pg_trigger where tgname='activity_event_booking_timing' and tgrelid='public.itinerary_items'::regclass)
    or not exists(select 1 from pg_trigger where tgname='activity_booking_event_timing' and tgrelid='public.bookings'::regclass) then
    raise exception 'Missing two-way activity booking timing triggers';
  end if;
  begin
    perform set_config('request.jwt.claim.sub', '', true);
    perform public.detach_booking_document(gen_random_uuid(),gen_random_uuid());
    raise exception 'Unauthenticated detach was allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
rollback;
