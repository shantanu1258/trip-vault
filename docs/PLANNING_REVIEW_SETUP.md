# Planning and activity Moments review

For an existing Supabase project, apply these migrations in order if not already applied:

1. `202609210002_planning_items.sql`
2. `202609210003_activity_moments.sql`
3. `202609220001_planning_archive_integrity.sql` (new follow-up)

Run them in the Supabase SQL Editor. Do not rerun complete setup on an existing project. The follow-up installs validation/ordering functions and triggers; it does not delete or rewrite existing records. Without it, agenda reordering reports a migration-required error rather than performing a partial swap.

The complete setup includes all three for new projects. The earlier archive migration must also be present on existing projects, as before.

Review fixes cover document filter history, default trip-upload visibility, optional day-plan locations, pre-save Moment cost validation, offline agenda caching and ordering, atomic online ordering, and archive deletion of linked planning/activity records. Personal previews do not expose trip navigation. Device share imports still begin private and require review before saving.

Local PostgreSQL checks reproduced the previous archive-link failure and verified migration reapplication, cost retention, source-link cleanup with archived parents, same-trip/parent validation, atomic swaps, rollback after a forced mid-swap failure, and stale-version rejection. Production migrations and real-device/offline acceptance must still be verified on the deployed app.
