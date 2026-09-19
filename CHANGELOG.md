# Changelog

User-visible changes are listed newest first. The HLD, LLD, and feature catalog are the current design contract; this file records history, including superseded experiments. This initial changelog covers the September 19 enhancement batch, not every earlier commit.

## Unreleased — Expense traveler scope

- Event costs now default to the event's selected travelers, not every traveler in the trip, with expense splitting either on or off. Explicit custom cost participants remain available when splitting is enabled.
- Existing expense participants can be edited even when the trip-wide splitting setting is off. Added an editor-only “Edit travelers” shortcut in expense details; an empty selection is rejected and selected travelers share the cost equally on save.
- Existing saved expenses are not automatically reassigned; review and edit previously incorrect participant lists.

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

## Proposed — Not shipped

- Opt-in Web Push using device subscriptions, a protected Supabase scheduled sender, server-held VAPID credentials, and notification handling in the PWA worker.
- Requires separate implementation, security review, deployment, and device testing. No push sender or scheduler is currently enabled by this repository. Offline receipt, expiry, OS/browser restrictions, and backend pausing must be accounted for.
