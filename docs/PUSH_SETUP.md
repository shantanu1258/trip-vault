# Web Push deployment

Status (2026-09-20): the project owner reports that the migration and SQL smoke test
both succeeded, and deployment output confirms both functions on project
`lutcaijkahflcdhazqjt`. Unauthenticated POST checks against both functions returned
HTTP 401. The owner confirmed an authenticated test notification arriving on their
phone after correcting `VAPID_SUBJECT`. Automatic Cron delivery and destination
behavior remain pending verification. The temporary test-send button has been removed;
the protected backend diagnostic endpoint remains. Applying the migration does not
enable any job; in-app alerts remain independent.

## Remaining steps for this deployment

### September 23: specific change notifications and early journey reminders

Existing projects with Web Push installed must apply `supabase/migrations/202609230001_push_change_details.sql`, then redeploy `push-dispatch` and deploy/reload the frontend (including its service worker). The complete setup already includes the change for fresh projects. This migration is safe to reapply and does not send notifications or enable Cron. No change to secrets or the `push-test` deployment is required.

For the five-day flight/bus heads-up, also apply `supabase/migrations/202609230002_journey_early_reminders.sql` after that migration, before redeploying the sender. The existing Reminders preference controls both stages. Each timed departure gets at most one early reminder per device, queued when it is five days away, with a 24-hour catch-up/expiry window; journeys already less than four days away do not get late early-reminders. One-hour reminders keep their existing occurrence keys. Rescheduling, cancelled/done/skipped events, removed membership and opt-out invalidate pending reminders. Messages use the journey name and exact departure-local date/time rather than claiming an exact countdown after delivery delays. These are best-effort push notifications, not alarms.

On an isolated test trip with opted-in devices, test a timed flight and bus five days away, then invoke the existing dispatcher/Cron. Verify named heads-ups, no repeat on the next run, opt-out, and reschedule/cancellation suppression. Preserve a separate one-hour test. SQL smoke fixtures cover these windows without waiting five days or sending real pushes; real-phone verification is still pending.

New change jobs capture the action (created, updated, restored), item/trip names, changed fields and a small allowlisted before/after snapshot at write time. Messages identify the record and show up to three changes, with a remaining-change count. Amounts respect currency precision; explicit event/booking times use the record's time zone. Untimed ordering timestamps are not presented as appointments. Notes, references, contact data and arbitrary booking details are not copied into the push snapshot; only their field-change labels may appear. Names, amounts and times can appear on the lock screen; Profile explains this. Pre-migration jobs retain generic copy rather than guessing a past action. Newly queued reminders have journey/event names and departure-local times.

Local checks cover the fresh baseline, incremental migration/retry, SQL authorization and immutable snapshots, sender payloads, worker copy/deep links and currency/time formatting. After deployment, use two consenting test members: create and update a named event/expense, change an amount/time/status, and verify the recipient's notification wording and tap target. Verify the author gets no change push and opting out still suppresses delivery. Real-phone acceptance has not been performed for this change.

1. Ensure Cloudflare has `VITE_PUSH_ENABLED=true` as a **build** variable and that the
   notification-enabled commit finishes deploying. Update/reload the app, then use
   Profile → Notifications → Enable. On iOS use the installed Home Screen app.
   The manual phone delivery check already succeeded for this deployment.
2. In Supabase, enable Integrations → Cron (`pg_cron`) and Database → Extensions →
   `pg_net`. Enabling these alone does not schedule delivery.
3. In Supabase Vault, add `push_project_url` with value
   `https://lutcaijkahflcdhazqjt.supabase.co`, and `push_dispatch_secret` with the exact
   value of the existing `PUSH_DISPATCH_SECRET` function secret. These are separate
   stores. Never paste the secret into chat, Git, or screenshots.
4. Only after the device test succeeds, copy `supabase/push_cron.sql` into SQL Editor
   and run it. In Cron, confirm `trip-vault-push-dispatch` is active every minute.
   Check its history and the `push-dispatch` function invocation status (HTTP 200).
   A successful Cron enqueue alone does not confirm successful HTTP delivery.

The full repeatable setup follows; do not rerun the completed one-time migration.

## What this version does

- Per-device opt-in and category switches in Profile; up to ten subscriptions/account.
- Specific change text includes item/trip names and safe field summaries; amounts and times may appear on the lock screen. Notes, references and contact details stay excluded. Older queued jobs and reminders retain generic text.
- Other active trip members receive timeline event additions/changes, booking-detail
  updates, and expense additions/changes. The person making the edit is excluded.
