-- Account-owned document inbox.
--
-- File bytes are uploaded independently of a trip. Associating an inbox file
-- with a trip is a separate atomic RPC, so a failed or interrupted association
-- never loses the upload.

begin;

create table if not exists public.account_document_uploads (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  byte_size bigint not null check (byte_size >= 0 and byte_size < 5000000),
  sha256 text not null check (sha256 ~ '^[0-9a-fA-F]{64}$'),
  associated_document_id uuid references public.documents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_document_owner_path check (storage_path like owner_id::text || '/%')
);

alter table public.document_versions
  add column if not exists storage_bucket text not null default 'trip-documents';
alter table public.document_versions
  drop constraint if exists document_versions_storage_bucket_check;
alter table public.document_versions
  add constraint document_versions_storage_bucket_check
  check (storage_bucket in ('trip-documents', 'account-documents'));
alter table public.document_versions
  add column if not exists source_upload_id uuid references public.account_document_uploads(id) on delete restrict;

create index if not exists account_document_uploads_owner_pending_idx
  on public.account_document_uploads (owner_id, created_at desc)
  where associated_document_id is null;
create index if not exists document_versions_source_upload_idx
  on public.document_versions (source_upload_id)
  where source_upload_id is not null;

drop trigger if exists set_updated_at on public.account_document_uploads;
create trigger set_updated_at before update on public.account_document_uploads
for each row execute function public.set_updated_at();

alter table public.account_document_uploads enable row level security;
revoke all on public.account_document_uploads from anon, authenticated;
grant select, insert, delete on public.account_document_uploads to authenticated;
grant all on public.account_document_uploads to service_role;

drop policy if exists account_document_uploads_read on public.account_document_uploads;
create policy account_document_uploads_read on public.account_document_uploads
for select to authenticated using (owner_id = auth.uid());
drop policy if exists account_document_uploads_create on public.account_document_uploads;
create policy account_document_uploads_create on public.account_document_uploads
for insert to authenticated with check (owner_id = auth.uid() and associated_document_id is null);
drop policy if exists account_document_uploads_update on public.account_document_uploads;
drop policy if exists account_document_uploads_delete on public.account_document_uploads;
create policy account_document_uploads_delete on public.account_document_uploads
for delete to authenticated using (owner_id = auth.uid() and associated_document_id is null);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'account-documents', 'account-documents', false, 4999999,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists account_documents_read on storage.objects;
create policy account_documents_read on storage.objects for select to authenticated using (
  bucket_id = 'account-documents'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1
      from public.document_versions version
      where version.storage_path = name
        and version.storage_bucket = 'account-documents'
        and version.source_upload_id is not null
        and public.can_read_document(version.document_id)
    )
  )
);

