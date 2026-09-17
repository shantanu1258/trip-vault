-- Preserve and explicitly edit Train, Bus, and Ferry before/after placement,
-- and apply a Domestic journey's event timezone to every connection atomically.

begin;

drop function if exists public.save_journey_leg_with_timing(uuid, jsonb, jsonb);

create or replace function public.save_journey_leg_with_timing(
  requested_leg_id uuid,
  requested_leg jsonb,
  requested_itinerary_timing jsonb default null,
  requested_event_timezone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  actor uuid := auth.uid();
  target_booking public.bookings%rowtype;
  target_mode text;
  itinerary_item_id uuid;
  existing_timing_mode text;
  existing_anchor_id uuid;
  existing_relative_position text;
  requested_timing_mode text;
  requested_anchor_id uuid;
  requested_relative_position text;
  saved_result jsonb;
  saved_itinerary jsonb;
  normalized_event_timezone text := nullif(trim(requested_event_timezone), '');
begin
  if actor is null then
    raise exception 'Sign in before editing a journey';
  end if;

  -- Match save_journey_leg's lock order before changing the linked itinerary.
  select booking.* into target_booking
  from public.bookings booking
  where booking.id = (
    select journey.booking_id
    from public.journey_legs journey
    where journey.id = requested_leg_id and journey.deleted_at is null
  )
    and booking.deleted_at is null
  for update;
  if not found then
    raise exception 'Journey leg was not found';
  end if;
  if not public.can_edit_trip(target_booking.trip_id) then
    raise exception 'Journey leg cannot be changed';
  end if;

  select journey.mode::text into target_mode
  from public.journey_legs journey
  where journey.id = requested_leg_id
    and journey.booking_id = target_booking.id
    and journey.deleted_at is null;

  -- Lock every connection before changing any of their wall-clock interpretations.
  perform journey.id
  from public.journey_legs journey
  where journey.booking_id = target_booking.id and journey.deleted_at is null
  order by journey.segment_order, journey.id
  for update;

  select item.id, item.timing_mode, item.anchor_itinerary_item_id, item.relative_position
  into itinerary_item_id, existing_timing_mode, existing_anchor_id, existing_relative_position
  from public.itinerary_items item
  where item.booking_id = target_booking.id and item.deleted_at is null
  order by item.created_at, item.id
  limit 1
  for update;

  if requested_itinerary_timing is not null
    and jsonb_typeof(requested_itinerary_timing) <> 'object' then
    raise exception 'Timeline placement must be an object';
  end if;

  if normalized_event_timezone is not null then
    if coalesce(target_booking.journey_scope::text, 'domestic') <> 'domestic' then
      raise exception 'International journeys use their departure and arrival time zones';
    end if;
    if not public.valid_iana_timezone(normalized_event_timezone) then
      raise exception 'Choose a valid journey time zone';
    end if;

    update public.journey_legs journey
    set scheduled_departure_at =
          (journey.scheduled_departure_at at time zone journey.origin_timezone)
            at time zone normalized_event_timezone,
        scheduled_arrival_at = case
          when journey.scheduled_arrival_at is null then null
          else (journey.scheduled_arrival_at at time zone journey.destination_timezone)
            at time zone normalized_event_timezone
        end,
        boarding_at = case
          when journey.boarding_at is null then null
          else (journey.boarding_at at time zone journey.origin_timezone)
            at time zone normalized_event_timezone
        end,
        origin_timezone = normalized_event_timezone,
        destination_timezone = normalized_event_timezone
    where journey.booking_id = target_booking.id
      and journey.id <> requested_leg_id
      and journey.deleted_at is null;
  end if;

  requested_timing_mode := nullif(trim(requested_itinerary_timing->>'timing_mode'), '');
  if requested_timing_mode is null
    and target_mode in ('train', 'bus', 'ferry')
    and existing_timing_mode = 'relative' then
    requested_timing_mode := existing_timing_mode;
    requested_anchor_id := existing_anchor_id;
    requested_relative_position := existing_relative_position;
  elsif requested_timing_mode is not null then
    if requested_timing_mode not in ('exact', 'relative') then
      raise exception 'Journey timeline placement must use its departure time or another event';
    end if;
    if target_mode not in ('train', 'bus', 'ferry') and requested_timing_mode = 'relative' then
      raise exception 'Before/after placement is available for Train, Bus, and Ferry journeys';
    end if;
    if requested_timing_mode = 'relative' then
      requested_anchor_id := nullif(trim(requested_itinerary_timing->>'anchor_itinerary_item_id'), '')::uuid;
      requested_relative_position := nullif(trim(requested_itinerary_timing->>'relative_position'), '');
      if requested_anchor_id is null or requested_relative_position not in ('before', 'after') then
        raise exception 'Choose a dated event and whether this journey belongs before or after it';
      end if;
      if not exists (
        select 1
        from public.itinerary_items anchor
        where anchor.id = requested_anchor_id
          and anchor.id is distinct from itinerary_item_id
          and anchor.trip_id = target_booking.trip_id
          and anchor.deleted_at is null
          and anchor.timing_mode not in ('relative', 'unscheduled')
      ) then
        raise exception 'Choose a dated, non-relative event from this trip as the journey anchor';
      end if;
    end if;
  end if;

  -- Remove the previous derived interval first. The underlying save writes the
  -- edited departure/arrival and lets the itinerary trigger derive a new one.
  update public.itinerary_items item
  set ends_at = null,
      duration_minutes = null
  where item.booking_id = target_booking.id and item.deleted_at is null;

  saved_result := public.save_journey_leg(requested_leg_id, requested_leg);

  if requested_timing_mode = 'relative' then
    update public.itinerary_items item
    set timing_mode = 'relative',
        anchor_itinerary_item_id = requested_anchor_id,
        relative_position = requested_relative_position,
        scheduled_date = (item.starts_at at time zone item.timezone)::date,
        is_all_day = false,
        has_explicit_start_time = true
    where item.booking_id = target_booking.id and item.deleted_at is null;
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(item) order by item.starts_at, item.sort_key, item.id),
    '[]'::jsonb
  )
  into saved_itinerary
  from public.itinerary_items item
  where item.booking_id = target_booking.id and item.deleted_at is null;

  return jsonb_set(saved_result, '{itinerary_items}', saved_itinerary, true);
