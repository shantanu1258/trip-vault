# Supabase database workflow

`TRIP_VAULT_COMPLETE_SETUP.sql` is the canonical current-state rollup for a new Supabase project. Its dated change log records when each database change entered the rollup; the executable sections remain in dependency order.

## New projects

`TRIP_VAULT_COMPLETE_SETUP.sql` marks its two phases explicitly:

- `-- PHASE 1 BEGIN: CURRENT SCHEMA` through `-- PHASE 1 END: CURRENT SCHEMA` installs the schema, functions, grants, Row Level Security policies, and Storage configuration.
- `-- PHASE 2 BEGIN: ADMIN-GATED CATALOG PUBLICATION` through `-- PHASE 2 END: ADMIN-GATED CATALOG PUBLICATION` publishes 103 airports, 27 airlines, and 9 booking vendors with an administrator recorded in the audit trail.

Run the whole file once on a blank project. If no active `public.app_admins` row backed by `auth.users` exists yet, Phase 2 emits notices and safely defers without rolling back Phase 1. Create the dedicated Auth administrator, bootstrap its active `public.app_admins` row through a trusted administrative operation, then select and run only the SQL between the Phase 2 markers. Do not rerun Phase 1 or the whole one-time setup. Phase 2 is safe to retry because both catalog releases have stable change-note guards.

After both phases complete, run `tests/001_schema_smoke.sql`.

## Existing projects

Do not use the complete setup file as an upgrade script. Apply every not-yet-applied file under `migrations/` in filename order, then run `tests/001_schema_smoke.sql`.

Released migrations are immutable because existing deployments may have applied different prefixes of the history. Keeping each forward change unchanged provides a safe incremental path and a reliable record of what a deployment may still need, even after its final state has been folded into the new-project rollup. A correction to an applied migration must be a new dated migration.

## Verification and diagnostics

- `tests/001_schema_smoke.sql` is separate so it can verify either installation path after deployment and roll back its probes without becoming part of the schema.
- Files under `diagnostics/` are opt-in, read-only investigations. They may expose account or trip details in query results and must never run as part of setup or migration deployment.
