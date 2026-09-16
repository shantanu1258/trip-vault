-- Prevent parent participant-scope triggers from resolving a field that does
-- not exist on the other parent table's NEW row. Safe to rerun after
-- 202609140001_event_form_data_model.sql.

begin;

create or replace function public.canonicalize_parent_participant_scope()
returns trigger language plpgsql security definer set search_path = public as $function$
declare
  row_data jsonb := to_jsonb(new);
begin
  -- bookings and itinerary_items have different composite row types. Read
  -- table-specific fields from JSON so PostgreSQL never tries to resolve
  -- NEW.participant_scope on itinerary_items (or the inverse field on bookings).
  if tg_table_name = 'bookings' then
    if coalesce(row_data->>'participant_scope', '') = 'everyone' then
      delete from public.booking_travelers assignment
      where assignment.booking_id = new.id;
      delete from public.flight_leg_travelers allocation
      using public.flight_legs leg
      where allocation.flight_leg_id = leg.id and leg.booking_id = new.id;
      delete from public.journey_leg_travelers allocation
      using public.journey_legs leg
      where allocation.journey_leg_id = leg.id and leg.booking_id = new.id;
    end if;
  elsif tg_table_name = 'itinerary_items' then
    if coalesce((row_data->>'applies_to_all_travelers')::boolean, false) then
      delete from public.itinerary_participants assignment
      where assignment.itinerary_item_id = new.id;
    end if;
  else
    raise exception 'Unexpected participant-scope parent trigger table: %', tg_table_name;
  end if;
  return new;
end
$function$;

drop trigger if exists booking_parent_participant_scope on public.bookings;
create trigger booking_parent_participant_scope
before update of participant_scope on public.bookings
for each row execute function public.canonicalize_parent_participant_scope();

drop trigger if exists itinerary_parent_participant_scope on public.itinerary_items;
create trigger itinerary_parent_participant_scope
before update of applies_to_all_travelers on public.itinerary_items
for each row execute function public.canonicalize_parent_participant_scope();

revoke all on function public.canonicalize_parent_participant_scope() from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';
