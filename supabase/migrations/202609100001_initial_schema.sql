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
