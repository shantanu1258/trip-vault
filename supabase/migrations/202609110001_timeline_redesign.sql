-- Trip Vault timeline-first redesign
-- Run after 202609100003_simplify_traveler_context.sql.
--
-- Recovery: this migration is additive. If the new client must be rolled back,
-- deploy the previous client; the added columns and tables can remain safely.

-- PostgreSQL requires newly added enum values to be committed before later
-- statements can use them in rows, constraints, or indexes.
begin;
alter type public.booking_type add value if not exists 'train';
alter type public.booking_type add value if not exists 'bus';
alter type public.booking_type add value if not exists 'ferry';
alter type public.booking_type add value if not exists 'cab';
commit;

begin;

do $$ begin
  create type public.timeline_event_type as enum (
    'flight', 'train', 'bus', 'ferry', 'cab', 'hotel_check_in',
    'hotel_check_out', 'transport', 'meal', 'activity', 'preparation', 'custom'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.journey_scope as enum ('domestic', 'international');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.journey_mode as enum ('train', 'bus', 'ferry', 'cab');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.catalog_suggestion_type as enum ('airline', 'airport', 'booking_vendor', 'service_provider');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.catalog_suggestion_status as enum ('pending', 'promoted', 'merged', 'rejected');
exception when duplicate_object then null; end $$;

alter table public.itinerary_items
  add column if not exists event_type public.timeline_event_type not null default 'custom',
  add column if not exists completed_at timestamptz;

update public.itinerary_items item
set event_type = case booking.type::text
  when 'flight' then 'flight'::public.timeline_event_type
  when 'train' then 'train'::public.timeline_event_type
  when 'bus' then 'bus'::public.timeline_event_type
  when 'ferry' then 'ferry'::public.timeline_event_type
  when 'cab' then 'cab'::public.timeline_event_type
  when 'hotel' then 'hotel_check_in'::public.timeline_event_type
  when 'transport' then 'transport'::public.timeline_event_type
  when 'restaurant' then 'meal'::public.timeline_event_type
  when 'activity' then 'activity'::public.timeline_event_type
  else 'custom'::public.timeline_event_type
end
from public.bookings booking
where item.booking_id = booking.id and item.event_type = 'custom';

alter table public.bookings
  add column if not exists journey_scope public.journey_scope,
  add column if not exists booked_via_name text,
  add column if not exists booked_via_url text,
  add column if not exists booking_vendor_catalog_key text,
  add column if not exists contact_name text,
  add column if not exists contact_phone text;

alter table public.bookings drop constraint if exists bookings_https_vendor_url;
alter table public.bookings add constraint bookings_https_vendor_url
  check (booked_via_url is null or booked_via_url ~ '^https://');

alter table public.bookings drop constraint if exists bookings_contact_phone_shape;
alter table public.bookings add constraint bookings_contact_phone_shape
  check (contact_phone is null or contact_phone ~ '^\+?[0-9][0-9 ()-]{5,24}$');

alter table public.bookings drop constraint if exists flight_booking_requires_reference;
alter table public.bookings add constraint flight_booking_requires_reference
  check (type::text <> 'flight' or char_length(trim(coalesce(reference_code, ''))) between 1 and 80) not valid;

alter table public.flight_legs
  add column if not exists journey_scope public.journey_scope,
  add column if not exists boarding_lead_minutes integer,
  add column if not exists departure_country_code text,
  add column if not exists arrival_country_code text;

alter table public.flight_legs drop constraint if exists flight_boarding_lead_range;
alter table public.flight_legs add constraint flight_boarding_lead_range
  check (boarding_lead_minutes is null or boarding_lead_minutes between 0 and 360);

alter table public.flight_legs drop constraint if exists flight_departure_country_code_shape;
alter table public.flight_legs add constraint flight_departure_country_code_shape
  check (departure_country_code is null or departure_country_code ~ '^[A-Z]{2}$');

alter table public.flight_legs drop constraint if exists flight_arrival_country_code_shape;
alter table public.flight_legs add constraint flight_arrival_country_code_shape
  check (arrival_country_code is null or arrival_country_code ~ '^[A-Z]{2}$');

create table if not exists public.journey_legs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  segment_order integer not null check (segment_order >= 0),
  mode public.journey_mode not null,
  operator_name text not null check (char_length(trim(operator_name)) between 1 and 160),
  service_number text,
  origin_code text,
  origin_name text not null check (char_length(trim(origin_name)) between 1 and 180),
  origin_country_code text check (origin_country_code is null or origin_country_code ~ '^[A-Z]{2}$'),
  origin_timezone text not null,
  destination_code text,
  destination_name text not null check (char_length(trim(destination_name)) between 1 and 180),
  destination_country_code text check (destination_country_code is null or destination_country_code ~ '^[A-Z]{2}$'),
  destination_timezone text not null,
  scheduled_departure_at timestamptz not null,
  scheduled_arrival_at timestamptz not null,
  boarding_at timestamptz,
  boarding_lead_minutes integer check (boarding_lead_minutes is null or boarding_lead_minutes between 0 and 360),
  departure_platform text,
  arrival_platform text,
  coach_or_cabin text,
  seat text,
  status_note text,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (booking_id, segment_order),
  constraint journey_schedule_order check (scheduled_arrival_at > scheduled_departure_at)
);

