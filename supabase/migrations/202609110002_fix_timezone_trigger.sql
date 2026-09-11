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
