-- Quick-cost categories for existing Trip Vault databases.
-- Back up first, then run this entire file in the Supabase SQL Editor.
-- Safe to reapply. Fresh projects already include these values in
-- TRIP_VAULT_COMPLETE_SETUP.sql.

begin;
alter type public.cost_category add value if not exists 'snacks';
alter type public.cost_category add value if not exists 'gift';
commit;
