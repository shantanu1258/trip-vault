-- Simplify the personal MVP's managed-traveler flow.
-- Owners and editors can work with traveler-linked documents without creating
-- a separate traveler_managers capability row. Private and selected-member
-- documents retain their existing visibility boundaries.

begin;

create or replace function public.can_read_document(requested_document_id uuid, requested_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.documents d
    join public.trip_members tm on tm.trip_id = d.trip_id and tm.user_id = requested_user_id and tm.status = 'active'
    where d.id = requested_document_id and d.deleted_at is null and (
      d.visibility = 'trip'
      or d.uploaded_by = requested_user_id
      or (d.visibility = 'selected_members' and exists (
        select 1 from public.document_access da where da.document_id = d.id and da.user_id = requested_user_id
      ))
      or (d.visibility = 'traveler_and_managers' and (
        public.can_edit_trip(d.trip_id, requested_user_id)
        or exists (select 1 from public.traveler_accounts ta where ta.traveler_id = d.traveler_id and ta.user_id = requested_user_id)
        or exists (
          select 1 from public.traveler_managers manager
          where manager.traveler_id = d.traveler_id and manager.user_id = requested_user_id
            and manager.can_view_documents and manager.revoked_at is null
        )
      ))
    )
  );
$$;

revoke all on function public.can_read_document(uuid, uuid) from public, anon;
grant execute on function public.can_read_document(uuid, uuid) to authenticated, service_role;

commit;
