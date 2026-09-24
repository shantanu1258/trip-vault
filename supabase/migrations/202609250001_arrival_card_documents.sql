-- Arrival cards for existing Trip Vault databases.
-- Back up first, then run this entire file in the Supabase SQL Editor.
-- Safe to reapply; existing documents and permissions are unchanged.
-- Fresh projects already include these values in TRIP_VAULT_COMPLETE_SETUP.sql.

begin;
alter type public.document_category add value if not exists 'arrival_card';
alter type public.document_purpose add value if not exists 'arrival_card';
commit;
