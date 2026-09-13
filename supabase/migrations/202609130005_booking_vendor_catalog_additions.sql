-- Add Airbnb and Trip.com to the published booking-vendor catalogue without
-- mutating the immutable release that users may already have cached.
-- Run after 202609130002_regional_travel_catalog.sql.

begin;

do $vendor_catalog$
declare
  actor_id uuid;
  source_release uuid;
  target_release uuid;
  next_version integer;
  release_note constant text := 'Booking vendor additions 2026-09-13';
begin
  if exists (select 1 from public.config_releases where change_note = release_note) then
    raise notice 'Booking vendor additions are already installed.';
    return;
  end if;

  select admin.user_id into actor_id
  from public.app_admins admin
  join auth.users account on account.id = admin.user_id
  where admin.status = 'active'
  order by (lower(account.email) = 'bingalan1@gmail.com') desc, admin.created_at
  limit 1;
  if actor_id is null then
    raise exception 'Create an active app_admin before installing booking vendors.';
  end if;

  select id into source_release
  from public.config_releases
  where status = 'published'
  limit 1;
  if source_release is null then
    raise exception 'Install 202609130002_regional_travel_catalog.sql before this migration.';
  end if;

  insert into public.config_releases (status, based_on_release_id, change_note, created_by)
  values ('draft', source_release, release_note, actor_id)
  returning id into target_release;

  insert into public.airline_catalog_entries (config_release_id, stable_key, name, iata_code, icao_code, aliases, check_in_url_template, manage_booking_url_template, status_url_template, tracker_url_template, brand_color, logo_asset_path, banner_asset_path, is_enabled, sort_order, updated_by)
  select target_release, stable_key, name, iata_code, icao_code, aliases, check_in_url_template, manage_booking_url_template, status_url_template, tracker_url_template, brand_color, logo_asset_path, banner_asset_path, is_enabled, sort_order, actor_id
  from public.airline_catalog_entries where config_release_id = source_release;

  insert into public.airport_catalog_entries (config_release_id, stable_key, iata_code, icao_code, name, city, country_code, timezone, aliases, latitude, longitude, is_enabled, sort_order, updated_by)
  select target_release, stable_key, iata_code, icao_code, name, city, country_code, timezone, aliases, latitude, longitude, is_enabled, sort_order, actor_id
  from public.airport_catalog_entries where config_release_id = source_release;

  insert into public.booking_vendor_catalog_entries (config_release_id, stable_key, name, aliases, website_url, logo_asset_path, brand_color, is_enabled, sort_order, updated_by)
  select target_release, stable_key, name, aliases, website_url, logo_asset_path, brand_color, is_enabled, sort_order, actor_id
  from public.booking_vendor_catalog_entries where config_release_id = source_release;

  insert into public.metadata_defaults (config_release_id, namespace, key, value, updated_by, updated_at)
  select target_release, namespace, key, value, actor_id, now()
  from public.metadata_defaults where config_release_id = source_release;

  insert into public.theme_palettes (config_release_id, light_tokens, dark_tokens, updated_by, updated_at)
  select target_release, light_tokens, dark_tokens, actor_id, now()
  from public.theme_palettes where config_release_id = source_release;

  update public.booking_vendor_catalog_entries
  set sort_order = case stable_key when 'airline-direct' then 80 when 'hotel-direct' then 90 else sort_order end,
      updated_by = actor_id
  where config_release_id = target_release and stable_key in ('airline-direct', 'hotel-direct');

  insert into public.booking_vendor_catalog_entries (
    config_release_id, stable_key, name, aliases, website_url, brand_color,
    is_enabled, sort_order, updated_by
  ) values
    (target_release, 'airbnb', 'Airbnb', array['Air BnB'], 'https://www.airbnb.com', '#ff385c', true, 60, actor_id),
    (target_release, 'trip-com', 'Trip.com', array['Trip'], 'https://www.trip.com', '#287dfa', true, 70, actor_id)
  on conflict (config_release_id, stable_key) do update set
    name = excluded.name,
    aliases = excluded.aliases,
    website_url = excluded.website_url,
    brand_color = excluded.brand_color,
    is_enabled = true,
    sort_order = excluded.sort_order,
    updated_by = actor_id;

  select coalesce(max(version_number), 0) + 1 into next_version from public.config_releases;
  update public.config_releases set status = 'retired' where status = 'published';
  update public.config_releases
  set status = 'published', version_number = next_version, published_by = actor_id, published_at = now()
  where id = target_release;

  insert into public.config_audit_events (config_release_id, actor_id, action, safe_summary)
  values
    (target_release, actor_id, 'created', jsonb_build_object('based_on', source_release, 'source', 'booking vendor additions')),
    (target_release, actor_id, 'published', jsonb_build_object('version', next_version));
end;
$vendor_catalog$;

commit;

notify pgrst, 'reload schema';

select release.version_number, release.status, release.change_note,
  (select count(*) from public.booking_vendor_catalog_entries vendor where vendor.config_release_id = release.id) as booking_vendors
from public.config_releases release
where release.status = 'published';
