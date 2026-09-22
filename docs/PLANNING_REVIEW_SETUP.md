# Planning and activity Moments review

Planning, activity Moments, archive integrity and ordering are included in `supabase/TRIP_VAULT_COMPLETE_SETUP.sql`. The separate migration and down files are retired. New projects need only that installer; existing projects must back up and review only missing sections, in dependency order, following `supabase/README.md`. Do not rerun the full installer on an existing database.

Review fixes cover document filter history, default trip-upload visibility, optional day-plan locations, pre-save Moment cost validation, offline agenda caching and ordering, atomic online ordering, and archive deletion of linked planning/activity records. Personal previews do not expose trip navigation. Device share imports still begin private and require review before saving.

Local PostgreSQL checks reproduced the previous archive-link failure and verified migration reapplication, cost retention, source-link cleanup with archived parents, same-trip/parent validation, atomic swaps, rollback after a forced mid-swap failure, and stale-version rejection. Production migrations and real-device/offline acceptance must still be verified on the deployed app.
