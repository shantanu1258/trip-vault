-- Trip Vault: complete Supabase setup
--
-- Paste this entire file into the Supabase SQL Editor for a new project.
-- It contains the full current baseline, including all historical fixes.
-- Files under supabase/migrations contain only changes made after this baseline
-- for existing deployments.
--
-- Safe expectation: use this complete file once on a new database. For an
-- existing database, run only migrations that have not already been applied.

-- ============================================================================
-- 202609100001_initial_schema.sql
-- ============================================================================

-- Trip Vault initial Supabase schema
-- Run this once in a new Supabase project's SQL Editor.
-- The script uses explicit Data API grants and Row Level Security throughout.

begin;

create extension if not exists pgcrypto;

do $$ begin create type public.trip_status as enum ('draft', 'upcoming', 'active', 'completed', 'archived'); exception when duplicate_object then null; end $$;
do $$ begin create type public.member_role as enum ('owner', 'editor', 'viewer'); exception when duplicate_object then null; end $$;
do $$ begin create type public.member_status as enum ('active', 'removed'); exception when duplicate_object then null; end $$;
do $$ begin create type public.participation_type as enum ('traveler', 'collaborator'); exception when duplicate_object then null; end $$;
do $$ begin create type public.traveler_status as enum ('active', 'removed'); exception when duplicate_object then null; end $$;
do $$ begin create type public.invitation_target_type as enum ('traveler', 'collaborator'); exception when duplicate_object then null; end $$;
do $$ begin create type public.app_admin_status as enum ('active', 'disabled'); exception when duplicate_object then null; end $$;
do $$ begin create type public.booking_type as enum ('flight', 'hotel', 'transport', 'activity', 'restaurant', 'other'); exception when duplicate_object then null; end $$;
do $$ begin create type public.document_category as enum ('flight', 'hotel', 'visa', 'passport', 'insurance', 'ticket', 'transport', 'receipt', 'other'); exception when duplicate_object then null; end $$;
do $$ begin create type public.document_purpose as enum ('confirmation', 'ticket', 'boarding_pass', 'baggage_tag', 'visa', 'passport', 'insurance', 'other'); exception when duplicate_object then null; end $$;
do $$ begin create type public.document_visibility as enum ('private', 'traveler_and_managers', 'trip', 'selected_members'); exception when duplicate_object then null; end $$;
do $$ begin create type public.flight_status as enum ('scheduled', 'check_in_open', 'boarding', 'delayed', 'departed', 'landed', 'cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type public.requirement_type as enum ('visa', 'passport', 'insurance', 'check_in', 'payment', 'packing', 'custom'); exception when duplicate_object then null; end $$;
do $$ begin create type public.requirement_status as enum ('to_check', 'not_required', 'required', 'in_progress', 'complete', 'expired'); exception when duplicate_object then null; end $$;
do $$ begin create type public.alert_severity as enum ('urgent', 'today', 'upcoming', 'information'); exception when duplicate_object then null; end $$;
do $$ begin create type public.cost_category as enum ('flight', 'hotel', 'transport', 'activity', 'food', 'visa', 'insurance', 'other'); exception when duplicate_object then null; end $$;
do $$ begin create type public.payment_status as enum ('planned', 'paid', 'refunded'); exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 100),
  avatar_path text,
  home_timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status public.app_admin_status not null default 'active',
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  disabled_at timestamptz
);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 120),
  destination_summary text not null default '',
  start_date date not null,
  end_date date not null,
  primary_timezone text not null default 'UTC',
  base_currency text not null default 'INR' check (base_currency ~ '^[A-Z]{3}$'),
  status public.trip_status not null default 'draft',
  cover_image_path text,
  created_by uuid not null references auth.users(id),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint trips_date_order check (end_date >= start_date)
);

create table if not exists public.trip_members (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null,
  participation_type public.participation_type not null default 'traveler',
  status public.member_status not null default 'active',
  joined_at timestamptz,
  added_by uuid not null references auth.users(id),
  removed_at timestamptz,
  primary key (trip_id, user_id)
);

create table if not exists public.travelers (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 100),
  status public.traveler_status not null default 'active',
  is_minor boolean not null default false,
  created_by uuid not null references auth.users(id),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  removed_at timestamptz
);

create table if not exists public.traveler_accounts (
  traveler_id uuid primary key references public.travelers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  invitation_id uuid,
  linked_at timestamptz not null default now()
);

create table if not exists public.traveler_managers (
  traveler_id uuid not null references public.travelers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  can_view_documents boolean not null default true,
  can_manage_documents boolean not null default false,
  can_edit_profile boolean not null default false,
  assigned_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (traveler_id, user_id)
);

create table if not exists public.trip_invitations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  target_type public.invitation_target_type not null,
  traveler_id uuid references public.travelers(id) on delete cascade,
  role public.member_role not null check (role <> 'owner'),
  code_lookup text not null unique,
  code_secret_hash text not null,
  expires_at timestamptz not null,
  invited_by uuid not null references auth.users(id),
  redeemed_by uuid references auth.users(id),
  redeemed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint invitation_target_shape check (
    (target_type = 'traveler' and traveler_id is not null)
    or (target_type = 'collaborator' and traveler_id is null)
  )
);

alter table public.traveler_accounts
  drop constraint if exists traveler_accounts_invitation_id_fkey;
alter table public.traveler_accounts
  add constraint traveler_accounts_invitation_id_fkey foreign key (invitation_id) references public.trip_invitations(id);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  type public.booking_type not null,
  title text not null check (char_length(trim(title)) between 1 and 160),
  provider text,
  reference_code text,
  start_at timestamptz,
  end_at timestamptz,
  source_timezone text,
  location jsonb,
  details jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users(id),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint bookings_time_order check (end_at is null or start_at is null or end_at >= start_at)
);

create table if not exists public.booking_travelers (
  booking_id uuid not null references public.bookings(id) on delete cascade,
  traveler_id uuid not null references public.travelers(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (booking_id, traveler_id)
);

create table if not exists public.flight_legs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  segment_order integer not null check (segment_order >= 0),
  airline_name text not null,
  flight_number text not null,
  departure_airport_code text,
  departure_airport_name text not null,
  arrival_airport_code text,
  arrival_airport_name text not null,
  scheduled_departure_at timestamptz not null,
  scheduled_arrival_at timestamptz not null,
  estimated_departure_at timestamptz,
  estimated_arrival_at timestamptz,
  actual_departure_at timestamptz,
  actual_arrival_at timestamptz,
  departure_timezone text not null,
  arrival_timezone text not null,
  boarding_at timestamptz,
  departure_terminal text,
  departure_gate text,
  arrival_terminal text,
  arrival_gate text,
  baggage_claim text,
  status public.flight_status not null default 'scheduled',
  status_note text,
  status_updated_by uuid not null references auth.users(id),
  status_updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (booking_id, segment_order),
  constraint flight_schedule_order check (scheduled_arrival_at > scheduled_departure_at)
);

create table if not exists public.flight_leg_travelers (
  flight_leg_id uuid not null references public.flight_legs(id) on delete cascade,
  traveler_id uuid not null references public.travelers(id) on delete cascade,
  seat text,
  boarding_group text,
  ticket_number text,
  updated_at timestamptz not null default now(),
  primary key (flight_leg_id, traveler_id)
);

create table if not exists public.itinerary_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  title text not null check (char_length(trim(title)) between 1 and 160),
  starts_at timestamptz not null,
  ends_at timestamptz,
  timezone text not null,
  location jsonb,
  notes text,
  applies_to_all_travelers boolean not null default true,
  sort_key text not null default '',
  created_by uuid not null references auth.users(id),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint itinerary_time_order check (ends_at is null or ends_at >= starts_at)
);

create table if not exists public.itinerary_participants (
  itinerary_item_id uuid not null references public.itinerary_items(id) on delete cascade,
  traveler_id uuid not null references public.travelers(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (itinerary_item_id, traveler_id)
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  flight_leg_id uuid references public.flight_legs(id) on delete set null,
  traveler_id uuid references public.travelers(id) on delete set null,
  title text not null check (char_length(trim(title)) between 1 and 180),
  category public.document_category not null,
  purpose public.document_purpose not null default 'other',
  short_label text,
  visibility public.document_visibility not null default 'private',
  uploaded_by uuid not null references auth.users(id),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint traveler_visibility_requires_traveler check (visibility <> 'traveler_and_managers' or traveler_id is not null)
);

create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  byte_size bigint not null check (byte_size >= 0 and byte_size < 5000000),
  sha256 text not null check (sha256 ~ '^[0-9a-fA-F]{64}$'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (document_id, version_number)
);

alter table public.documents add column if not exists current_version_id uuid;
alter table public.documents drop constraint if exists documents_current_version_id_fkey;
alter table public.documents add constraint documents_current_version_id_fkey foreign key (current_version_id) references public.document_versions(id) on delete set null;

create table if not exists public.document_access (
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  granted_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (document_id, user_id)
);

create table if not exists public.itinerary_item_documents (
  itinerary_item_id uuid not null references public.itinerary_items(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  label text,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_by uuid not null references auth.users(id),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (itinerary_item_id, document_id)
);

create table if not exists public.trip_requirements (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  type public.requirement_type not null,
  title text not null,
  destination_country_code text,
  visa_type text,
  status public.requirement_status not null default 'to_check',
  due_date date,
  issued_on date,
  expires_on date,
  validity_buffer_days integer check (validity_buffer_days is null or validity_buffer_days >= 0),
  official_guidance_url text check (official_guidance_url is null or official_guidance_url ~ '^https://'),
  guidance_checked_at timestamptz,
  linked_document_id uuid references public.documents(id) on delete set null,
  notes text,
  created_by uuid not null references auth.users(id),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.requirement_assignees (
  requirement_id uuid not null references public.trip_requirements(id) on delete cascade,
  traveler_id uuid not null references public.travelers(id) on delete cascade,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (requirement_id, traveler_id)
);

create table if not exists public.trip_costs (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  itinerary_item_id uuid references public.itinerary_items(id) on delete set null,
  title text not null check (char_length(trim(title)) between 1 and 160),
  category public.cost_category not null default 'other',
  amount_minor bigint not null check (amount_minor >= 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  payment_status public.payment_status not null default 'planned',
  paid_by uuid references auth.users(id) on delete set null,
  notes text,
  created_by uuid not null references auth.users(id),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete cascade,
  entity_type text,
  entity_id uuid,
  title text not null,
  due_at timestamptz not null,
  severity public.alert_severity not null default 'upcoming',
  completed_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.alert_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  alert_key text not null,
  read_at timestamptz,
  dismissed_at timestamptz,
  snoozed_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, alert_key)
);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.preserve_audit_actor()
returns trigger language plpgsql set search_path = public as $$
begin
  new := jsonb_populate_record(new, jsonb_build_object(TG_ARGV[0], to_jsonb(old) -> TG_ARGV[0]));
  return new;
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'profiles', 'trips', 'travelers', 'bookings', 'flight_legs', 'itinerary_items',
    'documents', 'itinerary_item_documents', 'trip_requirements', 'trip_costs',
    'reminders', 'alert_states'
  ] loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name);
  end loop;
end $$;

do $$
declare trigger_spec text[];
begin
  foreach trigger_spec slice 1 in array array[
    array['travelers', 'created_by'], array['bookings', 'created_by'],
    array['itinerary_items', 'created_by'], array['documents', 'uploaded_by'],
    array['itinerary_item_documents', 'created_by'], array['trip_requirements', 'created_by'],
    array['trip_costs', 'created_by'], array['trip_invitations', 'invited_by'],
    array['traveler_managers', 'assigned_by'], array['document_access', 'granted_by']
  ] loop
    execute format('drop trigger if exists preserve_audit_actor on public.%I', trigger_spec[1]);
    execute format(
      'create trigger preserve_audit_actor before update on public.%I for each row execute function public.preserve_audit_actor(%L)',
      trigger_spec[1], trigger_spec[2]
    );
  end loop;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(new.email, 'Traveler'), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (id, display_name)
select id, coalesce(nullif(trim(raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(email, 'Traveler'), '@', 1))
from auth.users
on conflict (id) do nothing;

create or replace function public.add_trip_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.trip_members (trip_id, user_id, role, participation_type, status, joined_at, added_by)
  values (new.id, new.created_by, 'owner', 'traveler', 'active', now(), new.created_by)
  on conflict (trip_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_trip_created_add_owner on public.trips;
create trigger on_trip_created_add_owner after insert on public.trips
for each row execute function public.add_trip_owner();

create or replace function public.is_trip_member(requested_trip_id uuid, requested_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = requested_trip_id and user_id = requested_user_id and status = 'active'
  );
$$;

create or replace function public.is_trip_owner(requested_trip_id uuid, requested_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = requested_trip_id and user_id = requested_user_id and status = 'active' and role = 'owner'
  );
$$;

create or replace function public.can_edit_trip(requested_trip_id uuid, requested_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = requested_trip_id and user_id = requested_user_id and status = 'active' and role in ('owner', 'editor')
  );
$$;

create or replace function public.shares_trip_with(other_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.trip_members mine
    join public.trip_members theirs on theirs.trip_id = mine.trip_id
    where mine.user_id = auth.uid() and mine.status = 'active'
      and theirs.user_id = other_user_id and theirs.status = 'active'
  );
$$;

create or replace function public.is_app_admin(requested_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_admins where user_id = requested_user_id and status = 'active');
$$;

create or replace function public.can_read_document(requested_document_id uuid, requested_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.documents d
    join public.trip_members tm on tm.trip_id = d.trip_id and tm.user_id = requested_user_id and tm.status = 'active'
    where d.id = requested_document_id and d.deleted_at is null and (
      d.visibility = 'trip'
      or d.uploaded_by = requested_user_id
      or (d.visibility = 'selected_members' and exists (
        select 1 from public.document_access da where da.document_id = d.id and da.user_id = requested_user_id
      ))
      or (d.visibility = 'traveler_and_managers' and (
        exists (select 1 from public.traveler_accounts ta where ta.traveler_id = d.traveler_id and ta.user_id = requested_user_id)
        or exists (
          select 1 from public.traveler_managers manager
          where manager.traveler_id = d.traveler_id and manager.user_id = requested_user_id
            and manager.can_view_documents and manager.revoked_at is null
        )
      ))
    )
  );
$$;

create or replace function public.can_manage_document(requested_document_id uuid, requested_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.documents d
    where d.id = requested_document_id and public.is_trip_member(d.trip_id, requested_user_id) and (
      d.uploaded_by = requested_user_id
      or public.can_edit_trip(d.trip_id, requested_user_id)
      or exists (
        select 1 from public.traveler_managers manager
        where manager.traveler_id = d.traveler_id and manager.user_id = requested_user_id
          and manager.can_manage_documents and manager.revoked_at is null
      )
    )
  );
$$;

create or replace function public.safe_uuid(value text)
returns uuid language plpgsql immutable as $$
begin
  return value::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.enforce_itinerary_document_trip()
returns trigger language plpgsql security definer set search_path = public as $$
declare item_trip_id uuid;
declare document_trip_id uuid;
begin
  select trip_id into item_trip_id from public.itinerary_items where id = new.itinerary_item_id;
  select trip_id into document_trip_id from public.documents where id = new.document_id;
  if item_trip_id is null or document_trip_id is null or item_trip_id <> document_trip_id then
    raise exception 'Itinerary item and document must belong to the same trip';
  end if;
  return new;
end;
$$;

drop trigger if exists itinerary_document_same_trip on public.itinerary_item_documents;
create trigger itinerary_document_same_trip before insert or update on public.itinerary_item_documents
for each row execute function public.enforce_itinerary_document_trip();

create or replace function public.enforce_current_document_version()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.current_version_id is not null and not exists (
    select 1 from public.document_versions v where v.id = new.current_version_id and v.document_id = new.id
  ) then
    raise exception 'Current version must belong to the same document';
  end if;
  return new;
end;
$$;

drop trigger if exists current_version_same_document on public.documents;
create trigger current_version_same_document before insert or update of current_version_id on public.documents
for each row execute function public.enforce_current_document_version();

create index if not exists trip_members_user_active_idx on public.trip_members (user_id, trip_id) where status = 'active';
create index if not exists travelers_trip_updated_idx on public.travelers (trip_id, updated_at, id) where removed_at is null;
create index if not exists bookings_trip_updated_idx on public.bookings (trip_id, updated_at, id) where deleted_at is null;
create index if not exists itinerary_trip_time_idx on public.itinerary_items (trip_id, starts_at, id) where deleted_at is null;
create index if not exists documents_trip_updated_idx on public.documents (trip_id, updated_at, id) where deleted_at is null;
create index if not exists requirements_trip_updated_idx on public.trip_requirements (trip_id, updated_at, id) where deleted_at is null;
create index if not exists costs_trip_currency_idx on public.trip_costs (trip_id, currency_code, category) where deleted_at is null;
create index if not exists reminders_user_due_idx on public.reminders (user_id, due_at) where completed_at is null;

alter table public.profiles enable row level security;
alter table public.app_admins enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.travelers enable row level security;
alter table public.traveler_accounts enable row level security;
alter table public.traveler_managers enable row level security;
alter table public.trip_invitations enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_travelers enable row level security;
alter table public.flight_legs enable row level security;
alter table public.flight_leg_travelers enable row level security;
alter table public.itinerary_items enable row level security;
alter table public.itinerary_participants enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_access enable row level security;
alter table public.itinerary_item_documents enable row level security;
alter table public.trip_requirements enable row level security;
alter table public.requirement_assignees enable row level security;
alter table public.trip_costs enable row level security;
alter table public.reminders enable row level security;
alter table public.alert_states enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'profiles', 'app_admins', 'trips', 'trip_members', 'travelers', 'traveler_accounts',
    'traveler_managers', 'trip_invitations', 'bookings', 'booking_travelers', 'flight_legs',
    'flight_leg_travelers', 'itinerary_items', 'itinerary_participants', 'documents',
    'document_versions', 'document_access', 'itinerary_item_documents', 'trip_requirements',
    'requirement_assignees', 'trip_costs', 'reminders', 'alert_states'
  ] loop
    execute format('revoke all on public.%I from anon', table_name);
    execute format('revoke all on public.%I from authenticated', table_name);
  end loop;
end $$;

grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select on public.app_admins to authenticated;
grant select, insert, update, delete on public.trips, public.travelers, public.traveler_managers,
  public.trip_invitations, public.bookings, public.booking_travelers, public.flight_legs,
  public.flight_leg_travelers, public.itinerary_items, public.itinerary_participants,
  public.documents, public.document_access, public.itinerary_item_documents,
  public.trip_requirements, public.requirement_assignees, public.trip_costs,
  public.reminders, public.alert_states to authenticated;
grant select, update, delete on public.trip_members to authenticated;
grant select on public.traveler_accounts to authenticated;
grant select, insert on public.document_versions to authenticated;
grant all on public.profiles, public.app_admins, public.trips, public.trip_members,
  public.travelers, public.traveler_accounts, public.traveler_managers, public.trip_invitations,
  public.bookings, public.booking_travelers, public.flight_legs, public.flight_leg_travelers,
  public.itinerary_items, public.itinerary_participants, public.documents, public.document_versions,
  public.document_access, public.itinerary_item_documents, public.trip_requirements,
  public.requirement_assignees, public.trip_costs, public.reminders, public.alert_states to service_role;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (id = auth.uid() or public.shares_trip_with(id));
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists app_admins_read_self on public.app_admins;
create policy app_admins_read_self on public.app_admins for select to authenticated using (user_id = auth.uid() and status = 'active');

drop policy if exists trips_read_member on public.trips;
create policy trips_read_member on public.trips for select to authenticated using (public.is_trip_member(id));
drop policy if exists trips_create on public.trips;
create policy trips_create on public.trips for insert to authenticated with check (created_by = auth.uid());
drop policy if exists trips_edit on public.trips;
create policy trips_edit on public.trips for update to authenticated using (public.can_edit_trip(id)) with check (public.can_edit_trip(id));
drop policy if exists trips_delete on public.trips;
create policy trips_delete on public.trips for delete to authenticated using (public.is_trip_owner(id));

drop policy if exists trip_members_read on public.trip_members;
create policy trip_members_read on public.trip_members for select to authenticated using (public.is_trip_member(trip_id));
drop policy if exists trip_members_update_owner on public.trip_members;
create policy trip_members_update_owner on public.trip_members for update to authenticated using (public.is_trip_owner(trip_id)) with check (public.is_trip_owner(trip_id));
drop policy if exists trip_members_delete_owner on public.trip_members;
create policy trip_members_delete_owner on public.trip_members for delete to authenticated using (public.is_trip_owner(trip_id) and user_id <> auth.uid());

drop policy if exists travelers_read on public.travelers;
create policy travelers_read on public.travelers for select to authenticated using (public.is_trip_member(trip_id));
drop policy if exists travelers_write on public.travelers;
drop policy if exists travelers_create on public.travelers;
create policy travelers_create on public.travelers for insert to authenticated with check (public.can_edit_trip(trip_id) and created_by = auth.uid());
drop policy if exists travelers_update on public.travelers;
create policy travelers_update on public.travelers for update to authenticated using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id));
drop policy if exists travelers_delete on public.travelers;
create policy travelers_delete on public.travelers for delete to authenticated using (public.can_edit_trip(trip_id));

