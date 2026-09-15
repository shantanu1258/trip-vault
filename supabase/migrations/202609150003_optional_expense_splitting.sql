-- Make expense-splitting controls an opt-in trip setting.
--
-- When disabled, the app keeps cost entry simple and applies each new cost to
-- every active traveler internally. Enabling it exposes payer and participant
-- controls without changing previously saved expense data.
-- Safe to rerun on an existing Trip Vault database.

begin;

alter table public.trips
  add column if not exists expense_splitting_enabled boolean not null default false;

comment on column public.trips.expense_splitting_enabled is
  'Whether cost forms expose payer and participant split controls for this trip.';

commit;

notify pgrst, 'reload schema';
