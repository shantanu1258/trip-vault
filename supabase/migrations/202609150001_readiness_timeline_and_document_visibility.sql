-- Event-linked readiness tasks and editable document visibility.
-- Safe to rerun after 202609140001_event_form_data_model.sql.

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
