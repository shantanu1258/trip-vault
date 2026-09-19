---
title: "Trip Vault Application Review"
description: "Compact review findings and verification handoff for later fixes."
scope: [service-wide]
agents: [coder, reviewer]
tags: [review, bugs, acceptance]
last_verified: 2026-09-19
---

# Application review — 19 September 2026

Review against commit `896b31d`: **13 prioritized findings**, plus documentation reconciliation and remaining acceptance checks. This is a findings backlog, not a replacement for the [feature catalog](FEATURES.md), [HLD](HIGH_LEVEL_DESIGN.md), or [LLD](LOW_LEVEL_DESIGN.md). No application fixes have been applied.

## Verification and scope

- Local development server: `http://127.0.0.1:5173`, using Node 20.19.6.
- Browser: welcome/demo and authenticated walkthrough completed using the user's confirmed **demo profile**. A real personal account is unnecessary. The user supplied local configuration; no credentials or personal booking identifiers are recorded here.
- Full automated suite: **504 passed, 1 failed; 86 passing files, 1 failing file**. Flight test also fails in isolation (6 pass, 1 fail).
- Production build and TypeScript: passed during dependency setup immediately before this review. Application formatting: passed during this review.
- Five temporary characterization probes confirmed the draft isolation, cache overwrite, local-file integrity, modal focus, and alert-cache behaviors below. An isolated copy of the Flight test passed all 7 tests after changing only its synchronous lookup to an awaited lookup. Temporary probe files were removed; these are evidence, not permanent regression coverage.
- Reviewed routes, shared UI, auth/session boundaries, event/booking/traveler workflows, document storage, offline preparation, synchronization, alerts, expenses, configuration publishing, SQL policies/publication setup, and associated tests. This is a risk-based code review, not an exhaustive proof of every line or deployed policy.

### Authenticated browser coverage

The demo trip contained three travelers, six active reservations, seven timeline entries, six costs, two archived bookings, and no documents or readiness tasks. Forms were inspected without saving; no uploads, invitations, archive/delete actions, or account-setting changes were submitted.

| Area                                            | Observed result / limit                                                                                                                                                                        |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home, Trips, Create trip, global Add            | Navigation and entry forms rendered; new-trip dates defaulted coherently. Creation not submitted.                                                                                              |
| Timeline, agenda, search, traveler focus        | Date groups and weekday search opened the relevant event; traveler focus reduced reservations from six to five and was restored to Everyone.                                                   |
| Details, reservations, people, costs            | Read-first details, full reservation list, three travelers, and itemized expense shares rendered. No balance reconciliation against backend mutations.                                         |
| Flight, Hotel, Cab, Ferry                       | Connecting-flight navigation and arrival timezone/duration rendered; Cab stops and passenger details were accessible. Hotel exposed artificial times: R12.                                     |
| All eleven Add-event variants                   | Flight, Hotel, Activity, Bus, Cab, Ferry, Train, Meal, Preparation, Other transport, and Other forms opened. Planned/booked and domestic/international controls inspected; no save-path claim. |
| Readiness, Vault, Alerts, upload/reminder forms | Empty states and forms rendered. Structured readiness fields were absent: R13. Populated document viewer and alert-action flows remain unverified live.                                        |
| Profile / upload recovery                       | Settings rendered; four existing upload receipts reported missing cloud files/original files unavailable on this device. Cause unknown; no retry/removal attempted.                            |
| Responsive / accessibility                      | Checked dark-theme layouts at 390px and 1365px; no horizontal page overflow observed in inspected views. Shared-sheet keyboard focus issue: R08. Light theme and screen reader not exercised.  |

The captured browser error-log check returned no errors; this is not proof that every request or workflow succeeded. Production PWA, multi-account permissions, and Admin remain acceptance gaps below.

## Prioritized fix backlog

P1 = privacy/data-preservation or core offline reliability; P2 = functional/accessibility defect; P3 = documentation consistency. “Probe” means an isolated local test; “Code” means a traced implementation path, not a reproduced live-backend failure.