alter table public.documents
  add column if not exists journey_leg_id uuid references public.journey_legs(id) on delete set null;

create table if not exists public.booking_vendor_catalog_entries (
  id uuid primary key default gen_random_uuid(),
  config_release_id uuid not null references public.config_releases(id) on delete cascade,
  stable_key text not null check (stable_key ~ '^[a-z0-9][a-z0-9_-]{1,79}$'),
  name text not null check (char_length(trim(name)) between 1 and 120),
  aliases text[] not null default '{}',
  website_url text check (website_url is null or website_url ~ '^https://'),
  logo_asset_path text,
  brand_color text check (brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$'),
  is_enabled boolean not null default true,
  sort_order integer not null default 0,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (config_release_id, stable_key)
);

create table if not exists public.catalog_suggestions (
  id uuid primary key default gen_random_uuid(),
  suggestion_type public.catalog_suggestion_type not null,
  display_value text not null check (char_length(trim(display_value)) between 1 and 180),
  normalized_value text not null check (char_length(trim(normalized_value)) between 1 and 180),
  proposed_data jsonb not null default '{}'::jsonb,
  status public.catalog_suggestion_status not null default 'pending',
  submitted_by uuid not null references auth.users(id),
  reviewed_by uuid references auth.users(id),
  review_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (suggestion_type, normalized_value)
);

create or replace function public.enforce_booking_vendor_metadata()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.logo_asset_path is not null and (
    new.logo_asset_path like '%..%' or new.logo_asset_path !~* '^[a-z0-9][a-z0-9/_-]*\.(png|jpe?g|webp)$'
  ) then raise exception 'Invalid booking vendor asset path'; end if;
  if new.website_url is not null and new.website_url !~ '^https://' then
    raise exception 'Booking vendor website must use HTTPS';
  end if;
  return new;
end;
$$;

drop trigger if exists booking_vendor_catalog_validate on public.booking_vendor_catalog_entries;
create trigger booking_vendor_catalog_validate before insert or update on public.booking_vendor_catalog_entries
for each row execute function public.enforce_booking_vendor_metadata();

create unique index if not exists hotel_timeline_milestone_unique
  on public.itinerary_items (booking_id, event_type)
  where booking_id is not null and event_type in ('hotel_check_in', 'hotel_check_out') and deleted_at is null;
create index if not exists itinerary_trip_timeline_idx
  on public.itinerary_items (trip_id, starts_at, sort_key, id) where deleted_at is null;
create index if not exists journey_legs_booking_order_idx
  on public.journey_legs (booking_id, segment_order) where deleted_at is null;
create index if not exists catalog_suggestions_pending_idx
  on public.catalog_suggestions (status, suggestion_type, created_at);

create or replace function public.enforce_timed_entity_timezone()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- NEW is a runtime record whose available fields depend on the table. Keep
  -- field access inside its table branch; a combined `table_name AND NEW.field`
  -- expression can still try to resolve a field that the current row lacks.
  if tg_table_name = 'itinerary_items' then
    if not public.valid_iana_timezone(new.timezone) then
      raise exception 'Invalid itinerary IANA timezone';
    end if;
  elsif tg_table_name = 'bookings' then
    if new.source_timezone is not null and not public.valid_iana_timezone(new.source_timezone) then
      raise exception 'Invalid booking IANA timezone';
    end if;
  elsif tg_table_name = 'flight_legs' then
    if not public.valid_iana_timezone(new.departure_timezone) or not public.valid_iana_timezone(new.arrival_timezone) then
      raise exception 'Invalid flight IANA timezone';
    end if;
  elsif tg_table_name = 'journey_legs' then
    if not public.valid_iana_timezone(new.origin_timezone) or not public.valid_iana_timezone(new.destination_timezone) then
      raise exception 'Invalid journey IANA timezone';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists itinerary_valid_timezone on public.itinerary_items;
create trigger itinerary_valid_timezone before insert or update of timezone on public.itinerary_items
for each row execute function public.enforce_timed_entity_timezone();
drop trigger if exists bookings_valid_timezone on public.bookings;
create trigger bookings_valid_timezone before insert or update of source_timezone on public.bookings
for each row execute function public.enforce_timed_entity_timezone();
drop trigger if exists flights_valid_timezones on public.flight_legs;
create trigger flights_valid_timezones before insert or update of departure_timezone, arrival_timezone on public.flight_legs
for each row execute function public.enforce_timed_entity_timezone();
drop trigger if exists journeys_valid_timezones on public.journey_legs;
create trigger journeys_valid_timezones before insert or update of origin_timezone, destination_timezone on public.journey_legs
for each row execute function public.enforce_timed_entity_timezone();

create or replace function public.enforce_journey_leg_booking()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.bookings booking
    where booking.id = new.booking_id and booking.type::text = new.mode::text
  ) then
    raise exception 'Journey leg mode must match its booking type';
  end if;
  return new;