drop policy if exists traveler_accounts_read on public.traveler_accounts;
create policy traveler_accounts_read on public.traveler_accounts for select to authenticated using (
  user_id = auth.uid() or exists (select 1 from public.travelers t where t.id = traveler_id and public.is_trip_member(t.trip_id))
);
drop policy if exists traveler_accounts_insert on public.traveler_accounts;

drop policy if exists traveler_managers_read on public.traveler_managers;
create policy traveler_managers_read on public.traveler_managers for select to authenticated using (
  exists (select 1 from public.travelers t where t.id = traveler_id and public.is_trip_member(t.trip_id))
);
drop policy if exists traveler_managers_write on public.traveler_managers;
create policy traveler_managers_write on public.traveler_managers for all to authenticated using (
  exists (select 1 from public.travelers t where t.id = traveler_id and public.is_trip_owner(t.trip_id))
) with check (
  exists (select 1 from public.travelers t where t.id = traveler_id and public.is_trip_owner(t.trip_id))
);

drop policy if exists invitations_owner_read on public.trip_invitations;
create policy invitations_owner_read on public.trip_invitations for select to authenticated using (public.is_trip_owner(trip_id));
drop policy if exists invitations_owner_write on public.trip_invitations;
drop policy if exists invitations_owner_create on public.trip_invitations;
create policy invitations_owner_create on public.trip_invitations for insert to authenticated with check (public.is_trip_owner(trip_id) and invited_by = auth.uid());
drop policy if exists invitations_owner_update on public.trip_invitations;
create policy invitations_owner_update on public.trip_invitations for update to authenticated using (public.is_trip_owner(trip_id)) with check (public.is_trip_owner(trip_id));
drop policy if exists invitations_owner_delete on public.trip_invitations;
create policy invitations_owner_delete on public.trip_invitations for delete to authenticated using (public.is_trip_owner(trip_id));

drop policy if exists bookings_read on public.bookings;
create policy bookings_read on public.bookings for select to authenticated using (public.is_trip_member(trip_id));
drop policy if exists bookings_write on public.bookings;
drop policy if exists bookings_create on public.bookings;
create policy bookings_create on public.bookings for insert to authenticated with check (public.can_edit_trip(trip_id) and created_by = auth.uid());
drop policy if exists bookings_update on public.bookings;
create policy bookings_update on public.bookings for update to authenticated using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id));
drop policy if exists bookings_delete on public.bookings;
create policy bookings_delete on public.bookings for delete to authenticated using (public.can_edit_trip(trip_id));

drop policy if exists booking_travelers_read on public.booking_travelers;
create policy booking_travelers_read on public.booking_travelers for select to authenticated using (
  exists (select 1 from public.bookings b where b.id = booking_id and public.is_trip_member(b.trip_id))
);
drop policy if exists booking_travelers_write on public.booking_travelers;
create policy booking_travelers_write on public.booking_travelers for all to authenticated using (
  exists (select 1 from public.bookings b where b.id = booking_id and public.can_edit_trip(b.trip_id))
) with check (
  exists (select 1 from public.bookings b where b.id = booking_id and public.can_edit_trip(b.trip_id))
);

drop policy if exists flight_legs_read on public.flight_legs;
create policy flight_legs_read on public.flight_legs for select to authenticated using (
  exists (select 1 from public.bookings b where b.id = booking_id and public.is_trip_member(b.trip_id))
);
drop policy if exists flight_legs_write on public.flight_legs;
create policy flight_legs_write on public.flight_legs for all to authenticated using (
  exists (select 1 from public.bookings b where b.id = booking_id and public.can_edit_trip(b.trip_id))
) with check (
  exists (select 1 from public.bookings b where b.id = booking_id and public.can_edit_trip(b.trip_id))
);

drop policy if exists flight_leg_travelers_read on public.flight_leg_travelers;
create policy flight_leg_travelers_read on public.flight_leg_travelers for select to authenticated using (
  exists (select 1 from public.flight_legs f join public.bookings b on b.id = f.booking_id where f.id = flight_leg_id and public.is_trip_member(b.trip_id))
);
drop policy if exists flight_leg_travelers_write on public.flight_leg_travelers;
create policy flight_leg_travelers_write on public.flight_leg_travelers for all to authenticated using (
  exists (select 1 from public.flight_legs f join public.bookings b on b.id = f.booking_id where f.id = flight_leg_id and public.can_edit_trip(b.trip_id))
) with check (
  exists (select 1 from public.flight_legs f join public.bookings b on b.id = f.booking_id where f.id = flight_leg_id and public.can_edit_trip(b.trip_id))
);

drop policy if exists itinerary_read on public.itinerary_items;
create policy itinerary_read on public.itinerary_items for select to authenticated using (public.is_trip_member(trip_id));
drop policy if exists itinerary_write on public.itinerary_items;
drop policy if exists itinerary_create on public.itinerary_items;
create policy itinerary_create on public.itinerary_items for insert to authenticated with check (public.can_edit_trip(trip_id) and created_by = auth.uid());
drop policy if exists itinerary_update on public.itinerary_items;
create policy itinerary_update on public.itinerary_items for update to authenticated using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id));
drop policy if exists itinerary_delete on public.itinerary_items;
create policy itinerary_delete on public.itinerary_items for delete to authenticated using (public.can_edit_trip(trip_id));

drop policy if exists itinerary_participants_read on public.itinerary_participants;
create policy itinerary_participants_read on public.itinerary_participants for select to authenticated using (
  exists (select 1 from public.itinerary_items i where i.id = itinerary_item_id and public.is_trip_member(i.trip_id))
);
drop policy if exists itinerary_participants_write on public.itinerary_participants;
create policy itinerary_participants_write on public.itinerary_participants for all to authenticated using (
  exists (select 1 from public.itinerary_items i where i.id = itinerary_item_id and public.can_edit_trip(i.trip_id))
) with check (
  exists (select 1 from public.itinerary_items i where i.id = itinerary_item_id and public.can_edit_trip(i.trip_id))
);

drop policy if exists documents_read on public.documents;
create policy documents_read on public.documents for select to authenticated using (public.can_read_document(id));
drop policy if exists documents_create on public.documents;
create policy documents_create on public.documents for insert to authenticated with check (public.is_trip_member(trip_id) and uploaded_by = auth.uid());
drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents for update to authenticated using (public.can_manage_document(id)) with check (public.is_trip_member(trip_id));
drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents for delete to authenticated using (public.can_manage_document(id));

drop policy if exists document_versions_read on public.document_versions;
create policy document_versions_read on public.document_versions for select to authenticated using (public.can_read_document(document_id));
drop policy if exists document_versions_create on public.document_versions;
create policy document_versions_create on public.document_versions for insert to authenticated with check (created_by = auth.uid() and public.can_manage_document(document_id));

drop policy if exists document_access_read on public.document_access;
create policy document_access_read on public.document_access for select to authenticated using (public.can_manage_document(document_id) or user_id = auth.uid());
drop policy if exists document_access_write on public.document_access;
drop policy if exists document_access_create on public.document_access;
create policy document_access_create on public.document_access for insert to authenticated with check (public.can_manage_document(document_id) and granted_by = auth.uid());
drop policy if exists document_access_delete on public.document_access;
create policy document_access_delete on public.document_access for delete to authenticated using (public.can_manage_document(document_id));

drop policy if exists itinerary_documents_read on public.itinerary_item_documents;
create policy itinerary_documents_read on public.itinerary_item_documents for select to authenticated using (
  public.can_read_document(document_id)
  and exists (select 1 from public.itinerary_items i where i.id = itinerary_item_id and public.is_trip_member(i.trip_id))
);
drop policy if exists itinerary_documents_write on public.itinerary_item_documents;
drop policy if exists itinerary_documents_create on public.itinerary_item_documents;
create policy itinerary_documents_create on public.itinerary_item_documents for insert to authenticated with check (
  created_by = auth.uid() and public.can_read_document(document_id)
  and exists (select 1 from public.itinerary_items i where i.id = itinerary_item_id and public.can_edit_trip(i.trip_id))
);
drop policy if exists itinerary_documents_update on public.itinerary_item_documents;
create policy itinerary_documents_update on public.itinerary_item_documents for update to authenticated using (
  exists (select 1 from public.itinerary_items i where i.id = itinerary_item_id and public.can_edit_trip(i.trip_id))
) with check (
  public.can_read_document(document_id)
  and exists (select 1 from public.itinerary_items i where i.id = itinerary_item_id and public.can_edit_trip(i.trip_id))
);
drop policy if exists itinerary_documents_delete on public.itinerary_item_documents;
create policy itinerary_documents_delete on public.itinerary_item_documents for delete to authenticated using (
  exists (select 1 from public.itinerary_items i where i.id = itinerary_item_id and public.can_edit_trip(i.trip_id))
);

drop policy if exists requirements_read on public.trip_requirements;
create policy requirements_read on public.trip_requirements for select to authenticated using (public.is_trip_member(trip_id));
drop policy if exists requirements_write on public.trip_requirements;
drop policy if exists requirements_create on public.trip_requirements;
create policy requirements_create on public.trip_requirements for insert to authenticated with check (public.can_edit_trip(trip_id) and created_by = auth.uid());
drop policy if exists requirements_update on public.trip_requirements;
create policy requirements_update on public.trip_requirements for update to authenticated using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id));
drop policy if exists requirements_delete on public.trip_requirements;
create policy requirements_delete on public.trip_requirements for delete to authenticated using (public.can_edit_trip(trip_id));

drop policy if exists requirement_assignees_read on public.requirement_assignees;
create policy requirement_assignees_read on public.requirement_assignees for select to authenticated using (
  exists (select 1 from public.trip_requirements r where r.id = requirement_id and public.is_trip_member(r.trip_id))
);
drop policy if exists requirement_assignees_write on public.requirement_assignees;
create policy requirement_assignees_write on public.requirement_assignees for all to authenticated using (
  exists (select 1 from public.trip_requirements r where r.id = requirement_id and public.can_edit_trip(r.trip_id))
) with check (
  exists (select 1 from public.trip_requirements r where r.id = requirement_id and public.can_edit_trip(r.trip_id))
);

drop policy if exists costs_read on public.trip_costs;
create policy costs_read on public.trip_costs for select to authenticated using (public.is_trip_member(trip_id));
drop policy if exists costs_write on public.trip_costs;
drop policy if exists costs_create on public.trip_costs;
create policy costs_create on public.trip_costs for insert to authenticated with check (public.can_edit_trip(trip_id) and created_by = auth.uid());
drop policy if exists costs_update on public.trip_costs;
create policy costs_update on public.trip_costs for update to authenticated using (public.can_edit_trip(trip_id)) with check (public.can_edit_trip(trip_id));
drop policy if exists costs_delete on public.trip_costs;
create policy costs_delete on public.trip_costs for delete to authenticated using (public.can_edit_trip(trip_id));

drop policy if exists reminders_own on public.reminders;
create policy reminders_own on public.reminders for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid() and (trip_id is null or public.is_trip_member(trip_id)));
drop policy if exists alert_states_own on public.alert_states;
create policy alert_states_own on public.alert_states for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.preserve_audit_actor() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.add_trip_owner() from public, anon, authenticated;
revoke all on function public.enforce_itinerary_document_trip() from public, anon, authenticated;
revoke all on function public.enforce_current_document_version() from public, anon, authenticated;
revoke all on function public.is_trip_member(uuid, uuid) from public, anon;
revoke all on function public.is_trip_owner(uuid, uuid) from public, anon;
revoke all on function public.can_edit_trip(uuid, uuid) from public, anon;
revoke all on function public.shares_trip_with(uuid) from public, anon;
revoke all on function public.is_app_admin(uuid) from public, anon;
revoke all on function public.can_read_document(uuid, uuid) from public, anon;
revoke all on function public.can_manage_document(uuid, uuid) from public, anon;
revoke all on function public.safe_uuid(text) from public, anon;
grant execute on function public.is_trip_member(uuid, uuid), public.is_trip_owner(uuid, uuid),
  public.can_edit_trip(uuid, uuid), public.shares_trip_with(uuid), public.is_app_admin(uuid),
  public.can_read_document(uuid, uuid), public.can_manage_document(uuid, uuid), public.safe_uuid(text)
  to authenticated;
grant execute on function public.is_trip_member(uuid, uuid), public.is_trip_owner(uuid, uuid),
  public.can_edit_trip(uuid, uuid), public.shares_trip_with(uuid), public.is_app_admin(uuid),
  public.can_read_document(uuid, uuid), public.can_manage_document(uuid, uuid), public.safe_uuid(text)
  to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'trip-documents', 'trip-documents', false, 4999999,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists trip_documents_read on storage.objects;
create policy trip_documents_read on storage.objects for select to authenticated using (
  bucket_id = 'trip-documents'
  and (storage.foldername(name))[1] = 'trips'
  and (storage.foldername(name))[3] = 'documents'
  and public.can_read_document(public.safe_uuid((storage.foldername(name))[4]))
);

