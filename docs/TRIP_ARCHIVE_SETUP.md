# Trip archive

Existing projects: run only `supabase/migrations/202609210001_archived_trip_items.sql` in the Supabase SQL Editor. It creates a permission-checked RPC and does not delete any data on installation. Do not rerun the complete setup for this change.

In Trip details, open **Archived trip items → Open archive**. Owners and editors can restore or explicitly confirm permanent deletion of tasks, notes, costs, events, and grouped bookings. Viewers can only read. Archive management requires a connection. Document recovery/deletion remains in Vault's Recently deleted collection.

Permanent deletion of an event/booking preserves its documents and costs but removes their links to the deleted item. Relative task/event dependencies block deletion; restore and reschedule/unlink those dependents first. Deleting a booking also removes its archived events and journey details. Restoring a task leaves its Done status unchanged.

## Investigating a missing task

Completion sets `status = 'complete'`; archive sets `deleted_at`. Neither action is intended to physically delete the row, including queued offline archives. The previous archive list omitted tasks and notes, which made soft-deleted rows inaccessible in the UI.

To check the reported trip without modifying anything, run:

```sql
select id, title, status, deleted_at, updated_at
from public.trip_requirements
where trip_id = 'f12a4d8b-2ca9-47b9-9b68-d76e870e3cdd'
order by updated_at desc;
```

Do not add `deleted_at is null` or a status filter to this diagnostic. If the task is truly absent, this UI cannot restore it. Its name/ID and an available backup or original task details are needed to investigate recovery; do not recreate it automatically or claim it has been restored.
