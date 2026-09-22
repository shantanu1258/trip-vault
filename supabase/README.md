# Supabase database setup

`TRIP_VAULT_COMPLETE_SETUP.sql` is the **new-project database installer**. It contains the complete schema, functions, grants, RLS, Storage policies, push database support, personal Vault, expense-document links, Planning, activity Moments, archive recovery/deletion, activity timing and booking-document detachment. The dated changelog is at the top of that file. Existing projects use incremental SQL files in `migrations/` for new changes.

## New projects

Run the whole file once in the Supabase SQL Editor on a blank project. No migration files need to be applied afterward.

- **Phase 1: current schema** creates every application database object.
- **Phase 2: admin-gated catalogue publication** publishes 103 airports, 27 airlines and 9 booking vendors only when an active `public.app_admins` row backed by `auth.users` exists. On a blank project it safely defers, leaving the schema installed.

Create the dedicated Auth administrator and bootstrap its active `app_admins` row through trusted SQL. Then run **only** the statements between `PHASE 2 BEGIN` and `PHASE 2 END`. Catalogue publication is safe to retry; it records its administrator in the audit trail. The full installer refuses to run if `public.trips` already exists.

Supabase Auth/Storage platform schemas are supplied by Supabase. Edge Functions, secrets and optional Cron delivery are infrastructure, not database schema: follow [PUSH_SETUP.md](../docs/PUSH_SETUP.md) to enable notification delivery. Installing this SQL alone does not send notifications or schedule jobs.

## Existing projects

Do **not** rerun the installer or delete/reset your database. Back up first and apply outstanding incremental migrations in order, checking their prerequisites. The migration folder contains new changes after consolidation, not the historical chain needed to create a database from scratch. Older deployments missing consolidated features need a separate reviewed upgrade; the admin migration below does not install those features.

Historical migrations and down scripts were retired on 2026-09-22 after consolidation and local verification. Their historical contents remain recoverable in Git. New database changes must ship a standalone incremental migration for existing deployments and update the complete baseline and changelog for fresh setups. Configuration-release recovery in Admin remains available; it is unrelated to removed schema rollback scripts.

For **Delete draft** in Admin, run [202609220004_admin_release_management.sql](migrations/202609220004_admin_release_management.sql) in full in the Supabase SQL Editor. It requires the existing admin/config-release schema, is safe to reapply, and does not delete any drafts when installed. No manual extraction from the complete installer is needed. It installs permission-checked discard and serializes publication with release writes. Deleted drafts are retired with no version number and hidden from Releases; their rows/assets and audit trail are retained. Published and previously published releases cannot be discarded. The UI change comparison uses existing read APIs and needs no database update.

For the **Snacks** and **Gift** quick-cost categories, run [202609220005_quick_cost_categories.sql](migrations/202609220005_quick_cost_categories.sql) in full. It only extends the existing cost-category enum and is safe to reapply.

## Verification

On an isolated test project, run the SQL tests after both setup phases:

- `tests/001_schema_smoke.sql`: schema, catalogues, RLS, grants and core trigger invariants.
- `tests/002_push_smoke.sql`: push privileges, recipients and reminder lifecycle; sends no HTTP.
- `tests/003_personal_documents_smoke.sql`: owner-only access and personal/trip boundaries.
- `tests/004_planning_items_smoke.sql`: Planning, Moments and archive associations.
- `tests/005_activity_moments_smoke.sql`: Moment schema and RLS.
- `tests/006_current_features_smoke.sql`: current feature columns, RPC access, activity timing triggers and quick-cost categories.
- `tests/007_admin_releases_smoke.sql`: admin-only draft discard, retained audit data, published/history protection and publication after discard.

These tests roll back their fixtures; they are not rollback/deployment scripts. Local verification executes the complete installer and these tests in PGlite with minimal Supabase Auth/Storage schema stand-ins. Hosted Auth, Storage APIs and delivery still require deployment acceptance checks.

Files under `diagnostics/` are opt-in, read-only investigations. They may expose account/trip details in results and must never run as part of installation.