drop policy if exists trip_documents_create on storage.objects;
create policy trip_documents_create on storage.objects for insert to authenticated with check (
  bucket_id = 'trip-documents'
  and (storage.foldername(name))[1] = 'trips'
  and (storage.foldername(name))[3] = 'documents'
  and public.can_manage_document(public.safe_uuid((storage.foldername(name))[4]))
);

drop policy if exists trip_documents_update on storage.objects;
create policy trip_documents_update on storage.objects for update to authenticated using (
  bucket_id = 'trip-documents'
  and public.can_manage_document(public.safe_uuid((storage.foldername(name))[4]))
) with check (
  bucket_id = 'trip-documents'
  and public.can_manage_document(public.safe_uuid((storage.foldername(name))[4]))
);

drop policy if exists trip_documents_delete on storage.objects;
create policy trip_documents_delete on storage.objects for delete to authenticated using (
  bucket_id = 'trip-documents'
  and public.can_manage_document(public.safe_uuid((storage.foldername(name))[4]))
);

commit;

-- ============================================================================
-- 202609100002_complete_lld.sql
-- ============================================================================

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
  elsif tg_table_name = 'airport_catalog_entries' then
    if not public.valid_iana_timezone(new.timezone) then
      raise exception 'Invalid IANA timezone';
    end if;
  elsif tg_table_name = 'theme_palettes' then
    if not public.valid_theme_tokens(new.light_tokens) or not public.valid_theme_tokens(new.dark_tokens) then
      raise exception 'Invalid or inaccessible theme tokens';
    end if;
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

-- ============================================================================
-- 202609100003_simplify_traveler_context.sql
-- ============================================================================

-- Simplify the personal MVP's managed-traveler flow.
-- Owners and editors can work with traveler-linked documents without creating
-- a separate traveler_managers capability row. Private and selected-member
-- documents retain their existing visibility boundaries.

begin;

create or replace function public.can_read_document(requested_document_id uuid, requested_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.documents d
    join public.trip_members tm on tm.trip_id = d.trip_id and tm.user_id = requested_user_id and tm.status = 'active'
    where d.id = requested_document_id and d.deleted_at is null and (
      d.visibility = 'trip'
      or d.uploaded_by = requested_user_id
      or (d.visibility = 'selected_members' and exists (
        select 1 from public.document_access da where da.document_id = d.id and da.user_id = requested_user_id
      ))
      or (d.visibility = 'traveler_and_managers' and (
        public.can_edit_trip(d.trip_id, requested_user_id)
        or exists (select 1 from public.traveler_accounts ta where ta.traveler_id = d.traveler_id and ta.user_id = requested_user_id)
        or exists (
          select 1 from public.traveler_managers manager
          where manager.traveler_id = d.traveler_id and manager.user_id = requested_user_id
            and manager.can_view_documents and manager.revoked_at is null
        )
      ))
    )
  );
$$;

revoke all on function public.can_read_document(uuid, uuid) from public, anon;
grant execute on function public.can_read_document(uuid, uuid) to authenticated, service_role;

commit;

-- ============================================================================
-- 202609110001_timeline_redesign.sql
-- ============================================================================

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

-- ============================================================================
-- 202609130003_account_document_inbox.sql
-- ============================================================================

-- Account-owned document inbox. File bytes are stored before trip metadata is
-- associated, so an interrupted association leaves a recoverable private file.

begin;

do $$ begin
  create type public.document_assignment_mode as enum ('shared', 'selected', 'unassigned');
exception when duplicate_object then null; end $$;
alter table public.documents
  add column if not exists assignment_mode public.document_assignment_mode;

-- The consolidated setup defines the inbox before the later document-
-- experience section. Create this dependency now; that later section adds its
-- trigger, indexes, grants, and policies before the script completes.
create table if not exists public.document_travelers (
  document_id uuid not null references public.documents(id) on delete cascade,
  traveler_id uuid not null references public.travelers(id) on delete cascade,
  assigned_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (document_id, traveler_id)
);

create table if not exists public.account_document_uploads (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  byte_size bigint not null check (byte_size >= 0 and byte_size < 5000000),
  sha256 text not null check (sha256 ~ '^[0-9a-fA-F]{64}$'),
  associated_document_id uuid references public.documents(id) on delete set null,
  stored_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_document_owner_path check (storage_path like owner_id::text || '/%')
);

alter table public.account_document_uploads
  add column if not exists stored_at timestamptz;

alter table public.document_versions
  add column if not exists storage_bucket text not null default 'trip-documents';
alter table public.document_versions
  drop constraint if exists document_versions_storage_bucket_check;
alter table public.document_versions
  add constraint document_versions_storage_bucket_check
  check (storage_bucket in ('trip-documents', 'account-documents'));
alter table public.document_versions
  add column if not exists source_upload_id uuid references public.account_document_uploads(id) on delete restrict;

create index if not exists account_document_uploads_owner_pending_idx
  on public.account_document_uploads (owner_id, created_at desc)
  where associated_document_id is null;
create index if not exists document_versions_source_upload_idx
  on public.document_versions (source_upload_id)
  where source_upload_id is not null;

drop trigger if exists set_updated_at on public.account_document_uploads;
create trigger set_updated_at before update on public.account_document_uploads
for each row execute function public.set_updated_at();

alter table public.account_document_uploads enable row level security;
revoke all on public.account_document_uploads from anon, authenticated;
grant select, insert, delete on public.account_document_uploads to authenticated;
grant all on public.account_document_uploads to service_role;

drop policy if exists account_document_uploads_read on public.account_document_uploads;
create policy account_document_uploads_read on public.account_document_uploads
for select to authenticated using (owner_id = auth.uid());
drop policy if exists account_document_uploads_create on public.account_document_uploads;
create policy account_document_uploads_create on public.account_document_uploads
for insert to authenticated with check (
  owner_id = auth.uid()
  and associated_document_id is null
  and stored_at is null
);
drop policy if exists account_document_uploads_update on public.account_document_uploads;
drop policy if exists account_document_uploads_delete on public.account_document_uploads;
create policy account_document_uploads_delete on public.account_document_uploads
for delete to authenticated using (owner_id = auth.uid() and associated_document_id is null);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'account-documents', 'account-documents', false, 4999999,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Storage completion hardening from
-- 202609130004_account_document_storage_state.sql.
update public.account_document_uploads upload
set stored_at = coalesce(upload.stored_at, now())
where upload.stored_at is null
  and exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'account-documents'
      and object.name = upload.storage_path
  );

create or replace function public.finalize_account_document_upload(requested_upload_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public, storage, pg_catalog
as $$
declare
  actor uuid := auth.uid();
  upload public.account_document_uploads%rowtype;
  finalized_at timestamptz;
begin
  if actor is null then raise exception 'Sign in before finalizing a document upload'; end if;
  select * into upload
  from public.account_document_uploads
  where id = requested_upload_id and owner_id = actor
  for update;
  if upload.id is null then raise exception 'Document upload was not found for this account'; end if;

  perform 1
  from storage.objects object
  where object.bucket_id = 'account-documents'
    and object.name = upload.storage_path
  for key share;
  if not found then raise exception 'Document file is not stored yet'; end if;

  update public.account_document_uploads
  set stored_at = coalesce(stored_at, now())
  where id = upload.id
  returning stored_at into finalized_at;
  return finalized_at;
end;
$$;

revoke all on function public.finalize_account_document_upload(uuid) from public, anon;
grant execute on function public.finalize_account_document_upload(uuid) to authenticated, service_role;

drop policy if exists account_documents_read on storage.objects;
create policy account_documents_read on storage.objects for select to authenticated using (
  bucket_id = 'account-documents'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1
      from public.document_versions version
      where version.storage_path = name
        and version.storage_bucket = 'account-documents'
        and version.source_upload_id is not null
        and public.can_read_document(version.document_id)
    )
  )
);
drop policy if exists account_documents_create on storage.objects;
-- Byte creation is limited to receipts that have not yet passed server-side
-- Storage verification. Objects are never updated in place; replacements use
-- new version paths. An unassociated finalized inbox item may still be deleted
-- from Profile, while association makes the object immutable.
create policy account_documents_create on storage.objects for insert to authenticated with check (
  bucket_id = 'account-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.account_document_uploads upload
    where upload.owner_id = auth.uid()
      and upload.storage_path = name
      and upload.associated_document_id is null
      and upload.stored_at is null
  )
);
drop policy if exists account_documents_update on storage.objects;
drop policy if exists account_documents_delete on storage.objects;
create policy account_documents_delete on storage.objects for delete to authenticated using (
  bucket_id = 'account-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.account_document_uploads upload
    where upload.owner_id = auth.uid()
      and upload.storage_path = name
      and upload.associated_document_id is null
  )
);

create or replace function public.associate_account_document(
  requested_upload_id uuid,
  requested_document_id uuid,
  requested_version_id uuid,
  requested_trip_id uuid,
  requested_title text,
  requested_category public.document_category,
  requested_purpose public.document_purpose,
  requested_assignment_mode public.document_assignment_mode,
  requested_visibility public.document_visibility,
  requested_booking_id uuid default null,
  requested_flight_leg_id uuid default null,
  requested_journey_leg_id uuid default null,
  requested_short_label text default null,
  requested_traveler_ids uuid[] default '{}',
  requested_user_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public, storage, pg_catalog
as $$
declare
  actor uuid := auth.uid();
  upload public.account_document_uploads%rowtype;
  traveler_ids uuid[] := coalesce(requested_traveler_ids, '{}'::uuid[]);
  selected_user_ids uuid[] := coalesce(requested_user_ids, '{}'::uuid[]);
  primary_traveler uuid;
begin
  if actor is null then raise exception 'Sign in before associating a document'; end if;
  select * into upload
  from public.account_document_uploads
  where id = requested_upload_id and owner_id = actor
  for update;
  if upload.id is null then raise exception 'Document upload was not found for this account'; end if;
  if upload.stored_at is null then raise exception 'Document file is not stored yet'; end if;
  perform 1
  from storage.objects object
  where object.bucket_id = 'account-documents'
    and object.name = upload.storage_path
  for key share;
  if not found then raise exception 'Document file is not stored yet'; end if;
  if upload.associated_document_id is not null then
    if upload.associated_document_id = requested_document_id then return requested_document_id; end if;
    raise exception 'Document upload is already associated';
  end if;
  if not public.is_trip_member(requested_trip_id, actor) then raise exception 'Join the trip before associating this document'; end if;
  if char_length(trim(requested_title)) not between 1 and 180 then raise exception 'Document title is required'; end if;

  if requested_assignment_mode = 'selected' and cardinality(traveler_ids) = 0 then
    raise exception 'Choose at least one traveler';
  elsif requested_assignment_mode <> 'selected' then
    traveler_ids := '{}'::uuid[];
  end if;
  if exists (
    select 1 from unnest(traveler_ids) as selected(traveler_id)
    where not exists (
      select 1 from public.travelers traveler
      where traveler.id = selected.traveler_id and traveler.trip_id = requested_trip_id and traveler.removed_at is null
    )
  ) then raise exception 'Every selected traveler must belong to the trip'; end if;
  if cardinality(traveler_ids) = 1 then primary_traveler := traveler_ids[1]; end if;
  if requested_visibility = 'traveler_and_managers' and primary_traveler is null then
    raise exception 'Traveler and manager visibility requires exactly one traveler';
  end if;
  if requested_visibility <> 'private' and not public.can_edit_trip(requested_trip_id, actor) and not (
    requested_visibility = 'traveler_and_managers' and (
      exists (select 1 from public.traveler_accounts account where account.traveler_id = primary_traveler and account.user_id = actor)
      or exists (
        select 1 from public.traveler_managers manager
        where manager.traveler_id = primary_traveler and manager.user_id = actor
          and manager.can_manage_documents and manager.revoked_at is null
      )
    )
  ) then raise exception 'This account may only attach a private document to this trip'; end if;
  if exists (
    select 1 from unnest(selected_user_ids) as selected(user_id)
    where not public.is_trip_member(requested_trip_id, selected.user_id)
  ) then raise exception 'Selected document viewers must be active trip members'; end if;

  insert into public.documents (
    id, trip_id, booking_id, flight_leg_id, journey_leg_id, traveler_id,
    assignment_mode, title, category, purpose, short_label, visibility, uploaded_by
  ) values (
    requested_document_id, requested_trip_id, requested_booking_id, requested_flight_leg_id,
    requested_journey_leg_id, primary_traveler, requested_assignment_mode, trim(requested_title),
    requested_category, requested_purpose, nullif(trim(requested_short_label), ''), requested_visibility, actor
  );
  insert into public.document_versions (
    id, document_id, version_number, storage_bucket, storage_path, original_filename,
    mime_type, byte_size, sha256, source_upload_id, created_by
  ) values (
    requested_version_id, requested_document_id, 1, 'account-documents', upload.storage_path,
    upload.original_filename, upload.mime_type, upload.byte_size, upload.sha256, upload.id, actor
  );
  update public.documents set current_version_id = requested_version_id where id = requested_document_id;
  insert into public.document_travelers (document_id, traveler_id, assigned_by)
  select requested_document_id, selected.traveler_id, actor
  from unnest(traveler_ids) as selected(traveler_id)
  on conflict (document_id, traveler_id) do nothing;
  insert into public.document_access (document_id, user_id, granted_by)
  select requested_document_id, selected.user_id, actor
  from unnest(selected_user_ids) as selected(user_id)
  on conflict (document_id, user_id) do nothing;
  update public.account_document_uploads
  set associated_document_id = requested_document_id
  where id = upload.id;
  return requested_document_id;
end;
$$;

revoke all on function public.associate_account_document(
  uuid, uuid, uuid, uuid, text, public.document_category, public.document_purpose,
  public.document_assignment_mode, public.document_visibility, uuid, uuid, uuid, text, uuid[], uuid[]
) from public, anon;
grant execute on function public.associate_account_document(
  uuid, uuid, uuid, uuid, text, public.document_category, public.document_purpose,
  public.document_assignment_mode, public.document_visibility, uuid, uuid, uuid, text, uuid[], uuid[]
) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- 202609130001_timeline_lifecycle_and_trip_expenses.sql
-- ============================================================================

-- This section intentionally mirrors the latest migration. New Supabase
-- projects can run this complete setup; existing projects run the migration.

begin;

alter table public.itinerary_items add column if not exists timing_mode text not null default 'exact';
alter table public.itinerary_items add column if not exists scheduled_date date;
alter table public.itinerary_items add column if not exists anchor_itinerary_item_id uuid references public.itinerary_items(id) on delete set null;
alter table public.itinerary_items add column if not exists relative_position text;
alter table public.itinerary_items add column if not exists event_status text not null default 'planned';
alter table public.itinerary_items drop constraint if exists itinerary_timing_mode_check;
alter table public.itinerary_items add constraint itinerary_timing_mode_check check (timing_mode in ('exact', 'date_only', 'all_day', 'relative', 'unscheduled'));
alter table public.itinerary_items drop constraint if exists itinerary_relative_position_check;
alter table public.itinerary_items add constraint itinerary_relative_position_check check ((timing_mode = 'relative' and anchor_itinerary_item_id is not null and relative_position in ('before', 'after')) or (timing_mode <> 'relative' and anchor_itinerary_item_id is null and relative_position is null));
alter table public.itinerary_items drop constraint if exists itinerary_event_status_check;
alter table public.itinerary_items add constraint itinerary_event_status_check check (event_status in ('planned', 'done', 'skipped', 'cancelled'));
update public.itinerary_items set timing_mode = case when coalesce(is_all_day, false) then 'all_day' else 'exact' end, scheduled_date = (starts_at at time zone timezone)::date where scheduled_date is null;
alter table public.trip_costs add column if not exists paid_by_traveler_id uuid references public.travelers(id) on delete set null;
create table if not exists public.trip_cost_participants (cost_id uuid not null references public.trip_costs(id) on delete cascade, traveler_id uuid not null references public.travelers(id) on delete cascade, share_amount_minor bigint check (share_amount_minor is null or share_amount_minor >= 0), updated_at timestamptz not null default now(), primary key (cost_id, traveler_id));

create or replace function public.enforce_itinerary_trip_dates() returns trigger language plpgsql security definer set search_path = public as $$
declare trip_row public.trips%rowtype; anchor_row public.itinerary_items%rowtype; local_start date; local_end date;
begin select * into trip_row from public.trips where id = new.trip_id and deleted_at is null; if not found then raise exception 'Trip is unavailable'; end if;
if new.timing_mode = 'relative' then select * into anchor_row from public.itinerary_items where id = new.anchor_itinerary_item_id and trip_id = new.trip_id and deleted_at is null; if not found or anchor_row.timing_mode in ('relative', 'unscheduled') then raise exception 'Choose a dated event from this trip as the before/after anchor'; end if; new.starts_at := anchor_row.starts_at; new.scheduled_date := coalesce(anchor_row.scheduled_date, (anchor_row.starts_at at time zone anchor_row.timezone)::date); new.ends_at := null;
elsif new.timing_mode = 'unscheduled' then new.scheduled_date := null; new.ends_at := null;
else local_start := coalesce(new.scheduled_date, (new.starts_at at time zone new.timezone)::date); local_end := case when new.ends_at is null then local_start else (new.ends_at at time zone new.timezone)::date end; if local_start < trip_row.start_date or local_start > trip_row.end_date or local_end < trip_row.start_date or local_end > trip_row.end_date then raise exception 'Event dates must stay between % and %', trip_row.start_date, trip_row.end_date; end if; new.scheduled_date := local_start; end if; return new; end; $$;
drop trigger if exists itinerary_trip_date_bounds on public.itinerary_items;
create trigger itinerary_trip_date_bounds before insert or update of trip_id, starts_at, ends_at, timezone, timing_mode, scheduled_date, anchor_itinerary_item_id, relative_position on public.itinerary_items for each row execute function public.enforce_itinerary_trip_dates();

create or replace function public.enforce_trip_contains_itinerary() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.itinerary_items item
    where item.trip_id = new.id and item.deleted_at is null and item.timing_mode <> 'unscheduled'
      and (
        coalesce(item.scheduled_date, (item.starts_at at time zone item.timezone)::date) < new.start_date
        or coalesce(item.scheduled_date, (item.starts_at at time zone item.timezone)::date) > new.end_date
        or (item.ends_at is not null and (item.ends_at at time zone item.timezone)::date not between new.start_date and new.end_date)
      )
  ) then raise exception 'Move or archive timeline items outside the new trip dates first'; end if;
  return new;