- Devices opting into reminders get one occurrence within the hour before a timed
  event. Date-only, all-day, unscheduled, inferred relative times, cancelled and done
  events are excluded. This is not yet a task/visa/manual-reminder push engine.
- Event/reminder taps reveal and highlight the precise timeline card; booking taps
  open booking details; expense taps open that expense. Sign-in preserves the URL.
- Offline changes only affect server notifications after sync. Delivery is best effort,
  not an alarm. An app resumed late may receive a reminder with less than an hour left.

## 1. Secrets (already prepared by the project owner)

Edge Functions → Secrets:

| Name                   | Value                                                         |
| ---------------------- | ------------------------------------------------------------- |
| `VAPID_PUBLIC_KEY`     | The public key supplied for this app                          |
| `VAPID_PRIVATE_KEY`    | Matching private key                                          |
| `VAPID_SUBJECT`        | `mailto:` with a real contact email                           |
| `APP_URL`              | `https://trip-vault.shantanu1258.workers.dev`                 |
| `PUSH_DISPATCH_SECRET` | Independently generated random secret, at least 32 characters |

The functions also use Supabase's injected `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`. Do not copy the service-role key into browser variables.
The VAPID public key is bundled in `src/features/notifications/config.ts`; only the
public key may be overridden using `VITE_VAPID_PUBLIC_KEY`.

## 2. Install and verify the database

New projects use `supabase/TRIP_VAULT_COMPLETE_SETUP.sql` once. Push tables, RLS and RPCs are included; there is no additional push migration. Run `supabase/tests/002_push_smoke.sql` on an isolated project. It rolls back fixtures, sends no HTTP, and checks privileges, recipients, stale reminders and rate limiting.

For an existing database missing push support, back up and review only `SECTION: WEB PUSH` in the installer through its `commit`, before `SECTION: COST DOCUMENT ASSOCIATION`. Do not rerun the installer or that section if already applied. Database support does not enable delivery by itself; continue with the deployment steps below.

## 3. Deploy the two functions

From the repository checkout on a personal machine or trusted cloud terminal:

```bash
npx supabase login
npx supabase functions deploy push-dispatch --project-ref YOUR_PROJECT_REF --use-api
npx supabase functions deploy push-test --project-ref YOUR_PROJECT_REF --use-api
```

For a trusted cloud Bash terminal, instead of browser login, read a personal access
token privately into the environment with `read -rsp "Supabase access token: " SUPABASE_ACCESS_TOKEN`
then `export SUPABASE_ACCESS_TOKEN`. The deploy commands work without interactive
browser login or Docker. After deployment, `unset SUPABASE_ACCESS_TOKEN`; revoke a
temporary access token in Supabase when it is no longer needed.

`supabase/config.toml` disables the platform JWT gate for these two functions only.
This is NOT anonymous sending: `push-dispatch` explicitly verifies `x-push-secret`;
`push-test` verifies a real user JWT with Auth, checks device ownership, restricts
Origin, and rate-limits atomically. Never deploy placeholder functions with this config.

Call the dispatch URL without credentials and verify HTTP 401 before enabling Cron.
Check function logs without logging credentials, full endpoint URLs, or subscription keys.

## 4. Deploy the frontend and test a device

Add `VITE_PUSH_ENABLED=true` in the frontend BUILD environment (Cloudflare's build
variables, not only Worker runtime bindings), then rebuild/deploy normally. Leave
the flag false until the migration and functions are ready. The public-key override
is optional for this deployment because the supplied public key is already bundled.

Reload and accept the PWA update when no forms are being edited. The existing
generated Workbox service worker imports `/push-worker.js`; its caching and update
prompt remain intact. Profile → Notifications → Enable registers the device and
exposes category preferences. There is no test-send button in the normal app.
The authenticated `push-test` endpoint is retained for operator diagnostics; its
success means the provider accepted delivery, not proof it was shown on a device.

Use HTTPS. On iPhone/iPad, use the installed Home Screen app, then tap Enable.
Permission denial must be reversed in browser/OS settings. Do not use random online
key generators. Keep private keys out of chat, Git, browser bundles and screenshots.

## 5. Enable the dispatcher after the test succeeds

Supabase → Integrations → Cron: enable Cron. Enable `pg_net` if necessary.
In Supabase Vault, create two separate entries:

- `push_project_url`: your **Supabase project** HTTPS URL, not the app URL.
- `push_dispatch_secret`: the exact value already stored as `PUSH_DISPATCH_SECRET`.

