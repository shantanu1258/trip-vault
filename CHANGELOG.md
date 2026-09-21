# Changelog

## Unreleased — Document ordering and activity booking timing

- Added compact up/down controls beside document unlink actions, scoped to each traveller section; booking-inherited documents can also be ordered.
- Corrected offline document ordering to queue updates against the link's composite key, with pending-link dependencies.
- Timeline document shortcuts now capture scroll at click time. Returning restores instantly, preserves document section expansion, and no longer overwrites the saved position during route cleanup.
- Activity bookings inherit their event time zone, including untimed activities. The booking editor exposes the zone and starts from the linked event's timing.
- Added `202609220002_activity_booking_timing.sql` for atomic two-way activity/event timing synchronization. Existing unambiguous activity bookings are aligned to their active event; archived and non-activity records are excluded. Apply this migration before using the new activity editing flow.
- Offline activity timing caches mirror server synchronization. Complete setup includes the new migration for fresh projects.

User-visible changes are listed newest first. The HLD, LLD, and feature catalog are the current design contract; this file records history, including superseded experiments. This initial changelog covers the September 19 enhancement batch, not every earlier commit.

## Unreleased — Vault navigation and planning review

- Vault search, document type, traveler, and archived collection are URL-backed and survive opening a document and browser Back. Trip-document Back to trip is retained; personal previews stay within the personal Vault.
- Manual Vault uploads into a trip default to everyone signed into the trip for owners/editors. Personal files, incoming device shares, and users restricted to private uploads retain their private defaults.
- Day-plan timeline cards no longer prompt for a missing location; a supplied location and navigation link are still shown.
- Reviewed the pulled cab refinements and day-planning/activity-Moment additions. Moment costs are validated before saving to prevent accidental duplicate Moments on correction; offline packs include plan items and Moments, and planning-page query errors block editing incomplete data.
- Agenda reordering uses one permission-checked database transaction online, with stale-version checks; offline swaps chain dependencies and preserve incremented versions for subsequent edits.
- Follow-up migration `202609220001_planning_archive_integrity.sql` fixes optional planning links blocking permanent archive deletion, retains Moment costs during parent-event deletion, and validates cost/Moment parent consistency. It requires the two September 21 planning/Moment migrations first. Complete setup now includes all three for fresh projects. Installation does not delete any data.

## Unreleased — Trip archive recovery

- Brightened the wallet icon to the dark-mode mint brand colour for stronger app-list visibility, retaining the keyhole, partial plane, and brass clasp. All active icon references use new versioned URLs.
- The app brand, installed-app icons, browser favicon, Apple touch icon, and push notifications now use the cleaned wallet/keyhole mark with a partial plane and muted brass clasp. Versioned icon URLs and offline precaching carry the update; existing home-screen icons remain subject to platform refresh/reinstallation behavior.
- Archive rows keep the title/type and actions together with tighter spacing. Recover and Delete use accessible, 44 px icon buttons on phones, adding labels on tablet/desktop; permanent deletion still requires confirmation.
- Timeline landing highlights now blink twice over 2.3 seconds instead of three times over 3.5 seconds, retaining the existing focus colours and reduced-motion behavior.
- Archived tasks and notes now appear alongside archived events, bookings, and costs. Trip details shows an Open archive entry instead of exposing archived cards directly.
- Restore preserves a task's completion status. Permanent deletion is online-only, explicitly confirmed, and checked on the server for edit permission, trip ownership of the item, and archived state. Linked documents and costs survive event/booking deletion; scheduled dependents block deletion until unlinked. Vault retains its separate document trash.
- Requires `supabase/migrations/202609210001_archived_trip_items.sql` for permanent deletion. Applying this migration does not delete data. Records already physically absent from the database cannot be recovered by the archive UI.

## Unreleased — Vault and transport filters