end;
$$;
drop trigger if exists trip_date_bounds_include_itinerary on public.trips;
create trigger trip_date_bounds_include_itinerary before update of start_date, end_date on public.trips for each row execute function public.enforce_trip_contains_itinerary();
create or replace function public.enforce_cost_participant_trip() returns trigger language plpgsql security definer set search_path = public as $$ begin if not exists (select 1 from public.trip_costs cost join public.travelers traveler on traveler.id = new.traveler_id where cost.id = new.cost_id and traveler.trip_id = cost.trip_id and traveler.removed_at is null) then raise exception 'Cost participant must belong to the same trip'; end if; return new; end; $$;
drop trigger if exists cost_participant_same_trip on public.trip_cost_participants;
create trigger cost_participant_same_trip before insert or update on public.trip_cost_participants for each row execute function public.enforce_cost_participant_trip();
create or replace function public.enforce_cost_payer_trip() returns trigger language plpgsql security definer set search_path = public as $$ begin if new.paid_by_traveler_id is not null and not exists (select 1 from public.travelers traveler where traveler.id = new.paid_by_traveler_id and traveler.trip_id = new.trip_id and traveler.removed_at is null) then raise exception 'Cost payer must belong to the same trip'; end if; return new; end; $$;
drop trigger if exists cost_payer_same_trip on public.trip_costs;
create trigger cost_payer_same_trip before insert or update of trip_id, paid_by_traveler_id on public.trip_costs for each row execute function public.enforce_cost_payer_trip();
create or replace function public.archive_trip_item(requested_itinerary_item_id uuid) returns void language plpgsql security definer set search_path = public as $$ declare item public.itinerary_items%rowtype; archived_at timestamptz := now(); begin select * into item from public.itinerary_items where id = requested_itinerary_item_id and deleted_at is null; if not found or not public.can_edit_trip(item.trip_id) then raise exception 'Timeline item cannot be archived'; end if; if item.booking_id is null then update public.itinerary_items set deleted_at = archived_at where id = item.id; else update public.bookings set deleted_at = archived_at where id = item.booking_id; update public.itinerary_items set deleted_at = archived_at where booking_id = item.booking_id and deleted_at is null; end if; end; $$;
create or replace function public.restore_trip_item(requested_itinerary_item_id uuid) returns void language plpgsql security definer set search_path = public as $$ declare item public.itinerary_items%rowtype; begin select * into item from public.itinerary_items where id = requested_itinerary_item_id; if not found or not public.can_edit_trip(item.trip_id) then raise exception 'Timeline item cannot be restored'; end if; if item.booking_id is null then update public.itinerary_items set deleted_at = null where id = item.id; else update public.bookings set deleted_at = null where id = item.booking_id; update public.itinerary_items set deleted_at = null where booking_id = item.booking_id; end if; end; $$;
create or replace function public.delete_trip_permanently(requested_trip_id uuid) returns void language plpgsql security definer set search_path = public as $$ begin if auth.uid() is null or not public.is_trip_owner(requested_trip_id) then raise exception 'Only the trip owner can permanently delete this trip'; end if; delete from public.trips where id = requested_trip_id; end; $$;
alter table public.trip_cost_participants enable row level security;
revoke all on public.trip_cost_participants from anon, authenticated;
grant select, insert, update, delete on public.trip_cost_participants to authenticated;
grant all on public.trip_cost_participants to service_role;
drop policy if exists cost_participants_read on public.trip_cost_participants;
create policy cost_participants_read on public.trip_cost_participants for select to authenticated using (exists (select 1 from public.trip_costs cost where cost.id = cost_id and public.is_trip_member(cost.trip_id)));
drop policy if exists cost_participants_write on public.trip_cost_participants;
create policy cost_participants_write on public.trip_cost_participants for all to authenticated using (exists (select 1 from public.trip_costs cost where cost.id = cost_id and public.can_edit_trip(cost.trip_id))) with check (exists (select 1 from public.trip_costs cost where cost.id = cost_id and public.can_edit_trip(cost.trip_id)));
revoke all on function public.enforce_itinerary_trip_dates(), public.enforce_trip_contains_itinerary(), public.enforce_cost_participant_trip(), public.enforce_cost_payer_trip() from public, anon, authenticated;
revoke all on function public.archive_trip_item(uuid), public.restore_trip_item(uuid), public.delete_trip_permanently(uuid) from public, anon;
grant execute on function public.archive_trip_item(uuid), public.restore_trip_item(uuid), public.delete_trip_permanently(uuid) to authenticated;
commit;
notify pgrst, 'reload schema';

-- ============================================================================
-- Traveler-focused views, reusable account invitations, and flight connections
-- ============================================================================

begin;

