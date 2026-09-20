-- An expense may point to an event/booking OR a document, never both.
begin;

alter table public.trip_costs
  add column if not exists document_id uuid references public.documents(id) on delete set null;

alter table public.trip_costs add constraint trip_cost_single_association check (
  document_id is null or
  (booking_id is null and itinerary_item_id is null and cab_stop_id is null)
);
create index trip_costs_document_id_idx on public.trip_costs(document_id)
  where document_id is not null;

create function public.enforce_cost_association_trip()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.trip_id is not distinct from old.trip_id
    and new.document_id is not distinct from old.document_id
    and new.booking_id is not distinct from old.booking_id
    and new.itinerary_item_id is not distinct from old.itinerary_item_id then
    return new;
  end if;
  if new.document_id is not null and not exists (
    select 1 from public.documents d
    where d.id = new.document_id and d.trip_id = new.trip_id and d.deleted_at is null
      and (auth.uid() is null or public.can_read_document(d.id))
  ) then
    raise exception 'Choose an available document from this trip';
  end if;
  if new.booking_id is not null and not exists (
    select 1 from public.bookings b
    where b.id = new.booking_id and b.trip_id = new.trip_id and b.deleted_at is null
  ) then
    raise exception 'Choose an available booking from this trip';
  end if;
  if new.itinerary_item_id is not null and not exists (
    select 1 from public.itinerary_items i
    where i.id = new.itinerary_item_id and i.trip_id = new.trip_id and i.deleted_at is null
      and (new.booking_id is null or i.booking_id = new.booking_id)
  ) then
    raise exception 'Choose an available event from this trip and its matching booking';
  end if;
  return new;
end;
$$;
create trigger cost_association_trip before insert or update of trip_id, document_id, booking_id, itinerary_item_id
  on public.trip_costs for each row execute function public.enforce_cost_association_trip();

commit;