drop policy if exists account_documents_create on storage.objects;
create policy account_documents_create on storage.objects for insert to authenticated with check (
  bucket_id = 'account-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists account_documents_update on storage.objects;
create policy account_documents_update on storage.objects for update to authenticated using (
  bucket_id = 'account-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
) with check (
  bucket_id = 'account-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists account_documents_delete on storage.objects;
create policy account_documents_delete on storage.objects for delete to authenticated using (
  bucket_id = 'account-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function public.associate_account_document(
  requested_upload_id uuid,
  requested_document_id uuid,
  requested_version_id uuid,
  requested_trip_id uuid,
  requested_title text,
  requested_category public.document_category,
  requested_purpose public.document_purpose,
  requested_assignment_mode public.document_assignment_mode,
  requested_visibility public.document_visibility,
  requested_booking_id uuid default null,
  requested_flight_leg_id uuid default null,
  requested_journey_leg_id uuid default null,
  requested_short_label text default null,
  requested_traveler_ids uuid[] default '{}',
  requested_user_ids uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public, storage, pg_catalog
as $$
declare
  actor uuid := auth.uid();
  upload public.account_document_uploads%rowtype;
  traveler_ids uuid[] := coalesce(requested_traveler_ids, '{}'::uuid[]);
  selected_user_ids uuid[] := coalesce(requested_user_ids, '{}'::uuid[]);
  primary_traveler uuid;
begin
  if actor is null then raise exception 'Sign in before associating a document'; end if;
  select * into upload
  from public.account_document_uploads
  where id = requested_upload_id and owner_id = actor
  for update;
  if upload.id is null then raise exception 'Document upload was not found for this account'; end if;
  if upload.associated_document_id is not null then
    if upload.associated_document_id = requested_document_id then return requested_document_id; end if;
    raise exception 'Document upload is already associated';
  end if;
  if not public.is_trip_member(requested_trip_id, actor) then raise exception 'Join the trip before associating this document'; end if;
  if char_length(trim(requested_title)) not between 1 and 180 then raise exception 'Document title is required'; end if;

  if requested_assignment_mode = 'selected' and cardinality(traveler_ids) = 0 then
    raise exception 'Choose at least one traveler';
  elsif requested_assignment_mode <> 'selected' then
    traveler_ids := '{}'::uuid[];
  end if;
  if exists (
    select 1 from unnest(traveler_ids) as selected(traveler_id)
    where not exists (
      select 1 from public.travelers traveler
      where traveler.id = selected.traveler_id and traveler.trip_id = requested_trip_id and traveler.removed_at is null
    )
  ) then raise exception 'Every selected traveler must belong to the trip'; end if;
  if cardinality(traveler_ids) = 1 then primary_traveler := traveler_ids[1]; end if;
  if requested_visibility = 'traveler_and_managers' and primary_traveler is null then
    raise exception 'Traveler and manager visibility requires exactly one traveler';
  end if;
  if requested_visibility <> 'private' and not public.can_edit_trip(requested_trip_id, actor) and not (
    requested_visibility = 'traveler_and_managers' and (
      exists (select 1 from public.traveler_accounts account where account.traveler_id = primary_traveler and account.user_id = actor)
      or exists (
        select 1 from public.traveler_managers manager
        where manager.traveler_id = primary_traveler and manager.user_id = actor
          and manager.can_manage_documents and manager.revoked_at is null
      )
    )
  ) then raise exception 'This account may only attach a private document to this trip'; end if;
  if exists (
    select 1 from unnest(selected_user_ids) as selected(user_id)
    where not public.is_trip_member(requested_trip_id, selected.user_id)
  ) then raise exception 'Selected document viewers must be active trip members'; end if;

  insert into public.documents (
    id, trip_id, booking_id, flight_leg_id, journey_leg_id, traveler_id,
    assignment_mode, title, category, purpose, short_label, visibility, uploaded_by
  ) values (
    requested_document_id, requested_trip_id, requested_booking_id, requested_flight_leg_id,
    requested_journey_leg_id, primary_traveler, requested_assignment_mode, trim(requested_title),
    requested_category, requested_purpose, nullif(trim(requested_short_label), ''), requested_visibility, actor
  );

  insert into public.document_versions (
    id, document_id, version_number, storage_bucket, storage_path, original_filename,
    mime_type, byte_size, sha256, source_upload_id, created_by
  ) values (
    requested_version_id, requested_document_id, 1, 'account-documents', upload.storage_path,
    upload.original_filename, upload.mime_type, upload.byte_size, upload.sha256, upload.id, actor
  );
  update public.documents set current_version_id = requested_version_id where id = requested_document_id;

  insert into public.document_travelers (document_id, traveler_id, assigned_by)
  select requested_document_id, selected.traveler_id, actor
  from unnest(traveler_ids) as selected(traveler_id)
  on conflict (document_id, traveler_id) do nothing;
  insert into public.document_access (document_id, user_id, granted_by)
  select requested_document_id, selected.user_id, actor
  from unnest(selected_user_ids) as selected(user_id)
  on conflict (document_id, user_id) do nothing;

  update public.account_document_uploads
  set associated_document_id = requested_document_id
  where id = upload.id;
  return requested_document_id;
end;
$$;

revoke all on function public.associate_account_document(
  uuid, uuid, uuid, uuid, text, public.document_category, public.document_purpose,
  public.document_assignment_mode, public.document_visibility, uuid, uuid, uuid, text, uuid[], uuid[]
) from public, anon;
grant execute on function public.associate_account_document(
  uuid, uuid, uuid, uuid, text, public.document_category, public.document_purpose,
  public.document_assignment_mode, public.document_visibility, uuid, uuid, uuid, text, uuid[], uuid[]
) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
