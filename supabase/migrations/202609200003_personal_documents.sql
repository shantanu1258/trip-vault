-- Personal Vault files stay in the existing owner-only account storage bucket.
-- No trip membership grants access, and personal files cannot be associated
-- accidentally by the trip-association RPC.
begin;

alter table public.account_document_uploads
  drop constraint if exists personal_document_metadata_check;
alter table public.account_document_uploads
  add column if not exists personal_title text,
  add column if not exists personal_kind text,
  add column if not exists personal_label text;

alter table public.account_document_uploads
  add constraint personal_document_metadata_check check (
    (personal_title is null and personal_kind is null and personal_label is null)
    or (
      personal_title is not null and length(btrim(personal_title)) between 1 and 200
      and personal_kind is not null
      and personal_kind in ('passport', 'aadhaar', 'identity', 'insurance', 'other')
      and (personal_label is null or length(personal_label) <= 200)
      and associated_document_id is null
    )
  );

comment on column public.account_document_uploads.personal_title is
  'Non-null for a permanent personal Vault document, not an unfinished trip upload. Owner-only RLS and private Storage still apply.';

-- A fabricated trip document version must never grant access to a personal file.
-- The definer function can inspect the owner-only upload row without exposing
-- its metadata to trip members; can_read_document still authorizes the caller.
create or replace function public.can_read_shared_account_file(requested_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.document_versions version
    join public.account_document_uploads upload on upload.id = version.source_upload_id
    where version.storage_path = requested_path
      and version.storage_bucket = 'account-documents'
      and upload.storage_path = requested_path
      and upload.personal_title is null
      and public.can_read_document(version.document_id)
  );
$$;
revoke all on function public.can_read_shared_account_file(text) from public, anon;
grant execute on function public.can_read_shared_account_file(text) to authenticated;

drop policy if exists account_documents_read on storage.objects;
create policy account_documents_read on storage.objects for select to authenticated using (
  bucket_id = 'account-documents'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.can_read_shared_account_file(name)
  )
);

commit;