- Common Vault trip documents use a 50/50 search-and-traveler row, followed by a rounded, horizontally scrollable type strip matching the trip-section shortcuts. Every type shows its count, with a distinct selected state; no Filters panel or overflow menu is needed. Category and traveler filters combine without silently clearing each other. Same-named travelers in different trips remain separate, and shared files match only within the focused traveler's trip. Personal documents remain separate and unchanged.
- Reservations and trip-detail summaries separate Trains, Buses, Ferries, and Cabs instead of Ground & water. Existing journey-filter links still work. Document categories use the linked reservation's mode when available, consistently across Vault, trip summaries, and trip-document filters; unlinked or unknown transport remains Other transport rather than guessing from filenames.
- Uses existing cached trip, traveler, and booking data; no migration or database changes required. Category counts reflect the traveler scope and current/deleted collection, before text search.

## Unreleased — Android share handoff

- Follow-up: accept attachments across multipart field names, including the old installed manifest, and distinguish absent attachments, link-only shares, and multiple files. Register PDF and image share fields separately with generic image MIME support; normalize supported image signatures. Native multipart regression tests cover these paths. Android installation/manifest refresh and real-device retesting are still required; this is not yet a confirmed device fix.
- Hardened incoming Android PDF shares by copying source bytes before redirect, normalizing PDF MIME aliases/parameters, and recognizing PDF bytes when the sender omits the filename/type. Failed or missing handoffs now show an explanation above the picker; a later failed share cannot retain an earlier attachment. An 800 kB synthetic file is covered end-to-end in handoff tests; real Android acceptance remains pending.

## Unreleased — Navigation and unsaved events

- Document cards in Trip details and the full trip-document list capture their scroll position before opening a file. Back restores the clicked card; the document list retains search/category/traveler filters in its URL. “View all documents” also preserves the originating section.
- Add event warns before discarding entered fields, picker changes, route connections/stops, or a selected attachment. Keep editing preserves the in-memory form; Discard and leave confirms loss. This covers form Back, changing type, backdrop/Escape, and routed browser Back. Pristine forms and successful event saves do not prompt. Browser-supported reload/tab-close warnings protect unsaved forms; there is no draft/autosave persistence yet.
- The app now uses React Router's data-router host for supported navigation blocking while keeping its existing lazy routes. A pending save cannot be dismissed before its result is known.

## Unreleased — Document download and device sharing

- Event attachments now have a clear Documents heading and compact traveler groups with adjacent counts. Tighter card padding and a bottom-right unlink action give full titles more room without the old full-height action column. The full document card, including its purpose and visibility badge, opens the file; unlink remains a separate confirmed action with a 44 px target.
- Trip-document viewers and personal-document previews now expose Download and Share actions: accessible icons on phones, with text labels on tablet/desktop. Trip viewer Open and Details actions use the same compact treatment.
- Open keeps its text label on phones too, making the device viewer easier to find when a document needs closer inspection or zooming.
- Share passes the already-loaded file and its original filename to the device share sheet, never a private route or signed storage URL. Unsupported browsers/file types show a Download/Files fallback; cancellation is silent and failures are retryable. Sharing a copy does not change Vault visibility. Native recipient delivery still needs device acceptance testing.

## Unreleased — Route bundle optimization

- Feature screens now load through route-level dynamic imports; welcome/sign-in, authentication guards, and startup services remain immediately available. Added an accessible loading state and explicit reload/home recovery for failed screen loads without clearing saved data.
- Production main JavaScript bundle reduced from 938.88 kB (235.88 kB gzip) to approximately 289.65 kB (72.39 kB gzip); all emitted chunks are below the existing 500 kB warning threshold. These are build sizes, not measured device startup timings.
- Workbox still precaches all screen chunks for offline navigation. Total installed cache/download size is not reduced by the same percentage; the improvement is less JavaScript needed upfront for a given screen.

## Unreleased — Personal documents and incoming shares

