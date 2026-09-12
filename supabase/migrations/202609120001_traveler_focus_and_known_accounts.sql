-- Traveler-focused presentation, reusable account invitations, and appendable
-- flight connections. Run once on an existing Trip Vault database after the
-- previous complete setup. Fresh databases should run COMPLETE_SETUP instead.

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
