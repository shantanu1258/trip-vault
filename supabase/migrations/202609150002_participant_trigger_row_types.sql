-- Prevent selected flight travelers from resolving itinerary-only NEW fields.
-- Safe to rerun after 202609140001_event_form_data_model.sql.

begin;

create or replace function public.enforce_explicit_participant_row()
returns trigger language plpgsql security definer set search_path = public as $function$
begin
  -- These trigger tables have different composite row types. Keep field
  -- access within a table-specific PL/pgSQL branch so the SQL planner cannot
  -- resolve NEW.itinerary_item_id for booking_travelers (or vice versa).
  if tg_table_name = 'booking_travelers' then
    if not exists (
      select 1
      from public.bookings booking
      where booking.id = new.booking_id
        and booking.participant_scope = 'selected'
    ) then
      raise exception 'Booking traveler rows require Selected scope';
    end if;
  elsif tg_table_name = 'itinerary_participants' then
    if not exists (
      select 1
      from public.itinerary_items item
      where item.id = new.itinerary_item_id
        and not item.applies_to_all_travelers
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
create trigger booking_traveler_explicit_scope
before insert or update on public.booking_travelers
for each row execute function public.enforce_explicit_participant_row();

drop trigger if exists itinerary_participant_explicit_scope on public.itinerary_participants;
create trigger itinerary_participant_explicit_scope
before insert or update on public.itinerary_participants
for each row execute function public.enforce_explicit_participant_row();

revoke all on function public.enforce_explicit_participant_row() from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';