- Vault now separates trip documents from owner-only personal documents. Add a passport, Aadhaar, insurance, or other PDF/image without a trip, with a name and optional label; preview, download, retry pending uploads, and explicitly delete personal files.
- Personal metadata travels with the existing account-owned upload/outbox operation. Personal originals cannot be associated with a trip; sharing requires an intentional separate upload. Storage reads enforce the same boundary.
- Installed Android PWAs can receive one PDF/JPEG/PNG/WebP under 5 MB via the system share sheet. The app opens a review screen with Personal documents or a selected trip; trip imports start as Only me. No cloud upload happens until Save.
- Incoming shares use a bounded local handoff cache, expire after 15 minutes, and are removed on Save, Cancel, or sign-out. Unsupported platforms retain manual upload.
- Apply `202609200003_personal_documents.sql` before personal-document cloud saves. SQL smoke checks and real Android share-sheet delivery still need deployment verification.
- Vault document rows use smaller icons, tighter padding, and smaller full-wrapping titles without removing metadata.
- Trip and Vault document lists use muted slate/teal folded-page outlines with small event-colored type symbols inside; personal files keep their document-type symbol. Compact category count chips wrap with consistent gaps, and trip document rows retain full titles and visibility badges with tighter spacing.

## Unreleased — Expense connections

- Expense details show a compact, clickable event-colored card in “Connected to”: event name and date, with a small chevron and a faint animated event silhouette. It links to flight/booking details or the exact timeline event, without repeating references or status.
- Standalone new expenses and previously unlinked expenses can optionally select an event or a Vault document, never both. Receipt uploads reuse the Vault document form and retain its visibility controls; cancelling an expense does not delete an uploaded document.
- Selecting an event for a new expense starts its split with that event’s travelers. Editing an expense preserves its existing traveler selection.
- Payment status and Paid by share one row at phone, tablet, and desktop widths.
- Cost details show included travelers without per-person amounts when the trip's expense splitting is off. Turning splitting on restores the amounts; stored shares and the overall expense total are unchanged.
- Migration `202609200002_cost_document_association.sql` adds the receipt link, same-trip/access checks, and the mutually exclusive association constraint. Apply it before testing document-linked expense saves.
- Daily overdue/readiness push rules remain a proposal, not an implemented feature.

## Unreleased — Update prompt recovery

- The explicit “Reload and update” action now handles waiting/installing service workers and stale prompts whose update already activated, then reloads after activation.
- Added an “Updating…” state, duplicate-click protection, and a bounded wait with an actionable retry message. No site data, caches, registrations, or push subscriptions are cleared; no automatic reload timer was added.
- Automatic overdue/daily-summary push notifications remain a proposal, not an implemented feature.

## 2026-09-20 — Retire temporary testing controls

- Removed the Profile test-notification button and its unused browser API call; device opt-in, event/expense/reminder preferences, and disabling notifications remain available.
- Removed the temporary permanent-delete-trip control and confirmation field. Normal Archive, Recently deleted, and restore flows are unchanged; no trip data was deleted by this change. Existing backend purge/storage-cleanup infrastructure is retained.
- The owner confirmed an actual phone notification after correcting `VAPID_SUBJECT` to a valid contact URI. Automatic Cron delivery and notification destinations still await real-device acceptance.
- The authenticated, rate-limited backend test endpoint remains available for operator diagnosis, without a normal-app control.
- Verification: 694 tests across 107 files passed with two workers, and the push-enabled production build passed. The default-concurrency run hit the existing 5-second international-bus form timeout; no test timeout or assertion was relaxed.

## 2026-09-20 — Push test diagnostics

- Distinguish a missing device (404), expired subscription (410), and one-minute test-attempt cooldown (429), including when the previous attempt failed.
- Return fixed, safe diagnostic codes for test configuration, storage, signing/encryption, network, and provider failures, without forwarding raw provider errors or credentials.
- Ignore failures to discard a provider response body after delivery; they must not turn an accepted send into a reported failure.
- These changes identified the reported HTTP 500 as an invalid `VAPID_SUBJECT`; the owner corrected the secret and confirmed delivery. No migration or rate-limit reset was required.

## Unreleased — Expense traveler scope

- Event costs now default to the event's selected travelers, not every traveler in the trip, with expense splitting either on or off. Explicit custom cost participants remain available when splitting is enabled.
- Existing expense participants can be edited even when the trip-wide splitting setting is off. Added an editor-only “Edit travelers” shortcut in expense details; an empty selection is rejected and selected travelers share the cost equally on save.
- Existing saved expenses are not automatically reassigned; review and edit previously incorrect participant lists.