### R01 · P1 · Drafts are shared across signed-in accounts

**Evidence: Probe + code.** `src/lib/forms/useFormDraft.ts:21,51` uses an unscoped LocalStorage key. `src/pages/CreateTripPage.tsx:13` uses the global `trip:new:v2` key. Profile sign-out/clear-data removes IndexedDB and files, but not these draft keys (`src/pages/ProfilePage.tsx:92`, `src/lib/local-db/database.ts:113`).

**Reproduce:** Account A starts a trip draft, leaves the form, signs out, and account B opens Create trip on the same browser. A's title/destination/dates can populate B's form. Shared-trip note/requirement drafts also lack account isolation.

**Fix/acceptance:** Namespace drafts by authenticated profile, remove that profile's drafts when requested, and safely discard/migrate old unscoped keys. Verify A → sign-out → B and explicit local-data removal.

### R02 · P1 · Online refresh overwrites the visible copy of pending edits

**Evidence: Probe + code.** `src/features/sync/localSync.ts:10,73` replaces an entire entity collection with the server result without overlaying pending mutations. `queueUpdate` stores the local edited row in that same collection. Conflict details later read `localValue` from it (`localSync.ts:703`).

**Reproduce:** Edit a note offline; reconnect while its upload is delayed/fails/conflicts; refresh its collection. The old server text replaces the local text even though the pending outbox operation remains. The conflict UI can consequently label server text as “Your saved version.” This is loss of the visible local snapshot, not proof that the outbox payload itself is deleted.

**Fix/acceptance:** Keep server snapshots separate from pending local overlays; reconstruct conflict-local values from preserved mutation snapshots. Test refresh before push, failed push, multiple queued edits, and conflicting remote edits.

### R03 · P1 · “Ready offline” does not prove a complete structured pack

**Evidence: Code; partly acknowledged by HLD-042/LLD-044.** `src/features/readiness/offlinePack.ts:81` now fetches generic journey legs, but omits Cab stops and the dedicated `current-traveler-accounts:<trip>` / `trip-event-documents:<trip>` caches consumed by Home and collection views (`src/features/workspace/tripRelationships.ts:25,51`). `cacheTripRelationships` populates different keys. The manifest still records only document IDs; booking/itinerary changes do not stale it.

**Reproduce:** On a fresh device, prepare a trip without first visiting every detail view, then cold-start offline. Cab stops or personalized document shortcuts can be absent despite a ready badge; changes to structured records need not change that badge.

**Fix/acceptance:** Enumerate and prepare every consumer's required cache, track structured freshness, and distinguish stale fallback from verified downloads. Test a fresh-browser production-PWA cold start with Cab stops and traveler-specific documents. Also ensure an empty essentials selection cannot become full `ready` (`calculatePackState` returns `ready` for an empty expected set).

### R04 · P1 · Existing local bytes are not reverified during preparation/open

**Evidence: Probe + code.** `offlinePack.ts:136` accepts a historical `verifiedAt` record and skips reading/downloading that version. `src/lib/storage/offlineFiles.ts:67` returns bytes without comparing their size/hash; a missing file returns null without clearing the verification record or staling the pack. New cloud downloads do validate a checksum; the gap concerns retained copies.

**Reproduce:** Retain local metadata but remove/change the associated blob, then refresh the pack. Preparation can still report ready; offline opening fails or returns mismatched bytes.

**Fix/acceptance:** Verify existence, size, and SHA-256 at preparation; clear invalid verification and invalidate dependent manifests. Recover online, and report the unavailable copy clearly offline.

### R05 · P2 · Offline alert updates can be silently ignored on synchronization

**Evidence: Code.** `src/features/trips/api.ts:1462` queues alert-state changes using `queueCreate`. `src/features/sync/localSync.ts:1029` sends creates using `upsert(..., { ignoreDuplicates: true })` and then removes successful operations.

**Reproduce:** Mark an alert read online; go offline and dismiss/snooze/restore that same alert; reconnect. Its existing `(user_id, alert_key)` row causes the change to be ignored. Repeated offline changes to a newly created alert have the same problem after the first insert.

