# Changelog

User-visible changes are listed newest first. The HLD, LLD, and feature catalog are the current design contract; this file records history, including superseded experiments. This initial changelog covers the September 19 enhancement batch, not every earlier commit.

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