## 2026-09-20 — Opt-in Web Push

- Added per-device notification consent, category preferences, test delivery, and revocation in Profile, behind `VITE_PUSH_ENABLED` (off by default).
- Added owner-scoped subscriptions, a protected delivery queue, event/booking/expense change triggers, and one-hour timed-event reminders. Private VAPID credentials stay on the server; lock-screen messages contain no trip details.
- Added authenticated test and secret-protected dispatch functions, bounded retries/expiry, membership rechecks, and a separate opt-in Cron script. Applying the migration does not start delivery.
- Notification links reveal/highlight a timeline event, open booking details, or open a specific expense; existing generated-worker offline caching is preserved.
- Added [deployment instructions](docs/PUSH_SETUP.md) and a rollback-only SQL smoke test. The owner reports both SQL scripts succeeded, and deployment output confirms both functions. Unauthenticated POST checks returned HTTP 401; authenticated delivery, real-device behavior, and Cron execution remain **unverified**.
- Verification: **690 tests across 105 files passed**, plus production TypeScript/build/PWA generation. These include 13 push-policy, worker, subscription, and destination tests and three cost-scope regressions beyond the test-cleanup baseline below.

## 2026-09-20 — Test-suite maintenance

- Replaced the 81-case silhouette matrix with 11 focused tests: all-type decorative artwork, representative animation branches, mount/rerender/collapse cleanup, reduced motion, and browsers without the animation API. Removed simulated viewport permutations that did not exercise any viewport-dependent code.
- Reduced Booking page tests from 52 to 30 by removing repeated border-style assertions and sampling shared edit/navigation behavior. Retained the distinct edit-label branches, location variants, permissions, data, and journey workflows.
- Removed a CSS-text pulse snapshot and a chevron-class test; retained scroll settlement, destination placement, pulse cleanup, reduced-motion logic, and actual expand/collapse behavior.
- Replaced selected cosmetic Tailwind assertions with accessible-name, document-link, and route assertions. Responsive geometry, exact appearance, and visual pulse timing remain browser-QA checks, not claims made by JSDOM tests.
- A second pass removed 15 redundant cases: checked ten event-type document defaults within their existing form workflows instead of separate mounts, removed two admin smoke cases already exercised by catalog workflows, and retained one launch-boundary routing check instead of four eligible-date permutations. All eleven document defaults remain checked; calendar/timezone boundaries remain in the presentation tests.
- Replaced additional document-row and admin layout-class assertions with full accessible names, correct destinations, separate actions, and navigation presence. These tests no longer claim to verify responsive geometry in JSDOM.
- A third pass removed 15 more overlapping cases: one presentation contract per booking type now checks exact schedule labels and countdowns (including three previously unchecked countdown types), with representative hotel/generic page checks. Removed duplicated search-alias, visibility-label, synthetic-start, and booking-action checks already covered by richer tests. Replaced two modal CSS-only cases with a content-editing/Back interaction test.
- No runtime code, dependencies, or test timeouts changed; distinct data-safety scenarios remain covered. No tests were skipped or disabled to reduce the count.
- Verification: **674 tests across 102 files passed** (798 → 704 → 689 → 674, a net reduction of 124); production build including TypeScript and PWA generation passed. The latest full-suite run took 26.06 seconds while the build ran concurrently; the benefit is reduced duplication and maintenance, not a claimed speedup.

## 2026-09-19 — Documentation reconciliation

- Reconciled the HLD, LLD, and feature catalog with the implementation through `7cdd785`.
- Replaced obsolete separate-Agenda, Home-launch, below-header/two-pulse focus, and collapsed-card silhouette descriptions.
- Recorded contextual Back/scroll restoration, event identity, documents-first details, responsive actions, contacts, INR formatting, and dark-mode hero behavior.
- Marked Web Push and Supabase scheduling as proposed and not deployed; existing in-app alerts remain implemented.
- Re-ran the application suite: **798 tests passed across 102 files**. No application, database, secret, or deployment configuration changes in this documentation batch.

