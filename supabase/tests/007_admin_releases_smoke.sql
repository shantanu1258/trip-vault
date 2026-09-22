-- Isolated test project only. All fixtures and mutations roll back.
begin;
do $$
declare
  admin_id uuid := gen_random_uuid(); outsider_id uuid := gen_random_uuid();
  draft_id uuid; live_id uuid; next_draft uuid; airline_count integer;
begin
  if has_function_privilege('anon','public.discard_config_draft(uuid)','EXECUTE')
    or not has_function_privilege('authenticated','public.discard_config_draft(uuid)','EXECUTE') then
    raise exception 'Incorrect draft-discard RPC grants';
  end if;
  insert into auth.users(id,email) values(admin_id,admin_id||'@admin-test.invalid'),(outsider_id,outsider_id||'@admin-test.invalid');
  insert into public.app_admins(user_id) values(admin_id);
  select id into live_id from public.config_releases where status='published';
  if live_id is null then raise exception 'Run the admin-gated catalogue phase before this test'; end if;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  execute 'set local role authenticated';
  draft_id := public.create_config_draft('Discard test');
  select count(*) into airline_count from public.airline_catalog_entries where config_release_id=draft_id;
  perform set_config('request.jwt.claim.sub',outsider_id::text,true);
  begin
    perform public.discard_config_draft(draft_id);
    raise exception 'Non-admin could discard a draft';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  begin
    perform public.discard_config_draft(live_id);
    raise exception 'Published release could be discarded';
  exception when sqlstate '55000' then null;
  end;
  begin
    perform public.discard_config_draft(gen_random_uuid());
    raise exception 'Missing release was accepted';
  exception when sqlstate '55000' then null;
  end;
  perform public.discard_config_draft(draft_id);
  if not exists(select 1 from public.config_releases where id=draft_id and status='retired' and version_number is null)
    or not exists(select 1 from public.config_releases where id=live_id and status='published')
    or not exists(select 1 from public.config_audit_events where config_release_id=draft_id and safe_summary @> '{"discarded_draft":true}')
    or airline_count <> (select count(*) from public.airline_catalog_entries where config_release_id=draft_id) then
    raise exception 'Discard did not preserve live config and audit data';
  end if;
  begin
    perform public.discard_config_draft(draft_id);
    raise exception 'Already discarded draft accepted';
  exception when sqlstate '55000' then null;
  end;
  begin
    perform public.publish_config_release(draft_id);
    raise exception 'Discarded draft was published';
  exception when raise_exception then
    if sqlerrm <> 'Publish requires a draft' then raise; end if;
  end;
  next_draft := public.create_config_draft('Publish test');
  perform public.publish_config_release(next_draft);
  if not exists(select 1 from public.config_releases where id=next_draft and status='published') then
    raise exception 'Valid draft publication failed';
  end if;
  begin
    perform public.discard_config_draft(live_id);
    raise exception 'Historical published release could be discarded';
  exception when sqlstate '55000' then null;
  end;
  execute 'reset role';
end $$;
rollback;
