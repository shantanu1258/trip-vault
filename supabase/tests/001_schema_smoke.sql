-- Run in Supabase SQL Editor after every migration.
-- It is read-only and raises a clear error if an essential LLD invariant is absent.

begin;

do $$
declare
  expected_tables constant text[] := array[
    'profiles', 'app_admins', 'trips', 'trip_members', 'travelers', 'traveler_accounts',
    'traveler_managers', 'trip_invitations', 'bookings', 'booking_travelers', 'trip_airlines',
    'flight_legs', 'flight_leg_travelers', 'itinerary_items', 'itinerary_participants',
    'itinerary_item_documents', 'documents', 'document_versions', 'document_access', 'document_travelers', 'notes',
    'trip_requirements', 'requirement_assignees', 'trip_costs', 'trip_cost_participants', 'reminders', 'alert_states',
    'activity_events', 'config_releases', 'airline_catalog_entries', 'airport_catalog_entries',
    'booking_vendor_catalog_entries', 'catalog_suggestions', 'journey_legs',
    'trip_membership_offers',
    'metadata_defaults', 'theme_palettes', 'config_audit_events'
  ];
  expected_table_name text;
begin
  foreach expected_table_name in array expected_tables loop
    if to_regclass('public.' || expected_table_name) is null then
      raise exception 'Missing required table: public.%', expected_table_name;
    end if;
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = expected_table_name and c.relrowsecurity
    ) then
      raise exception 'RLS is not enabled on public.%', expected_table_name;
    end if;
  end loop;

  if not exists (select 1 from storage.buckets where id = 'trip-documents' and not public and file_size_limit = 4999999) then
    raise exception 'The private trip-documents bucket is missing or has the wrong size limit';
  end if;
  if (select count(*) from public.config_releases where status = 'published') > 1 then
    raise exception 'More than one configuration release is published';
  end if;
  if to_regprocedure('public.create_trip_invitation(uuid,public.invitation_target_type,uuid,public.member_role)') is null then
    raise exception 'create_trip_invitation RPC is missing';
  end if;
  if to_regprocedure('public.redeem_trip_invitation(text)') is null then
    raise exception 'redeem_trip_invitation RPC is missing';
  end if;
  if to_regprocedure('public.create_trip_membership_offer(uuid,uuid,public.invitation_target_type,uuid,public.member_role)') is null then
    raise exception 'create_trip_membership_offer RPC is missing';
  end if;
  if to_regprocedure('public.list_associated_accounts()') is null or to_regprocedure('public.list_incoming_trip_membership_offers()') is null then
    raise exception 'Known-account invitation query RPCs are missing';
  end if;
  if to_regprocedure('public.respond_trip_membership_offer(uuid,boolean)') is null then
    raise exception 'respond_trip_membership_offer RPC is missing';
  end if;
  if to_regprocedure('public.add_flight_connection(uuid,jsonb)') is null then
    raise exception 'add_flight_connection RPC is missing';
  end if;
  if to_regprocedure('public.reorder_itinerary_items(uuid,uuid[])') is null then
    raise exception 'reorder_itinerary_items RPC is missing';
  end if;
  if to_regprocedure('public.archive_trip_item(uuid)') is null or to_regprocedure('public.restore_trip_item(uuid)') is null then
    raise exception 'Timeline archive/restore RPCs are missing';
  end if;
  if to_regprocedure('public.delete_trip_permanently(uuid)') is null then
    raise exception 'Owner-only permanent trip deletion RPC is missing';
  end if;
  if to_regprocedure('public.can_edit_traveler_profile(uuid,uuid)') is null then
    raise exception 'Delegated traveler profile authorization is missing';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trips'
      and policyname = 'trips_create' and cmd = 'INSERT'
  ) then
    raise exception 'Authenticated trip creation policy is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'itinerary_items' and column_name = 'timing_mode'
  ) then
    raise exception 'Flexible timeline timing is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'trip_costs' and column_name = 'paid_by_traveler_id'
  ) then
    raise exception 'Trip expense payer support is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trip_date_bounds_include_itinerary' and not tgisinternal) then
    raise exception 'Trip date changes are not protected by timeline bounds';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'on_trip_created_add_owner' and not tgisinternal) then
    raise exception 'Trip owner bootstrap trigger is missing';
  end if;
  if pg_get_functiondef('public.can_read_document(uuid,uuid)'::regprocedure) not like '%public.can_edit_trip(d.trip_id, requested_user_id)%' then
    raise exception 'Simplified Owner/Editor traveler-document access is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'document_trip_references' and not tgisinternal) then
    raise exception 'Document same-trip validation trigger is missing';
  end if;
  if not pg_get_functiondef('public.enforce_trip_references()'::regprocedure) like '%A document cannot be moved to another trip%' then
    raise exception 'Document trip immutability validation is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'flight_requires_flight_booking' and not tgisinternal) then
    raise exception 'Flight same-trip validation trigger is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'requirement_document_same_trip' and not tgisinternal) then
    raise exception 'Requirement document same-trip validation trigger is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'itinerary_booking_same_trip' and not tgisinternal) then
    raise exception 'Itinerary booking same-trip validation trigger is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'traveler_manager_is_member' and not tgisinternal) then
    raise exception 'Traveler manager membership validation trigger is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'managed_traveler_update_scope' and not tgisinternal) then
    raise exception 'Delegated traveler update scope trigger is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'journeys_valid_timezones' and not tgisinternal) then
    raise exception 'Strict journey timezone validation trigger is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'airport_catalog_validate' and not tgisinternal)
    or not exists (select 1 from pg_trigger where tgname = 'theme_palettes_validate' and not tgisinternal) then
    raise exception 'Admin metadata validation triggers are missing';
  end if;
  -- These no-op updates are rolled back below. They ensure the shared trigger
  -- never tries to resolve airport-only fields while validating a theme row.
  if exists (select 1 from public.theme_palettes) then
    update public.theme_palettes
    set light_tokens = light_tokens
    where config_release_id = (select config_release_id from public.theme_palettes limit 1);
  end if;
  if exists (select 1 from public.airport_catalog_entries) then
    update public.airport_catalog_entries
    set timezone = timezone
    where id = (select id from public.airport_catalog_entries limit 1);
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'document_journey_reference' and not tgisinternal) then
    raise exception 'Journey document same-trip validation trigger is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'itinerary_items' and column_name = 'event_type'
  ) then
    raise exception 'Timeline event typing is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'documents' and column_name = 'journey_leg_id'
  ) then
    raise exception 'Journey document association is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'documents' and column_name = 'assignment_mode'
  ) then
    raise exception 'Document traveler assignment mode is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'document_traveler_same_trip' and not tgisinternal) then
    raise exception 'Document traveler same-trip validation trigger is missing';
  end if;
end;
$$;

select
  'Trip Vault schema smoke test passed' as result,
  (select count(*) from pg_policies where schemaname = 'public') as public_rls_policies,
  (select file_size_limit from storage.buckets where id = 'trip-documents') as document_byte_limit;

rollback;