## 2026-09-19 — Theme, navigation, and currency

Implementation: `7cdd785`; preceding highlight/theme regression coverage: `080da96`.

### Changed

- Dark-mode trip header now uses light teal with dark title, metadata, and actions, matching the primary action treatment.
- INR amounts use Indian lakh/crore grouping, such as ₹3,75,525.00; other currencies retain locale formatting.
- Next up and current-event jumps center the destination heading between the sticky bars and bottom controls.
- Landing feedback starts after scrolling settles and flashes a stronger border/outline three times over 3.5 seconds, including readiness tasks. Reduced motion remains respected.

### Fixed

- Fresh target/current/search navigation no longer loses to stale saved return positions.
- Current-event navigation reveals its collapsed date/card before positioning.
- Genuine Back/return navigation continues restoring its original card offset.

### Verified

- Full application tests and production build passed at `7cdd785`; existing chunk-size and mixed-import advisories remain.
- Read-only 375×812 browser checks verified the inverted hero, INR total, Next up landing, and current-task highlight. This does not certify remote deployment or installed-PWA/offline delivery.

## 2026-09-19 — Event identity and search

Implementation: `f3a4c47`.

- Kept compact colored event icons in timeline headers, with bed icons for hotels and top-right disclosure chevrons.
- Added bottom-right decorative silhouettes to expanded summaries, modals, and event-colored detail heroes: 80% height for expanded booking summaries and 50% elsewhere.
- Added consistent one-shot motion across phone/tablet/desktop: diagonal flight entrance, left-to-right transport, rising hotel sun, rotating activity wheel, and opening meal lid.
- Preserved labels, contrast, independent actions, and reduced-motion support; artwork is decorative and ignores pointer input.
- Removed experimental event-colored timeline borders. Ordinary cards remain neutral; the active event has a consistent accented double stroke/outline and trailing NEXT/NOW badge, while active tasks retain amber TO DO.
- Added event-type labels, plurals, and aliases to event/booking search.
- Full suite at this checkpoint: 791 tests across 101 files; build passed.

## 2026-09-19 — Booking, contact, and document details

Implementation: `28a81fe`, `73c5967`.

- Added consistent type-specific booking heroes, schedule/reference sections, hotel days/nights and room/guest details, accessible secondary disclosures, linked costs, and visible cab stops.
- Moved role-gated typed Edit actions beside Back and exposed location navigation from summaries.
- Added hotel-host and cab-driver names/numbers plus Call/WhatsApp to the opening event modal.
- Made summary shortcuts icon-only on phones and labeled on larger screens, with accessible names and tooltips.
- Replaced arbitrary in-app history-back behavior with explicit nested origin destinations and card-position restoration, including timeline → modal → booking and reservation-list paths.
- Added shared event-type choices to timeline filters.
- Put existing documents before smaller upload/attach actions; promoted those actions in empty states and retained traveler/access grouping.
- Reworked multi-page PDF viewing into a vertical lazy-rendered stack with zoom, fit, supported fullscreen, and per-page retry.

## 2026-09-19 — Compact Trips-first experience

Implementation: `dc44af4`.

- Simplified primary navigation to Trips / Vault / Profile; legacy Home/Add routes redirect to Trips.
- Fresh root entry opens only one unambiguous trip in its ten-day pre-departure launch window; overlapping trips require selection.
- Unified Timeline and Agenda into expandable date groups, with draft filters, independent date/card expansion, session-local presentation state, and compact task rows.
- Added compact in-app notification and readiness surfaces, task deep links, responsive sticky navigation, progressive form sections, and bundled DM Sans typography.
- Kept existing schema, authorization, offline, and synchronization boundaries. Later entries above supersede intermediate styling and focus experiments from this batch.

## Pending release acceptance

- Web Push functions have been deployed and reject unauthenticated requests; the owner reports successful migration/smoke SQL. Authenticated delivery, real-device and scheduled-send checks remain release gates. Offline receipt, expiry, OS/browser restrictions, and backend pausing prevent guaranteed delivery.