**Fix/acceptance:** Queue a real upsert/update with the correct composite conflict key and preserve operation order. Verify dismiss, restore, snooze, and mark-read against both existing and new server rows.

### R06 · P2 · Alert controls invalidate the wrapper but reuse stale inputs

**Evidence: Probe + code.** `src/pages/AlertsPage.tsx:34,39` invalidates `alerts`, while `src/features/alerts/load.ts:12` obtains `alert-states` through a separate five-minute query cache. Reminder creation similarly omits the actual `reminders` cache key.

**Reproduce:** With populated caches, dismiss an alert or create a reminder. The wrapper refetch can reuse the previous state, leaving the alert/count unchanged until the nested cache refreshes. The isolated probe returned old states after `alerts` invalidation and new states only after invalidating `alert-states` as well.

**Fix/acceptance:** Update/invalidate the underlying input keys before recalculating alerts. Assert immediate results online and offline without depending on Realtime.

### R07 · P2 · Realtime setup and invalidation keys do not cover current features

**Evidence: Code/SQL; deployed publication not inspected.** The canonical publication list (`supabase/TRIP_VAULT_COMPLETE_SETUP.sql:1722`, plus `journey_leg_travelers` at 4772) omits tables such as `cab_stops`, `trip_membership_offers`, `alert_states`, and `itinerary_item_documents`. Client handling exists for them but receives no events from the supplied setup. Separately, `src/features/sync/queryRoots.ts:9,28` misses FlightPage's `flight-legs` key and uses `pending-trip-offers` where Home uses `incoming-trip-offers`.

**Reproduce:** Keep another member's page open while changing an attachment, Cab stop, or invitation offer; or append a Flight connection. Relevant views can remain stale without a reload.

**Fix/acceptance:** Add an immutable publication migration and reconcile invalidation keys, including dependent queries. Verify with two signed-in sessions; do not assume the actual deployed publication matches local SQL.

### R08 · P2 · Shared sheets do not manage keyboard focus

**Evidence: Probe + browser observation + code.** `src/components/ModalSheet.tsx:24` implements Escape and history, but no initial focus, focus trap, background inertness, or focus restoration. The demo flight opener remained active after its dialog opened; the probe likewise found focus outside the dialog.

**Fix/acceptance:** Move focus inside on open, contain Tab/Shift+Tab, make the background inert, restore the opener on close, and close only the topmost sheet on Escape. Check nested details/forms with keyboard and screen reader. Relevant contract: LLD §15.

### R09 · P2 · Newly created offline expenses lose participant data on reread

**Evidence: Code.** `src/features/trips/api.ts:1224` builds the cache row with `participants: undefined`, then passes that row to `queueCreate`. Participant links are cached separately, but offline `listCosts` returns the raw parent collection without joining them (`api.ts:1184`).

**Reproduce:** Create an offline expense with payer/participants, then reload or revisit Costs. Participant shares disappear from the cached expense, potentially hiding it under traveler focus and producing incorrect balances.

**Fix/acceptance:** Cache the complete cost separately from its server payload, or join participant rows on local reads. Verify shares, balances, and traveler filters across offline navigation/reload and later synchronization.

### R10 · P2 · Trip details lack the promised online-error cache fallback

**Evidence: Code.** `src/features/trips/api.ts:215` uses cached trip metadata only when `navigator.onLine` is false. A connected browser with an unreachable Supabase endpoint goes directly to the network and throws, unlike collection reads through `networkWithCache`.

**Reproduce:** Cache a trip, keep browser connectivity true, block the backend request, and reopen Trip details. The cached trip cannot satisfy `getTrip`.

**Fix/acceptance:** Fall back for transport/service failures and disclose freshness; keep explicit authorization revocation distinct. Verify a backend outage with the browser still online. Relevant contract: HLD-041 / LLD §8.3.

### R11 · P2 · Flight test failure is an asynchronous assertion race

