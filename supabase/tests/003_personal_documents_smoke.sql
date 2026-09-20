-- Optional: run on an isolated test project after 202609200003_personal_documents.sql.
-- All fixtures roll back. No file bytes or HTTP requests are created.
begin;
do $$
declare
  owner_id uuid := gen_random_uuid(); other_id uuid := gen_random_uuid();
  upload_id uuid := gen_random_uuid();
begin
  insert into auth.users(id,email) values
    (owner_id, owner_id || '@personal-vault.invalid'),
    (other_id, other_id || '@personal-vault.invalid');
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  execute 'set local role authenticated';
  insert into public.account_document_uploads
    (id,owner_id,storage_path,original_filename,mime_type,byte_size,sha256,personal_title,personal_kind)
    values(upload_id,owner_id,owner_id || '/' || upload_id || '/fixture.pdf','fixture.pdf',
      'application/pdf',42,repeat('a',64),'Private passport','passport');
  if not exists(select 1 from public.account_document_uploads where id=upload_id) then
    raise exception 'Owner cannot read personal metadata';
  end if;
  if public.can_read_shared_account_file(owner_id || '/' || upload_id || '/fixture.pdf') then
    raise exception 'Personal file incorrectly qualifies for trip sharing';
  end if;
  perform set_config('request.jwt.claim.sub', other_id::text, true);
  if exists(select 1 from public.account_document_uploads where id=upload_id) then
    raise exception 'Personal metadata leaked to another account';
  end if;
  delete from public.account_document_uploads where id=upload_id;
  if found then raise exception 'Another account could delete a personal file'; end if;
  execute 'reset role';
  begin
    update public.account_document_uploads set associated_document_id=gen_random_uuid() where id=upload_id;
    raise exception 'Personal file incorrectly accepted a trip association';
  exception when check_violation then null;
  end;
end $$;
rollback;