end
$function$;

revoke all on function public.save_journey_leg_with_timing(uuid, jsonb, jsonb, text) from public, anon;
grant execute on function public.save_journey_leg_with_timing(uuid, jsonb, jsonb, text) to authenticated;

create or replace function public.save_domestic_flight_update(
  requested_leg_id uuid,
  requested_version integer,
  requested_patch jsonb,
  requested_event_timezone text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  actor uuid := auth.uid();
  target_leg public.flight_legs%rowtype;
  target_booking public.bookings%rowtype;
  event_zone text := nullif(trim(requested_event_timezone), '');
  departure_at timestamptz;
  arrival_at timestamptz;
  boarding_time timestamptz;
  boarding_lead integer;
  first_leg public.flight_legs%rowtype;
  last_leg public.flight_legs%rowtype;
  saved_leg jsonb;
begin
  if actor is null then raise exception 'Sign in before editing a flight'; end if;

  select booking.* into target_booking
  from public.bookings booking
  where booking.id = (
    select flight.booking_id
    from public.flight_legs flight
    where flight.id = requested_leg_id and flight.deleted_at is null
  ) and booking.deleted_at is null
  for update;
  if not found then raise exception 'Flight was not found'; end if;
  if not public.can_edit_trip(target_booking.trip_id) then
    raise exception 'Flight cannot be changed';
  end if;
  if coalesce(target_booking.journey_scope::text, 'domestic') <> 'domestic' then
    raise exception 'International flights keep their departure and arrival time zones';
  end if;
  if event_zone is null or not public.valid_iana_timezone(event_zone) then
    raise exception 'Choose a valid flight time zone';
  end if;

  perform flight.id
  from public.flight_legs flight
  where flight.booking_id = target_booking.id and flight.deleted_at is null
  order by flight.segment_order, flight.id
  for update;

  select flight.* into target_leg
  from public.flight_legs flight
  where flight.id = requested_leg_id
    and flight.booking_id = target_booking.id
    and flight.deleted_at is null;
  if requested_version is not null and target_leg.version <> requested_version then
    raise exception 'version_conflict';
  end if;

  departure_at := nullif(requested_patch->>'scheduled_departure_at', '')::timestamptz;
  arrival_at := nullif(requested_patch->>'scheduled_arrival_at', '')::timestamptz;
  boarding_time := nullif(requested_patch->>'boarding_at', '')::timestamptz;
  boarding_lead := nullif(requested_patch->>'boarding_lead_minutes', '')::integer;
  if departure_at is null or arrival_at is null or arrival_at <= departure_at then
    raise exception 'Scheduled arrival must be after departure';
  end if;
  if boarding_time is not null and boarding_time > departure_at then
    raise exception 'Boarding cannot be after departure';
  end if;
  if boarding_lead is not null and (boarding_lead < 0 or boarding_lead > 360) then
    raise exception 'Boarding lead must be between 0 and 360 minutes';
  end if;

  update public.flight_legs flight
  set scheduled_departure_at =
        (flight.scheduled_departure_at at time zone flight.departure_timezone) at time zone event_zone,
      scheduled_arrival_at =
        (flight.scheduled_arrival_at at time zone flight.arrival_timezone) at time zone event_zone,
      estimated_departure_at = case when flight.estimated_departure_at is null then null else
        (flight.estimated_departure_at at time zone flight.departure_timezone) at time zone event_zone end,
      estimated_arrival_at = case when flight.estimated_arrival_at is null then null else
        (flight.estimated_arrival_at at time zone flight.arrival_timezone) at time zone event_zone end,
      actual_departure_at = case when flight.actual_departure_at is null then null else
        (flight.actual_departure_at at time zone flight.departure_timezone) at time zone event_zone end,
      actual_arrival_at = case when flight.actual_arrival_at is null then null else
        (flight.actual_arrival_at at time zone flight.arrival_timezone) at time zone event_zone end,
      boarding_at = case when flight.boarding_at is null then null else
        (flight.boarding_at at time zone flight.departure_timezone) at time zone event_zone end,
      departure_timezone = event_zone,
      arrival_timezone = event_zone
  where flight.booking_id = target_booking.id
    and flight.id <> requested_leg_id
    and flight.deleted_at is null;

  update public.flight_legs flight
  set status = (requested_patch->>'status')::public.flight_status,
      scheduled_departure_at = departure_at,
      scheduled_arrival_at = arrival_at,
      estimated_departure_at = nullif(requested_patch->>'estimated_departure_at', '')::timestamptz,
      estimated_arrival_at = nullif(requested_patch->>'estimated_arrival_at', '')::timestamptz,
      actual_departure_at = nullif(requested_patch->>'actual_departure_at', '')::timestamptz,
      actual_arrival_at = nullif(requested_patch->>'actual_arrival_at', '')::timestamptz,
      boarding_at = boarding_time,
      boarding_lead_minutes = boarding_lead,
      departure_timezone = event_zone,
      arrival_timezone = event_zone,
      departure_terminal = nullif(trim(requested_patch->>'departure_terminal'), ''),
      departure_gate = nullif(trim(requested_patch->>'departure_gate'), ''),
      arrival_terminal = nullif(trim(requested_patch->>'arrival_terminal'), ''),
      arrival_gate = nullif(trim(requested_patch->>'arrival_gate'), ''),
      baggage_claim = nullif(trim(requested_patch->>'baggage_claim'), ''),
      status_note = nullif(trim(requested_patch->>'status_note'), ''),
      status_updated_by = actor,
      status_updated_at = now()
  where flight.id = requested_leg_id;

  if exists (
    select 1
    from (
      select flight.scheduled_departure_at,
        lag(flight.scheduled_arrival_at) over (order by flight.segment_order) as previous_arrival
      from public.flight_legs flight
      where flight.booking_id = target_booking.id and flight.deleted_at is null
    ) ordered
    where ordered.previous_arrival is not null
      and ordered.scheduled_departure_at < ordered.previous_arrival
  ) then
    raise exception 'A flight connection departs before the previous flight arrives';
  end if;

  select flight.* into first_leg from public.flight_legs flight
  where flight.booking_id = target_booking.id and flight.deleted_at is null
  order by flight.segment_order limit 1;
  select flight.* into last_leg from public.flight_legs flight
  where flight.booking_id = target_booking.id and flight.deleted_at is null
  order by flight.segment_order desc limit 1;

  update public.bookings booking
  set start_at = first_leg.scheduled_departure_at,
      end_at = last_leg.scheduled_arrival_at,
      source_timezone = event_zone
  where booking.id = target_booking.id;
  update public.itinerary_items item
  set starts_at = first_leg.scheduled_departure_at,
      ends_at = last_leg.scheduled_arrival_at,
      timezone = event_zone,
      sort_key = first_leg.scheduled_departure_at::text || ':' || item.id::text
  where item.booking_id = target_booking.id and item.deleted_at is null;

  select to_jsonb(flight) into saved_leg
  from public.flight_legs flight where flight.id = requested_leg_id;
  return saved_leg;
end
$function$;

revoke all on function public.save_domestic_flight_update(uuid, integer, jsonb, text) from public, anon;
grant execute on function public.save_domestic_flight_update(uuid, integer, jsonb, text) to authenticated;

commit;

notify pgrst, 'reload schema';
