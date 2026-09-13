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