create table if not exists public.trip_membership_offers (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  invited_user_id uuid not null references auth.users(id) on delete cascade,
  target_type public.invitation_target_type not null,
  traveler_id uuid references public.travelers(id) on delete cascade,
  role public.member_role not null check (role <> 'owner'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked')),
  offered_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint membership_offer_target_shape check (
    (target_type = 'traveler' and traveler_id is not null)
    or (target_type = 'collaborator' and traveler_id is null)
  )
);

create unique index if not exists one_pending_membership_offer
  on public.trip_membership_offers (trip_id, invited_user_id)
  where status = 'pending';
create index if not exists membership_offers_recipient_idx
  on public.trip_membership_offers (invited_user_id, created_at desc)
  where status = 'pending';

alter table public.trip_membership_offers enable row level security;
revoke all on public.trip_membership_offers from anon, authenticated;
grant select on public.trip_membership_offers to authenticated;
grant all on public.trip_membership_offers to service_role;

drop policy if exists membership_offers_read_parties on public.trip_membership_offers;
create policy membership_offers_read_parties on public.trip_membership_offers for select to authenticated using (
  invited_user_id = auth.uid() or public.is_trip_owner(trip_id)
);

create or replace function public.list_associated_accounts()
returns table (user_id uuid, display_name text)
language sql stable security definer set search_path = public as $$
  select distinct profile.id, profile.display_name
  from public.trip_members mine
  join public.trip_members associated on associated.trip_id = mine.trip_id
  join public.profiles profile on profile.id = associated.user_id
  where mine.user_id = auth.uid()
    and mine.status = 'active'
    and mine.role = 'owner'
    and associated.user_id <> auth.uid()
    and associated.joined_at is not null
  order by profile.display_name, profile.id;
$$;

create or replace function public.create_trip_membership_offer(
  requested_trip_id uuid,
  requested_user_id uuid,
  requested_target_type public.invitation_target_type,
  requested_traveler_id uuid,
  requested_role public.member_role
) returns uuid language plpgsql security definer set search_path = public as $$
declare created_offer_id uuid;
begin
  if auth.uid() is null or not public.is_trip_owner(requested_trip_id) then raise exception 'Only the trip owner can invite a known account'; end if;
  if requested_user_id = auth.uid() or requested_role not in ('editor', 'viewer') then raise exception 'Invalid membership offer'; end if;
  if not exists (
    select 1 from public.trip_members mine
    join public.trip_members associated on associated.trip_id = mine.trip_id
    where mine.user_id = auth.uid() and mine.status = 'active' and mine.role = 'owner'
      and associated.user_id = requested_user_id and associated.joined_at is not null
  ) then raise exception 'This account has not joined one of your trips before'; end if;
  if public.is_trip_member(requested_trip_id, requested_user_id) then raise exception 'This account is already a trip member'; end if;
  if requested_target_type = 'traveler' and (
    requested_traveler_id is null
    or not exists (select 1 from public.travelers where id = requested_traveler_id and trip_id = requested_trip_id and removed_at is null)
    or exists (select 1 from public.traveler_accounts where traveler_id = requested_traveler_id and user_id <> requested_user_id)
  ) then raise exception 'The selected traveler cannot be linked to this account'; end if;
  if requested_target_type = 'collaborator' and requested_traveler_id is not null then raise exception 'A non-traveling helper cannot claim a traveler profile'; end if;

  update public.trip_membership_offers set status = 'revoked', responded_at = now()
  where trip_id = requested_trip_id and invited_user_id = requested_user_id and status = 'pending';
  insert into public.trip_membership_offers (trip_id, invited_user_id, target_type, traveler_id, role, offered_by)
  values (requested_trip_id, requested_user_id, requested_target_type, requested_traveler_id, requested_role, auth.uid())
  returning id into created_offer_id;
  return created_offer_id;
end;
$$;

create or replace function public.list_incoming_trip_membership_offers()
returns table (
  id uuid, trip_id uuid, trip_title text, destination_summary text,
  start_date date, end_date date, target_type public.invitation_target_type,
  traveler_id uuid, traveler_name text, role public.member_role,
  offered_by_name text, created_at timestamptz
) language sql stable security definer set search_path = public as $$
  select offer.id, offer.trip_id, trip.title, trip.destination_summary,
    trip.start_date, trip.end_date, offer.target_type, offer.traveler_id,
    traveler.display_name, offer.role, profile.display_name, offer.created_at
  from public.trip_membership_offers offer
  join public.trips trip on trip.id = offer.trip_id and trip.deleted_at is null
  join public.profiles profile on profile.id = offer.offered_by
  left join public.travelers traveler on traveler.id = offer.traveler_id
  where offer.invited_user_id = auth.uid() and offer.status = 'pending'
  order by offer.created_at desc;
$$;

create or replace function public.respond_trip_membership_offer(requested_offer_id uuid, accept_offer boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare offer public.trip_membership_offers%rowtype;
begin
  if auth.uid() is null then raise exception 'Sign in before responding'; end if;
  select * into offer from public.trip_membership_offers
  where id = requested_offer_id and invited_user_id = auth.uid() and status = 'pending'
  for update;
  if not found then raise exception 'This invitation is no longer available'; end if;
  if not accept_offer then
    update public.trip_membership_offers set status = 'declined', responded_at = now() where id = offer.id;
    return null;
  end if;
  if not exists (select 1 from public.trips where id = offer.trip_id and deleted_at is null) then raise exception 'This trip is no longer available'; end if;
  if offer.target_type = 'traveler' and (
    exists (select 1 from public.traveler_accounts where traveler_id = offer.traveler_id and user_id <> auth.uid())
    or exists (
      select 1 from public.traveler_accounts account
      join public.travelers traveler on traveler.id = account.traveler_id
      where account.user_id = auth.uid() and traveler.trip_id = offer.trip_id and account.traveler_id <> offer.traveler_id
    )
  ) then raise exception 'The traveler profile is already associated with another account'; end if;

  insert into public.trip_members (trip_id, user_id, role, participation_type, status, joined_at, added_by, removed_at)
  values (offer.trip_id, auth.uid(), offer.role, case when offer.target_type = 'traveler' then 'traveler'::public.participation_type else 'collaborator'::public.participation_type end, 'active', now(), offer.offered_by, null)
  on conflict (trip_id, user_id) do update set
    role = case when trip_members.role = 'owner' then trip_members.role else excluded.role end,
    participation_type = excluded.participation_type, status = 'active', joined_at = now(),
    added_by = excluded.added_by, removed_at = null;
  if offer.target_type = 'traveler' then
    insert into public.traveler_accounts (traveler_id, user_id, invitation_id)
    values (offer.traveler_id, auth.uid(), null)
    on conflict (traveler_id) do update set user_id = excluded.user_id, invitation_id = null, linked_at = now();
  end if;
  update public.trip_membership_offers set status = 'accepted', responded_at = now() where id = offer.id;
  return offer.trip_id;
end;
$$;

create or replace function public.add_flight_connection(requested_booking_id uuid, requested_leg jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  booking public.bookings%rowtype;
  previous_leg public.flight_legs%rowtype;
  created_leg_id uuid := gen_random_uuid();
  departure_at timestamptz;
  arrival_at timestamptz;
  airline_id uuid;
  airline_name text;
begin
  select * into booking from public.bookings where id = requested_booking_id and deleted_at is null for update;
  if not found or booking.type::text <> 'flight' or not public.can_edit_trip(booking.trip_id) then raise exception 'Flight connection cannot be added'; end if;
  select * into previous_leg from public.flight_legs where booking_id = booking.id and deleted_at is null order by segment_order desc limit 1 for update;
  if not found then raise exception 'The original flight leg is missing'; end if;
  departure_at := (requested_leg->>'scheduled_departure_at')::timestamptz;
  arrival_at := (requested_leg->>'scheduled_arrival_at')::timestamptz;
  airline_name := trim(coalesce(requested_leg->>'airline_name', ''));
  airline_id := public.safe_uuid(requested_leg->>'marketing_airline_id');
  if airline_name = '' or trim(coalesce(requested_leg->>'flight_number', '')) = '' then raise exception 'Airline and flight number are required'; end if;
  if departure_at < previous_leg.scheduled_arrival_at then raise exception 'The connection departs before the previous flight arrives'; end if;
  if arrival_at <= departure_at then raise exception 'Flight arrival must be after departure'; end if;
  if not public.valid_iana_timezone(requested_leg->>'departure_timezone') or not public.valid_iana_timezone(requested_leg->>'arrival_timezone') then raise exception 'Use valid airport time zones'; end if;

  insert into public.flight_legs (
    id, booking_id, segment_order, airline_name, marketing_airline_id, flight_number,
    departure_airport_code, departure_airport_name, departure_country_code,
    arrival_airport_code, arrival_airport_name, arrival_country_code,
    scheduled_departure_at, scheduled_arrival_at, departure_timezone, arrival_timezone,
    boarding_lead_minutes, journey_scope, status, status_updated_by, status_updated_at
  ) values (
    created_leg_id, booking.id, previous_leg.segment_order + 1, airline_name, airline_id, upper(trim(requested_leg->>'flight_number')),
    nullif(upper(trim(requested_leg->>'departure_airport_code')), ''), trim(requested_leg->>'departure_airport_name'), nullif(upper(trim(requested_leg->>'departure_country_code')), ''),
    nullif(upper(trim(requested_leg->>'arrival_airport_code')), ''), trim(requested_leg->>'arrival_airport_name'), nullif(upper(trim(requested_leg->>'arrival_country_code')), ''),
    departure_at, arrival_at, requested_leg->>'departure_timezone', requested_leg->>'arrival_timezone',
    nullif(requested_leg->>'boarding_lead_minutes', '')::integer, coalesce((requested_leg->>'journey_scope')::public.journey_scope, booking.journey_scope),
    'scheduled', auth.uid(), now()
  );
  insert into public.flight_leg_travelers (flight_leg_id, traveler_id)
  select created_leg_id, traveler_id from public.booking_travelers where booking_id = booking.id;
  update public.bookings set
    end_at = arrival_at,
    provider = case when coalesce(provider, '') ilike '%' || airline_name || '%' then provider else concat_ws(' / ', nullif(provider, ''), airline_name) end
  where id = booking.id;
  update public.itinerary_items set ends_at = arrival_at
  where booking_id = booking.id and event_type = 'flight' and deleted_at is null;
  return created_leg_id;
end;
$$;

revoke all on function public.list_associated_accounts() from public, anon;
revoke all on function public.create_trip_membership_offer(uuid, uuid, public.invitation_target_type, uuid, public.member_role) from public, anon;
revoke all on function public.list_incoming_trip_membership_offers() from public, anon;
revoke all on function public.respond_trip_membership_offer(uuid, boolean) from public, anon;
revoke all on function public.add_flight_connection(uuid, jsonb) from public, anon;
grant execute on function public.list_associated_accounts(),
  public.create_trip_membership_offer(uuid, uuid, public.invitation_target_type, uuid, public.member_role),
  public.list_incoming_trip_membership_offers(), public.respond_trip_membership_offer(uuid, boolean),
  public.add_flight_connection(uuid, jsonb) to authenticated;

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- 202609110002_fix_timezone_trigger.sql
-- ============================================================================

-- Repair the polymorphic timezone trigger installed by
-- 202609110001_timeline_redesign.sql.
-- Safe to run more than once and does not modify trip data.

begin;

create or replace function public.enforce_timed_entity_timezone()
returns trigger language plpgsql security definer set search_path = public as $$
begin
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

revoke all on function public.enforce_timed_entity_timezone() from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- 202609110003_document_experience.sql
-- ============================================================================

-- Document viewer and traveler-assignment model
-- Run after 202609110002_fix_timezone_trigger.sql.
--
-- Document assignment describes who uses a file. It never grants access;
-- document_visibility and document_access remain the authorization controls.

begin;
alter type public.document_category add value if not exists 'activity';
alter type public.document_purpose add value if not exists 'hotel_confirmation';
alter type public.document_purpose add value if not exists 'activity_ticket';
alter type public.document_purpose add value if not exists 'meal_voucher';
alter type public.document_purpose add value if not exists 'receipt';
commit;

begin;

do $$ begin
  create type public.document_assignment_mode as enum ('shared', 'selected', 'unassigned');
exception when duplicate_object then null; end $$;

alter table public.documents add column if not exists assignment_mode public.document_assignment_mode;

update public.documents
set assignment_mode = case when traveler_id is null then 'shared'::public.document_assignment_mode else 'selected'::public.document_assignment_mode end
where assignment_mode is null;

alter table public.documents alter column assignment_mode set default 'unassigned';
alter table public.documents alter column assignment_mode set not null;

create table if not exists public.document_travelers (
  document_id uuid not null references public.documents(id) on delete cascade,
  traveler_id uuid not null references public.travelers(id) on delete cascade,
  assigned_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (document_id, traveler_id)
);

insert into public.document_travelers (document_id, traveler_id, assigned_by)
select id, traveler_id, uploaded_by from public.documents
where traveler_id is not null and assignment_mode = 'selected'
on conflict (document_id, traveler_id) do nothing;

create or replace function public.enforce_document_traveler_trip()
returns trigger language plpgsql security definer set search_path = public as $$
declare document_trip uuid; traveler_trip uuid;
begin
  select trip_id into document_trip from public.documents where id = new.document_id and deleted_at is null;
  select trip_id into traveler_trip from public.travelers where id = new.traveler_id and removed_at is null;
  if document_trip is null or traveler_trip is null or document_trip <> traveler_trip then
    raise exception 'Document and traveler must belong to the same trip';
  end if;
  return new;
end;
$$;

drop trigger if exists document_traveler_same_trip on public.document_travelers;
create trigger document_traveler_same_trip before insert or update on public.document_travelers
for each row execute function public.enforce_document_traveler_trip();

create index if not exists document_travelers_traveler_idx on public.document_travelers (traveler_id, document_id);
create index if not exists document_versions_checksum_idx on public.document_versions (sha256);

alter table public.document_travelers enable row level security;
revoke all on public.document_travelers from anon, authenticated;
grant select, insert, delete on public.document_travelers to authenticated;
grant all on public.document_travelers to service_role;

drop policy if exists document_travelers_read on public.document_travelers;
create policy document_travelers_read on public.document_travelers for select to authenticated using (
  public.can_read_document(document_id)
);
drop policy if exists document_travelers_create on public.document_travelers;
create policy document_travelers_create on public.document_travelers for insert to authenticated with check (
  assigned_by = auth.uid() and public.can_manage_document(document_id)
);
drop policy if exists document_travelers_delete on public.document_travelers;
create policy document_travelers_delete on public.document_travelers for delete to authenticated using (
  public.can_manage_document(document_id)
);

revoke all on function public.enforce_document_traveler_trip() from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- 202609130006_trip_storage_cleanup_queue.sql
-- ============================================================================

-- Preserve legacy trip-document cleanup work before permanent trip deletion.
--
-- PostgreSQL and Supabase Storage cannot participate in one transaction. The
-- owner-only RPC therefore records every legacy Storage path and deletes the
-- database trip in one database transaction. The client removes those exact
-- objects only after the RPC commits, then acknowledges successful cleanup by
-- deleting the queue rows. A failed Storage call leaves retryable queue rows.

begin;

create table if not exists public.trip_storage_cleanup_queue (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- Intentionally no trips foreign key: cleanup must survive trip deletion.
  trip_id uuid not null,
  storage_bucket text not null default 'trip-documents'
    check (storage_bucket = 'trip-documents'),
  storage_path text not null check (char_length(trim(storage_path)) > 0),
  created_at timestamptz not null default now()
);

create unique index if not exists trip_storage_cleanup_owner_path_idx
  on public.trip_storage_cleanup_queue (owner_id, storage_bucket, storage_path);
create index if not exists trip_storage_cleanup_owner_trip_idx
  on public.trip_storage_cleanup_queue (owner_id, trip_id, created_at);

alter table public.trip_storage_cleanup_queue enable row level security;
revoke all on public.trip_storage_cleanup_queue from anon, authenticated;
grant select, delete on public.trip_storage_cleanup_queue to authenticated;
grant all on public.trip_storage_cleanup_queue to service_role;

drop policy if exists trip_storage_cleanup_read_own on public.trip_storage_cleanup_queue;
create policy trip_storage_cleanup_read_own
on public.trip_storage_cleanup_queue for select to authenticated
using (owner_id = auth.uid());

drop policy if exists trip_storage_cleanup_delete_own on public.trip_storage_cleanup_queue;
create policy trip_storage_cleanup_delete_own
on public.trip_storage_cleanup_queue for delete to authenticated
using (owner_id = auth.uid());

-- This helper deliberately bypasses document RLS when checking whether a path
-- has been reused by any live document version. Without that second check, a
-- stale cleanup row could authorize deletion of a newly reused object path.
create or replace function public.can_cleanup_trip_storage_object(
  requested_bucket text,
  requested_path text
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select auth.uid() is not null
    and requested_bucket = 'trip-documents'
    and exists (
      select 1
      from public.trip_storage_cleanup_queue cleanup
      where cleanup.owner_id = auth.uid()
        and cleanup.storage_bucket = requested_bucket
        and cleanup.storage_path = requested_path
    )
    and not exists (
      select 1
      from public.document_versions version
      where version.storage_bucket = requested_bucket
        and version.storage_path = requested_path
    );
$$;

revoke all on function public.can_cleanup_trip_storage_object(text, text) from public, anon;
grant execute on function public.can_cleanup_trip_storage_object(text, text) to authenticated, service_role;

drop policy if exists trip_documents_delete on storage.objects;
create policy trip_documents_delete on storage.objects for delete to authenticated using (
  bucket_id = 'trip-documents'
  and (
    public.can_manage_document(public.safe_uuid((storage.foldername(name))[4]))
    or public.can_cleanup_trip_storage_object(bucket_id, name)
  )
);

create or replace function public.delete_trip_permanently(requested_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null or not public.is_trip_owner(requested_trip_id, actor) then
    raise exception 'Only the trip owner can permanently delete this trip';
  end if;

  -- Block new child rows while the complete path set is captured. The trip
  -- lock serializes new documents; document locks serialize new versions of
  -- documents that already exist.
  perform 1 from public.trips where id = requested_trip_id for update;
  if not found then raise exception 'The trip is no longer available'; end if;
  perform 1 from public.documents where trip_id = requested_trip_id for update;

  insert into public.trip_storage_cleanup_queue (
    owner_id, trip_id, storage_bucket, storage_path
  )
  select distinct actor, requested_trip_id, 'trip-documents', version.storage_path
  from public.document_versions version
  join public.documents document on document.id = version.document_id
  where document.trip_id = requested_trip_id
    and version.storage_bucket = 'trip-documents'
  on conflict (owner_id, storage_bucket, storage_path) do update
  set trip_id = excluded.trip_id,
      created_at = now();

  delete from public.trips where id = requested_trip_id;
end;
$$;

revoke all on function public.delete_trip_permanently(uuid) from public, anon;
grant execute on function public.delete_trip_permanently(uuid) to authenticated, service_role;

-- Harden the direct RPC as well as the UI: a connection must depart from the
-- preceding arrival endpoint, and domestic connections cannot cross country.
create or replace function public.add_flight_connection(requested_booking_id uuid, requested_leg jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  booking public.bookings%rowtype;
  previous_leg public.flight_legs%rowtype;
  created_leg_id uuid := gen_random_uuid();
  departure_at timestamptz;
  arrival_at timestamptz;
  airline_id uuid;
  airline_name text;
  previous_arrival_code text;
  departure_code text;
  previous_arrival_name text;
  departure_name text;
  arrival_name text;
  previous_arrival_country text;
  departure_country text;
  arrival_country text;
  established_scope public.journey_scope;
  requested_scope public.journey_scope;
  effective_scope public.journey_scope;
begin
  select * into booking
  from public.bookings
  where id = requested_booking_id and deleted_at is null
  for update;
  if not found or booking.type::text <> 'flight' or not public.can_edit_trip(booking.trip_id) then
    raise exception 'Flight connection cannot be added';
  end if;

  select * into previous_leg
  from public.flight_legs
  where booking_id = booking.id and deleted_at is null
  order by segment_order desc
  limit 1
  for update;
  if not found then raise exception 'The original flight leg is missing'; end if;

  departure_at := (requested_leg->>'scheduled_departure_at')::timestamptz;
  arrival_at := (requested_leg->>'scheduled_arrival_at')::timestamptz;
  airline_name := trim(coalesce(requested_leg->>'airline_name', ''));
  airline_id := public.safe_uuid(requested_leg->>'marketing_airline_id');
  departure_code := nullif(upper(trim(coalesce(requested_leg->>'departure_airport_code', ''))), '');
  previous_arrival_code := nullif(upper(trim(coalesce(previous_leg.arrival_airport_code, ''))), '');
  departure_name := regexp_replace(trim(coalesce(requested_leg->>'departure_airport_name', '')), '\s+', ' ', 'g');
  previous_arrival_name := regexp_replace(trim(coalesce(previous_leg.arrival_airport_name, '')), '\s+', ' ', 'g');
  arrival_name := regexp_replace(trim(coalesce(requested_leg->>'arrival_airport_name', '')), '\s+', ' ', 'g');
  departure_country := nullif(upper(trim(coalesce(requested_leg->>'departure_country_code', ''))), '');
  previous_arrival_country := nullif(upper(trim(coalesce(previous_leg.arrival_country_code, ''))), '');
  arrival_country := nullif(upper(trim(coalesce(requested_leg->>'arrival_country_code', ''))), '');
  requested_scope := nullif(requested_leg->>'journey_scope', '')::public.journey_scope;
  established_scope := coalesce(booking.journey_scope, previous_leg.journey_scope);
  if requested_scope is not null and established_scope is not null and requested_scope <> established_scope then
    raise exception 'Connection scope must match the existing flight journey';
  end if;
  effective_scope := coalesce(established_scope, requested_scope);

  if airline_name = '' or trim(coalesce(requested_leg->>'flight_number', '')) = '' then
    raise exception 'Airline and flight number are required';
  end if;
  if departure_name = '' or arrival_name = '' then
    raise exception 'Departure and arrival airports are required';
  end if;
  if previous_arrival_code is not null then
    if departure_code is distinct from previous_arrival_code then
      raise exception 'Connection departure must match the previous arrival airport';
    end if;
  elsif lower(departure_name) is distinct from lower(previous_arrival_name) then
    raise exception 'Connection departure must match the previous arrival airport';
  end if;
  if requested_leg->>'departure_timezone' is distinct from previous_leg.arrival_timezone then
    raise exception 'Connection departure timezone must match the previous arrival airport';
  end if;
  if departure_at <= previous_leg.scheduled_arrival_at then
    raise exception 'The connection must depart after the previous flight arrives';
  end if;
  if arrival_at <= departure_at then raise exception 'Flight arrival must be after departure'; end if;
  if not public.valid_iana_timezone(requested_leg->>'departure_timezone')
    or not public.valid_iana_timezone(requested_leg->>'arrival_timezone') then
    raise exception 'Use valid airport time zones';
  end if;

  if effective_scope = 'domestic' then
    if previous_arrival_country is null
      or departure_country is distinct from previous_arrival_country
      or arrival_country is distinct from previous_arrival_country then
      raise exception 'Domestic connection countries must match the previous arrival country';
    end if;
    effective_scope := 'domestic';
  end if;

  insert into public.flight_legs (
    id, booking_id, segment_order, airline_name, marketing_airline_id, flight_number,
    departure_airport_code, departure_airport_name, departure_country_code,
    arrival_airport_code, arrival_airport_name, arrival_country_code,
    scheduled_departure_at, scheduled_arrival_at, departure_timezone, arrival_timezone,
    boarding_lead_minutes, journey_scope, status, status_updated_by, status_updated_at
  ) values (
    created_leg_id, booking.id, previous_leg.segment_order + 1, airline_name, airline_id,
    upper(trim(requested_leg->>'flight_number')), departure_code, departure_name, departure_country,
    nullif(upper(trim(coalesce(requested_leg->>'arrival_airport_code', ''))), ''), arrival_name, arrival_country,
    departure_at, arrival_at, requested_leg->>'departure_timezone', requested_leg->>'arrival_timezone',
    nullif(requested_leg->>'boarding_lead_minutes', '')::integer, effective_scope,
    'scheduled', auth.uid(), now()
  );

  insert into public.flight_leg_travelers (flight_leg_id, traveler_id)
  select created_leg_id, traveler_id
  from public.booking_travelers
  where booking_id = booking.id;

  update public.bookings
  set end_at = arrival_at,
      provider = case
        when coalesce(provider, '') ilike '%' || airline_name || '%' then provider
        else concat_ws(' / ', nullif(provider, ''), airline_name)
      end
  where id = booking.id;

  update public.itinerary_items
  set ends_at = arrival_at
  where booking_id = booking.id and event_type = 'flight' and deleted_at is null;

  return created_leg_id;
end;
$$;

revoke all on function public.add_flight_connection(uuid, jsonb) from public, anon;
grant execute on function public.add_flight_connection(uuid, jsonb) to authenticated;

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- 202609130007_relative_event_timing.sql
-- ============================================================================

-- Preserve before/after ordering while allowing an event to gain a real start
-- time, end time, or planned duration independently.

begin;

do $migration$
declare
  had_explicit_start_column boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'itinerary_items'
      and column_name = 'has_explicit_start_time'
  ) into had_explicit_start_column;

  alter table public.itinerary_items
    add column if not exists has_explicit_start_time boolean not null default true;

  -- Rows created before this migration used starts_at only as the non-null
  -- ordering fallback for flexible timing modes. Do this conversion only when
  -- the column is first introduced so rerunning the setup never erases a real
  -- start time later added to a relative event.
  if not had_explicit_start_column then
    update public.itinerary_items
    set has_explicit_start_time = false
    where timing_mode in ('relative', 'date_only', 'all_day', 'unscheduled');
  end if;
end;
$migration$;

alter table public.itinerary_items
  alter column has_explicit_start_time set default true;
update public.itinerary_items
set has_explicit_start_time = case
  when timing_mode in ('date_only', 'all_day', 'unscheduled') then false
  else true
end
where has_explicit_start_time is null;
alter table public.itinerary_items
  alter column has_explicit_start_time set not null;

alter table public.itinerary_items
  add column if not exists duration_minutes integer;

-- Exact events already carrying an end can expose their duration immediately
-- when the interval can be represented without losing precision.
update public.itinerary_items
set duration_minutes = (extract(epoch from (ends_at - starts_at)) / 60)::integer
where duration_minutes is null
  and has_explicit_start_time
  and timing_mode in ('exact', 'relative')
  and ends_at > starts_at
  and mod(extract(epoch from (ends_at - starts_at)), 60) = 0
  and extract(epoch from (ends_at - starts_at)) / 60 <= 2147483647;

-- Older rows were allowed to store a zero-length range. Treat that as an
-- unknown end rather than leaving a value that the stricter trigger rejects.
update public.itinerary_items
set ends_at = null,
    duration_minutes = null
where has_explicit_start_time
  and timing_mode in ('exact', 'relative')
  and ends_at = starts_at;

-- Flexible modes never own an end timestamp. Relative events may retain a
-- duration even when their actual start is still unknown.
update public.itinerary_items
set ends_at = null,
    duration_minutes = case when timing_mode = 'relative' then duration_minutes else null end
where not has_explicit_start_time;

update public.itinerary_items
set has_explicit_start_time = true
where timing_mode = 'exact' and not has_explicit_start_time;

update public.itinerary_items
set has_explicit_start_time = false,
    ends_at = null,
    duration_minutes = null
where timing_mode in ('date_only', 'all_day', 'unscheduled');

-- Make a rerun safe even if a partially applied client previously wrote an
-- invalid duration before this constraint existed.
update public.itinerary_items
set duration_minutes = null
where duration_minutes <= 0;

alter table public.itinerary_items
  drop constraint if exists itinerary_duration_minutes_positive;
alter table public.itinerary_items
  add constraint itinerary_duration_minutes_positive
  check (duration_minutes is null or duration_minutes > 0);

alter table public.itinerary_items
  drop constraint if exists itinerary_timing_precision_check;
alter table public.itinerary_items
  add constraint itinerary_timing_precision_check
  check (
    (
      (timing_mode = 'exact' and has_explicit_start_time)
      or timing_mode = 'relative'
      or (
        timing_mode in ('date_only', 'all_day', 'unscheduled')
        and not has_explicit_start_time
      )
    )
    and (has_explicit_start_time or ends_at is null)
    and (timing_mode in ('exact', 'relative') or duration_minutes is null)
  );

alter table public.itinerary_items
  drop constraint if exists itinerary_duration_consistency_check;
alter table public.itinerary_items
  add constraint itinerary_duration_consistency_check
  check (
    ends_at is null
    or duration_minutes is null
    or ends_at = starts_at + make_interval(mins => duration_minutes)
  );

create or replace function public.enforce_itinerary_trip_dates()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  trip_row public.trips%rowtype;
  anchor_row public.itinerary_items%rowtype;
  local_start date;
  local_end date;
  duration_seconds numeric;
begin
  select * into trip_row
  from public.trips
  where id = new.trip_id and deleted_at is null;
  if not found then raise exception 'Trip is unavailable'; end if;

  if new.timing_mode = 'relative' then
    select * into anchor_row
    from public.itinerary_items
    where id = new.anchor_itinerary_item_id
      and id <> new.id
      and trip_id = new.trip_id
      and deleted_at is null;
    if not found or anchor_row.timing_mode in ('relative', 'unscheduled') then
      raise exception 'Choose a dated, non-relative event from this trip as the before/after anchor';
    end if;

    if not new.has_explicit_start_time then
      if new.ends_at is not null then
        raise exception 'Add a start time before adding an end time';
      end if;
      new.starts_at := anchor_row.starts_at;
      new.scheduled_date := coalesce(
        anchor_row.scheduled_date,
        (anchor_row.starts_at at time zone anchor_row.timezone)::date
      );
      new.timezone := anchor_row.timezone;
      new.ends_at := null;
      -- duration_minutes intentionally remains independent of an actual start.
    end if;
  elsif new.timing_mode = 'exact' then
    new.has_explicit_start_time := true;
  else
    new.has_explicit_start_time := false;
    if new.ends_at is not null then
      raise exception 'Add a start time before adding an end time';
    end if;
    new.ends_at := null;
    new.duration_minutes := null;
    if new.timing_mode = 'unscheduled' then
      new.scheduled_date := null;
      return new;
    end if;
  end if;

  if new.timing_mode in ('exact', 'relative') and new.has_explicit_start_time then
    if new.duration_minutes is not null and new.duration_minutes <= 0 then
      raise exception 'Duration must be a positive number of minutes';
    end if;

    if new.ends_at is null and new.duration_minutes is not null then
      new.ends_at := new.starts_at + make_interval(mins => new.duration_minutes);
    elsif new.ends_at is not null and new.duration_minutes is null then
      duration_seconds := extract(epoch from (new.ends_at - new.starts_at));
      if duration_seconds <= 0 then
        raise exception 'End time must be after start time';
      end if;
      if mod(duration_seconds, 60) <> 0 then
        raise exception 'Duration must resolve to whole minutes';
      end if;
      if duration_seconds / 60 > 2147483647 then
        raise exception 'Duration is too large';
      end if;
      new.duration_minutes := (duration_seconds / 60)::integer;
    elsif new.ends_at is not null
      and new.ends_at is distinct from new.starts_at + make_interval(mins => new.duration_minutes) then
      raise exception 'End time and duration do not match';
    end if;

    if new.ends_at is not null and new.ends_at <= new.starts_at then
      raise exception 'End time must be after start time';
    end if;

    local_start := (new.starts_at at time zone new.timezone)::date;
    local_end := case
      when new.ends_at is null then local_start
      else (new.ends_at at time zone new.timezone)::date
    end;
    new.scheduled_date := local_start;
  elsif new.timing_mode = 'relative' then
    local_start := new.scheduled_date;
    local_end := local_start;
  else
    local_start := coalesce(
      new.scheduled_date,
      (new.starts_at at time zone new.timezone)::date
    );
    local_end := local_start;
    new.scheduled_date := local_start;
  end if;

  if local_start < trip_row.start_date
    or local_start > trip_row.end_date
    or local_end < trip_row.start_date
    or local_end > trip_row.end_date then
    raise exception 'Event dates must stay between % and %', trip_row.start_date, trip_row.end_date;
  end if;

  return new;
end;
$$;

drop trigger if exists itinerary_trip_date_bounds on public.itinerary_items;
create trigger itinerary_trip_date_bounds
before insert or update of
  trip_id, starts_at, ends_at, timezone, timing_mode, scheduled_date,
  anchor_itinerary_item_id, relative_position, has_explicit_start_time,
  duration_minutes
on public.itinerary_items
for each row execute function public.enforce_itinerary_trip_dates();

create or replace function public.propagate_relative_anchor_timing()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if exists (
    select 1
    from public.itinerary_items dependent
    where dependent.anchor_itinerary_item_id = new.id
      and dependent.timing_mode = 'relative'
      and dependent.deleted_at is null
  ) and (
    new.trip_id is distinct from old.trip_id
    or new.deleted_at is not null
    or new.timing_mode in ('relative', 'unscheduled')
  ) then
    raise exception 'Move, archive, or re-anchor dependent events before changing this anchor';
  end if;

  update public.itinerary_items dependent
  set starts_at = new.starts_at,
      scheduled_date = coalesce(
        new.scheduled_date,
        (new.starts_at at time zone new.timezone)::date
      ),
      timezone = new.timezone
  where dependent.anchor_itinerary_item_id = new.id
    and dependent.timing_mode = 'relative'
    and not dependent.has_explicit_start_time
    and dependent.deleted_at is null
    and (
      dependent.starts_at is distinct from new.starts_at
      or dependent.scheduled_date is distinct from coalesce(
        new.scheduled_date,
        (new.starts_at at time zone new.timezone)::date
      )
      or dependent.timezone is distinct from new.timezone
    );

  return null;
end;
$$;

drop trigger if exists itinerary_propagate_relative_anchor_timing on public.itinerary_items;
create trigger itinerary_propagate_relative_anchor_timing
after update of trip_id, starts_at, scheduled_date, timezone, timing_mode, deleted_at
on public.itinerary_items
for each row execute function public.propagate_relative_anchor_timing();

revoke all on function public.enforce_itinerary_trip_dates() from public, anon, authenticated;
revoke all on function public.propagate_relative_anchor_timing() from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- 202609140001_event_form_data_model.sql
-- ============================================================================

-- Event-form data model: explicit booking state/scope, typed journey details,
-- per-traveler journey allocations, and atomic hotel milestones.
-- Safe to re-run after 202609130007_relative_event_timing.sql.

begin;

do $migration$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'booking_reservation_state') then
    create type public.booking_reservation_state as enum ('planned', 'walk_up', 'booked');
  end if;
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'participant_scope') then
    create type public.participant_scope as enum ('everyone', 'selected');
  end if;
end
$migration$;

do $migration$
declare
  had_reservation_state boolean;
  had_participant_scope boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'reservation_state'
  ) into had_reservation_state;
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'participant_scope'
  ) into had_participant_scope;

  alter table public.bookings
    add column if not exists reservation_state public.booking_reservation_state not null default 'booked',
    add column if not exists participant_scope public.participant_scope not null default 'everyone';

  -- Removed travelers must not influence the one-time legacy scope inference.
  -- Keep these deletes outside the first-run branches so rerunning the
  -- migration repairs stale assignment rows left by an interrupted removal.
  delete from public.booking_travelers assignment
  using public.travelers traveler
  where assignment.traveler_id = traveler.id
    and traveler.removed_at is not null;
  delete from public.itinerary_participants assignment
  using public.travelers traveler
  where assignment.traveler_id = traveler.id
    and traveler.removed_at is not null;

  if not had_reservation_state then
    update public.bookings set reservation_state = 'booked';
  end if;
  if not had_participant_scope then
    update public.bookings booking
    set participant_scope = case
      when not exists (
        select 1 from public.booking_travelers assignment where assignment.booking_id = booking.id
      ) then 'everyone'::public.participant_scope
      -- Before participant_scope existed, the UI represented Everyone by
      -- inserting every active traveler. A selected-all state was not
      -- distinguishable, so migrate that legacy shape back to Everyone.
      when exists (
        select 1 from public.travelers traveler
        where traveler.trip_id = booking.trip_id and traveler.removed_at is null
      ) and not exists (
        select 1 from public.travelers traveler
        where traveler.trip_id = booking.trip_id and traveler.removed_at is null
          and not exists (
            select 1 from public.booking_travelers assignment
            where assignment.booking_id = booking.id and assignment.traveler_id = traveler.id
          )
      ) then 'everyone'::public.participant_scope
      else 'selected'::public.participant_scope
    end;

    -- The legacy event form represented Everyone by inserting every active
    -- traveler on the timeline item, including items without a booking.
    -- Canonicalize that ambiguous legacy shape once; after this column exists,
    -- a selected-all list is allowed to remain an intentional Selected scope.
    update public.itinerary_items item
    set applies_to_all_travelers = true
    where not item.applies_to_all_travelers
      and exists (
        select 1 from public.travelers traveler
        where traveler.trip_id = item.trip_id and traveler.removed_at is null
      )
      and not exists (
        select 1 from public.travelers traveler
        where traveler.trip_id = item.trip_id and traveler.removed_at is null
          and not exists (
            select 1 from public.itinerary_participants assignment
            where assignment.itinerary_item_id = item.id and assignment.traveler_id = traveler.id
          )
      );
  end if;

  -- Keep this cleanup idempotent so rerunning the migration also repairs a
  -- previously interrupted client-side scope change.
  delete from public.booking_travelers assignment
  using public.bookings booking
  where assignment.booking_id = booking.id and booking.participant_scope = 'everyone';

  -- Everyone is represented only by the parent flag after migration. Keep
  -- this cleanup rerunnable so a previously interrupted scope change repairs.
  delete from public.itinerary_participants assignment
  using public.itinerary_items item
  where assignment.itinerary_item_id = item.id and item.applies_to_all_travelers;
end
$migration$;

alter table public.journey_legs
  alter column operator_name drop not null,
  alter column scheduled_arrival_at drop not null,
  add column if not exists details jsonb not null default '{}'::jsonb;

update public.journey_legs
set details = case
  when mode = 'cab' then '{"kind":"cab","ride_type":"local"}'::jsonb
  else jsonb_build_object('kind', mode::text)
end
where details = '{}'::jsonb;

alter table public.journey_legs alter column details drop default;

alter table public.journey_legs drop constraint if exists journey_schedule_order;
alter table public.journey_legs add constraint journey_schedule_order
  check (scheduled_arrival_at is null or scheduled_arrival_at > scheduled_departure_at);

create or replace function public.valid_journey_leg_details(requested_mode public.journey_mode, requested_details jsonb)
returns boolean language plpgsql immutable set search_path = public as $function$
declare
  allowed_keys text[];
  text_keys text[];
  key_name text;
  vehicle jsonb;
begin
  if requested_details is null or jsonb_typeof(requested_details) <> 'object' then return false; end if;
  if requested_details->>'kind' is distinct from requested_mode::text then return false; end if;

  if requested_mode = 'train' then
    allowed_keys := array['kind','train_name','booked_from_name','booked_from_code','travel_class','quota','booking_status','current_status'];
    text_keys := allowed_keys;
  elsif requested_mode = 'bus' then
    allowed_keys := array['kind','bus_class_or_layout','shared_ticket_number','boarding_point_details','dropoff_point_details'];
    text_keys := allowed_keys;
  elsif requested_mode = 'ferry' then
    allowed_keys := array['kind','direction','ticket_timing','seating','seller_reference','operator_reference','accommodation','vessel_name','departure_gate','baggage_allowance','related_sailing_id','vehicle'];
    text_keys := array['kind','direction','ticket_timing','seating','seller_reference','operator_reference','accommodation','vessel_name','departure_gate','baggage_allowance','related_sailing_id'];
    if requested_details ? 'direction' and requested_details->>'direction' not in ('one_way','outbound','return') then return false; end if;
    if requested_details ? 'ticket_timing' and requested_details->>'ticket_timing' not in ('fixed','open_date','open_return') then return false; end if;
    if requested_details ? 'seating' and requested_details->>'seating' not in ('free','assigned','unknown') then return false; end if;
    if requested_details ? 'vehicle' then
      vehicle := requested_details->'vehicle';
      if jsonb_typeof(vehicle) <> 'object' then return false; end if;
      if exists (select 1 from jsonb_object_keys(vehicle) as vehicle_keys(vehicle_key) where vehicle_keys.vehicle_key <> all(array['type','registration','length_cm','height_cm'])) then return false; end if;
      foreach key_name in array array['type','registration'] loop
        if vehicle ? key_name and jsonb_typeof(vehicle->key_name) <> 'string' then return false; end if;
      end loop;
      if vehicle ? 'length_cm' and (jsonb_typeof(vehicle->'length_cm') <> 'number' or (vehicle->>'length_cm')::numeric < 0) then return false; end if;
      if vehicle ? 'height_cm' and (jsonb_typeof(vehicle->'height_cm') <> 'number' or (vehicle->>'height_cm')::numeric < 0) then return false; end if;
    end if;
  elsif requested_mode = 'cab' then
    allowed_keys := array['kind','ride_type','cross_border','linked_flight_leg_id','pickup_buffer_minutes','luggage_count','pickup_instructions','vehicle_class','driver_name','driver_phone','vehicle_registration','trip_shape','return_at','package_duration_minutes','final_dropoff'];
    text_keys := array['kind','ride_type','linked_flight_leg_id','pickup_instructions','vehicle_class','driver_name','driver_phone','vehicle_registration','trip_shape','return_at','final_dropoff'];
    if requested_details->>'ride_type' is null or requested_details->>'ride_type' not in ('local','airport_transfer','outstation','hourly') then return false; end if;
    if requested_details ? 'cross_border' and jsonb_typeof(requested_details->'cross_border') <> 'boolean' then return false; end if;
    if requested_details ? 'trip_shape' and requested_details->>'trip_shape' not in ('one_way','round_trip') then return false; end if;
    foreach key_name in array array['pickup_buffer_minutes','luggage_count','package_duration_minutes'] loop
      if requested_details ? key_name and (jsonb_typeof(requested_details->key_name) <> 'number' or (requested_details->>key_name)::numeric < 0) then return false; end if;
    end loop;
  else
    return false;
  end if;

  if exists (select 1 from jsonb_object_keys(requested_details) as supplied_keys(supplied_key) where supplied_keys.supplied_key <> all(allowed_keys)) then return false; end if;
  foreach key_name in array text_keys loop
    if requested_details ? key_name and jsonb_typeof(requested_details->key_name) <> 'string' then return false; end if;
  end loop;
  if requested_mode = 'cab' and requested_details ? 'linked_flight_leg_id' and public.safe_uuid(requested_details->>'linked_flight_leg_id') is null then return false; end if;
  return true;
exception when others then
  return false;
end
$function$;

alter table public.journey_legs drop constraint if exists journey_leg_details_shape;
alter table public.journey_legs add constraint journey_leg_details_shape
  check (public.valid_journey_leg_details(mode, details));

create table if not exists public.journey_leg_travelers (
  journey_leg_id uuid not null references public.journey_legs(id) on delete cascade,
  traveler_id uuid not null references public.travelers(id) on delete cascade,
  seat_or_berth text,
  coach_or_cabin text,
  passenger_reference text,
  updated_at timestamptz not null default now(),
  primary key (journey_leg_id, traveler_id)
);

create index if not exists journey_leg_travelers_traveler_idx
  on public.journey_leg_travelers (traveler_id, journey_leg_id);

drop trigger if exists set_updated_at on public.journey_leg_travelers;
create trigger set_updated_at before update on public.journey_leg_travelers
for each row execute function public.set_updated_at();

create or replace function public.enforce_assignment_trip()
returns trigger language plpgsql security definer set search_path = public as $function$
declare parent_trip uuid; traveler_trip uuid; parent_booking_id uuid; booking_scope public.participant_scope;
begin
  select trip_id into traveler_trip from public.travelers where id = new.traveler_id and removed_at is null;
  if tg_table_name = 'booking_travelers' then select trip_id into parent_trip from public.bookings where id = new.booking_id and deleted_at is null;
  elsif tg_table_name = 'itinerary_participants' then select trip_id into parent_trip from public.itinerary_items where id = new.itinerary_item_id and deleted_at is null;
  elsif tg_table_name = 'requirement_assignees' then select trip_id into parent_trip from public.trip_requirements where id = new.requirement_id and deleted_at is null;
  elsif tg_table_name = 'flight_leg_travelers' then select b.trip_id, b.id, b.participant_scope into parent_trip, parent_booking_id, booking_scope from public.flight_legs f join public.bookings b on b.id = f.booking_id where f.id = new.flight_leg_id and f.deleted_at is null and b.deleted_at is null;
  elsif tg_table_name = 'journey_leg_travelers' then select b.trip_id, b.id, b.participant_scope into parent_trip, parent_booking_id, booking_scope from public.journey_legs j join public.bookings b on b.id = j.booking_id where j.id = new.journey_leg_id and j.deleted_at is null and b.deleted_at is null;
  end if;
  if parent_trip is null or traveler_trip is null or parent_trip <> traveler_trip then raise exception 'Assigned traveler must belong to the same trip'; end if;
  if parent_booking_id is not null and booking_scope = 'selected' and not exists (
    select 1 from public.booking_travelers assignment
    where assignment.booking_id = parent_booking_id and assignment.traveler_id = new.traveler_id
  ) then
    raise exception 'Leg traveler must be included in the booking';
  end if;
  return new;
end
$function$;

drop trigger if exists journey_leg_traveler_same_trip on public.journey_leg_travelers;
create trigger journey_leg_traveler_same_trip before insert or update on public.journey_leg_travelers
for each row execute function public.enforce_assignment_trip();

create or replace function public.enforce_explicit_participant_row()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  -- Keep row-type-specific fields inside their own PL/pgSQL branches. Putting
  -- NEW.booking_id and NEW.itinerary_item_id in sibling SQL boolean
  -- expressions lets PostgreSQL resolve a field from the wrong trigger row.
  if tg_table_name = 'booking_travelers' then
    if not exists (
      select 1 from public.bookings booking where booking.id = new.booking_id and booking.participant_scope = 'selected'
    ) then
      raise exception 'Booking traveler rows require Selected scope';
    end if;
  elsif tg_table_name = 'itinerary_participants' then
    if not exists (
      select 1 from public.itinerary_items item where item.id = new.itinerary_item_id and not item.applies_to_all_travelers
    ) then
      raise exception 'Itinerary participant rows require Selected scope';
    end if;
  else
    raise exception 'Unexpected participant-scope trigger table: %', tg_table_name;
  end if;
  return new;
end
$function$;

drop trigger if exists booking_traveler_explicit_scope on public.booking_travelers;
create trigger booking_traveler_explicit_scope before insert or update on public.booking_travelers
for each row execute function public.enforce_explicit_participant_row();
drop trigger if exists itinerary_participant_explicit_scope on public.itinerary_participants;
create trigger itinerary_participant_explicit_scope before insert or update on public.itinerary_participants
for each row execute function public.enforce_explicit_participant_row();

-- A caller with direct table access must not be able to leave an Everyone
-- parent with explicit assignment rows. Canonicalize the transition inside
-- the parent statement so older clients that update the flag before deleting
-- child rows remain safe rather than committing a contradictory state.
create or replace function public.canonicalize_parent_participant_scope()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  if tg_table_name = 'bookings' and new.participant_scope = 'everyone' then
    delete from public.booking_travelers assignment
    where assignment.booking_id = new.id;
    delete from public.flight_leg_travelers allocation
    using public.flight_legs leg
    where allocation.flight_leg_id = leg.id and leg.booking_id = new.id;
    delete from public.journey_leg_travelers allocation
    using public.journey_legs leg
    where allocation.journey_leg_id = leg.id and leg.booking_id = new.id;
  elsif tg_table_name = 'itinerary_items' and new.applies_to_all_travelers then
    delete from public.itinerary_participants assignment
    where assignment.itinerary_item_id = new.id;
  end if;
  return new;
end
$function$;

drop trigger if exists booking_parent_participant_scope on public.bookings;
create trigger booking_parent_participant_scope before update of participant_scope on public.bookings
for each row execute function public.canonicalize_parent_participant_scope();
drop trigger if exists itinerary_parent_participant_scope on public.itinerary_items;
create trigger itinerary_parent_participant_scope before update of applies_to_all_travelers on public.itinerary_items
for each row execute function public.canonicalize_parent_participant_scope();


create or replace function public.sync_booking_participants(
  requested_booking_id uuid,
  requested_scope public.participant_scope,
  requested_traveler_ids uuid[] default '{}',
  requested_itinerary_item_id uuid default null,
  requested_itinerary_version integer default null
)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare
  actor uuid := auth.uid();
  target_trip_id uuid;
  selected_traveler_ids uuid[];
  linked_item public.itinerary_items%rowtype;
  saved_booking jsonb;
  saved_itinerary jsonb;
begin
  if actor is null then raise exception 'Sign in before changing booking travelers'; end if;

  select booking.trip_id into target_trip_id
  from public.bookings booking
  where booking.id = requested_booking_id and booking.deleted_at is null
  for update;
  if not found or not public.can_edit_trip(target_trip_id) then
    raise exception 'Booking travelers cannot be changed';
  end if;

  select coalesce(array_agg(distinct selected.selected_id), '{}'::uuid[])
  into selected_traveler_ids
  from unnest(coalesce(requested_traveler_ids, '{}'::uuid[])) as selected(selected_id)
  where selected.selected_id is not null;

  if requested_scope = 'everyone' and cardinality(selected_traveler_ids) <> 0 then
    raise exception 'Everyone cannot contain selected travelers';
  end if;
  if requested_scope = 'selected' and cardinality(selected_traveler_ids) = 0 then
    raise exception 'Select at least one traveler';
  end if;
  if exists (
    select 1 from unnest(selected_traveler_ids) as selected(selected_id)
    where not exists (
      select 1 from public.travelers traveler
      where traveler.id = selected.selected_id
        and traveler.trip_id = target_trip_id
        and traveler.removed_at is null
    )
  ) then
    raise exception 'Selected traveler must belong to the trip';
  end if;

  if requested_itinerary_item_id is not null then
    select item.* into linked_item
    from public.itinerary_items item
    where item.id = requested_itinerary_item_id and item.deleted_at is null
    for update;
    if not found
      or linked_item.trip_id <> target_trip_id
      or (linked_item.booking_id is not null and linked_item.booking_id <> requested_booking_id) then
      raise exception 'This event cannot be attached to the booking';
    end if;
    if requested_itinerary_version is not null and linked_item.version <> requested_itinerary_version then
      raise exception 'version_conflict';
    end if;
    update public.itinerary_items
    set booking_id = requested_booking_id,
        applies_to_all_travelers = requested_scope = 'everyone'
    where id = requested_itinerary_item_id;
  end if;

  perform item.id
  from public.itinerary_items item
  where item.booking_id = requested_booking_id
  for update;

  -- Per-leg allocations contain traveler-specific private details. Keep rows
  -- only for travelers who remain explicitly selected; switching to Everyone
  -- intentionally clears every allocation instead of retaining stale seats or
  -- passenger references from the previous selected roster.
  delete from public.flight_leg_travelers allocation
  using public.flight_legs leg
  where allocation.flight_leg_id = leg.id
    and leg.booking_id = requested_booking_id
    and (requested_scope = 'everyone' or allocation.traveler_id <> all(selected_traveler_ids));
  delete from public.journey_leg_travelers allocation
  using public.journey_legs leg
  where allocation.journey_leg_id = leg.id
    and leg.booking_id = requested_booking_id
    and (requested_scope = 'everyone' or allocation.traveler_id <> all(selected_traveler_ids));

  delete from public.booking_travelers assignment
  where assignment.booking_id = requested_booking_id;
  update public.bookings booking
  set participant_scope = requested_scope
  where booking.id = requested_booking_id
    and booking.participant_scope is distinct from requested_scope;
  if requested_scope = 'selected' then
    insert into public.booking_travelers (booking_id, traveler_id)
    select requested_booking_id, selected.selected_id
    from unnest(selected_traveler_ids) as selected(selected_id);
  end if;

  delete from public.itinerary_participants assignment
  where assignment.itinerary_item_id in (
    select item.id from public.itinerary_items item
    where item.booking_id = requested_booking_id
  );
  update public.itinerary_items item
  set applies_to_all_travelers = requested_scope = 'everyone'
  where item.booking_id = requested_booking_id
    and item.applies_to_all_travelers is distinct from (requested_scope = 'everyone');

  if requested_scope = 'selected' then
    insert into public.itinerary_participants (itinerary_item_id, traveler_id)
    select item.id, selected.selected_id
    from public.itinerary_items item
    cross join unnest(selected_traveler_ids) as selected(selected_id)
    where item.booking_id = requested_booking_id;
  end if;

  select to_jsonb(booking) into saved_booking
  from public.bookings booking
  where booking.id = requested_booking_id;
  select coalesce(jsonb_agg(to_jsonb(item) order by item.starts_at, item.sort_key, item.id), '[]'::jsonb)
  into saved_itinerary
  from public.itinerary_items item
  where item.booking_id = requested_booking_id;

  return jsonb_build_object('booking', saved_booking, 'itinerary_items', saved_itinerary);
end
$function$;

revoke all on function public.sync_booking_participants(uuid, public.participant_scope, uuid[], uuid, integer) from public, anon;
grant execute on function public.sync_booking_participants(uuid, public.participant_scope, uuid[], uuid, integer) to authenticated, service_role;


alter table public.journey_leg_travelers enable row level security;
revoke all on public.journey_leg_travelers from anon, authenticated;
grant select, insert, update, delete on public.journey_leg_travelers to authenticated;
grant all on public.journey_leg_travelers to service_role;

drop policy if exists journey_leg_travelers_read on public.journey_leg_travelers;
create policy journey_leg_travelers_read on public.journey_leg_travelers for select to authenticated using (
  exists (
    select 1 from public.journey_legs leg join public.bookings booking on booking.id = leg.booking_id
    where leg.id = journey_leg_id and public.is_trip_member(booking.trip_id)
  )
);
drop policy if exists journey_leg_travelers_write on public.journey_leg_travelers;
create policy journey_leg_travelers_write on public.journey_leg_travelers for all to authenticated using (
  exists (
    select 1 from public.journey_legs leg join public.bookings booking on booking.id = leg.booking_id
    where leg.id = journey_leg_id and public.can_edit_trip(booking.trip_id)
  )
) with check (
  exists (
    select 1 from public.journey_legs leg join public.bookings booking on booking.id = leg.booking_id
    where leg.id = journey_leg_id and public.can_edit_trip(booking.trip_id)
  )
);

create or replace function public.save_hotel_stay(
  requested_booking jsonb,
  requested_traveler_ids uuid[] default '{}',
  requested_milestones jsonb default '{}'::jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare
  actor uuid := auth.uid();
  target_booking_id uuid := public.safe_uuid(requested_booking->>'id');
  target_trip_id uuid := public.safe_uuid(requested_booking->>'trip_id');
  check_in_id uuid;
  check_out_id uuid;
  check_in_at timestamptz;
  check_out_at timestamptz;
  source_zone text;
  title_value text;
  reservation_value public.booking_reservation_state;
  scope_value public.participant_scope;
  expected_version integer;
  existing_booking public.bookings%rowtype;
  selected_traveler_id uuid;
begin
  if actor is null then raise exception 'Sign in before saving a hotel'; end if;
  if target_booking_id is null or target_trip_id is null or not public.can_edit_trip(target_trip_id) then raise exception 'Hotel cannot be saved'; end if;
  title_value := trim(coalesce(requested_booking->>'title', ''));
  check_in_at := (requested_booking->>'start_at')::timestamptz;
  check_out_at := (requested_booking->>'end_at')::timestamptz;
  source_zone := requested_booking->>'source_timezone';
  if title_value = '' or check_out_at <= check_in_at then raise exception 'Hotel checkout must be after check-in'; end if;
  if not public.valid_iana_timezone(source_zone) then raise exception 'Use a valid hotel timezone'; end if;
  if coalesce(jsonb_typeof(requested_booking->'details'), 'object') <> 'object' then raise exception 'Hotel details must be an object'; end if;
  if coalesce(requested_booking->>'reservation_state', 'booked') not in ('planned','walk_up','booked') then raise exception 'Invalid hotel reservation state'; end if;
  if coalesce(requested_booking->>'participant_scope', case when cardinality(requested_traveler_ids) > 0 then 'selected' else 'everyone' end) not in ('everyone','selected') then raise exception 'Invalid participant scope'; end if;
  reservation_value := coalesce(requested_booking->>'reservation_state', 'booked')::public.booking_reservation_state;
  scope_value := coalesce(requested_booking->>'participant_scope', case when cardinality(requested_traveler_ids) > 0 then 'selected' else 'everyone' end)::public.participant_scope;
  if scope_value = 'everyone' and cardinality(requested_traveler_ids) <> 0 then raise exception 'Everyone cannot contain selected travelers'; end if;
  if scope_value = 'selected' and cardinality(requested_traveler_ids) = 0 then raise exception 'Select at least one traveler'; end if;
  foreach selected_traveler_id in array requested_traveler_ids loop
    if not exists (select 1 from public.travelers traveler where traveler.id = selected_traveler_id and traveler.trip_id = target_trip_id and traveler.removed_at is null) then raise exception 'Selected traveler must belong to the trip'; end if;
  end loop;

  select * into existing_booking from public.bookings booking where booking.id = target_booking_id for update;
  if found then
    if existing_booking.trip_id <> target_trip_id or existing_booking.type::text <> 'hotel' or existing_booking.deleted_at is not null then raise exception 'Hotel cannot be updated'; end if;
    expected_version := nullif(requested_booking->>'version', '')::integer;
    if expected_version is not null and existing_booking.version <> expected_version then raise exception 'version_conflict'; end if;
    update public.bookings set
      title = title_value, provider = nullif(trim(requested_booking->>'provider'), ''),
      reference_code = nullif(trim(requested_booking->>'reference_code'), ''),
      start_at = check_in_at, end_at = check_out_at, source_timezone = source_zone,
      location = nullif(requested_booking->'location', 'null'::jsonb), details = coalesce(requested_booking->'details', '{}'::jsonb),
      reservation_state = reservation_value, participant_scope = scope_value,
      journey_scope = null, booked_via_name = nullif(trim(requested_booking->>'booked_via_name'), ''),
      booked_via_url = nullif(trim(requested_booking->>'booked_via_url'), ''),
      booking_vendor_catalog_key = nullif(trim(requested_booking->>'booking_vendor_catalog_key'), ''),
      contact_name = nullif(trim(requested_booking->>'contact_name'), ''), contact_phone = nullif(trim(requested_booking->>'contact_phone'), '')
    where id = target_booking_id;
  else
    insert into public.bookings (
      id, trip_id, type, title, provider, reference_code, start_at, end_at, source_timezone,
      location, details, reservation_state, participant_scope, booked_via_name, booked_via_url,
      booking_vendor_catalog_key, contact_name, contact_phone, created_by
    ) values (
      target_booking_id, target_trip_id, 'hotel', title_value, nullif(trim(requested_booking->>'provider'), ''),
      nullif(trim(requested_booking->>'reference_code'), ''), check_in_at, check_out_at, source_zone,
      nullif(requested_booking->'location', 'null'::jsonb), coalesce(requested_booking->'details', '{}'::jsonb),
      reservation_value, scope_value, nullif(trim(requested_booking->>'booked_via_name'), ''),
      nullif(trim(requested_booking->>'booked_via_url'), ''), nullif(trim(requested_booking->>'booking_vendor_catalog_key'), ''),
      nullif(trim(requested_booking->>'contact_name'), ''), nullif(trim(requested_booking->>'contact_phone'), ''), actor
    );
  end if;

  delete from public.booking_travelers assignment where assignment.booking_id = target_booking_id;
  if scope_value = 'selected' then
    insert into public.booking_travelers (booking_id, traveler_id)
    select target_booking_id, selected_id from unnest(requested_traveler_ids) selected_id
    on conflict do nothing;
  end if;

  select item.id into check_in_id from public.itinerary_items item where item.booking_id = target_booking_id and item.event_type = 'hotel_check_in' and item.deleted_at is null for update;
  select item.id into check_out_id from public.itinerary_items item where item.booking_id = target_booking_id and item.event_type = 'hotel_check_out' and item.deleted_at is null for update;
  -- Milestone identifiers are server-owned. This prevents a caller from using
  -- SECURITY DEFINER to update an unrelated itinerary row through ON CONFLICT.
  check_in_id := coalesce(check_in_id, gen_random_uuid());
  check_out_id := coalesce(check_out_id, gen_random_uuid());

  insert into public.itinerary_items (
    id, trip_id, booking_id, title, event_type, starts_at, ends_at, timezone, location, notes,
    applies_to_all_travelers, is_all_day, timing_mode, scheduled_date, has_explicit_start_time,
    event_status, sort_key, created_by, deleted_at
  ) values
    (check_in_id, target_trip_id, target_booking_id, left(title_value, 148) || ' · Check in', 'hotel_check_in', check_in_at, null, source_zone,
     nullif(requested_booking->'location', 'null'::jsonb), requested_booking->>'notes', scope_value = 'everyone', false,
     case when coalesce((requested_milestones->>'check_in_has_time')::boolean, true) then 'exact'::public.event_timing_mode else 'date_only'::public.event_timing_mode end,
     case when coalesce((requested_milestones->>'check_in_has_time')::boolean, true) then null else (check_in_at at time zone source_zone)::date end,
     coalesce((requested_milestones->>'check_in_has_time')::boolean, true), 'planned', check_in_at::text || ':' || check_in_id::text, actor, null),
    (check_out_id, target_trip_id, target_booking_id, left(title_value, 148) || ' · Check out', 'hotel_check_out', check_out_at, null, source_zone,
     nullif(requested_booking->'location', 'null'::jsonb), requested_booking->>'notes', scope_value = 'everyone', false,
     case when coalesce((requested_milestones->>'check_out_has_time')::boolean, true) then 'exact'::public.event_timing_mode else 'date_only'::public.event_timing_mode end,
     case when coalesce((requested_milestones->>'check_out_has_time')::boolean, true) then null else (check_out_at at time zone source_zone)::date end,
     coalesce((requested_milestones->>'check_out_has_time')::boolean, true), 'planned', check_out_at::text || ':' || check_out_id::text, actor, null)
  on conflict (id) do update set
    title = excluded.title, starts_at = excluded.starts_at, ends_at = null, timezone = excluded.timezone,
    location = excluded.location, notes = excluded.notes, applies_to_all_travelers = excluded.applies_to_all_travelers,
    timing_mode = excluded.timing_mode, scheduled_date = excluded.scheduled_date,
    has_explicit_start_time = excluded.has_explicit_start_time, sort_key = excluded.sort_key, deleted_at = null;

  delete from public.itinerary_participants where itinerary_item_id in (check_in_id, check_out_id);
  if scope_value = 'selected' then
    insert into public.itinerary_participants (itinerary_item_id, traveler_id)
    select milestone_id, selected_id
    from unnest(array[check_in_id, check_out_id]) milestone_id
    cross join unnest(requested_traveler_ids) selected_id
    on conflict do nothing;
  end if;

  return jsonb_build_object('booking_id', target_booking_id, 'check_in_id', check_in_id, 'check_out_id', check_out_id);
end
$function$;

-- Edit one non-flight journey leg and derive its parent booking/timeline
-- summary in the same transaction. The client intentionally does not queue
-- this operation offline because partial route edits would make three views
-- disagree about the next event. Adjacent legs are locked and validated so a
-- one-leg edit cannot break the route or chronology of a connection.
create or replace function public.save_journey_leg(
  requested_leg_id uuid,
  requested_leg jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $function$
declare
  actor uuid := auth.uid();
  target_leg public.journey_legs%rowtype;
  target_booking public.bookings%rowtype;
  previous_leg public.journey_legs%rowtype;
  next_leg public.journey_legs%rowtype;
  first_journey_leg public.journey_legs%rowtype;
  last_journey_leg public.journey_legs%rowtype;
  departure_at timestamptz;
  arrival_at timestamptz;
  boarding_time timestamptz;
  boarding_lead integer;
  origin_zone text;
  destination_zone text;
  origin_value text;
  destination_value text;
  detail_value jsonb;
  expected_version integer;
  provider_value text;
  saved_leg jsonb;
  saved_booking jsonb;
  saved_itinerary jsonb;
begin
  if actor is null then raise exception 'Sign in before editing a journey'; end if;
  if requested_leg is null or jsonb_typeof(requested_leg) <> 'object' then raise exception 'Journey details must be an object'; end if;

  -- Lock order invariant: resolve and lock the parent booking first.
  select booking.* into target_booking
  from public.bookings booking
  where booking.id = (
    select journey.booking_id
    from public.journey_legs journey
    where journey.id = requested_leg_id and journey.deleted_at is null
  )
    and booking.deleted_at is null
  for update;
  if not found then raise exception 'Journey leg was not found'; end if;
  if not public.can_edit_trip(target_booking.trip_id) then
    raise exception 'Journey leg cannot be changed';
  end if;

  -- Lock order invariant: every editor next locks all active route legs in
  -- deterministic segment/id order before reading its target or neighbors.
  perform journey.id
  from public.journey_legs journey
  where journey.booking_id = target_booking.id and journey.deleted_at is null
  order by journey.segment_order, journey.id
  for update;

  select journey.* into target_leg
  from public.journey_legs journey
  where journey.id = requested_leg_id
    and journey.booking_id = target_booking.id
    and journey.deleted_at is null;
  if not found then raise exception 'Journey leg was not found'; end if;
  if target_booking.type::text <> target_leg.mode::text then
    raise exception 'Journey leg cannot be changed';
  end if;

  select journey.* into previous_leg
  from public.journey_legs journey
  where journey.booking_id = target_leg.booking_id
    and journey.deleted_at is null
    and journey.segment_order < target_leg.segment_order
  order by journey.segment_order desc
  limit 1;

  select journey.* into next_leg
  from public.journey_legs journey
  where journey.booking_id = target_leg.booking_id
    and journey.deleted_at is null
    and journey.segment_order > target_leg.segment_order
  order by journey.segment_order
  limit 1;

  expected_version := nullif(requested_leg->>'version', '')::integer;
  if expected_version is not null and target_leg.version <> expected_version then raise exception 'version_conflict'; end if;

  origin_value := trim(coalesce(requested_leg->>'origin_name', ''));
  destination_value := trim(coalesce(requested_leg->>'destination_name', ''));
  departure_at := nullif(requested_leg->>'scheduled_departure_at', '')::timestamptz;
  arrival_at := nullif(requested_leg->>'scheduled_arrival_at', '')::timestamptz;
  boarding_time := nullif(requested_leg->>'boarding_at', '')::timestamptz;
  origin_zone := trim(coalesce(requested_leg->>'origin_timezone', ''));
  destination_zone := trim(coalesce(requested_leg->>'destination_timezone', ''));
  detail_value := requested_leg->'details';

  if origin_value = '' or destination_value = '' or departure_at is null then raise exception 'Departure, destination, and departure time are required'; end if;
  if not public.valid_iana_timezone(origin_zone) or not public.valid_iana_timezone(destination_zone) then raise exception 'Use valid journey time zones'; end if;
  if arrival_at is not null and arrival_at <= departure_at then raise exception 'Journey arrival must be after departure'; end if;
  if boarding_time is not null and boarding_time > departure_at then raise exception 'Boarding cannot be after departure'; end if;
  if requested_leg->>'boarding_lead_minutes' is not null then
    if requested_leg->>'boarding_lead_minutes' !~ '^\d+$' then raise exception 'Boarding reminder must be a whole number'; end if;
    boarding_lead := (requested_leg->>'boarding_lead_minutes')::integer;
    if boarding_lead < 0 or boarding_lead > 360 then raise exception 'Boarding reminder must be between 0 and 360 minutes'; end if;
  end if;
  if not public.valid_journey_leg_details(target_leg.mode, detail_value) then raise exception 'Invalid journey ticket details'; end if;
  if nullif(requested_leg->>'origin_country_code', '') is not null and upper(requested_leg->>'origin_country_code') !~ '^[A-Z]{2}$' then raise exception 'Invalid departure country code'; end if;
  if nullif(requested_leg->>'destination_country_code', '') is not null and upper(requested_leg->>'destination_country_code') !~ '^[A-Z]{2}$' then raise exception 'Invalid destination country code'; end if;

  if previous_leg.id is not null then
    if nullif(trim(previous_leg.destination_code), '') is not null
      and nullif(trim(requested_leg->>'origin_code'), '') is not null then
      if upper(trim(previous_leg.destination_code)) <> upper(trim(requested_leg->>'origin_code')) then
        raise exception 'Edited departure must match the previous leg destination';
      end if;
    elsif lower(regexp_replace(trim(coalesce(previous_leg.destination_name, '')), '[[:space:]]+', ' ', 'g'))
      <> lower(regexp_replace(origin_value, '[[:space:]]+', ' ', 'g')) then
      raise exception 'Edited departure must match the previous leg destination';
    end if;
    if previous_leg.destination_timezone is distinct from origin_zone then
      raise exception 'Edited departure time zone must match the previous leg destination time zone';
    end if;
    if previous_leg.scheduled_arrival_at is not null and departure_at <= previous_leg.scheduled_arrival_at then
      raise exception 'Edited departure must be after the previous leg arrives';
    end if;
  end if;

  if next_leg.id is not null then
    if nullif(trim(requested_leg->>'destination_code'), '') is not null
      and nullif(trim(next_leg.origin_code), '') is not null then
      if upper(trim(requested_leg->>'destination_code')) <> upper(trim(next_leg.origin_code)) then
        raise exception 'Edited destination must match the next leg origin';
      end if;
    elsif lower(regexp_replace(destination_value, '[[:space:]]+', ' ', 'g'))
      <> lower(regexp_replace(trim(coalesce(next_leg.origin_name, '')), '[[:space:]]+', ' ', 'g')) then
      raise exception 'Edited destination must match the next leg origin';
    end if;
    if destination_zone is distinct from next_leg.origin_timezone then
      raise exception 'Edited destination time zone must match the next leg origin time zone';
    end if;
    if arrival_at is not null and next_leg.scheduled_departure_at <= arrival_at then
      raise exception 'Next leg must depart after the edited leg arrives';
    end if;
  end if;

  update public.journey_legs journey set
    operator_name = nullif(trim(requested_leg->>'operator_name'), ''),
    service_number = nullif(trim(requested_leg->>'service_number'), ''),
    origin_code = nullif(upper(trim(requested_leg->>'origin_code')), ''),
    origin_name = origin_value,
    origin_country_code = nullif(upper(trim(requested_leg->>'origin_country_code')), ''),
    origin_timezone = origin_zone,
    destination_code = nullif(upper(trim(requested_leg->>'destination_code')), ''),
    destination_name = destination_value,
    destination_country_code = nullif(upper(trim(requested_leg->>'destination_country_code')), ''),
    destination_timezone = destination_zone,
    scheduled_departure_at = departure_at,
    scheduled_arrival_at = arrival_at,
    boarding_at = boarding_time,
    boarding_lead_minutes = boarding_lead,
    departure_platform = nullif(trim(requested_leg->>'departure_platform'), ''),
    arrival_platform = nullif(trim(requested_leg->>'arrival_platform'), ''),
    details = detail_value
  where journey.id = requested_leg_id;

  select journey.* into first_journey_leg
  from public.journey_legs journey
  where journey.booking_id = target_booking.id and journey.deleted_at is null
  order by journey.segment_order
  limit 1;
  select journey.* into last_journey_leg
  from public.journey_legs journey
  where journey.booking_id = target_booking.id and journey.deleted_at is null
  order by journey.segment_order desc
  limit 1;
  select string_agg(operator.operator_name, ' / ' order by operator.first_segment)
  into provider_value
  from (
    select journey.operator_name, min(journey.segment_order) as first_segment
    from public.journey_legs journey
    where journey.booking_id = target_booking.id
      and journey.deleted_at is null
      and nullif(trim(journey.operator_name), '') is not null
    group by journey.operator_name
  ) operator;

  update public.bookings booking set
    provider = provider_value,
    start_at = first_journey_leg.scheduled_departure_at,
    end_at = last_journey_leg.scheduled_arrival_at,
    source_timezone = first_journey_leg.origin_timezone
  where booking.id = target_booking.id;

  update public.itinerary_items item set
    starts_at = first_journey_leg.scheduled_departure_at,
    ends_at = last_journey_leg.scheduled_arrival_at,
    timezone = first_journey_leg.origin_timezone,
    timing_mode = 'exact',
    scheduled_date = null,
    anchor_itinerary_item_id = null,
    relative_position = null,
    is_all_day = false,
    has_explicit_start_time = true,
    sort_key = first_journey_leg.scheduled_departure_at::text || ':' || item.id::text
  where item.booking_id = target_booking.id and item.deleted_at is null;

  select to_jsonb(journey) into saved_leg from public.journey_legs journey where journey.id = requested_leg_id;
  select to_jsonb(booking) into saved_booking from public.bookings booking where booking.id = target_booking.id;
  select coalesce(jsonb_agg(to_jsonb(item) order by item.starts_at, item.sort_key, item.id), '[]'::jsonb)
  into saved_itinerary
  from public.itinerary_items item
  where item.booking_id = target_booking.id and item.deleted_at is null;
  return jsonb_build_object('leg', saved_leg, 'booking', saved_booking, 'itinerary_items', saved_itinerary);
end
$function$;

revoke all on function public.valid_journey_leg_details(public.journey_mode, jsonb) from public, anon;
revoke all on function public.enforce_explicit_participant_row() from public, anon, authenticated;
revoke all on function public.canonicalize_parent_participant_scope() from public, anon, authenticated;
revoke all on function public.save_hotel_stay(jsonb, uuid[], jsonb) from public, anon;
revoke all on function public.save_journey_leg(uuid, jsonb) from public, anon;
grant execute on function public.valid_journey_leg_details(public.journey_mode, jsonb) to authenticated, service_role;
grant execute on function public.save_hotel_stay(jsonb, uuid[], jsonb) to authenticated;
grant execute on function public.save_journey_leg(uuid, jsonb) to authenticated;

do $migration$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'journey_leg_travelers'
  ) then
    alter publication supabase_realtime add table public.journey_leg_travelers;
  end if;
end
$migration$;

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- 202609150001_readiness_timeline_and_document_visibility.sql
-- ============================================================================

-- Event-linked readiness tasks and editable document visibility.
begin;

do $migration$
declare
  had_timing_mode boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'trip_requirements' and column_name = 'timing_mode'
  ) into had_timing_mode;

  alter table public.trip_requirements
    add column if not exists timing_mode text not null default 'unscheduled',
    add column if not exists anchor_itinerary_item_id uuid references public.itinerary_items(id),
    add column if not exists relative_position text,
    add column if not exists offset_minutes integer;

  if not had_timing_mode then
    update public.trip_requirements
    set timing_mode = case when due_date is null then 'unscheduled' else 'date_only' end;
  end if;
end
$migration$;

alter table public.trip_requirements drop constraint if exists trip_requirement_timing_shape;
alter table public.trip_requirements add constraint trip_requirement_timing_shape check (
  (timing_mode = 'unscheduled' and due_date is null and anchor_itinerary_item_id is null and relative_position is null and offset_minutes is null)
  or (timing_mode = 'date_only' and due_date is not null and anchor_itinerary_item_id is null and relative_position is null and offset_minutes is null)
  or (timing_mode = 'relative' and due_date is null and anchor_itinerary_item_id is not null and relative_position in ('before', 'after') and offset_minutes is not null and offset_minutes >= 0)
);

create or replace function public.enforce_requirement_timing()
returns trigger language plpgsql security definer set search_path = public as $function$
declare
  anchor public.itinerary_items%rowtype;
begin
  if new.timing_mode = 'relative' then
    select item.* into anchor
    from public.itinerary_items item
    where item.id = new.anchor_itinerary_item_id and item.deleted_at is null;
    if not found or anchor.trip_id <> new.trip_id then
      raise exception 'Readiness task anchor must be an active event in the same trip';
    end if;
    if coalesce(to_jsonb(anchor)->>'timing_mode', 'exact') in ('relative', 'unscheduled') then
      raise exception 'Readiness tasks must link to a dated trip event';
    end if;
  end if;
  return new;
end
$function$;

drop trigger if exists trip_requirement_timing_guard on public.trip_requirements;
create trigger trip_requirement_timing_guard
before insert or update of trip_id, timing_mode, anchor_itinerary_item_id, relative_position, offset_minutes, due_date
on public.trip_requirements for each row execute function public.enforce_requirement_timing();

create index if not exists trip_requirements_anchor_idx
  on public.trip_requirements (anchor_itinerary_item_id)
  where deleted_at is null and anchor_itinerary_item_id is not null;

create or replace function public.update_document_visibility(
  requested_document_id uuid,
  requested_visibility public.document_visibility,
  requested_user_ids uuid[] default '{}'::uuid[]
)
returns void language plpgsql security invoker set search_path = public as $function$
declare
  actor uuid := auth.uid();
  target public.documents%rowtype;
  selected_user_ids uuid[];
begin
  if actor is null then raise exception 'Sign in before changing document access'; end if;

  select document.* into target
  from public.documents document
  where document.id = requested_document_id and document.deleted_at is null
  for update;
  if not found or not public.can_edit_trip(target.trip_id, actor) then
    raise exception 'Only a trip owner or editor can change document access';
  end if;

  select coalesce(array_agg(distinct selected.user_id), '{}'::uuid[])
  into selected_user_ids
  from unnest(coalesce(requested_user_ids, '{}'::uuid[])) as selected(user_id)
  where selected.user_id is not null;

  if requested_visibility = 'selected_members' and cardinality(selected_user_ids) = 0 then
    raise exception 'Select at least one signed-in trip member';
  end if;
  if requested_visibility <> 'selected_members' and cardinality(selected_user_ids) <> 0 then
    raise exception 'Selected members are only valid for selected-member access';
  end if;
  if exists (
    select 1 from unnest(selected_user_ids) as selected(user_id)
    where not exists (
      select 1 from public.trip_members member
      where member.trip_id = target.trip_id and member.user_id = selected.user_id and member.status = 'active'
    )
  ) then
    raise exception 'Every selected account must be an active member of this trip';
  end if;

  update public.documents
  set visibility = requested_visibility
  where id = requested_document_id;

  delete from public.document_access where document_id = requested_document_id;
  if requested_visibility = 'selected_members' then
    insert into public.document_access (document_id, user_id, granted_by)
    select requested_document_id, selected.user_id, actor
    from unnest(selected_user_ids) as selected(user_id);
  end if;
end
$function$;

revoke all on function public.enforce_requirement_timing() from public, anon, authenticated;
revoke all on function public.update_document_visibility(uuid, public.document_visibility, uuid[]) from public, anon;
grant execute on function public.update_document_visibility(uuid, public.document_visibility, uuid[]) to authenticated;

commit;

notify pgrst, 'reload schema';