end;
$$;

drop trigger if exists journey_leg_booking_matches on public.journey_legs;
create trigger journey_leg_booking_matches before insert or update of booking_id, mode on public.journey_legs
for each row execute function public.enforce_journey_leg_booking();

create or replace function public.enforce_document_journey_reference()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.journey_leg_id is not null and not exists (
    select 1 from public.journey_legs leg
    join public.bookings booking on booking.id = leg.booking_id
    where leg.id = new.journey_leg_id and booking.trip_id = new.trip_id
  ) then
    raise exception 'Journey leg must belong to the same trip';
  end if;
  return new;
end;
$$;

drop trigger if exists document_journey_reference on public.documents;
create trigger document_journey_reference before insert or update of journey_leg_id, trip_id on public.documents
for each row execute function public.enforce_document_journey_reference();

drop trigger if exists set_updated_at on public.journey_legs;
create trigger set_updated_at before update on public.journey_legs for each row execute function public.set_updated_at();
drop trigger if exists increment_entity_version on public.journey_legs;
create trigger increment_entity_version before update on public.journey_legs for each row execute function public.increment_entity_version();
drop trigger if exists set_updated_at on public.booking_vendor_catalog_entries;
create trigger set_updated_at before update on public.booking_vendor_catalog_entries for each row execute function public.set_updated_at();

alter table public.journey_legs enable row level security;
alter table public.booking_vendor_catalog_entries enable row level security;
alter table public.catalog_suggestions enable row level security;