Function secrets and Vault are different stores; the scheduler cannot read function
environment variables. Then run `supabase/push_cron.sql` in SQL Editor. It schedules
one run per minute, not one Cron job per notification. Change notifications can take
roughly a minute plus delivery delay. Check both Cron run history and Edge Function
logs: successful HTTP enqueue is not proof that a push was delivered.

## 6. Release acceptance (automatic delivery still pending)

With Cron running, create an exact-time event starting 30 minutes from now, wait
for sync, then background the enabled app. A reminder should arrive on a subsequent
minute tick (delivery may be delayed); tap it to verify the timeline destination.
To test changes, use a different active member's account to add/edit an event and
an expense. Edits never notify their author, including that author's other devices.

- Two accounts/devices: one changes an event/cost; only the authorized other account
  receives a change push. Each device respects its category switches.
- Tap with app closed, open, and signed out: event is centered/highlighted, expense
  opens, login continues to the destination. Existing unsaved desktop tabs are not
  forcibly navigated; the handler asks the browser to open a destination window.
- Collapse dates/apply filters before tapping: the correct timeline target is revealed.
- Reschedule/complete/delete an event and revoke membership before dispatch; stale jobs
  are cancelled. A message already handed to the push provider cannot be recalled.
- Sign out: browser subscription is invalidated and its server row deleted when reachable.
- Block permission, revoke the subscription, test denied permission, and test 404/410
  cleanup. Disable this device from Profile to stop deliveries.
- Real Android and installed iOS PWA checks, including delayed/offline delivery and TTL.
- Recheck installed-PWA offline shell caching and update prompt after the worker update.

## Troubleshooting test delivery

A device can be registered and ready while sending still fails. The test-attempt
cooldown starts before contacting the push provider, so a failed attempt can be
followed by a 429 for one minute. Wait before testing again; do not reset the limiter.

The updated `push-test` returns a safe JSON `code` and message, and logs only a fixed
stage/code on exceptions. Redeploy the function (including all `_shared` files) to
receive these diagnostics; an old deployment returns only a generic HTTP 500.
Share only the response code/message, never copied authorization headers or keys.

- `device_missing` (404) or `device_expired` (410): disable and re-enable notifications
  on that device. These are not temporary cooldowns.
- `test_cooldown` (429): wait one minute after the last attempt.
- `missing_vapid_*` / `invalid_vapid_*`: review the named function secret. Do not
  regenerate keys casually; browser subscriptions use the existing public key.
- `push_request_failed`: signing or encryption failed; investigate runtime/library
  compatibility and subscription data without logging raw errors or credentials.
- `push_network_failed`: the function could not reach the browser push service.
- `push_provider_rejected` / `push_provider_unavailable` (502): the provider refused
  delivery or is temporarily unavailable; a rejected request warrants checking the
  matching VAPID pair and contact subject, not assuming a device quota issue.
- `database_failed`: check that the notification migration is applied and accessible.

Keep Cron disabled until an authenticated test actually arrives on a real device.
Local mocked-handler tests do not verify Supabase's crypto runtime or provider delivery.

## Security and operational boundaries

`push_jobs` has no browser grants. Subscription RLS allows only its owner to read/delete
and update the three preference columns; registration is validated/rate-bounded by RPC.
The sender rechecks membership, source existence, category preferences and reminder
time/status before every send. Current trip events/bookings/costs are member-readable;
if private expenses or narrower event RLS are introduced, update recipient authorization
before enabling pushes for those new private rows.

Endpoint hosts are restricted to known browser push providers, HTTPS only, no credentials
or custom ports, and HTTP redirects are forbidden. Newly supported browser providers
must be reviewed and added to both registration validation and the sender allowlist.

Jobs use `FOR UPDATE SKIP LOCKED`, five-minute leases, a lease token on completion,
unique occurrence/device IDs, up to five attempts, exponential retries, source-specific
expiry and 30-day history cleanup. Delivery is at-least-once: a crash after provider
acceptance can cause retry; a stable notification tag replaces duplicate displays.
Expired subscriptions are removed on 404/410. Test sends are limited to once per minute.
There is no guarantee of exact-time delivery, unlimited free-tier usage, or delivery
while the backend is paused.

Emergency stop: unschedule `trip-vault-push-dispatch` using the statement at the bottom
of `supabase/push_cron.sql`. Disable subscriptions if stopping test sends as well.
Turning off only the frontend flag does not stop an already-running server scheduler.

Sources: [Supabase scheduling](https://supabase.com/docs/guides/functions/schedule-functions),
[function authentication](https://supabase.com/docs/guides/functions/auth),
[Web Push library](https://github.com/web-push-libs/web-push),
[Apple Home Screen Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).
