# Supabase database setup

`TRIP_VAULT_COMPLETE_SETUP.sql` is the **only database installer**. It contains the complete schema, functions, grants, RLS, Storage policies, push database support, personal Vault, expense-document links, Planning, activity Moments, archive recovery/deletion, activity timing and booking-document detachment. The dated changelog is at the top of that file.

## New projects

Run the whole file once in the Supabase SQL Editor on a blank project. No migration files need to be applied afterward.

- **Phase 1: current schema** creates every application database object.
- **Phase 2: admin-gated catalogue publication** publishes 103 airports, 27 airlines and 9 booking vendors only when an active `public.app_admins` row backed by `auth.users` exists. On a blank project it safely defers, leaving the schema installed.

Create the dedicated Auth administrator and bootstrap its active `app_admins` row through trusted SQL. Then run **only** the statements between `PHASE 2 BEGIN` and `PHASE 2 END`. Catalogue publication is safe to retry; it records its administrator in the audit trail. The full installer refuses to run if `public.trips` already exists.

Supabase Auth/Storage platform schemas are supplied by Supabase. Edge Functions, secrets and optional Cron delivery are infrastructure, not database schema: follow [PUSH_SETUP.md](../docs/PUSH_SETUP.md) to enable notification delivery. Installing this SQL alone does not send notifications or schedule jobs.

## Existing projects

Do **not** rerun the installer or delete/reset your database. Back up first, compare the deployment with the changelog, and apply only reviewed missing SQL sections in dependency order. Deployments missing the latest unlink function can run just `SECTION: BOOKING DOCUMENT DETACHMENT` through the following grant, before `PHASE 1 END`.

The standalone migrations and down scripts were retired on 2026-09-22 after consolidation and local verification. Their historical contents remain recoverable in Git. Future schema changes should update this single baseline and its changelog, with explicit targeted upgrade instructions for existing deployments. Configuration-release recovery in Admin remains available; it is unrelated to removed schema rollback scripts.

For **Delete draft** in Admin, apply only the transaction between `SECTION: ADMIN RELEASE MANAGEMENT` and `END SECTION: ADMIN RELEASE MANAGEMENT`. This installs permission-checked discard and serializes publication with release writes. Deleted drafts are retired with no version number and hidden from Releases; their rows/assets and audit trail are retained. Published and previously published releases cannot be discarded. The UI change comparison uses existing read APIs and needs no database update.

## Verification

On an isolated test project, run the SQL tests after both setup phases:

- `tests/001_schema_smoke.sql`: schema, catalogues, RLS, grants and core trigger invariants.
- `tests/002_push_smoke.sql`: push privileges, recipients and reminder lifecycle; sends no HTTP.
- `tests/003_personal_documents_smoke.sql`: owner-only access and personal/trip boundaries.
- `tests/004_planning_items_smoke.sql`: Planning, Moments and archive associations.
- `tests/005_activity_moments_smoke.sql`: Moment schema and RLS.
- `tests/006_current_features_smoke.sql`: current feature columns, RPC access and activity timing triggers.
- `tests/007_admin_releases_smoke.sql`: admin-only draft discard, retained audit data, published/history protection and publication after discard.

These tests roll back their fixtures; they are not rollback/deployment scripts. Local verification executes the complete installer and these tests in PGlite with minimal Supabase Auth/Storage schema stand-ins. Hosted Auth, Storage APIs and delivery still require deployment acceptance checks.

Files under `diagnostics/` are opt-in, read-only investigations. They may expose account/trip details in results and must never run as part of installation.
