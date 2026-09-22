-- Admin release management: incremental upgrade for existing Trip Vault databases.
-- Requires the existing admin/config-release schema and validation functions.
-- Back up first, then run this entire file in the Supabase SQL Editor.
-- Safe to reapply. Installs functions/grants only; does not discard any draft.
-- Fresh projects already include these definitions in TRIP_VAULT_COMPLETE_SETUP.sql.

begin;
create or replace function public.discard_config_draft(requested_release_id uuid)
returns void language plpgsql security definer set search_path = public, pg_catalog as $$
declare target public.config_releases;
begin
  if not public.is_app_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  lock table public.config_releases in share row exclusive mode;
  select * into target from public.config_releases where id=requested_release_id for update;
  if not found or target.status <> 'draft' or target.version_number is not null then
    raise exception 'Only an unpublished draft can be deleted' using errcode='55000';
  end if;
  -- A never-published retired row is a discarded draft, hidden from active releases.
  -- Keep its records and assets so its audit history and references remain intact.
  update public.config_releases set status='retired' where id=requested_release_id;
  insert into public.config_audit_events(config_release_id,actor_id,action,safe_summary)
  values(requested_release_id,auth.uid(),'retired',jsonb_build_object('discarded_draft',true,'change_note',target.change_note));
end;
$$;

create or replace function public.publish_config_release(requested_release_id uuid)
returns integer language plpgsql security definer set search_path = public, pg_catalog as $$
declare next_version integer;
begin
  if not public.is_app_admin() then raise exception 'Administrator access required' using errcode='42501'; end if;
  -- Includes draft deletion and older release-writing RPCs in the same lock boundary.
  lock table public.config_releases in share row exclusive mode;
  if not exists (select 1 from public.config_releases where id=requested_release_id and status='draft' and version_number is null) then raise exception 'Publish requires a draft'; end if;
  if not exists (select 1 from public.theme_palettes where config_release_id = requested_release_id and public.valid_theme_tokens(light_tokens) and public.valid_theme_tokens(dark_tokens)) then raise exception 'Publish requires a valid light and dark palette'; end if;
  if exists (select 1 from public.airline_catalog_entries where config_release_id = requested_release_id and (not public.valid_action_template(check_in_url_template) or not public.valid_action_template(manage_booking_url_template) or not public.valid_action_template(status_url_template) or not public.valid_action_template(tracker_url_template))) then raise exception 'Publish contains invalid airline actions'; end if;
  if exists (select 1 from public.airport_catalog_entries where config_release_id = requested_release_id and not public.valid_iana_timezone(timezone)) then raise exception 'Publish contains invalid airport timezones'; end if;
  select coalesce(max(version_number), 0) + 1 into next_version from public.config_releases;
  update public.config_releases set status='retired' where status='published';
  update public.config_releases set status='published',version_number=next_version,published_by=auth.uid(),published_at=now() where id=requested_release_id;
  insert into public.config_audit_events(config_release_id,actor_id,action,safe_summary)
  values(requested_release_id,auth.uid(),'published',jsonb_build_object('version',next_version));
  return next_version;
end;
$$;
revoke all on function public.discard_config_draft(uuid), public.publish_config_release(uuid) from public, anon;
grant execute on function public.discard_config_draft(uuid), public.publish_config_release(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;

