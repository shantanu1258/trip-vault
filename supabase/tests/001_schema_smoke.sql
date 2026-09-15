-- Run in Supabase SQL Editor after every migration.
-- It leaves no changes behind: trigger probes run inside a rolled-back transaction.
-- A missing essential LLD invariant raises a clear error.

begin;

do $$
declare
  expected_tables constant text[] := array[
    'profiles', 'app_admins', 'trips', 'trip_members', 'travelers', 'traveler_accounts',
    'traveler_managers', 'trip_invitations', 'bookings', 'booking_travelers', 'trip_airlines',
    'flight_legs', 'flight_leg_travelers', 'itinerary_items', 'itinerary_participants',
    'itinerary_item_documents', 'documents', 'document_versions', 'account_document_uploads', 'trip_storage_cleanup_queue', 'document_access', 'document_travelers', 'notes',
    'trip_requirements', 'requirement_assignees', 'trip_costs', 'trip_cost_participants', 'reminders', 'alert_states',
    'activity_events', 'config_releases', 'airline_catalog_entries', 'airport_catalog_entries',
    'booking_vendor_catalog_entries', 'catalog_suggestions', 'journey_legs', 'journey_leg_travelers',
    'trip_membership_offers',
    'metadata_defaults', 'theme_palettes', 'config_audit_events'
  ];
  expected_table_name text;
  expected_airport_code text;
  expected_airline_code text;
  published_release_id uuid;
  permanent_delete_definition text;
  flight_connection_definition text;
  hotel_save_definition text;
  journey_save_definition text;
  participant_sync_definition text;
  parent_scope_definition text;
  relative_timing_definition text;
  relative_timing_trigger_definition text;
  relative_anchor_definition text;
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
  if not exists (
    select 1 from storage.buckets
    where id = 'account-documents'
      and not public
      and file_size_limit = 4999999
      and coalesce(allowed_mime_types, '{}'::text[]) @> array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']::text[]
  ) then
    raise exception 'The private account-documents inbox bucket is missing or has the wrong restrictions';
  end if;
  if (select count(*) from public.config_releases where status = 'published') <> 1 then
    raise exception 'Exactly one configuration release must be published';
  end if;
  select id into published_release_id
  from public.config_releases
  where status = 'published';
  if (select count(*) from public.airport_catalog_entries where config_release_id = published_release_id) < 103 then
    raise exception 'Published catalogue contains fewer than 103 airports';
  end if;
  if (select count(*) from public.airline_catalog_entries where config_release_id = published_release_id) < 27 then
    raise exception 'Published catalogue contains fewer than 27 airlines';
  end if;
  if (select count(*) from public.booking_vendor_catalog_entries where config_release_id = published_release_id) < 9 then
    raise exception 'Published catalogue contains fewer than 9 booking vendors';
  end if;
  if not exists (
    select 1 from public.booking_vendor_catalog_entries
    where config_release_id = published_release_id and stable_key = 'airbnb' and is_enabled
  ) or not exists (
    select 1 from public.booking_vendor_catalog_entries
    where config_release_id = published_release_id and stable_key = 'trip-com' and is_enabled
  ) then
    raise exception 'Published catalogue is missing Airbnb or Trip.com';
  end if;
  if not exists (select 1 from public.theme_palettes where config_release_id = published_release_id) then
    raise exception 'Published catalogue theme palette is missing';
  end if;
  if exists (
    select 1 from public.airport_catalog_entries
    where config_release_id = published_release_id and not public.valid_iana_timezone(timezone)
  ) then
    raise exception 'Published catalogue contains an invalid airport timezone';
  end if;
  if exists (
    select 1 from public.airline_catalog_entries
    where config_release_id = published_release_id and (
      not public.valid_action_template(check_in_url_template)
      or not public.valid_action_template(manage_booking_url_template)
      or not public.valid_action_template(status_url_template)
      or not public.valid_action_template(tracker_url_template)
    )
  ) then
    raise exception 'Published catalogue contains an invalid airline action URL';
  end if;
  foreach expected_airport_code in array array['DEL','BOM','BLR','HYD','MAA','CCU','COK','GOX','SIN','KUL','PEN','CGK','DPS','SUB'] loop
    if not exists (
      select 1 from public.airport_catalog_entries
      where config_release_id = published_release_id and upper(iata_code) = expected_airport_code and is_enabled
    ) then
      raise exception 'Published catalogue is missing airport %', expected_airport_code;
    end if;
  end loop;
  foreach expected_airline_code in array array['AI','6E','IX','QP','SG','9I','SQ','TR','MH','AK','GA','QG','JT','ID'] loop
    if not exists (
      select 1 from public.airline_catalog_entries
      where config_release_id = published_release_id and upper(iata_code) = expected_airline_code and is_enabled
    ) then
      raise exception 'Published catalogue is missing airline %', expected_airline_code;
    end if;
  end loop;
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
  if to_regprocedure('public.save_hotel_stay(jsonb,uuid[],jsonb)') is null then
    raise exception 'Atomic hotel booking/milestone RPC is missing';
  end if;
  hotel_save_definition := lower(pg_get_functiondef('public.save_hotel_stay(jsonb,uuid[],jsonb)'::regprocedure));
  if strpos(hotel_save_definition, 'left(title_value, 148)') = 0 then
    raise exception 'Hotel milestone titles can exceed the itinerary title limit';
  end if;
  if to_regprocedure('public.save_journey_leg(uuid,jsonb)') is null then
    raise exception 'Atomic journey leg editing RPC is missing';
  end if;
  journey_save_definition := lower(pg_get_functiondef('public.save_journey_leg(uuid,jsonb)'::regprocedure));
  if strpos(journey_save_definition, 'edited departure must match the previous leg destination') = 0
    or strpos(journey_save_definition, 'edited destination must match the next leg origin') = 0
    or strpos(journey_save_definition, 'edited departure time zone must match the previous leg destination time zone') = 0
    or strpos(journey_save_definition, 'edited destination time zone must match the next leg origin time zone') = 0
    or strpos(journey_save_definition, 'departure_at <= previous_leg.scheduled_arrival_at') = 0
    or strpos(journey_save_definition, 'next_leg.scheduled_departure_at <= arrival_at') = 0
    or strpos(journey_save_definition, 'for update') = 0 then
    raise exception 'Journey leg editing does not preserve adjacent connection endpoints, time zones, chronology, and locks';
  end if;
  if strpos(journey_save_definition, 'lock order invariant: resolve and lock the parent booking first') = 0
    or strpos(journey_save_definition, 'lock order invariant: every editor next locks all active route legs') = 0
    or strpos(journey_save_definition, 'order by journey.segment_order, journey.id') = 0
    or strpos(journey_save_definition, 'lock order invariant: resolve and lock the parent booking first')
      >= strpos(journey_save_definition, 'lock order invariant: every editor next locks all active route legs')
    or strpos(journey_save_definition, 'lock order invariant: every editor next locks all active route legs')
      >= strpos(journey_save_definition, 'select journey.* into target_leg') then
    raise exception 'Journey leg editing does not lock booking then route legs in deterministic order';
  end if;
  if to_regprocedure('public.sync_booking_participants(uuid,public.participant_scope,uuid[],uuid,integer)') is null then
    raise exception 'Atomic booking/event participant synchronization RPC is missing';
  end if;
  participant_sync_definition := lower(pg_get_functiondef('public.sync_booking_participants(uuid,public.participant_scope,uuid[],uuid,integer)'::regprocedure));
  if strpos(participant_sync_definition, 'public.can_edit_trip(target_trip_id)') = 0
    or strpos(participant_sync_definition, 'delete from public.booking_travelers') = 0
    or strpos(participant_sync_definition, 'delete from public.flight_leg_travelers') = 0
    or strpos(participant_sync_definition, 'delete from public.journey_leg_travelers') = 0
    or strpos(participant_sync_definition, 'allocation.traveler_id <> all') = 0
    or strpos(participant_sync_definition, 'update public.itinerary_items') = 0
    or strpos(participant_sync_definition, 'delete from public.itinerary_participants') = 0 then
    raise exception 'Booking/event participant synchronization is not authorized or complete';
  end if;
  if to_regprocedure('public.canonicalize_parent_participant_scope()') is null then
    raise exception 'Parent-side participant scope canonicalization is missing';
  end if;
  parent_scope_definition := lower(pg_get_functiondef('public.canonicalize_parent_participant_scope()'::regprocedure));
  if strpos(parent_scope_definition, 'delete from public.booking_travelers') = 0
    or strpos(parent_scope_definition, 'delete from public.flight_leg_travelers') = 0
    or strpos(parent_scope_definition, 'delete from public.journey_leg_travelers') = 0
    or strpos(parent_scope_definition, 'delete from public.itinerary_participants') = 0 then
    raise exception 'Parent-side participant scope canonicalization is incomplete';
  end if;
  if to_regprocedure('public.valid_journey_leg_details(public.journey_mode,jsonb)') is null then
    raise exception 'Mode-specific journey detail validation is missing';
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
  if to_regprocedure('public.can_cleanup_trip_storage_object(text,text)') is null then
    raise exception 'Queued trip Storage cleanup authorization is missing';
  end if;
  if to_regprocedure('public.associate_account_document(uuid,uuid,uuid,uuid,text,public.document_category,public.document_purpose,public.document_assignment_mode,public.document_visibility,uuid,uuid,uuid,text,uuid[],uuid[])') is null then
    raise exception 'Account document association RPC is missing';
  end if;
  if to_regprocedure('public.finalize_account_document_upload(uuid)') is null then
    raise exception 'Account document Storage finalization RPC is missing';
  end if;
  if to_regprocedure('public.can_edit_traveler_profile(uuid,uuid)') is null then
    raise exception 'Delegated traveler profile authorization is missing';
  end if;
  if to_regprocedure('public.update_document_visibility(uuid,public.document_visibility,uuid[])') is null then
    raise exception 'Atomic document visibility update RPC is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'trip_requirements' and column_name = 'timing_mode'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'trip_requirements' and column_name = 'anchor_itinerary_item_id'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'trip_requirements' and column_name = 'relative_position'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'trip_requirements' and column_name = 'offset_minutes'
  ) then
    raise exception 'Readiness timeline scheduling columns are missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trip_requirement_timing_guard' and not tgisinternal) then
    raise exception 'Readiness task timing validation trigger is missing';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'trips'
      and policyname = 'trips_create' and cmd = 'INSERT'
  ) then
    raise exception 'Authenticated trip creation policy is missing';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'account_document_uploads'
      and policyname = 'account_document_uploads_create' and cmd = 'INSERT'
      and with_check ilike '%stored_at is null%'
  ) then
    raise exception 'Account document receipts may bypass server Storage verification';
  end if;
  if exists (
    select 1
    from pg_constraint fk
    join pg_class relation on relation.oid = fk.conrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    join unnest(fk.conkey) as key_column(attnum) on true
    join pg_attribute attribute on attribute.attrelid = relation.oid and attribute.attnum = key_column.attnum
    where namespace.nspname = 'public'
      and relation.relname = 'trip_storage_cleanup_queue'
      and fk.contype = 'f'
      and attribute.attname = 'trip_id'
  ) then
    raise exception 'Trip Storage cleanup rows must survive trip deletion';
  end if;
  if not exists (
    select 1 from pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = 'trip_storage_cleanup_queue'
      and policy.policyname = 'trip_storage_cleanup_read_own'
      and policy.cmd = 'SELECT'
      and coalesce(policy.qual, '') ilike '%owner_id = auth.uid()%'
  ) or not exists (
    select 1 from pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = 'trip_storage_cleanup_queue'
      and policy.policyname = 'trip_storage_cleanup_delete_own'
      and policy.cmd = 'DELETE'
      and coalesce(policy.qual, '') ilike '%owner_id = auth.uid()%'
  ) then
    raise exception 'Trip Storage cleanup queue owner policies are missing';
  end if;
  if not exists (
    select 1 from pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname = 'trip_documents_delete'
      and policy.cmd = 'DELETE'
      and coalesce(policy.qual, '') ilike '%can_cleanup_trip_storage_object%'
  ) then
    raise exception 'Legacy trip document cleanup is not authorized by exact queued paths';
  end if;
  permanent_delete_definition := lower(pg_get_functiondef('public.delete_trip_permanently(uuid)'::regprocedure));
  if strpos(permanent_delete_definition, 'insert into public.trip_storage_cleanup_queue') = 0
    or strpos(permanent_delete_definition, 'delete from public.trips') = 0
    or strpos(permanent_delete_definition, 'perform 1 from public.trips where id = requested_trip_id for update') = 0
    or strpos(permanent_delete_definition, 'perform 1 from public.documents where trip_id = requested_trip_id for update') = 0
    or strpos(permanent_delete_definition, 'insert into public.trip_storage_cleanup_queue')
      > strpos(permanent_delete_definition, 'delete from public.trips') then
    raise exception 'Permanent trip deletion does not lock children and queue Storage paths before deleting the trip';
  end if;
  if pg_get_functiondef('public.can_cleanup_trip_storage_object(text,text)'::regprocedure) not ilike '%not exists%public.document_versions%' then
    raise exception 'Queued Storage cleanup does not protect paths reused by live documents';
  end if;
  flight_connection_definition := lower(pg_get_functiondef('public.add_flight_connection(uuid,jsonb)'::regprocedure));
  if strpos(flight_connection_definition, 'connection departure must match the previous arrival airport') = 0
    or strpos(flight_connection_definition, 'connection departure timezone must match the previous arrival airport') = 0
    or strpos(flight_connection_definition, 'connection scope must match the existing flight journey') = 0
    or strpos(flight_connection_definition, 'domestic connection countries must match the previous arrival country') = 0
    or strpos(flight_connection_definition, 'departure_at <= previous_leg.scheduled_arrival_at') = 0 then
    raise exception 'Flight connection endpoint, time-zone, scope, country, or strict layover validation is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'itinerary_items' and column_name = 'timing_mode'
  ) then
    raise exception 'Flexible timeline timing is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'itinerary_items'
      and column_name = 'has_explicit_start_time'
      and data_type = 'boolean'
      and is_nullable = 'NO'
      and coalesce(column_default, '') ilike '%true%'
  ) then
    raise exception 'Relative timeline explicit-start state is missing or has the wrong default';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'itinerary_items'
      and column_name = 'duration_minutes'
      and data_type = 'integer'
      and is_nullable = 'YES'
  ) then
    raise exception 'Optional timeline duration is missing';
  end if;
  if not exists (
    select 1
    from pg_constraint constraint_row
    join pg_class relation on relation.oid = constraint_row.conrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'itinerary_items'
      and constraint_row.conname = 'itinerary_duration_minutes_positive'
      and pg_get_constraintdef(constraint_row.oid) ilike '%duration_minutes > 0%'
  ) then
    raise exception 'Timeline duration positivity is not enforced';
  end if;
  if not exists (
    select 1
    from pg_constraint constraint_row
    join pg_class relation on relation.oid = constraint_row.conrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'itinerary_items'
      and constraint_row.conname = 'itinerary_timing_precision_check'
  ) then
    raise exception 'Timeline explicit/flexible timing shape is not enforced';
  end if;
  if not exists (
    select 1
    from pg_constraint constraint_row
    join pg_class relation on relation.oid = constraint_row.conrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'itinerary_items'
      and constraint_row.conname = 'itinerary_duration_consistency_check'
  ) then
    raise exception 'Timeline end-time and duration consistency is not enforced';
  end if;
  relative_timing_definition := lower(pg_get_functiondef('public.enforce_itinerary_trip_dates()'::regprocedure));
  if strpos(relative_timing_definition, 'new.starts_at := anchor_row.starts_at') = 0
    or strpos(relative_timing_definition, 'new.timezone := anchor_row.timezone') = 0
    or strpos(relative_timing_definition, 'new.ends_at := new.starts_at + make_interval') = 0
    or strpos(relative_timing_definition, 'new.duration_minutes :=') = 0
    or strpos(relative_timing_definition, 'add a start time before adding an end time') = 0
    or strpos(relative_timing_definition, 'id <> new.id') = 0 then
    raise exception 'Relative timing fallback, duration derivation, or self-anchor validation is missing';
  end if;
  select lower(pg_get_triggerdef(trigger_row.oid)) into relative_timing_trigger_definition
  from pg_trigger trigger_row
  where trigger_row.tgname = 'itinerary_trip_date_bounds'
    and not trigger_row.tgisinternal;
  if relative_timing_trigger_definition is null
    or strpos(relative_timing_trigger_definition, 'has_explicit_start_time') = 0
    or strpos(relative_timing_trigger_definition, 'duration_minutes') = 0 then
    raise exception 'Timeline validation trigger does not watch explicit-start and duration changes';
  end if;
  if to_regprocedure('public.propagate_relative_anchor_timing()') is null
    or not exists (
      select 1 from pg_trigger
      where tgname = 'itinerary_propagate_relative_anchor_timing' and not tgisinternal
    ) then
    raise exception 'Relative timeline anchor propagation is missing';
  end if;
  relative_anchor_definition := lower(pg_get_functiondef('public.propagate_relative_anchor_timing()'::regprocedure));
  if strpos(relative_anchor_definition, 'dependent.anchor_itinerary_item_id = new.id') = 0
    or strpos(relative_anchor_definition, 'not dependent.has_explicit_start_time') = 0
    or strpos(relative_anchor_definition, 'dependent.timezone is distinct from new.timezone') = 0 then
    raise exception 'Relation-only events do not follow anchor date, time, and timezone changes';
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
  if not exists (select 1 from pg_trigger where tgname = 'journey_leg_traveler_same_trip' and not tgisinternal) then
    raise exception 'Journey traveler same-trip validation trigger is missing';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'booking_traveler_explicit_scope' and not tgisinternal)
    or not exists (select 1 from pg_trigger where tgname = 'itinerary_participant_explicit_scope' and not tgisinternal) then
    raise exception 'Explicit Everyone/Selected participant validation is missing';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'booking_parent_participant_scope'
      and tgrelid = 'public.bookings'::regclass and not tgisinternal
  ) or not exists (
    select 1 from pg_trigger
    where tgname = 'itinerary_parent_participant_scope'
      and tgrelid = 'public.itinerary_items'::regclass and not tgisinternal
  ) then
    raise exception 'Parent-side Everyone scope canonicalization triggers are missing';
  end if;
  if exists (
    select 1
    from public.booking_travelers assignment
    join public.bookings booking on booking.id = assignment.booking_id
    where booking.participant_scope = 'everyone'
  ) or exists (
    select 1
    from public.itinerary_participants assignment
    join public.itinerary_items item on item.id = assignment.itinerary_item_id
    where item.applies_to_all_travelers
  ) then
    raise exception 'Everyone scope still contains explicit traveler rows';
  end if;
  if exists (
    select 1
    from public.booking_travelers assignment
    join public.travelers traveler on traveler.id = assignment.traveler_id
    where traveler.removed_at is not null
  ) or exists (
    select 1
    from public.itinerary_participants assignment
    join public.travelers traveler on traveler.id = assignment.traveler_id
    where traveler.removed_at is not null
  ) then
    raise exception 'Removed travelers still have booking or timeline participant rows';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'reservation_state'
      and udt_name = 'booking_reservation_state' and is_nullable = 'NO'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'bookings' and column_name = 'participant_scope'
      and udt_name = 'participant_scope' and is_nullable = 'NO'
  ) then
    raise exception 'Booking reservation state or explicit participant scope is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'journey_legs' and column_name = 'scheduled_arrival_at' and is_nullable = 'YES'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'journey_legs' and column_name = 'details' and data_type = 'jsonb'
  ) then
    raise exception 'Journey optional arrival or typed details storage is missing';
  end if;
  if not public.valid_journey_leg_details('train', '{"kind":"train","travel_class":"AC 2 Tier"}'::jsonb)
    or public.valid_journey_leg_details('train', '{}'::jsonb)
    or public.valid_journey_leg_details('bus', '{"kind":"train"}'::jsonb)
    or public.valid_journey_leg_details('cab', '{"kind":"cab","ride_type":"teleport"}'::jsonb)
    or public.valid_journey_leg_details('ferry', '{"kind":"ferry","unexpected":true}'::jsonb) then
    raise exception 'Mode-specific journey detail validation accepts an invalid shape';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'journey_leg_travelers' and policyname = 'journey_leg_travelers_read'
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'journey_leg_travelers' and policyname = 'journey_leg_travelers_write'
  ) then
    raise exception 'Journey traveler RLS policies are missing';
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
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'document_versions' and column_name = 'storage_bucket'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'document_versions' and column_name = 'source_upload_id'
  ) then
    raise exception 'Account document version provenance is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'account_document_uploads' and column_name = 'stored_at'
  ) then
    raise exception 'Server-verified account document Storage state is missing';
  end if;
  if exists (
    select required.policyname, required.command
    from (values
      ('account_documents_read', 'SELECT'),
      ('account_documents_create', 'INSERT'),
      ('account_documents_delete', 'DELETE')
    ) as required(policyname, command)
    where not exists (
      select 1 from pg_policies policy
      where policy.schemaname = 'storage'
        and policy.tablename = 'objects'
        and policy.policyname = required.policyname
        and policy.cmd = required.command
    )
  ) then
    raise exception 'One or more account document Storage policies are missing';
  end if;
  if not exists (
    select 1 from pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname = 'account_documents_create'
      and policy.cmd = 'INSERT'
      and coalesce(policy.with_check, '') ilike '%associated_document_id IS NULL%'
      and coalesce(policy.with_check, '') ilike '%stored_at IS NULL%'
  ) then
    raise exception 'Account document Storage creation is not limited to pending uploads';
  end if;
  if exists (
    select 1 from pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname = 'account_documents_update'
      and policy.cmd = 'UPDATE'
  ) then
    raise exception 'Account document Storage objects must never be updated in place';
  end if;
  if not exists (
    select 1 from pg_policies policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname = 'account_documents_delete'
      and policy.cmd = 'DELETE'
      and coalesce(policy.qual, '') ilike '%associated_document_id IS NULL%'
      and coalesce(policy.qual, '') not ilike '%stored_at IS NULL%'
  ) then
    raise exception 'Account document deletion does not preserve the unassociated inbox cleanup boundary';
  end if;
  if pg_get_functiondef('public.finalize_account_document_upload(uuid)'::regprocedure) not ilike '%from storage.objects%'
    or pg_get_functiondef('public.finalize_account_document_upload(uuid)'::regprocedure) not ilike '%Document file is not stored yet%' then
    raise exception 'Account document finalization does not verify the Storage object';
  end if;
  if pg_get_functiondef('public.associate_account_document(uuid,uuid,uuid,uuid,text,public.document_category,public.document_purpose,public.document_assignment_mode,public.document_visibility,uuid,uuid,uuid,text,uuid[],uuid[])'::regprocedure) not ilike '%upload.stored_at is null%'
    or pg_get_functiondef('public.associate_account_document(uuid,uuid,uuid,uuid,text,public.document_category,public.document_purpose,public.document_assignment_mode,public.document_visibility,uuid,uuid,uuid,text,uuid[],uuid[])'::regprocedure) not ilike '%from storage.objects%'
  then
    raise exception 'Account document association does not verify stored bytes';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'document_traveler_same_trip' and not tgisinternal) then
    raise exception 'Document traveler same-trip validation trigger is missing';
  end if;
end;
$$;

select
  'Trip Vault schema smoke test passed' as result,
  (select count(*) from pg_policies where schemaname = 'public') as public_rls_policies,
  (select file_size_limit from storage.buckets where id = 'trip-documents') as document_byte_limit,
  (select version_number from public.config_releases where status = 'published') as published_catalog_version,
  (select count(*) from public.airport_catalog_entries where config_release_id = (select id from public.config_releases where status = 'published')) as published_airports,
  (select count(*) from public.airline_catalog_entries where config_release_id = (select id from public.config_releases where status = 'published')) as published_airlines,
  (select count(*) from public.booking_vendor_catalog_entries where config_release_id = (select id from public.config_releases where status = 'published')) as published_booking_vendors;

rollback;