**Evidence: Reproduced and isolated.** `src/pages/FlightPage.test.tsx:239` synchronously calls `getByRole` after waiting for the main Flight editor button, before the separate connection query necessarily renders. An otherwise identical temporary copy using `await findByRole` passed all 7 tests.

**Fix/acceptance:** Await the connection itself and retain the accent/neutral-surface assertions. Rerun the complete suite. Current evidence identifies a test timing problem, not a proven broken connection card.

### R12 · P2 · Date-only Hotel reservations expose artificial clock times

**Evidence: Signed-in browser + code.** The same Hotel displayed date-only milestones on the timeline, blank optional printed times in its editor, but noon start/end times and a 24-hour elapsed duration in reservation details. `src/pages/BookingPage.tsx:229–253` formats stored instants and duration unconditionally; `src/features/trips/TripDetailsCards.tsx:74` likewise formats a clock time without consulting milestone precision. This contradicts BKG-024 / HLD-060: neutral ordering instants must remain hidden.

**Reproduce:** Create a Hotel with check-in/check-out dates but no printed times; compare timeline, reservation list, and booking details. The latter surfaces can present invented times as confirmed.

**Fix/acceptance:** Share a precision-aware Hotel formatter across all views; show dates/nights rather than elapsed hours until actual times exist. Cover date-only, timed, and mixed-precision stays.

### R13 · P2 · Structured readiness features are unreachable from the task form

**Evidence: Signed-in browser + code.** Add task exposes title, timing, participants, and notes only. `src/features/workspace/WorkspaceForms.tsx:1289–1309` hard-codes new requirements to `custom` and merely preserves existing visa/expiry/buffer/guidance/document fields. No alternate editing controls were found for these fields. The API/types support them, but a user cannot enter the structured inputs promised by RDY-006/008/011/014.

**Reproduce:** Open Readiness → Add task and try to record visa type, issue/expiry dates, validity buffer, official guidance, or a linked document. These cannot be entered through the available form; notes cannot drive the structured expiry checks.

**Fix/acceptance:** Add progressive structured requirement controls and authorized document linking, or explicitly defer the corresponding catalog claims. Test create → read → edit → expiry alert for a traveler-specific requirement, preserving simple checklist entry.

## Documentation reconciliation (P3)

- HLD §6.4 and LLD §8.4/8.6 incorrectly say generic journey legs are not prepared; code now loads them. Keep the still-valid structured-proof concern and replace the obsolete missing-domain detail with R03.
- LLD §11.4 says both below-header positioning and viewport-center positioning; its readiness-card table says direct edit while FEATURES RDY-004 says read-first details. Reconcile with the current intended interaction.
- FEATURES TRP-004 is Owner-only, while LLD §6.1 permits Editor trip editing; choose and enforce one contract. The backend currently permits editors through `can_edit_trip`.
- FEATURES repeats `COL-019` for two capabilities. Give each a stable unique ID.
- Update the recorded test baseline after fixing R11: this run is 504 pass / 1 fail, not the previously documented 503 plus timeout.
- Minor copy polish: the Bus form labels its connection choice “Connecting buss.”

## Remaining acceptance work

1. Populate a controlled test trip with documents, structured readiness tasks, and actionable alerts; verify viewer/version linking, expiry warnings, alert actions, and recovery receipts. Empty-state inspection does not establish these workflows work.
2. Use a confirmed disposable test trip for create/edit/upload, invitation/role changes, archive/restore, and recovery scenarios. A demo login alone does not authorize destructive changes; personal travel data is not required.
3. On a production preview build, verify fresh install, airplane-mode cold start, prepared PDFs, queued edits/reconnect, conflict resolution, update prompt, storage removal, and phone layouts. The development server is not PWA acceptance evidence.
4. Run the deployed schema smoke and three-account Owner/Editor/Viewer plus managed-traveler/collaborator checks. Admin draft/publish/rollback and private Storage authorization remain separate test-environment gates.

Suggested implementation order: **R01–R04 → R05–R07/R09 → R08/R10/R12/R13 → R11 → documentation reconciliation**, followed by the remaining live/device gates.