revoke all on public.journey_legs, public.booking_vendor_catalog_entries, public.catalog_suggestions from anon, authenticated;
grant select, insert, update, delete on public.journey_legs to authenticated;
grant select, insert, update, delete on public.booking_vendor_catalog_entries to authenticated;
grant select, insert, update on public.catalog_suggestions to authenticated;
grant all on public.journey_legs, public.booking_vendor_catalog_entries, public.catalog_suggestions to service_role;

drop policy if exists journey_legs_read on public.journey_legs;
create policy journey_legs_read on public.journey_legs for select to authenticated using (
  exists (select 1 from public.bookings booking where booking.id = booking_id and public.is_trip_member(booking.trip_id))
);
drop policy if exists journey_legs_write on public.journey_legs;
create policy journey_legs_write on public.journey_legs for all to authenticated using (
  exists (select 1 from public.bookings booking where booking.id = booking_id and public.can_edit_trip(booking.trip_id))
) with check (
  exists (select 1 from public.bookings booking where booking.id = booking_id and public.can_edit_trip(booking.trip_id))
);

drop policy if exists booking_vendor_catalog_read on public.booking_vendor_catalog_entries;
create policy booking_vendor_catalog_read on public.booking_vendor_catalog_entries for select to authenticated using (
  public.is_app_admin() or exists (
    select 1 from public.config_releases release
    where release.id = config_release_id and release.status = 'published'
  )
);
drop policy if exists booking_vendor_catalog_write on public.booking_vendor_catalog_entries;
create policy booking_vendor_catalog_write on public.booking_vendor_catalog_entries for all to authenticated using (
  public.is_app_admin() and exists (
    select 1 from public.config_releases release
    where release.id = config_release_id and release.status = 'draft'
  )
) with check (
  public.is_app_admin() and updated_by = auth.uid() and exists (
    select 1 from public.config_releases release
    where release.id = config_release_id and release.status = 'draft'
  )
);

drop policy if exists catalog_suggestions_submit on public.catalog_suggestions;
create policy catalog_suggestions_submit on public.catalog_suggestions for insert to authenticated with check (
  submitted_by = auth.uid() and status = 'pending' and reviewed_by is null and reviewed_at is null
);
drop policy if exists catalog_suggestions_admin_read on public.catalog_suggestions;
create policy catalog_suggestions_admin_read on public.catalog_suggestions for select to authenticated using (public.is_app_admin());
drop policy if exists catalog_suggestions_admin_update on public.catalog_suggestions;
create policy catalog_suggestions_admin_update on public.catalog_suggestions for update to authenticated using (public.is_app_admin()) with check (
  public.is_app_admin() and reviewed_by = auth.uid()
);

