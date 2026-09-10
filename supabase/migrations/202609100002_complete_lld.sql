-- Trip Vault LLD completion migration
-- Run after 202609100001_initial_schema.sql.

begin;

do $$ begin create type public.focus_source as enum ('automatic', 'manual'); exception when duplicate_object then null; end $$;
do $$ begin create type public.config_release_status as enum ('draft', 'published', 'retired'); exception when duplicate_object then null; end $$;

create table if not exists public.user_trip_focus (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  source public.focus_source not null default 'automatic',
  updated_at timestamptz not null default now()
);

create table if not exists public.trip_airlines (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  iata_code text check (iata_code is null or iata_code ~ '^[A-Z0-9]{2}$'),
  icao_code text check (icao_code is null or icao_code ~ '^[A-Z0-9]{3}$'),
  check_in_url_template text check (check_in_url_template is null or check_in_url_template ~ '^https://'),
  manage_booking_url_template text check (manage_booking_url_template is null or manage_booking_url_template ~ '^https://'),
  status_url_template text check (status_url_template is null or status_url_template ~ '^https://'),
  tracker_url_template text check (tracker_url_template is null or tracker_url_template ~ '^https://'),
  brand_color text check (brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$'),
  logo_asset_key text,
  banner_asset_key text,
  source_catalog_key text,
  source_config_version integer,
  metadata_source text not null default 'manual' check (metadata_source in ('bundled_fallback', 'published_catalog', 'manual')),
  last_verified_at timestamptz,
  created_by uuid not null references auth.users(id),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.flight_legs add column if not exists marketing_airline_id uuid references public.trip_airlines(id) on delete set null;
alter table public.flight_legs add column if not exists operating_airline_id uuid references public.trip_airlines(id) on delete set null;
alter table public.flight_legs add column if not exists departure_airport_catalog_key text;
alter table public.flight_legs add column if not exists arrival_airport_catalog_key text;

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  title text,
  body text not null check (char_length(trim(body)) between 1 and 10000),
  created_by uuid not null references auth.users(id),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.itinerary_items add column if not exists is_all_day boolean not null default false;

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  entity_type text not null,
  entity_id uuid not null,
  action text not null check (action in ('created', 'updated', 'deleted', 'invited', 'access_changed')),
  safe_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.join_code_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  failed_count integer not null default 0 check (failed_count >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.config_releases (
  id uuid primary key default gen_random_uuid(),
  version_number integer unique,
  status public.config_release_status not null default 'draft',
  based_on_release_id uuid references public.config_releases(id),
  change_note text not null default '',
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  published_by uuid references auth.users(id),
  published_at timestamptz
);

create unique index if not exists exactly_one_published_config on public.config_releases ((status)) where status = 'published';

create table if not exists public.airline_catalog_entries (
  id uuid primary key default gen_random_uuid(),
  config_release_id uuid not null references public.config_releases(id) on delete cascade,
  stable_key text not null check (stable_key ~ '^[a-z0-9][a-z0-9_-]{1,79}$'),
  name text not null check (char_length(trim(name)) between 1 and 120),
  iata_code text check (iata_code is null or iata_code ~ '^[A-Z0-9]{2}$'),
  icao_code text check (icao_code is null or icao_code ~ '^[A-Z0-9]{3}$'),
  aliases text[] not null default '{}',
  check_in_url_template text check (check_in_url_template is null or check_in_url_template ~ '^https://'),
  manage_booking_url_template text check (manage_booking_url_template is null or manage_booking_url_template ~ '^https://'),
  status_url_template text check (status_url_template is null or status_url_template ~ '^https://'),
  tracker_url_template text check (tracker_url_template is null or tracker_url_template ~ '^https://'),
  brand_color text check (brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$'),
  logo_asset_path text,
  banner_asset_path text,
  is_enabled boolean not null default true,
  sort_order integer not null default 0,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (config_release_id, stable_key)
);

create table if not exists public.airport_catalog_entries (
  id uuid primary key default gen_random_uuid(),
  config_release_id uuid not null references public.config_releases(id) on delete cascade,
  stable_key text not null check (stable_key ~ '^[a-z0-9][a-z0-9_-]{1,79}$'),
  iata_code text check (iata_code is null or iata_code ~ '^[A-Z0-9]{3}$'),
  icao_code text check (icao_code is null or icao_code ~ '^[A-Z0-9]{4}$'),
  name text not null,
  city text not null,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  timezone text not null,
  aliases text[] not null default '{}',
  latitude numeric check (latitude is null or latitude between -90 and 90),
  longitude numeric check (longitude is null or longitude between -180 and 180),
  is_enabled boolean not null default true,
  sort_order integer not null default 0,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint airport_coordinates_pair check ((latitude is null) = (longitude is null)),
  unique (config_release_id, stable_key)
);

create table if not exists public.metadata_defaults (
  config_release_id uuid not null references public.config_releases(id) on delete cascade,
  namespace text not null check (namespace in ('booking', 'document', 'readiness', 'alerts', 'external_links')),
  key text not null check (key ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  value jsonb not null,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (config_release_id, namespace, key)
);

create table if not exists public.theme_palettes (
  config_release_id uuid primary key references public.config_releases(id) on delete cascade,
  light_tokens jsonb not null,
  dark_tokens jsonb not null,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.config_audit_events (
  id uuid primary key default gen_random_uuid(),
  config_release_id uuid not null references public.config_releases(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  action text not null check (action in ('created', 'edited', 'validated', 'published', 'retired', 'rolled_back')),
  safe_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

drop trigger if exists set_updated_at on public.trip_airlines;
create trigger set_updated_at before update on public.trip_airlines for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.notes;
create trigger set_updated_at before update on public.notes for each row execute function public.set_updated_at();
drop trigger if exists preserve_audit_actor on public.trip_airlines;
create trigger preserve_audit_actor before update on public.trip_airlines for each row execute function public.preserve_audit_actor('created_by');
drop trigger if exists preserve_audit_actor on public.notes;
create trigger preserve_audit_actor before update on public.notes for each row execute function public.preserve_audit_actor('created_by');
drop trigger if exists preserve_audit_actor on public.trips;
create trigger preserve_audit_actor before update on public.trips for each row execute function public.preserve_audit_actor('created_by');

create or replace function public.valid_iana_timezone(value text)
returns boolean language sql stable security definer set search_path = public, pg_catalog as $$
  select exists (select 1 from pg_timezone_names where name = value);
$$;

create or replace function public.valid_action_template(value text)
returns boolean language sql immutable set search_path = public, pg_catalog as $$
  select value is null or (
    value ~ '^https://' and
    regexp_replace(value, '\{(flightNumber|airlineCode|departureDate|bookingReference|departureAirport|arrivalAirport)\}', '', 'g') !~ '[{}]'
  );
$$;

create or replace function public.theme_relative_luminance(value text)
returns numeric language plpgsql immutable set search_path = public, pg_catalog as $$
declare component text; channel numeric; result numeric := 0; weight numeric[] := array[0.2126, 0.7152, 0.0722]; index_value integer;
begin
  if value !~ '^#[0-9a-fA-F]{6}$' then return null; end if;
  for index_value in 1..3 loop
    component := substr(value, index_value * 2, 2);
    channel := (('x' || component)::bit(8)::integer)::numeric / 255;
    if channel <= 0.03928 then channel := channel / 12.92; else channel := power((channel + 0.055) / 1.055, 2.4); end if;
    result := result + channel * weight[index_value];
  end loop;
  return result;
end;
$$;

create or replace function public.theme_contrast(first_color text, second_color text)
returns numeric language sql immutable set search_path = public, pg_catalog as $$
  select (greatest(public.theme_relative_luminance(first_color), public.theme_relative_luminance(second_color)) + 0.05) /
         (least(public.theme_relative_luminance(first_color), public.theme_relative_luminance(second_color)) + 0.05);
$$;

create or replace function public.valid_theme_tokens(tokens jsonb)
returns boolean language sql immutable set search_path = public, pg_catalog as $$
  select jsonb_typeof(tokens) = 'object'
    and tokens ?& array['canvas','surface','elevated','ink','muted','line','brand','brandSoft','coral','success','warning','danger']
    and (select count(*) = 12 from jsonb_object_keys(tokens))
    and not exists (select 1 from jsonb_each_text(tokens) where value !~ '^#[0-9a-fA-F]{6}$')
    and public.theme_contrast(tokens->>'ink', tokens->>'canvas') >= 4.5
    and public.theme_contrast(tokens->>'ink', tokens->>'surface') >= 4.5
    and public.theme_contrast(tokens->>'muted', tokens->>'surface') >= 4.5;
$$;

create or replace function public.enforce_admin_metadata()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name in ('airline_catalog_entries', 'trip_airlines') then
    if not public.valid_action_template(new.check_in_url_template) or not public.valid_action_template(new.manage_booking_url_template)
      or not public.valid_action_template(new.status_url_template) or not public.valid_action_template(new.tracker_url_template) then
      raise exception 'Invalid HTTPS action template';
    end if;
    if tg_table_name = 'airline_catalog_entries' and (
      (to_jsonb(new)->>'logo_asset_path' is not null and ((to_jsonb(new)->>'logo_asset_path') like '%..%' or (to_jsonb(new)->>'logo_asset_path') !~* '^[a-z0-9][a-z0-9/_-]*\.(png|jpe?g|webp)$'))
      or (to_jsonb(new)->>'banner_asset_path' is not null and ((to_jsonb(new)->>'banner_asset_path') like '%..%' or (to_jsonb(new)->>'banner_asset_path') !~* '^[a-z0-9][a-z0-9/_-]*\.(png|jpe?g|webp)$'))
    ) then raise exception 'Invalid catalog asset path'; end if;
  elsif tg_table_name = 'airport_catalog_entries' and not public.valid_iana_timezone(new.timezone) then
    raise exception 'Invalid IANA timezone';
  elsif tg_table_name = 'theme_palettes' and (not public.valid_theme_tokens(new.light_tokens) or not public.valid_theme_tokens(new.dark_tokens)) then
    raise exception 'Invalid or inaccessible theme tokens';
  end if;
  return new;
end;
$$;

drop trigger if exists airline_catalog_validate on public.airline_catalog_entries;
create trigger airline_catalog_validate before insert or update on public.airline_catalog_entries for each row execute function public.enforce_admin_metadata();
drop trigger if exists trip_airlines_validate on public.trip_airlines;
create trigger trip_airlines_validate before insert or update on public.trip_airlines for each row execute function public.enforce_admin_metadata();
drop trigger if exists airport_catalog_validate on public.airport_catalog_entries;
create trigger airport_catalog_validate before insert or update on public.airport_catalog_entries for each row execute function public.enforce_admin_metadata();
drop trigger if exists theme_palettes_validate on public.theme_palettes;
create trigger theme_palettes_validate before insert or update on public.theme_palettes for each row execute function public.enforce_admin_metadata();

create or replace function public.enforce_valid_timezone()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.valid_iana_timezone(new.primary_timezone) then raise exception 'Invalid IANA timezone'; end if;
  return new;
end;
$$;

drop trigger if exists trips_valid_timezone on public.trips;
create trigger trips_valid_timezone before insert or update of primary_timezone on public.trips for each row execute function public.enforce_valid_timezone();

create or replace function public.enforce_profile_timezone()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.valid_iana_timezone(new.home_timezone) then raise exception 'Invalid IANA timezone'; end if;
  return new;
end;
$$;

drop trigger if exists profiles_valid_timezone on public.profiles;
create trigger profiles_valid_timezone before insert or update of home_timezone on public.profiles for each row execute function public.enforce_profile_timezone();

create or replace function public.enforce_trip_references()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.trip_id is distinct from old.trip_id then
    raise exception 'A document cannot be moved to another trip';
  end if;
  if new.booking_id is not null and not exists (select 1 from public.bookings where id = new.booking_id and trip_id = new.trip_id) then raise exception 'Booking must belong to the same trip'; end if;
  if new.flight_leg_id is not null and not exists (select 1 from public.flight_legs f join public.bookings b on b.id = f.booking_id where f.id = new.flight_leg_id and b.trip_id = new.trip_id) then raise exception 'Flight leg must belong to the same trip'; end if;
  if new.traveler_id is not null and not exists (select 1 from public.travelers where id = new.traveler_id and trip_id = new.trip_id) then raise exception 'Traveler must belong to the same trip'; end if;
  return new;
end;
$$;

drop trigger if exists document_trip_references on public.documents;
create trigger document_trip_references before insert or update on public.documents for each row execute function public.enforce_trip_references();

create or replace function public.enforce_requirement_document_trip()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.linked_document_id is not null and not exists (
    select 1 from public.documents where id = new.linked_document_id and trip_id = new.trip_id and deleted_at is null
  ) then raise exception 'Requirement document must belong to the same trip'; end if;
  if new.linked_document_id is not null and auth.uid() is not null and not public.can_read_document(new.linked_document_id) then
    raise exception 'Requirement document is not accessible';
  end if;
  return new;
end;
$$;

drop trigger if exists requirement_document_same_trip on public.trip_requirements;
create trigger requirement_document_same_trip before insert or update of trip_id, linked_document_id on public.trip_requirements for each row execute function public.enforce_requirement_document_trip();

create or replace function public.enforce_itinerary_booking_trip()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.booking_id is not null and not exists (
    select 1 from public.bookings where id = new.booking_id and trip_id = new.trip_id and deleted_at is null
  ) then raise exception 'Itinerary booking must belong to the same trip'; end if;
  return new;
end;
$$;

drop trigger if exists itinerary_booking_same_trip on public.itinerary_items;
create trigger itinerary_booking_same_trip before insert or update of trip_id, booking_id on public.itinerary_items for each row execute function public.enforce_itinerary_booking_trip();

create or replace function public.enforce_flight_booking()
returns trigger language plpgsql security definer set search_path = public as $$
declare booking_trip uuid;
begin
  select trip_id into booking_trip from public.bookings where id = new.booking_id and type = 'flight' and deleted_at is null;
  if booking_trip is null then raise exception 'Flight leg requires a flight booking'; end if;
  if new.marketing_airline_id is not null and not exists (select 1 from public.trip_airlines where id = new.marketing_airline_id and trip_id = booking_trip and deleted_at is null) then raise exception 'Marketing airline must belong to the same trip'; end if;
  if new.operating_airline_id is not null and not exists (select 1 from public.trip_airlines where id = new.operating_airline_id and trip_id = booking_trip and deleted_at is null) then raise exception 'Operating airline must belong to the same trip'; end if;
  return new;
end;
$$;

create or replace function public.can_manage_document(requested_document_id uuid, requested_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.documents d
    where d.id = requested_document_id and public.is_trip_member(d.trip_id, requested_user_id) and (
      d.uploaded_by = requested_user_id
      or public.can_edit_trip(d.trip_id, requested_user_id)
      or exists (select 1 from public.traveler_accounts ta where ta.traveler_id = d.traveler_id and ta.user_id = requested_user_id)
      or exists (
        select 1 from public.traveler_managers manager
        where manager.traveler_id = d.traveler_id and manager.user_id = requested_user_id
          and manager.can_manage_documents and manager.revoked_at is null
      )
    )
  );
$$;

drop trigger if exists flight_requires_flight_booking on public.flight_legs;
create trigger flight_requires_flight_booking before insert or update of booking_id, marketing_airline_id, operating_airline_id on public.flight_legs for each row execute function public.enforce_flight_booking();

create or replace function public.enforce_assignment_trip()
returns trigger language plpgsql security definer set search_path = public as $$
declare parent_trip uuid; traveler_trip uuid;
begin
  select trip_id into traveler_trip from public.travelers where id = new.traveler_id and removed_at is null;
  if tg_table_name = 'booking_travelers' then select trip_id into parent_trip from public.bookings where id = new.booking_id and deleted_at is null;
  elsif tg_table_name = 'itinerary_participants' then select trip_id into parent_trip from public.itinerary_items where id = new.itinerary_item_id and deleted_at is null;
  elsif tg_table_name = 'requirement_assignees' then select trip_id into parent_trip from public.trip_requirements where id = new.requirement_id and deleted_at is null;
  elsif tg_table_name = 'flight_leg_travelers' then select b.trip_id into parent_trip from public.flight_legs f join public.bookings b on b.id = f.booking_id where f.id = new.flight_leg_id and f.deleted_at is null;
  end if;
  if parent_trip is null or traveler_trip is null or parent_trip <> traveler_trip then raise exception 'Assigned traveler must belong to the same trip'; end if;
  return new;
end;
$$;

drop trigger if exists booking_traveler_same_trip on public.booking_travelers;
create trigger booking_traveler_same_trip before insert or update on public.booking_travelers for each row execute function public.enforce_assignment_trip();
drop trigger if exists itinerary_participant_same_trip on public.itinerary_participants;
create trigger itinerary_participant_same_trip before insert or update on public.itinerary_participants for each row execute function public.enforce_assignment_trip();
drop trigger if exists requirement_assignee_same_trip on public.requirement_assignees;
create trigger requirement_assignee_same_trip before insert or update on public.requirement_assignees for each row execute function public.enforce_assignment_trip();
drop trigger if exists flight_leg_traveler_same_trip on public.flight_leg_travelers;
create trigger flight_leg_traveler_same_trip before insert or update on public.flight_leg_travelers for each row execute function public.enforce_assignment_trip();

create or replace function public.enforce_traveler_manager_membership()
returns trigger language plpgsql security definer set search_path = public as $$
declare managed_trip_id uuid;
begin
  select trip_id into managed_trip_id from public.travelers where id = new.traveler_id and removed_at is null;
  if managed_trip_id is null or not public.is_trip_member(managed_trip_id, new.user_id) then
    raise exception 'Traveler manager must be an active trip member';
  end if;
  return new;
end;
$$;

drop trigger if exists traveler_manager_is_member on public.traveler_managers;
create trigger traveler_manager_is_member before insert or update on public.traveler_managers for each row execute function public.enforce_traveler_manager_membership();

create or replace function public.can_edit_traveler_profile(requested_traveler_id uuid, requested_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.travelers traveler
    where traveler.id = requested_traveler_id and traveler.removed_at is null and (
      public.can_edit_trip(traveler.trip_id, requested_user_id)
      or exists (
        select 1 from public.traveler_managers manager
        where manager.traveler_id = traveler.id and manager.user_id = requested_user_id
          and manager.can_edit_profile and manager.revoked_at is null
      )
    )
  );
$$;

create or replace function public.enforce_managed_traveler_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.can_edit_trip(old.trip_id) then return new; end if;
  if public.can_edit_traveler_profile(old.id) then
    if new.trip_id <> old.trip_id or new.status <> old.status or new.created_by <> old.created_by
      or new.removed_at is distinct from old.removed_at then
      raise exception 'A delegated manager may only edit traveler profile details';
    end if;
    return new;
  end if;
  raise exception 'Traveler update is not allowed';
end;
$$;

drop trigger if exists managed_traveler_update_scope on public.travelers;
create trigger managed_traveler_update_scope before update on public.travelers for each row execute function public.enforce_managed_traveler_update();

create or replace function public.increment_entity_version()
returns trigger language plpgsql set search_path = public as $$
begin new.version = old.version + 1; return new; end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['trips', 'travelers', 'bookings', 'flight_legs', 'itinerary_items', 'documents', 'itinerary_item_documents', 'trip_requirements', 'trip_costs', 'notes', 'trip_airlines'] loop
    execute format('drop trigger if exists increment_entity_version on public.%I', table_name);
    execute format('create trigger increment_entity_version before update on public.%I for each row execute function public.increment_entity_version()', table_name);
  end loop;
end $$;

create or replace function public.reorder_itinerary_items(requested_trip_id uuid, requested_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare active_count integer;
begin
  if auth.uid() is null or not public.can_edit_trip(requested_trip_id) then raise exception 'Itinerary reorder is not allowed'; end if;
  if requested_ids is null or cardinality(requested_ids) = 0 then raise exception 'Itinerary order is empty'; end if;
  if cardinality(requested_ids) <> (select count(distinct value) from unnest(requested_ids) as ids(value)) then raise exception 'Itinerary order contains duplicates'; end if;
  select count(*) into active_count from public.itinerary_items where trip_id = requested_trip_id and deleted_at is null;
  if active_count <> cardinality(requested_ids) or exists (
    select 1 from unnest(requested_ids) as ids(requested_id)
    where not exists (select 1 from public.itinerary_items where id = ids.requested_id and trip_id = requested_trip_id and deleted_at is null)
  ) then raise exception 'Itinerary order is stale'; end if;
  update public.itinerary_items item
  set sort_key = lpad(ordered.position::text, 8, '0') || ':' || item.id::text
  from unnest(requested_ids) with ordinality as ordered(id, position)
  where item.id = ordered.id and item.trip_id = requested_trip_id;
end;
$$;

create or replace function public.create_trip_invitation(
  requested_trip_id uuid,
  requested_target_type public.invitation_target_type,
  requested_traveler_id uuid,
  requested_role public.member_role
) returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  raw_code text := '';
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  random_byte bytea;
  lookup_value text;
  attempt integer := 0;
begin
  if auth.uid() is null or not public.is_trip_owner(requested_trip_id) then raise exception 'Invitation could not be created'; end if;
  if requested_role not in ('editor', 'viewer') then raise exception 'Invitation could not be created'; end if;
  if requested_target_type = 'traveler' and (requested_traveler_id is null or not exists (select 1 from public.travelers where id = requested_traveler_id and trip_id = requested_trip_id and removed_at is null)) then raise exception 'Invitation could not be created'; end if;
  if requested_target_type = 'collaborator' and requested_traveler_id is not null then raise exception 'Invitation could not be created'; end if;
  loop
    raw_code := '';
    for index_value in 1..16 loop
      random_byte := gen_random_bytes(1);
      raw_code := raw_code || substr(alphabet, (get_byte(random_byte, 0) % 32) + 1, 1);
    end loop;
    lookup_value := substr(raw_code, 1, 4);
    exit when not exists (select 1 from public.trip_invitations where code_lookup = lookup_value);
    attempt := attempt + 1;
    if attempt > 20 then raise exception 'Invitation could not be created'; end if;
  end loop;
  insert into public.trip_invitations (trip_id, target_type, traveler_id, role, code_lookup, code_secret_hash, expires_at, invited_by)
  values (requested_trip_id, requested_target_type, requested_traveler_id, requested_role, lookup_value, crypt(raw_code, gen_salt('bf')), now() + interval '14 days', auth.uid());
  insert into public.activity_events (trip_id, actor_id, entity_type, entity_id, action, safe_summary)
  select requested_trip_id, auth.uid(), 'invitation', id, 'invited', jsonb_build_object('target_type', requested_target_type, 'role', requested_role)
  from public.trip_invitations where code_lookup = lookup_value;
  return substr(raw_code, 1, 4) || '-' || substr(raw_code, 5, 4) || '-' || substr(raw_code, 9, 4) || '-' || substr(raw_code, 13, 4);
end;
$$;

create or replace function public.redeem_trip_invitation(submitted_code text)
returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  normalized text := upper(regexp_replace(coalesce(submitted_code, ''), '[^0-9A-Z]', '', 'g'));
  invitation public.trip_invitations%rowtype;
  attempt public.join_code_attempts%rowtype;
begin
  if auth.uid() is null then return null; end if;
  select * into attempt from public.join_code_attempts where user_id = auth.uid() for update;
  if found and attempt.window_started_at > now() - interval '15 minutes' and attempt.failed_count >= 5 then return null; end if;
  if not found or attempt.window_started_at <= now() - interval '15 minutes' then
    insert into public.join_code_attempts (user_id, window_started_at, failed_count, updated_at) values (auth.uid(), now(), 0, now())
    on conflict (user_id) do update set window_started_at = now(), failed_count = 0, updated_at = now();
  end if;
  if char_length(normalized) <> 16 then
    update public.join_code_attempts set failed_count = failed_count + 1, updated_at = now() where user_id = auth.uid();
    return null;
  end if;
  select * into invitation from public.trip_invitations
  where code_lookup = substr(normalized, 1, 4) and crypt(normalized, code_secret_hash) = code_secret_hash for update;
  if not found or invitation.expires_at <= now() or invitation.revoked_at is not null or invitation.redeemed_at is not null or public.is_trip_member(invitation.trip_id) then
    update public.join_code_attempts set failed_count = failed_count + 1, updated_at = now() where user_id = auth.uid();
    return null;
  end if;
  if invitation.target_type = 'traveler' and exists (
    select 1 from public.traveler_accounts ta join public.travelers t on t.id = ta.traveler_id
    where ta.user_id = auth.uid() and t.trip_id = invitation.trip_id
  ) then
    update public.join_code_attempts set failed_count = failed_count + 1, updated_at = now() where user_id = auth.uid();
    return null;
  end if;
  insert into public.trip_members (trip_id, user_id, role, participation_type, status, joined_at, added_by)
  values (invitation.trip_id, auth.uid(), invitation.role, case when invitation.target_type = 'traveler' then 'traveler'::public.participation_type else 'collaborator'::public.participation_type end, 'active', now(), invitation.invited_by);
  if invitation.target_type = 'traveler' then
    insert into public.traveler_accounts (traveler_id, user_id, invitation_id) values (invitation.traveler_id, auth.uid(), invitation.id);
  end if;
  update public.trip_invitations set redeemed_by = auth.uid(), redeemed_at = now() where id = invitation.id;
  delete from public.join_code_attempts where user_id = auth.uid();
  return invitation.trip_id;
end;
$$;

create or replace function public.create_config_draft(requested_change_note text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare source_release uuid; draft_id uuid;
begin
  if not public.is_app_admin() then raise exception 'Administrator access required'; end if;
  select id into source_release from public.config_releases where status = 'published' limit 1;
  insert into public.config_releases (status, based_on_release_id, change_note, created_by) values ('draft', source_release, coalesce(requested_change_note, ''), auth.uid()) returning id into draft_id;
  if source_release is not null then
    insert into public.airline_catalog_entries (config_release_id, stable_key, name, iata_code, icao_code, aliases, check_in_url_template, manage_booking_url_template, status_url_template, tracker_url_template, brand_color, logo_asset_path, banner_asset_path, is_enabled, sort_order, updated_by)
    select draft_id, stable_key, name, iata_code, icao_code, aliases, check_in_url_template, manage_booking_url_template, status_url_template, tracker_url_template, brand_color, logo_asset_path, banner_asset_path, is_enabled, sort_order, auth.uid() from public.airline_catalog_entries where config_release_id = source_release;
    insert into public.airport_catalog_entries (config_release_id, stable_key, iata_code, icao_code, name, city, country_code, timezone, aliases, latitude, longitude, is_enabled, sort_order, updated_by)
    select draft_id, stable_key, iata_code, icao_code, name, city, country_code, timezone, aliases, latitude, longitude, is_enabled, sort_order, auth.uid() from public.airport_catalog_entries where config_release_id = source_release;
    insert into public.metadata_defaults select draft_id, namespace, key, value, auth.uid(), now() from public.metadata_defaults where config_release_id = source_release;
    insert into public.theme_palettes select draft_id, light_tokens, dark_tokens, auth.uid(), now() from public.theme_palettes where config_release_id = source_release;
  end if;
  insert into public.config_audit_events (config_release_id, actor_id, action, safe_summary) values (draft_id, auth.uid(), 'created', jsonb_build_object('based_on', source_release));
  return draft_id;
end;
$$;

create or replace function public.publish_config_release(requested_release_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare next_version integer;
begin
  if not public.is_app_admin() then raise exception 'Administrator access required'; end if;
  if not exists (select 1 from public.config_releases where id = requested_release_id and status = 'draft') then raise exception 'Publish requires a draft'; end if;
  if not exists (select 1 from public.theme_palettes where config_release_id = requested_release_id and public.valid_theme_tokens(light_tokens) and public.valid_theme_tokens(dark_tokens)) then raise exception 'Publish requires a valid light and dark palette'; end if;
  if exists (select 1 from public.airline_catalog_entries where config_release_id = requested_release_id and (not public.valid_action_template(check_in_url_template) or not public.valid_action_template(manage_booking_url_template) or not public.valid_action_template(status_url_template) or not public.valid_action_template(tracker_url_template))) then raise exception 'Publish contains invalid airline actions'; end if;
  if exists (select 1 from public.airport_catalog_entries where config_release_id = requested_release_id and not public.valid_iana_timezone(timezone)) then raise exception 'Publish contains invalid airport timezones'; end if;
  select coalesce(max(version_number), 0) + 1 into next_version from public.config_releases;
  update public.config_releases set status = 'retired' where status = 'published';
  update public.config_releases set status = 'published', version_number = next_version, published_by = auth.uid(), published_at = now() where id = requested_release_id;
  insert into public.config_audit_events (config_release_id, actor_id, action, safe_summary) values (requested_release_id, auth.uid(), 'published', jsonb_build_object('version', next_version));
  return next_version;
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
  insert into public.metadata_defaults select rollback_draft, namespace, key, value, auth.uid(), now() from public.metadata_defaults where config_release_id = requested_release_id;
  insert into public.theme_palettes select rollback_draft, light_tokens, dark_tokens, auth.uid(), now() from public.theme_palettes where config_release_id = requested_release_id;
  select coalesce(max(version_number), 0) + 1 into next_version from public.config_releases;
  update public.config_releases set status = 'retired' where status = 'published';
  update public.config_releases set status = 'published', version_number = next_version, published_by = auth.uid(), published_at = now() where id = rollback_draft;
  insert into public.config_audit_events (config_release_id, actor_id, action, safe_summary) values (rollback_draft, auth.uid(), 'rolled_back', jsonb_build_object('source_release', requested_release_id, 'version', next_version));
  return next_version;
end;
$$;

create index if not exists trip_airlines_trip_updated_idx on public.trip_airlines (trip_id, updated_at, id) where deleted_at is null;
create index if not exists notes_trip_updated_idx on public.notes (trip_id, updated_at, id) where deleted_at is null;
create index if not exists activity_events_trip_created_idx on public.activity_events (trip_id, created_at desc);
create index if not exists flight_leg_purpose_idx on public.documents (flight_leg_id, purpose) where deleted_at is null;
create index if not exists alert_states_user_updated_idx on public.alert_states (user_id, updated_at);

alter table public.user_trip_focus enable row level security;
alter table public.trip_airlines enable row level security;
alter table public.notes enable row level security;
alter table public.activity_events enable row level security;
alter table public.join_code_attempts enable row level security;
alter table public.config_releases enable row level security;
alter table public.airline_catalog_entries enable row level security;
alter table public.airport_catalog_entries enable row level security;
alter table public.metadata_defaults enable row level security;
alter table public.theme_palettes enable row level security;
alter table public.config_audit_events enable row level security;

revoke all on public.user_trip_focus, public.trip_airlines, public.notes, public.activity_events, public.join_code_attempts,
  public.config_releases, public.airline_catalog_entries, public.airport_catalog_entries, public.metadata_defaults,
  public.theme_palettes, public.config_audit_events from anon, authenticated;
grant select, insert, update, delete on public.user_trip_focus, public.trip_airlines, public.notes to authenticated;
grant select on public.activity_events, public.config_releases, public.airline_catalog_entries, public.airport_catalog_entries,
  public.metadata_defaults, public.theme_palettes, public.config_audit_events to authenticated;
grant insert, update, delete on public.airline_catalog_entries, public.airport_catalog_entries, public.metadata_defaults, public.theme_palettes to authenticated;
grant all on public.user_trip_focus, public.trip_airlines, public.notes, public.activity_events, public.join_code_attempts,
  public.config_releases, public.airline_catalog_entries, public.airport_catalog_entries, public.metadata_defaults,
  public.theme_palettes, public.config_audit_events to service_role;

create policy focus_own on public.user_trip_focus for all to authenticated using (user_id = auth.uid() and public.is_trip_member(trip_id)) with check (user_id = auth.uid() and public.is_trip_member(trip_id));
create policy trip_airlines_read on public.trip_airlines for select to authenticated using (public.is_trip_member(trip_id));
create policy trip_airlines_create on public.trip_airlines for insert to authenticated with check (public.can_edit_trip(trip_id) and created_by = auth.uid());
create policy trip_airlines_update on public.trip_airlines for update to authenticated using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id));
create policy trip_airlines_delete on public.trip_airlines for delete to authenticated using (public.can_edit_trip(trip_id));
create policy notes_read on public.notes for select to authenticated using (public.is_trip_member(trip_id));
create policy notes_create on public.notes for insert to authenticated with check (public.can_edit_trip(trip_id) and created_by = auth.uid());
create policy notes_update on public.notes for update to authenticated using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id));
create policy notes_delete on public.notes for delete to authenticated using (public.can_edit_trip(trip_id));
create policy activity_read on public.activity_events for select to authenticated using (public.is_trip_member(trip_id));

drop policy if exists travelers_update on public.travelers;
create policy travelers_update on public.travelers for update to authenticated using (
  public.can_edit_traveler_profile(id)
) with check (
  public.can_edit_traveler_profile(id)
);

drop policy if exists documents_create on public.documents;
create policy documents_create on public.documents for insert to authenticated with check (
  public.is_trip_member(trip_id)
  and uploaded_by = auth.uid()
  and (
    public.can_edit_trip(trip_id)
    or visibility = 'private'
    or (
      visibility = 'traveler_and_managers' and traveler_id is not null and (
        exists (select 1 from public.traveler_accounts ta where ta.traveler_id = documents.traveler_id and ta.user_id = auth.uid())
        or exists (
          select 1 from public.traveler_managers manager
          where manager.traveler_id = documents.traveler_id and manager.user_id = auth.uid()
            and manager.can_manage_documents and manager.revoked_at is null
        )
      )
    )
  )
);

drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents for update to authenticated using (public.can_manage_document(id)) with check (
  public.is_trip_member(trip_id)
  and (
    public.can_edit_trip(trip_id)
    or visibility = 'private'
    or (
      visibility = 'traveler_and_managers' and traveler_id is not null and (
        exists (select 1 from public.traveler_accounts ta where ta.traveler_id = documents.traveler_id and ta.user_id = auth.uid())
        or exists (
          select 1 from public.traveler_managers manager
          where manager.traveler_id = documents.traveler_id and manager.user_id = auth.uid()
            and manager.can_manage_documents and manager.revoked_at is null
        )
      )
    )
  )
);

create policy config_releases_read on public.config_releases for select to authenticated using (status = 'published' or public.is_app_admin());
create policy airline_catalog_read on public.airline_catalog_entries for select to authenticated using (public.is_app_admin() or exists (select 1 from public.config_releases where id = config_release_id and status = 'published'));
create policy airline_catalog_write on public.airline_catalog_entries for all to authenticated using (public.is_app_admin() and exists (select 1 from public.config_releases where id = config_release_id and status = 'draft')) with check (public.is_app_admin() and updated_by = auth.uid() and exists (select 1 from public.config_releases where id = config_release_id and status = 'draft'));
create policy airport_catalog_read on public.airport_catalog_entries for select to authenticated using (public.is_app_admin() or exists (select 1 from public.config_releases where id = config_release_id and status = 'published'));
create policy airport_catalog_write on public.airport_catalog_entries for all to authenticated using (public.is_app_admin() and exists (select 1 from public.config_releases where id = config_release_id and status = 'draft')) with check (public.is_app_admin() and updated_by = auth.uid() and exists (select 1 from public.config_releases where id = config_release_id and status = 'draft'));
create policy metadata_defaults_read on public.metadata_defaults for select to authenticated using (public.is_app_admin() or exists (select 1 from public.config_releases where id = config_release_id and status = 'published'));
create policy metadata_defaults_write on public.metadata_defaults for all to authenticated using (public.is_app_admin() and exists (select 1 from public.config_releases where id = config_release_id and status = 'draft')) with check (public.is_app_admin() and updated_by = auth.uid() and exists (select 1 from public.config_releases where id = config_release_id and status = 'draft'));
create policy theme_palettes_read on public.theme_palettes for select to authenticated using (public.is_app_admin() or exists (select 1 from public.config_releases where id = config_release_id and status = 'published'));
create policy theme_palettes_write on public.theme_palettes for all to authenticated using (public.is_app_admin() and exists (select 1 from public.config_releases where id = config_release_id and status = 'draft')) with check (public.is_app_admin() and updated_by = auth.uid() and exists (select 1 from public.config_releases where id = config_release_id and status = 'draft'));
create policy config_audit_admin_read on public.config_audit_events for select to authenticated using (public.is_app_admin());

revoke all on function public.create_trip_invitation(uuid, public.invitation_target_type, uuid, public.member_role) from public, anon;
revoke all on function public.redeem_trip_invitation(text) from public, anon;
revoke all on function public.create_config_draft(text) from public, anon;
revoke all on function public.publish_config_release(uuid) from public, anon;
revoke all on function public.rollback_config_release(uuid) from public, anon;
revoke all on function public.reorder_itinerary_items(uuid, uuid[]) from public, anon;
revoke all on function public.enforce_profile_timezone() from public, anon, authenticated;
revoke all on function public.enforce_requirement_document_trip() from public, anon, authenticated;
revoke all on function public.enforce_itinerary_booking_trip() from public, anon, authenticated;
revoke all on function public.enforce_traveler_manager_membership() from public, anon, authenticated;
revoke all on function public.enforce_managed_traveler_update() from public, anon, authenticated;
revoke all on function public.can_edit_traveler_profile(uuid, uuid) from public, anon;
grant execute on function public.create_trip_invitation(uuid, public.invitation_target_type, uuid, public.member_role), public.redeem_trip_invitation(text) to authenticated;
grant execute on function public.create_config_draft(text), public.publish_config_release(uuid) to authenticated;
grant execute on function public.rollback_config_release(uuid) to authenticated;
grant execute on function public.reorder_itinerary_items(uuid, uuid[]) to authenticated;
grant execute on function public.can_edit_traveler_profile(uuid, uuid) to authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalog-assets', 'catalog-assets', true, 2000000, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists catalog_assets_public_read on storage.objects;
create policy catalog_assets_public_read on storage.objects for select to public using (bucket_id = 'catalog-assets');
drop policy if exists catalog_assets_admin_create on storage.objects;
create policy catalog_assets_admin_create on storage.objects for insert to authenticated with check (bucket_id = 'catalog-assets' and public.is_app_admin());
drop policy if exists catalog_assets_admin_update on storage.objects;
create policy catalog_assets_admin_update on storage.objects for update to authenticated using (bucket_id = 'catalog-assets' and public.is_app_admin()) with check (bucket_id = 'catalog-assets' and public.is_app_admin());
drop policy if exists catalog_assets_admin_delete on storage.objects;
create policy catalog_assets_admin_delete on storage.objects for delete to authenticated using (bucket_id = 'catalog-assets' and public.is_app_admin());

do $$
declare table_name text;
begin
  foreach table_name in array array['trips', 'trip_members', 'travelers', 'bookings', 'flight_legs', 'itinerary_items', 'documents', 'trip_requirements', 'trip_costs', 'reminders', 'notes'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = table_name
    ) then execute format('alter publication supabase_realtime add table public.%I', table_name); end if;
  end loop;
end $$;

commit;
