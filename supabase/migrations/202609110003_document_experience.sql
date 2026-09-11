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

-- Preserve the meaning of old rows once. A row with a traveler was personal;
-- the old "trip-wide / not assigned" option represented a shared document.
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
