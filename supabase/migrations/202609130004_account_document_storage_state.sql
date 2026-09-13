-- Make account-document upload state reflect the actual Storage object.
--
-- The metadata row is intentionally created before the object upload so an
-- interrupted upload remains visible and recoverable. `stored_at` is only set
-- by a security-definer RPC after the server verifies that the matching object
-- exists. Association repeats that verification inside its transaction.

begin;

alter table public.account_document_uploads
  add column if not exists stored_at timestamptz;

-- Only the server-side finalization function may move a receipt into the
-- stored state. A direct authenticated insert must always begin unverified.
drop policy if exists account_document_uploads_create on public.account_document_uploads;
create policy account_document_uploads_create on public.account_document_uploads
for insert to authenticated with check (
  owner_id = auth.uid()
  and associated_document_id is null
  and stored_at is null
);

-- Only the receipt owner may create its object while the receipt is still
-- pending Storage verification. Objects are never updated in place: retries
-- use insert-without-upsert, and document replacement creates a new version.
-- Deletion remains available for an unassociated inbox item (including a
-- finalized one) so the Profile cleanup flow can remove an upload; association
-- freezes deletion as well.
drop policy if exists account_documents_create on storage.objects;
create policy account_documents_create on storage.objects for insert to authenticated with check (
  bucket_id = 'account-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.account_document_uploads upload
    where upload.owner_id = auth.uid()
      and upload.storage_path = name
      and upload.associated_document_id is null
      and upload.stored_at is null
  )
);
drop policy if exists account_documents_update on storage.objects;
drop policy if exists account_documents_delete on storage.objects;
create policy account_documents_delete on storage.objects for delete to authenticated using (
  bucket_id = 'account-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.account_document_uploads upload
    where upload.owner_id = auth.uid()
      and upload.storage_path = name
      and upload.associated_document_id is null
  )
);

-- Existing rows are only marked stored when their object is present. Rows left
-- null remain verifiable receipts; if their object is absent, the original must
-- be retried on its device or selected again.
update public.account_document_uploads upload
set stored_at = coalesce(upload.stored_at, now())
where upload.stored_at is null
  and exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'account-documents'
      and object.name = upload.storage_path
  );

create or replace function public.finalize_account_document_upload(requested_upload_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public, storage, pg_catalog
as $$
declare
  actor uuid := auth.uid();
  upload public.account_document_uploads%rowtype;
  finalized_at timestamptz;
begin
  if actor is null then raise exception 'Sign in before finalizing a document upload'; end if;

  select * into upload
  from public.account_document_uploads
  where id = requested_upload_id and owner_id = actor
  for update;
  if upload.id is null then raise exception 'Document upload was not found for this account'; end if;

  -- Hold the Storage metadata row while this transaction records completion,
  -- so a concurrent object deletion cannot win between the check and commit.
  perform 1
  from storage.objects object
  where object.bucket_id = 'account-documents'
    and object.name = upload.storage_path
  for key share;
  if not found then raise exception 'Document file is not stored yet'; end if;

  update public.account_document_uploads
  set stored_at = coalesce(stored_at, now())
  where id = upload.id
  returning stored_at into finalized_at;

  return finalized_at;
end;
$$;

revoke all on function public.finalize_account_document_upload(uuid) from public, anon;
grant execute on function public.finalize_account_document_upload(uuid) to authenticated, service_role;

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
  if upload.stored_at is null then raise exception 'Document file is not stored yet'; end if;

  perform 1
  from storage.objects object
  where object.bucket_id = 'account-documents'
    and object.name = upload.storage_path
  for key share;
  if not found then raise exception 'Document file is not stored yet'; end if;

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