create or replace function public.create_config_draft(requested_change_note text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare source_release uuid; draft_id uuid;
begin
  if not public.is_app_admin() then raise exception 'Administrator access required'; end if;
  select id into source_release from public.config_releases where status = 'published' limit 1;
  insert into public.config_releases (status, based_on_release_id, change_note, created_by)
  values ('draft', source_release, coalesce(requested_change_note, ''), auth.uid()) returning id into draft_id;
  if source_release is not null then
    insert into public.airline_catalog_entries (config_release_id, stable_key, name, iata_code, icao_code, aliases, check_in_url_template, manage_booking_url_template, status_url_template, tracker_url_template, brand_color, logo_asset_path, banner_asset_path, is_enabled, sort_order, updated_by)
    select draft_id, stable_key, name, iata_code, icao_code, aliases, check_in_url_template, manage_booking_url_template, status_url_template, tracker_url_template, brand_color, logo_asset_path, banner_asset_path, is_enabled, sort_order, auth.uid() from public.airline_catalog_entries where config_release_id = source_release;
    insert into public.airport_catalog_entries (config_release_id, stable_key, iata_code, icao_code, name, city, country_code, timezone, aliases, latitude, longitude, is_enabled, sort_order, updated_by)
    select draft_id, stable_key, iata_code, icao_code, name, city, country_code, timezone, aliases, latitude, longitude, is_enabled, sort_order, auth.uid() from public.airport_catalog_entries where config_release_id = source_release;
    insert into public.booking_vendor_catalog_entries (config_release_id, stable_key, name, aliases, website_url, logo_asset_path, brand_color, is_enabled, sort_order, updated_by)
    select draft_id, stable_key, name, aliases, website_url, logo_asset_path, brand_color, is_enabled, sort_order, auth.uid() from public.booking_vendor_catalog_entries where config_release_id = source_release;
    insert into public.metadata_defaults select draft_id, namespace, key, value, auth.uid(), now() from public.metadata_defaults where config_release_id = source_release;
    insert into public.theme_palettes select draft_id, light_tokens, dark_tokens, auth.uid(), now() from public.theme_palettes where config_release_id = source_release;
  end if;
  insert into public.config_audit_events (config_release_id, actor_id, action, safe_summary)
  values (draft_id, auth.uid(), 'created', jsonb_build_object('based_on', source_release));
  return draft_id;
end;
$$;

create or replace function public.rollback_config_release(requested_release_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare rollback_draft uuid; next_version integer;
begin
  if not public.is_app_admin() then raise exception 'Administrator access required'; end if;
  if not exists (select 1 from public.config_releases where id = requested_release_id and version_number is not null) then raise exception 'Rollback source not found'; end if;
  insert into public.config_releases (status, based_on_release_id, change_note, created_by)
  values ('draft', requested_release_id, 'Rollback from prior published version', auth.uid()) returning id into rollback_draft;
  insert into public.airline_catalog_entries (config_release_id, stable_key, name, iata_code, icao_code, aliases, check_in_url_template, manage_booking_url_template, status_url_template, tracker_url_template, brand_color, logo_asset_path, banner_asset_path, is_enabled, sort_order, updated_by)
  select rollback_draft, stable_key, name, iata_code, icao_code, aliases, check_in_url_template, manage_booking_url_template, status_url_template, tracker_url_template, brand_color, logo_asset_path, banner_asset_path, is_enabled, sort_order, auth.uid() from public.airline_catalog_entries where config_release_id = requested_release_id;
  insert into public.airport_catalog_entries (config_release_id, stable_key, iata_code, icao_code, name, city, country_code, timezone, aliases, latitude, longitude, is_enabled, sort_order, updated_by)
  select rollback_draft, stable_key, iata_code, icao_code, name, city, country_code, timezone, aliases, latitude, longitude, is_enabled, sort_order, auth.uid() from public.airport_catalog_entries where config_release_id = requested_release_id;
  insert into public.booking_vendor_catalog_entries (config_release_id, stable_key, name, aliases, website_url, logo_asset_path, brand_color, is_enabled, sort_order, updated_by)
  select rollback_draft, stable_key, name, aliases, website_url, logo_asset_path, brand_color, is_enabled, sort_order, auth.uid() from public.booking_vendor_catalog_entries where config_release_id = requested_release_id;
  insert into public.metadata_defaults select rollback_draft, namespace, key, value, auth.uid(), now() from public.metadata_defaults where config_release_id = requested_release_id;
  insert into public.theme_palettes select rollback_draft, light_tokens, dark_tokens, auth.uid(), now() from public.theme_palettes where config_release_id = requested_release_id;
  select coalesce(max(version_number), 0) + 1 into next_version from public.config_releases;
  update public.config_releases set status = 'retired' where status = 'published';
  update public.config_releases set status = 'published', version_number = next_version, published_by = auth.uid(), published_at = now() where id = rollback_draft;
  insert into public.config_audit_events (config_release_id, actor_id, action, safe_summary)
  values (rollback_draft, auth.uid(), 'rolled_back', jsonb_build_object('source_release', requested_release_id, 'version', next_version));
  return next_version;
end;
$$;

revoke all on function public.enforce_timed_entity_timezone() from public, anon, authenticated;
revoke all on function public.enforce_journey_leg_booking() from public, anon, authenticated;
revoke all on function public.enforce_document_journey_reference() from public, anon, authenticated;
revoke all on function public.enforce_booking_vendor_metadata() from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';
