---
title: "Trip Vault Feature Catalog"
description: "Prioritized inventory of Trip Vault capabilities, MVP boundaries, acceptance conditions, and intentionally deferred ideas."
scope: [service-wide]
agents: [coder, reviewer, planner]
tags: [features, product-scope, mvp, acceptance-criteria, roadmap]
last_verified: 2026-09-13
---

# Trip Vault Feature Catalog

This catalog is the product-scope source of truth for the personal Trip Vault application. Prototype and MVP items define the implemented release contract unless an item explicitly says it is deferred; Later and Not planned items remain outside this implementation.

**Redesign status:** the accepted timeline-first decisions in `docs/REDESIGN_CHECKLIST.md` are implemented locally and included in this catalog.

**Catalog status:** Personal MVP 1.0

**Implementation status:** Implemented locally; the configured Supabase project still requires the completion migration and remote acceptance run

### Timeline-first release additions

- Open a trip directly into one chronological timeline and position it at the single current/next event.
- Keep one derived readiness card above the timeline; represent other dated pre-trip work as `preparation` events.
- Create Flight, Train, Bus, Ferry/Boat, Cab, Hotel, Meal, Activity, Transport, Preparation, and Custom events from one Add Event flow.
- Store connected journeys as one booking with ordered legs, using explicit origin/destination IANA time zones and provider-local ticket display.
- Require flight PNR, support domestic/international classification, boarding lead or exact time, and manual operational updates.
- Store booked-via vendor/website and optional phone; expose phone handlers through Call and WhatsApp actions.
- Search authorized cached trip metadata locally and jump to the matching event or detail.
- Generate a QR invitation from the existing one-time code without storing a QR image or sending the code to a QR-generation service.
- Keep Reservations, Costs, People, Readiness, Documents, Offline, Travel metadata, Notes, and Settings in a sectioned Trip details workspace.
- Classify uploaded files in travel language, assign them to everyone, selected travelers, or later, and keep that assignment separate from signed-in access.
- Open a document directly in a local-first viewer, retain native full-screen zoom, and move metadata/management behind an Info action.
- Use Everyone or one traveler as a trip-wide presentation filter so timeline, reservations, costs, readiness, seats, and documents stay relevant without changing access rights.
- Reuse accounts from previously shared trips through a consent-required Home offer, while retaining private code/QR sharing for first-time recipients.
- Add an omitted connecting flight later from Flight details and keep the grouped journey, travelers, and timeline end in sync.

## 1. Priority and Release Definitions

| Label | Meaning |
|---|---|
| P0 | Required for a trustworthy first usable release |
| P1 | Important follow-up after the core is stable |
| P2 | Valuable enhancement with no MVP dependency |
| Explore | Requires product or technical investigation before prioritization |

| Release | Meaning |
|---|---|
| Prototype | Visual and interaction validation using synthetic data |
| MVP | First private real-data release |
| Later | Candidate after MVP evidence |
| Not planned | Explicitly excluded from the personal-use roadmap unless the catalog is deliberately revised |

## 2. Feature Summary

| Area | Prototype | MVP | Later |
|---|---:|---:|---:|
| Onboarding | 5 | 4 | 1 |
| Account and security | 1 | 8 | 4 |
| Trips | 2 | 7 | 3 |
| Dashboard and itinerary | 7 | 18 | 1 |
| Bookings | 3 | 6 | 4 |
| Flight assistance | 2 | 8 | 0 |
| Airline metadata | 1 | 5 | 0 |
| Administration and metadata | 2 | 8 | 0 |
| Travel readiness | 3 | 9 | 1 |
| Documents | 4 | 16 | 5 |
| Offline and sync | 3 | 14 | 4 |
| Collaboration | 4 | 14 | 3 |
| Search and organization | 2 | 3 | 6 |
| Notifications and automation | 0 | 7 | 8 |
| Profile and settings | 1 | 4 | 2 |

Counts are planning aids, exclude `Not planned` items, and should be updated when features are split or combined.

## 3. Onboarding

| ID | Feature | Priority | Release | Acceptance condition |
|---|---|---:|---|---|
| ONB-001 | Welcome screen | P0 | Prototype | Shows the Trip Vault identity, a concise value statement, warm travel artwork, and a clear continue action |
| ONB-002 | Value card: organize | P0 | Prototype | Explains trips, bookings, documents, and notes in plain language |
| ONB-003 | Value card: offline | P0 | Prototype | Explains explicit offline availability without promising unlimited device storage |
| ONB-004 | Value card: collaborate | P0 | Prototype | Explains trip membership and controlled sharing |
| ONB-005 | Sample Mediterranean trip | P0 | Prototype | A bundled, resettable synthetic trip demonstrates four stops, six traveler/collaborator cases, every Home mode, and an itinerary event with several small watermarked sample documents without using Supabase or real personal data |
| ONB-006 | Skip and resume | P1 | MVP | A returning user can skip onboarding; an incomplete user can resume at the correct stage |
| ONB-007 | Install guidance | P1 | MVP | Supported devices receive clear, platform-appropriate PWA installation instructions |
| ONB-008 | Offline limitation disclosure | P0 | MVP | Before pinning files, the user is told how local copies, quotas, and removal work |
| ONB-009 | First-trip prompt | P0 | MVP | After onboarding, an empty account is guided directly to create or join a trip without a separate confirmation screen |
| ONB-010 | Personalized onboarding | P2 | Later | Steps adapt based on whether the user travels alone or with a group |

## 4. Account and Security

| ID | Feature | Priority | Release | Acceptance condition |
|---|---|---:|---|---|
| AUT-001 | Sign-in visual flow | P0 | Prototype | Demonstrates sign-in and account creation states without connecting to a real identity provider |
| AUT-002 | Email-only Supabase sign-in | P0 | MVP | A user enters an email and continues through the configured Supabase flow without a separate onboarding confirmation gate |
| AUT-003 | Sign out | P0 | MVP | Ends the online session and clearly asks whether local offline copies should be removed |
| AUT-004 | Profile | P1 | MVP | User can set a display name and home timezone and can see the account email |
| AUT-005 | Session recovery | P0 | MVP | Returning online users regain their session or receive a non-destructive sign-in prompt |
| AUT-006 | Local access while offline | P0 | MVP | A previously initialized device can open authorized cached data according to the agreed offline-session policy |
| AUT-007 | Access-denied handling | P0 | MVP | Revoked or unauthorized access produces a clear message and does not reveal protected metadata |
| AUT-008 | Sensitive-data logging policy | P0 | MVP | Logs exclude document contents, signed URLs, booking codes, passport details, and addresses |
| AUT-009 | Multi-factor authentication | P1 | Later | User can enable a supported second factor and complete recovery safely |
| AUT-010 | Device and session list | P1 | Later | User can review and revoke active sessions where backend capabilities permit |
| AUT-011 | App lock | Explore | Later | Agreed threat model determines whether a PIN, passkey, or native secure storage is required |
| AUT-012 | Provider-blind encryption | Explore | Later | A decision covers key creation, recovery, sharing, previews, and migration before implementation |
| AUT-013 | Authenticated trip privacy | P0 | MVP | Destination, dates, traveler names, bookings, requirements, and document metadata are returned only after sign-in and active membership |

## 5. Trips

| ID | Feature | Priority | Release | Acceptance condition |
|---|---|---:|---|---|
| TRP-001 | Trip card | P0 | Prototype | Shows title, date range, progress, document count, traveler avatars, and offline state |
| TRP-002 | Trip detail mockup | P0 | Prototype | Demonstrates overview, itinerary, bookings, documents, notes, and members |
| TRP-003 | Trip creation | P0 | MVP | User can create a trip with title, destination, dates, and currency; the hidden compatibility timezone is taken from the device while each journey records its own endpoint timezones |
| TRP-004 | Trip editing | P0 | MVP | Authorized users can update trip details with version-conflict protection |
| TRP-005 | Trip lifecycle | P0 | MVP | Trips are grouped as draft, upcoming, active, completed, or archived using agreed rules |
| TRP-006 | Trip progress | P1 | MVP | Progress is based on an explicit checklist definition rather than an unexplained percentage |
| TRP-007 | Archive trip | P1 | MVP | Owner can archive and restore a trip without deleting its records |
| TRP-008 | Recoverable deletion | P1 | MVP | Owner can delete a trip into a retention window and restore it before final removal |
| TRP-008A | Temporary test-trip purge | P0 | Testing | Owner can type the exact trip name to permanently remove stale trip data and cloud documents while the product is being retested; remove or redesign this before normal use |
| TRP-009 | Duplicate trip | P2 | Later | User can copy structure without copying sensitive documents by default |
| TRP-010 | Trip templates | P2 | Later | Reusable packing, booking, and document checklists can seed new trips |
| TRP-011 | Multiple destinations | P1 | MVP | Itinerary supports multiple stops without forcing the trip summary into one city |
| TRP-012 | Cover image | P2 | Later | User can choose a safe stock, generated, or uploaded trip image |

## 6. Home Dashboard and Itinerary

| ID | Feature | Priority | Release | Acceptance condition |
|---|---|---:|---|---|
| DSH-001 | Today card | P0 | Prototype | Shows current date, next relevant travel event, status, and key action |
| DSH-002 | Upcoming trip card | P0 | Prototype | Shows date range, destination, preparation progress, document count, and member summary |
| DSH-003 | Quick actions | P0 | Prototype | Provides visible Add trip, Add booking, and Upload document actions |
| DSH-004 | Responsive navigation | P0 | Prototype | Phone has fixed bottom navigation; wider layouts reorganize without losing route identity |
| DSH-005 | Sample itinerary timeline | P0 | Prototype | Demonstrates day grouping, times, locations, and attached bookings |
| DSH-006 | Cached dashboard | P0 | MVP | Dashboard renders meaningful data before the first network response |
| DSH-007 | Day-by-day itinerary | P0 | MVP | Items are grouped using their stored timezone and remain readable offline |
| DSH-008 | Add custom itinerary item | P0 | MVP | Authorized user can add a timed or date-only item without requiring a booking |
| DSH-009 | Reorder equal-time items | P1 | MVP | Stable manual ordering is preserved across clients |
| DSH-010 | Timezone clarity | P0 | MVP | Ambiguous times display the relevant timezone and never silently shift date |
| DSH-011 | Preparation checklist | P1 | MVP | Trip owners can track agreed readiness items with explicit completion rules |
| DSH-012 | Calendar view | P1 | Later | Month or week presentation complements, but does not replace, the timeline |
| DSH-013 | Calendar export | P1 | MVP | User can export selected itinerary items and preparation deadlines without exposing private documents |
| DSH-014 | Open in Google Maps | P1 | MVP | An address or stored coordinate opens through a Google Maps URL without requiring an API key; the action is unavailable offline |
| DSH-015 | Provider-fed live disruption status | Explore | Not planned | MVP uses manual updates and external tracker links instead of a live flight-data provider |
| DSH-016 | Context-aware home modes | P0 | Prototype | Demonstrates planning, pre-departure, travel-day, in-trip, and post-trip arrangements without changing navigation |
| DSH-017 | Next-action hero | P0 | MVP | Home shows one highest-priority action or event with its time, location, reason, and direct action |
| DSH-018 | Need-now shortcut bubbles | P0 | MVP | Home computes a short row of relevant boarding pass, visa, hotel, insurance, transport, or contact shortcuts |
| DSH-019 | Upcoming-trip work queue | P0 | MVP | Each upcoming trip shows missing or time-sensitive preparation work and its nearest due date |
| DSH-020 | Trip Home | P0 | MVP | A trip-specific home puts Now/Next, urgent documents, today's timeline, accommodation, and unresolved work before the full itinerary |
| DSH-021 | One-tap essential document | P0 | MVP | A contextual shortcut opens the correct authorized local copy when offline and the current cloud version when online |
| DSH-022 | Immediate travel actions | P1 | MVP | Flight, hotel, and transport cards can expose relevant check-in, tracking, navigation, call, or copy-reference actions |
| DSH-023 | Single current-trip focus | P0 | MVP | Home presents at most one current trip per user while retaining other upcoming and historical trips elsewhere |
| DSH-024 | D-1 current-mode transition | P0 | MVP | Current mode begins one calendar day before the trip using the hidden compatibility timezone captured from the creator's device; journey display always uses each endpoint's source timezone |
| DSH-025 | Overlap resolution | P1 | MVP | If trip windows overlap, the user can choose the focused trip and can switch without changing either trip's dates |
| DSH-026 | Contextual-focus motion mockup | P0 | Prototype | Demonstrates a restrained zoom/elevation treatment for the current trip and current timeline item, scroll-settled carousel focus, route continuity, and a reduced-motion variant |
| DSH-027 | Contextual-focus motion system | P0 | MVP | Current content receives a label, accent, and small transform without relying on motion or color alone; animations use approved properties/timings and become static when reduced motion is requested |
| DSH-028 | Traveler-focused trip presentation | P0 | MVP | Everyone shows the complete trip; selecting one traveler shows shared plus that person's timeline, reservations, costs, readiness, seats, and documents and hides records assigned only to another traveler |

## 7. Bookings

| ID | Feature | Priority | Release | Acceptance condition |
|---|---|---:|---|---|
| BKG-001 | Booking cards | P0 | Prototype | Flight, hotel, and activity examples show type-appropriate summary fields |
| BKG-002 | Booking detail | P0 | Prototype | Demonstrates provider, reference, timing, location, notes, and attachments |
| BKG-003 | Add-booking form | P0 | Prototype | Demonstrates validation and type-specific fields |
| BKG-004 | Manual booking creation | P0 | MVP | Editor can create flight, hotel, transport, activity, restaurant, or other booking |
| BKG-005 | Manual booking editing | P0 | MVP | Authorized edits are version-checked and update related itinerary information predictably |
| BKG-006 | Confirmation reference | P0 | MVP | Reference is searchable, copyable, masked where appropriate, and available offline |
| BKG-007 | Attach documents | P0 | MVP | One or more documents can be associated with a booking without changing their visibility rules |
| BKG-008 | Booking status | P1 | Later | A later schema can distinguish planned, confirmed, changed, cancelled, and completed states; flights already keep their separate manual operational status |
| BKG-009 | Multiple travelers | P1 | MVP | Booking records identify the traveler profiles they apply to, including managed travelers without accounts |
| BKG-010 | Type-specific details | P1 | MVP | Each supported type validates a documented schema while retaining an `other` escape hatch |
| BKG-011 | Email import | Explore | Not planned | Personal-use scope deliberately uses manual booking entry and document upload |
| BKG-012 | PDF extraction | Explore | Not planned | Personal-use scope deliberately avoids OCR and booking-field extraction |
| BKG-013 | Duplicate detection | P2 | Later | Likely duplicate bookings are suggested using explainable matching |
| BKG-014 | Provider change tracking | P2 | Later | The app records changes without claiming live provider truth when none exists |
| BKG-015 | Boarding-pass wallet integration | Explore | Later | Platform feasibility and native requirements are assessed first |

## 8. Documents and Vault

| ID | Feature | Priority | Release | Acceptance condition |
|---|---|---:|---|---|
| DOC-001 | Document list mockup | P0 | Prototype | Demonstrates categories, visibility, file size, version, and offline status |
| DOC-002 | Upload mockup | P0 | Prototype | Demonstrates progress, metadata entry, visibility selection, and error states |
| DOC-003 | Document preview mockup | P0 | Prototype | Makes the PDF/image the primary page, with an Info sheet and native full-screen zoom action |
| DOC-004 | Category filters | P0 | Prototype | User can switch between all documents and major travel categories |
| DOC-005 | Private upload | P0 | MVP | New document is private to uploader unless a broader scope is deliberately selected |
| DOC-006 | Shared upload | P0 | MVP | Authorized user can share with the whole trip or selected active members |
| DOC-007 | Retryable small-file upload | P0 | MVP | An interrupted file remains in the outbox and retries safely from its verified local copy; the under-5-MB MVP does not promise chunk-level resume |
| DOC-008 | Immutable versions | P0 | MVP | Replacing a document creates a new version and preserves version history |
| DOC-009 | Safe preview | P0 | MVP | PDFs and approved images open automatically from a verified local copy, or download once from private storage and then remain cached |
| DOC-010 | Download original | P0 | MVP | Authorized user receives the original with correct filename and MIME type |
| DOC-011 | Document metadata | P0 | MVP | Title, purpose, category, trip, related booking or itinerary events, traveler usage, uploader, size, and visibility are searchable |
| DOC-012 | Integrity check | P0 | MVP | Server manifest and pinned local file can be compared using size and SHA-256 |
| DOC-013 | Recoverable document deletion | P1 | MVP | Authorized deletion hides the document while retaining a defined restoration window |
| DOC-014 | Storage usage | P1 | MVP | Profile shows approximate cloud and local usage with understandable units |
| DOC-015 | Multi-file upload | P1 | Later | Batch selection must still collect purpose, traveler usage, and access for every file rather than silently creating generic documents |
| DOC-016 | Version restoration | P1 | Later | Authorized user can make an earlier immutable version current without data loss |
| DOC-017 | Full-text OCR search | Explore | Not planned | Documents are stored and categorized without OCR or content extraction |
| DOC-018 | Exact duplicate file recovery | P0 | MVP | Matching same-trip SHA-256 stops a second byte copy and offers to open or attach the existing Vault document |
| DOC-019 | Share outside trip | Explore | Not planned | Real documents require a signed-in active trip member; public or recipient-only file links are excluded |
| DOC-020 | Trip archive export | P1 | Later | User can create a portable package with manifest and selected originals |
| DOC-021 | Camera scan | P2 | Later | Mobile capture creates a corrected image or PDF with clear quality feedback |
| DOC-022 | Traveler usage assignment | P0 | MVP | Usage is Shared, Selected travelers, or Assign later; selected usage supports multiple travelers and never grants document access |
| DOC-023 | Five-megabyte upload boundary | P0 | MVP | Every file must be smaller than 5,000,000 bytes; the picker, offline queue, upload finalization, and private Storage bucket enforce the same limit and show the measured size when rejected |
| DOC-024 | User-reviewed image optimization | P2 | Later | An oversized JPEG, PNG, or WebP may be converted to a smaller copy only after before/after size and legibility preview; the app never claims the result is lossless |
| DOC-025 | Multiple documents per itinerary event | P0 | MVP | An itinerary event can link, order, open, and unlink multiple existing or newly uploaded documents; unlinking or deleting the event does not delete the underlying Vault documents |
| DOC-026 | Travel-specific document types | P0 | MVP | Upload offers flight ticket, boarding pass, baggage tag, visa, passport, stay confirmation, journey ticket, activity confirmation/admission, meal voucher, receipt, insurance, and Other with sensible assignment defaults |
| DOC-027 | Assignment/access separation | P0 | MVP | The upload form explains that who uses a document is independent from Only me, signed-in trip, or selected-member access |
| DOC-028 | Context-derived document name | P0 | MVP | Default name combines document type, who it is for, and linked event; a custom name is allowed while the derived context remains visible below it |

## 9. Offline and Synchronization

| ID | Feature | Priority | Release | Acceptance condition |
|---|---|---:|---|---|
| OFF-001 | Offline dashboard state | P0 | Prototype | UI clearly demonstrates cached data, last-sync time, and unavailable actions |
| OFF-002 | Offline readiness state | P0 | Prototype | Trip card distinguishes not downloaded, preparing, Essentials ready, Ready offline, stale, and failed |
| OFF-003 | Synchronization status | P0 | Prototype | Pending, syncing, synced, conflict, and failure are understandable without technical jargon |
| OFF-004 | Cached structured data | P0 | MVP | Current trips, bookings, itinerary, permitted document index, and notes open without network |
| OFF-005 | Pin document | P0 | MVP | User can store and verify an authorized document locally for offline viewing |
| OFF-006 | Pin trip | P0 | MVP | Default preparation downloads all current documents authorized for that user; a reviewed reduced set is clearly labeled Essentials ready |
| OFF-007 | Readiness verification | P0 | MVP | Ready offline is shown only after complete structured data and all authorized current document versions pass integrity checks |
| OFF-008 | Storage estimate | P0 | MVP | App checks estimated quota before download and reports shortfall before failure |
| OFF-009 | Persistent-storage request | P1 | MVP | App requests persistence when supported and reports the resulting protection honestly |
| OFF-010 | Offline draft and edit queue | P0 | MVP | Supported changes save locally with an explicit queued state |
| OFF-011 | Foreground resynchronization | P0 | MVP | Opening the connected app pushes eligible changes, pulls remote changes, and retries pending files |
| OFF-012 | Conflict preservation | P0 | MVP | Neither local nor server content is silently discarded when versions disagree |
| OFF-013 | Remove local copies | P0 | MVP | User can unpin a file or trip and recover local space without deleting cloud originals |
| OFF-014 | Stale pack warning | P0 | MVP | Changed remote content invalidates the readiness timestamp until refreshed |
| OFF-015 | Background sync enhancement | P2 | Later | Supported browsers may sync opportunistically without changing baseline correctness |
| OFF-016 | Automatic essential selection | P2 | Later | Suggestions remain user-reviewable and disclose why each document was selected |
| OFF-017 | Scheduled readiness check | P2 | Later | App reminds users before departure only with consent and supported notification delivery |
| OFF-018 | Multiple-device offline management | P2 | Later | User can understand which devices have locally pinned packs without implying remote deletion control |
| OFF-019 | Complete prepared-trip operation | P0 | MVP | After a verified preparation, Home, itinerary, bookings, readiness, alerts, manual flight updates, and authorized downloaded documents work in airplane mode |
| OFF-020 | Self-contained app resources | P0 | MVP | The app shell bundles required code, fonts, icons, and starter airline metadata and makes no runtime CDN request to start offline |
| OFF-021 | Profile-local document opening | P0 | MVP | A signed-in or offline-enrolled profile opens its verified local document immediately without a per-open cached authorization test; another profile cannot list or open that local copy, and missing cloud files still require current server authorization |

## 10. Collaboration

| ID | Feature | Priority | Release | Acceptance condition |
|---|---|---:|---|---|
| COL-001 | Traveler avatars | P0 | Prototype | Cards show a compact, accessible member summary |
| COL-002 | Join-code flow mockup | P0 | Prototype | Demonstrates sign-up, authenticated code entry, traveler or collaborator target, role, expiry, success, used, revoked, and invalid states |
| COL-003 | Visibility selector mockup | P0 | Prototype | Private, trip-wide, and selected-member options are clearly differentiated |
| COL-004 | Generate one-time join code | P0 | MVP | Owner creates a high-entropy, expiring, revocable code bound to exactly one traveler or non-traveling collaborator invitation |
| COL-005 | Redeem join code | P0 | MVP | A signed-in recipient enters the code online; one transaction creates membership, claims the intended target, and prevents reuse |
| COL-006 | Roles | P0 | MVP | Owner, editor, and viewer capabilities match the approved matrix in the LLD |
| COL-007 | Remove member | P0 | MVP | Owner revokes future access and sees a warning about previously downloaded copies |
| COL-008 | Change role | P1 | MVP | Owner can change a member role without recreating membership |
| COL-009 | Realtime refresh | P1 | MVP | Connected members see authorized metadata changes without manual reload |
| COL-010 | Selected-member documents | P0 | MVP | Only uploader and explicitly selected active members can access metadata and files |
| COL-011 | Traveler booking assignment | P1 | MVP | A booking can identify affected traveler profiles without narrowing trip access by itself |
| COL-012 | Activity history | P1 | Later | Users can see safe summaries of material changes without sensitive field values |
| COL-013 | Comments | P2 | Later | Members can discuss a booking or itinerary item with notification controls |
| COL-014 | Ownership transfer | P1 | Later | Owner can transfer ownership with re-authentication and audit history |
| COL-015 | Guest access | Explore | Not planned | Every person who operates the app must sign in; reduced access uses an authenticated Viewer collaborator instead |
| COL-016 | External public link | Explore | Not planned | Real trip details and documents are never exposed through an unauthenticated public link |
| COL-017 | Traveler roster mockup | P0 | Prototype | Demonstrates claimed, unclaimed, managed, and non-traveling collaborator states without implying every traveler has an account |
| COL-018 | Link account to traveler | P0 | MVP | Successful targeted code redemption links the signed-in account to exactly one intended traveler in that trip |
| COL-019 | Non-traveling collaborator | P1 | MVP | Owner can generate the same kind of code for an Editor or Viewer who can help without appearing in bookings or traveler counts |
| COL-020 | Managed traveler | P0 | MVP | Owner or Editor can manage a child, elderly parent, or other traveler without creating an account; a persistent Everyone/traveler switcher preselects that person in new bookings, itinerary items, requirements, and documents |
| COL-021 | Itinerary participants | P0 | MVP | Each itinerary item applies to everyone or selected traveler profiles, independently from account membership |
| COL-022 | Per-traveler manager permissions | P2 | Later | Explicit per-person capability grants may be added later; the personal MVP relies on Owner/Editor trip roles and does not show delegation permission controls |
| COL-023 | No anonymous trip access | P0 | MVP | A code-entry screen reveals no real trip details until the user is signed in and the code has been successfully redeemed |
| COL-024 | Known-account trip offer | P0 | MVP | Once two accounts have shared an accepted trip, the owner can offer a later trip to that account; the recipient must accept on Home before membership or traveler linkage is created |

## 11. Search and Organization

| ID | Feature | Priority | Release | Acceptance condition |
|---|---|---:|---|---|
| SRC-001 | Search mockup | P0 | Prototype | Demonstrates results grouped across trips, bookings, and documents |
| SRC-002 | Category navigation | P0 | Prototype | Major travel categories are reachable without using search |
| SRC-003 | Local document search | P0 | MVP | Authorized cached document titles, purposes, short labels, and categories are searchable offline in Vault |
| SRC-004 | Authorized cloud document index | P0 | MVP | Online Vault results never include documents outside the user's current access |
| SRC-005 | Document category filter | P1 | MVP | Vault results can be filtered by the categories present in the authorized document set |
| SRC-006 | Recent items | P1 | Later | Recently opened items are device-local and can be cleared |
| SRC-007 | Saved searches | P2 | Later | User can save a set of safe metadata filters |
| SRC-008 | Search inside documents | Explore | Not planned | Search is limited to user-entered metadata; document contents are not extracted |
| SRC-009 | Global tags | P2 | Later | User-managed tags complement, rather than replace, stable categories |
| SRC-010 | Smart suggestions | Explore | Later | Suggestions are explainable and do not expose protected content to unintended processing |
| SRC-011 | Duplicate consolidation | P2 | Later | User reviews every merge and originals remain recoverable |
| SRC-012 | Archive search | P2 | Later | Historical trips remain searchable without cluttering active views |

## 12. Notifications and Automation

| ID | Feature | Priority | Release | Acceptance condition |
|---|---|---:|---|---|
| NTF-001 | In-app action required | P1 | MVP | Sync conflicts and incomplete offline packs appear in Alerts and detailed sync failures remain reviewable in Profile |
| NTF-002 | Web push opt-in | P1 | Later | User opts in through a deliberate action and can disable each category |
| NTF-003 | Departure reminder | P1 | Later | Uses the trip timezone and links to the relevant trip |
| NTF-004 | Check-in reminder | Explore | Later | Timing source and provider accuracy are defined before activation |
| NTF-005 | Offline pack reminder | P1 | Later | User is reminded before travel only when the pack is incomplete or stale |
| NTF-006 | Invitation status | P2 | Later | Owner can optionally receive an in-app status when a code is redeemed, expires, or is revoked; code delivery remains manual |
| NTF-007 | Change notification | P2 | Later | User controls whether material booking edits generate push or email |
| NTF-008 | Visa and passport expiry | P0 | MVP | App-load checks compare user-entered expiry and validity buffers with trip dates and link directly to the requirement |
| NTF-009 | Automatic itinerary proposal | Explore | Not planned | Manual entry remains authoritative because email import and document extraction are excluded |
| NTF-010 | On-load reminder engine | P0 | MVP | Every app launch recomputes due and urgent actions from local trip data without requiring a paid notification service |
| NTF-011 | In-app travel-day alert | P0 | MVP | While the app is open, newly urgent check-in, departure, document, or transfer items appear immediately and accessibly |
| NTF-012 | Free Web Push experiment | Explore | Later | Test browser and installed-PWA delivery, consent, reliability, and battery behavior before promising scheduled alerts |
| NTF-013 | Scheduled push worker | Explore | Later | A server schedule sends only approved reminders and remains optional if free-tier backend pausing makes delivery unreliable |
| NTF-014 | Alerts page | P0 | MVP | Urgent, Today, Upcoming, and dismissed alerts appear in one page and link to the record that needs attention |
| NTF-015 | Unread alert count | P0 | MVP | Navigation shows the number of unread active alerts, recomputed when the app opens, resumes, or relevant local data changes |
| NTF-016 | Alert controls | P1 | MVP | User can mark an alert read, dismiss it, or snooze it without changing the underlying booking or requirement |

## 13. Profile and Settings

| ID | Feature | Priority | Release | Acceptance condition |
|---|---|---:|---|---|
| PRF-001 | Profile screen | P0 | Prototype | Demonstrates account, appearance, offline storage, security, and support sections |
| PRF-002 | Local storage manager | P0 | MVP | User can see pinned trips and files, approximate usage, and safely remove local copies |
| PRF-003 | Home timezone | P0 | MVP | User can choose the default timezone without changing provider-issued source times; display locale follows the browser in MVP |
| PRF-004 | Per-device appearance mode | P0 | MVP | User can choose System, Light, or Dark; the local choice applies before first render, follows operating-system changes in System mode, and works offline |
| PRF-005 | Data export request | P1 | Later | User can request a portable export of their authorized account data |
| PRF-006 | Account deletion | P1 | Later | Flow explains ownership transfer, shared records, retention, and irreversible effects |
| PRF-007 | Privacy controls | P1 | MVP | User can review offline behavior, remove one file or trip pack, and sign out while either keeping or clearing all local copies |

## 14. Research-Informed Product Review

### 14.1 Patterns worth adopting

| Pattern | Evidence from comparable apps | Trip Vault position |
|---|---|---|
| One chronological itinerary | TripIt and Tripsy organize flights, stays, activities, and documents around one trip timeline | Adopt as the main trip structure |
| Information at the moment of need | Flighty uses morning-of, check-in, connection, and inbound-aircraft assistants; TripIt surfaces check-in and gate guidance | Adopt the context model, initially using our own stored times and external actions |
| Explicit offline trip access | Wanderlog promotes downloading a trip plan for offline use | Keep verified offline packs as a core differentiator |
| Collaborative trip editing | Wanderlog and Tripsy support shared planning and guest permissions | Keep invitation-based owner, editor, and viewer access |
| Confirmation-email import | TripIt, Tripsy, and KAYAK accept forwarded reservation emails | Do not adopt; manual entry avoids inbox access and parsing complexity |
| Flight monitoring | TripIt, Tripsy, Flighty, and Wanderlog offer live flight status, generally as a paid capability | Recreate the useful flight-day states from user-maintained times, gates, and status; keep external tracker links |
| Maps, budgets, and packing | Wanderlog combines these with trip planning | Use keyless external map links; support trip-scoped payer/participants/equal splits, but exclude route optimization, automatic currency conversion, offline map downloads, and a standalone expense product |

### 14.2 Recommended App Home information order

| Order | Region | Behavior |
|---:|---|---|
| 1 | Critical banner | Appears only for a blocking problem such as an expired document, incomplete offline pack, unresolved sync conflict, or cancelled item |
| 2 | Now / Next hero | Shows the single most relevant event or preparation action with one primary button |
| 3 | Need-now bubbles | Shows no more than five contextual shortcuts such as Boarding pass, Visa, Hotel, Insurance, or Airport transfer |
| 4 | Today timeline | Lists today's events chronologically with local times and status |
| 5 | Upcoming trip work | Shows future trips with preparation count and nearest due action |
| 6 | Recent and quick add | Provides secondary access to recently used documents and creation actions |

When no trip is current, the Home page emphasizes the next upcoming trip and its preparation. At local midnight one calendar day before the trip starts, Home changes to current-trip mode and emphasizes Now, Next, essential documents, accommodation, and transport until the trip ends.

### 14.3 Recommended Trip Home information order

| Order | Region | Contents |
|---:|---|---|
| 1 | Trip header | Destination, dates, traveler summary, local time, and verified offline state |
| 2 | Now / Next | Current or next event with time, terminal or location, and direct action |
| 3 | Essential shortcuts | Boarding pass or ticket, visa, passport, hotel confirmation/address, insurance, and emergency contact when relevant |
| 4 | Action required | Missing document, upcoming check-in, unconfirmed booking, stale offline pack, or sync conflict |
| 5 | Today's itinerary | Compact chronological events; later days remain collapsed |
| 6 | Stay and transport | Current hotel address, next transfer, navigation, and contact actions |
| 7 | Full trip sections | Itinerary, bookings, documents, notes, travelers, and settings |

### 14.4 Cost and dependency boundary

| Capability | Can be zero-cost? | Proposed approach | Database implication |
|---|---|---|---|
| On-load reminders | Yes | Calculate locally from dates, requirements, and cached data whenever the app opens | Requirement status and due dates |
| Need-now shortcuts | Yes | Derive from current time, next event, document category, and offline state | Document purpose, booking links, and priority metadata |
| External flight tracking | Yes | Open an airline or public tracking page using stored flight number and date | External URL plus airline and flight identifiers |
| Airline check-in | Usually | Store or derive the airline's official check-in link; allow manual correction | Check-in URL and check-in availability time |
| Manual flight updates | Yes | User records delay, cancellation, gate, terminal, boarding, and baggage information | Scheduled and estimated times, manual status, location fields, freshness metadata |
| Google Maps hand-off | Yes | Open Maps URLs using an address or optional stored coordinates; do not embed a map in MVP | Address, latitude, and longitude are optional structured fields |
| Calendar reminders | Yes | Export preparation deadlines and itinerary events to the user's calendar | Stable event IDs and export timestamps |
| Browser Web Push | Usually at personal scale | Optional permission plus service worker; scheduled delivery still requires a reliable server job | Push subscriptions and reminder-delivery state |
| Provider-fed live flight status | Not reliably | Do not include; Trip Vault displays the user's latest manual update and its age | Manual status, source, updater, and update time |
| Automated visa rules | Not reliably | Do not include; link to official guidance and let the user maintain requirements | Manual requirements and verified-source URL |
| Embedded map images or geocoding | Only within provider allowances | Exclude from MVP; Google Static Maps and Geocoding require a billing-enabled key even when usage stays within a free monthly cap | No provider-specific fields required for MVP |

## 15. Travel Readiness Candidates

| ID | Feature | Priority | Release | Acceptance condition |
|---|---|---:|---|---|
| RDY-001 | Readiness summary mockup | P0 | Prototype | Shows Ready, Action required, and Missing states for documents and preparation work |
| RDY-002 | Essential shortcut mockup | P0 | Prototype | Demonstrates context-sensitive visa, passport, ticket, hotel, insurance, and transfer bubbles |
| RDY-003 | Missing-item warning mockup | P0 | Prototype | Demonstrates a prominent but calm warning with a direct resolution action |
| RDY-004 | Trip requirements checklist | P0 | MVP | User can create visa, passport, insurance, check-in, payment, packing, or custom requirements |
| RDY-005 | Assign requirement to traveler | P1 | MVP | A requirement applies to the whole trip or selected traveler profiles, including those managed without accounts |
| RDY-006 | Link requirement to document | P0 | MVP | Requirement can open its current authorized document version in one action |
| RDY-007 | Need-by date | P0 | MVP | Requirement supports a due date, completion state, notes, and contextual urgency |
| RDY-008 | Passport and visa expiry warning | P0 | MVP | User-entered expiry is compared with trip dates and a configurable validity buffer without claiming legal advice |
| RDY-009 | App-load readiness reminders | P0 | MVP | Opening the app surfaces overdue, due-soon, missing, or stale items from cached data |
| RDY-010 | Readiness completion | P0 | MVP | A trip is marked ready only when all required items for all assigned travelers are complete |
| RDY-011 | Official-guidance link | P1 | MVP | User can save and open the relevant embassy or government URL beside a requirement |
| RDY-012 | Automated visa eligibility | Explore | Not planned | Trip Vault does not determine eligibility or present user-entered data as immigration advice |
| RDY-013 | Shared packing checklist | P2 | Later | Travelers can assign and complete non-sensitive packing items separately from legal/document requirements |
| RDY-014 | Manual visa input | P0 | MVP | User records destination, traveler, requirement status, visa type, due date, issue and expiry dates, validity buffer, notes, official link, and linked document |

## 16. Flight Assistance Candidates

| ID | Feature | Priority | Release | Acceptance condition |
|---|---|---:|---|---|
| FLT-001 | Flight-day card mockup | P0 | Prototype | Demonstrates route, scheduled time, terminal or gate, check-in state, ticket, and tracking actions |
| FLT-002 | External tracking shortcut mockup | P0 | Prototype | Demonstrates leaving Trip Vault for a relevant airline or tracking site with clear labeling |
| FLT-003 | Complete manual flight record | P0 | MVP | User stores airline, flight number, date, airports, source times, terminals, booking reference, and travelers |
| FLT-004 | Airline action links | P0 | MVP | Flight card offers stored official check-in, manage-booking, and status URLs with manual correction |
| FLT-005 | External tracker link | P0 | MVP | Track flight opens the selected public tracking service using flight number and date without claiming in-app live status |
| FLT-006 | Status freshness and manual verification | P1 | MVP | Every operational value is labeled user-entered and shows who updated it and when |
| FLT-007 | OpenSky aircraft-position experiment | Explore | Not planned | Aircraft position does not supply the passenger-facing delay, gate, cancellation, or baggage facts this app needs |
| FLT-008 | Paid flight-status API | Explore | Not planned | Personal-use scope relies on manual updates and external trackers without a recurring flight-data cost |
| FLT-009 | Manual operational update | P0 | MVP | User can set on-time, delayed, boarding, departed, landed, or cancelled status plus revised times, terminals, gates, baggage claim, and a note |
| FLT-010 | Connection and inbound-aircraft assistant | P2 | Not planned | Connection readiness is covered by stored itinerary times and manual flight updates; inbound-aircraft automation is excluded |
| FLT-011 | Ticket-to-boarding-pass transition | P0 | MVP | Before a boarding pass exists the flight card prioritizes the ticket; after one is attached it prioritizes the boarding pass with seat, boarding time, terminal, and gate |
| FLT-012 | Baggage tag attachments | P0 | MVP | User can attach one or more baggage-tag documents to a flight and label each for the relevant traveler or bag |
| FLT-013 | Delay-aware countdown | P0 | MVP | Countdown uses the latest user-entered estimated departure when delayed and otherwise uses the scheduled departure, with source and update time visible |
| FLT-014 | Add a missing connection later | P0 | MVP | An owner/editor can append a chronological leg from Flight details; the leg inherits booking travelers and extends the grouped booking and timeline event |

### 16.1 Flight-data conclusion

OpenSky is open and permits personal/non-profit API use, but it does not provide the commercial schedule, delay, gate, or cancellation information needed for this passenger workflow. Aircraft position alone does not justify the integration.

The MVP therefore treats the stored flight record as user-maintained information. It offers one-tap airline check-in, airline status, and external tracker actions, while the in-app countdown, gate, delay, cancellation, and baggage display use the most recent manual values. No automated provider or paid API is planned.

## 17. Airline Metadata Candidates

| ID | Feature | Priority | Release | Acceptance condition |
|---|---|---:|---|---|
| AIR-001 | Airline picker mockup | P0 | Prototype | Searchable dropdown demonstrates airline name, IATA code, safe logo fallback, and selected-card treatment |
| AIR-002 | Starter airline catalog | P0 | MVP | A small curated list of commonly used airlines is available without network access and does not claim global completeness |
| AIR-003 | Editable airline metadata | P0 | MVP | Owner can correct a trip airline snapshot's name, codes, links, and color without changing existing flight history unexpectedly |
| AIR-004 | Airline-branded flight card | P1 | MVP | Cards may use an approved logo, banner, and accessible brand color, with a neutral monogram fallback |
| AIR-005 | Editable action templates | P0 | MVP | Check-in, manage-booking, status, and tracker URL templates support documented placeholders and can be disabled when stale |
| AIR-006 | Safe asset policy | P0 | MVP | The app never scrapes or hotlinks airline logos; it uses bundled, licensed, or user-supplied assets with a fallback |
| AIR-007 | Automatically synchronized airline catalog | Explore | Not planned | Personal scope does not need a remote catalog service or automated brand-data ingestion |

## 18. Administration and Metadata

| ID | Feature | Priority | Release | Acceptance condition |
|---|---|---:|---|---|
| ADM-001 | Administrator sign-in mockup | P0 | Prototype | Demonstrates a distinct Admin entry, unauthorized state, and no path from ordinary trip navigation |
| ADM-002 | Metadata and theme console mockup | P0 | Prototype | Demonstrates online-only catalog navigation, draft changes, light/dark preview, validation, publish, rollback, and disabled controls after connection loss |
| ADM-003 | Dedicated administrator account | P0 | MVP | A separately created Supabase Auth account reaches Admin routes only when its user ID is active in the application-admin allowlist |
| ADM-004 | Administrator isolation | P0 | MVP | Admin status permits configuration operations but never bypasses trip membership, traveler management, or document visibility policies |
| ADM-005 | Airline catalog management | P0 | MVP | Admin can add, edit, disable, preview, and publish airline names, codes, aliases, action templates, safe assets, and accessible brand accents |
| ADM-006 | Airport catalog management | P1 | MVP | Admin can maintain airport codes, name, city, country, timezone, optional location, and user-facing aliases without claiming live terminal or gate data |
| ADM-007 | Travel metadata defaults | P1 | MVP | Admin can save browser-safe namespaced JSON defaults; executable configuration, credentials, and authorization rules remain impossible |
| ADM-008 | Light and dark theme editor | P0 | MVP | Admin edits only allowlisted semantic color tokens, previews each palette, and cannot publish a palette that fails validation |
| ADM-009 | Versioned configuration publishing | P0 | MVP | A live connection is required; draft metadata is never queued offline and remains invisible to travelers until one atomic publish creates a version clients can cache and identify |
| ADM-010 | Configuration audit and rollback | P1 | MVP | Every published version records the administrator and time and can be rolled back without deleting history |
| ADM-011 | Administrator access to user trips | Explore | Not planned | Configuration authority never grants access to private trip data or documents |
| ADM-012 | Browser editing of secrets or security policies | Explore | Not planned | API secrets, RLS rules, MIME security policy, and other deployment controls remain code or environment configuration |

## 19. Explicit MVP Exclusions

The following do not belong in the first real-data release unless the catalog is deliberately revised:

- Native iOS or Android applications
- Flight or hotel purchasing
- Provider-fed flight status or live-status guarantees
- Email booking import or inbox access
- OCR, PDF field extraction, or AI extraction
- Public unauthenticated file sharing
- Full-text search inside uploaded documents
- Expense splitting and payments
- Route optimization, embedded map images, or offline map downloads
- Automated visa eligibility decisions
- Inbound-aircraft automation
- Social feed, chat, or comments
- Custom provider-blind end-to-end encryption
- Automatic deletion of another person's downloaded copies
- Billing, subscriptions, commercial accounts, or a public product offering

## 20. MVP Exit Criteria

The MVP is ready for private travel use only when:

1. A new user can sign in, create a trip, and invite another user.
2. Both users see only records allowed by tested database and storage policies.
3. An editor can add bookings, itinerary items, notes, and documents.
4. A viewer cannot perform editor actions through either the UI or direct client requests.
5. A selected trip can be prepared and independently verified offline.
6. The app launches offline on supported target browsers and shows cached trip data.
7. Offline edits synchronize without silent data loss after reconnection.
8. Concurrent edits produce a resolvable conflict rather than last-write-wins loss.
9. Interrupted uploads retry from the verified local copy or clearly request user action.
10. Sign-out and local-copy removal behavior is understandable and tested.
11. Phone, tablet, and desktop layouts meet agreed accessibility targets.
12. The owner can recover from a paused free-tier backend, complete a pre-trip synchronization, and verify the offline pack.
13. Home and Trip Home compute the correct next action and essential shortcuts for planning, pre-departure, travel-day, and in-trip test scenarios.
14. Flight tracking and check-in shortcuts clearly identify external data and continue to expose stored itinerary details offline.
15. Travel-readiness warnings can be resolved through a linked document or checklist action.
16. Home switches into the correct single current trip at D-1 in the trip timezone and handles overlaps deterministically.
17. A flight progresses from ticket-first to boarding-pass-first presentation and supports manual delay, gate, cancellation, and baggage updates offline.
18. The Alerts page and unread count are reproducible from the same cached data after an offline reload.
19. Every map action works without an API key when online and has an understandable unavailable state when offline.
20. A signed-in user can redeem a targeted code exactly once, while expired, revoked, reused, and rate-limited attempts reveal no trip details.
21. An owner can create managed travelers and non-traveling collaborators without treating either as an ordinary claimed traveler account.
22. Bookings, itinerary items, requirements, and documents consistently use traveler profiles rather than assuming every traveler is a signed-in member.
23. A prepared trip cold-starts in airplane mode and completes the agreed read, document-preview, alert, and local-edit scenarios without any network request.
24. A normal traveler account cannot enter an Admin route or mutate any global configuration table through direct client requests.
25. While online, the dedicated administrator can draft, preview, publish, audit, and roll back airline, airport, metadata-default, and theme changes without gaining trip access; connection loss disables all mutations rather than queuing them.
26. System, Light, and Dark preferences render correctly before the main UI, survive offline restart, and preserve readable urgent, warning, success, disabled, focus, and document states.
27. A published metadata version is cached for offline clients, while existing trip snapshots remain unchanged until an owner explicitly refreshes them.
28. The public demo trip and all sample documents run from bundled synthetic fixtures, reset predictably, work offline, and contain no usable booking, identity, ticket, barcode, or personal data.
29. The current trip and current timeline item remain visually obvious with motion enabled or reduced, and scrolling never continuously resizes the page content.
30. A file of 4,999,999 bytes is accepted and a file of 5,000,000 bytes is rejected consistently before local queuing and by authoritative cloud storage validation.
31. A verified local document opens for the profile that stored it with no cached document-authorization branch, while the same browser signed into another profile cannot discover or open that copy.
32. One itinerary event can display and open several authorized documents online and offline; unlinking one attachment or deleting the event leaves every underlying Vault document intact.
33. A stay confirmation can be shared, a boarding pass or visa can target one or more travelers, and an unnamed admission ticket can remain unassigned without changing who may open it.
34. Opening a document immediately shows the verified local PDF/image, or retrieves and caches it once; metadata and destructive actions remain behind Info.
35. Uploading the same bytes twice in one trip offers the existing Vault document instead of storing a duplicate.
36. Selecting one traveler consistently hides another traveler's assigned events, bookings, readiness, costs, seats, and documents while retaining records shared with everyone.
37. An owner can offer a later trip to a previously associated account, and no membership exists until that account accepts from Home.
38. An owner/editor can add a missing flight connection after creation and see the complete route and seats at the top of Flight details.

## 21. Product Decisions and Open Reviews

| Order | Decision | Status | Why it changes scope |
|---:|---|---|---|
| 1 | PWA only or planned native wrapper milestone | Accepted | PWA first; reconsider a wrapper only after measured personal-use constraints |
| 2 | Sensitive-document threat model | Accepted | Browser/OS profile isolation is the personal MVP boundary; custom encrypted vault is deferred |
| 3 | Exact definition of an essential offline pack | Accepted | Full authorized manifest is Ready offline; deliberate subset is Essentials ready |
| 4 | Owner/editor/viewer permissions | Accepted | Owner manages access; editors change shared data; viewers read and may add private personal files |
| 5 | MVP booking types and fields | Accepted | Flight, hotel, transport, activity, and other share one record model with type-specific fields |
| 6 | Prototype fidelity | Accepted | Production-ready responsive PWA scaffold plus a bundled synthetic demo |
| 7 | Flight tracking source | Accepted | Manual operational fields plus editable airline/public tracker links; no automated provider |
| 8 | Reminder boundary | Accepted | On-load/in-app Alerts page for MVP; Web Push remains a later experiment |
| 9 | Map boundary | Accepted | Keyless Google Maps URLs only; no embedded images, geocoding dependency, optimization, or downloads |
| 10 | Current-trip boundary | Accepted | One focused current trip per user, beginning one calendar day before departure in the trip timezone |
| 11 | Visa-assistance boundary | Accepted | Manual input and official links only; no automated eligibility determination |
| 12 | Recoverable deletion period | Accepted | Trips and documents remain recoverable for 30 days |
| 13 | Invitation mechanism | Accepted | Signed-in recipients redeem unique, expiring, single-use codes targeted to one traveler or non-traveling collaborator |
| 14 | Traveler/account relationship | Accepted | Traveler profiles may be claimed, managed without an account, or absent for a collaborator |
| 15 | Trip information privacy | Accepted | No real trip information is visible to unauthenticated users or before successful membership creation |
| 16 | Offline operating promise | Accepted | A verified local trip pack works in airplane mode; enrollment, sharing, missing downloads, and synchronization remain online |
| 17 | Administrator identity | Accepted | A separate administrator account uses the same Supabase Auth project and an application-admin allowlist rather than a second authentication system |
| 18 | Admin privacy boundary | Accepted | Global configuration authority provides no implicit trip or document access |
| 19 | Theme behavior | Accepted | System is the default, Light and Dark are explicit local overrides, and both palettes remain available offline |
| 20 | Metadata lifecycle | Accepted | Admin changes are online-only; versioned draft/preview/publish/rollback does not silently rewrite existing trip snapshots |
| 21 | Visual reference direction | Accepted | Combine Flighty's immediate operational hierarchy with Tripsy/TripIt's itinerary clarity, while retaining an original warm document-vault identity |
| 22 | Contextual focus effect | Accepted | Use restrained scale/elevation plus an explicit Now or Current label; do not use continuous scroll-linked zoom or motion as the only cue |
| 23 | Demo data | Accepted | Bundle a fully synthetic, resettable Mediterranean trip and small clearly invalid sample documents for prototype and offline testing |
| 24 | Document size | Accepted | Each uploaded original must be smaller than 5,000,000 bytes and the limit is enforced locally and by the Storage bucket |
| 25 | Automatic compression | Accepted | Do not alter files automatically in MVP; consider an explicit image-only smaller-copy tool later, while PDFs remain unchanged |
| 26 | Local document opening | Accepted | Current local sign-in plus a verified file in that profile's namespace is sufficient; only a missing cloud file requires current server authorization |
| 27 | Itinerary event documents | Accepted | Use event-to-document links so one event can contain several documents and one document can be reused without duplicating its stored file |
| 28 | Document usage versus access | Accepted | Shared, selected-traveler, and unassigned usage is independent from private, trip, or selected-member authorization |
| 29 | Document-page hierarchy | Accepted | The document is visible first and cached locally; Info contains facts and management, while full-screen uses the device viewer |
| 30 | Exact duplicate handling | Accepted | Same-trip SHA-256 matches reuse the existing Vault record and bytes |
| 31 | Traveler-focused presentation | Accepted | Everyone shows all authorized trip data; one traveler shows only shared and person-relevant planning records |
| 32 | Reuse associated accounts | Accepted | Prior shared-trip history enables a consent-required direct offer; first-time sharing still uses a private code/QR |
| 33 | Late flight connections | Accepted | Editors may append a validated connection later without recreating the flight booking |
| 34 | Flexible timeline placement | Accepted | Exact, date-only, all-day, relative, and unscheduled events remain accessible on one timeline |
| 35 | Event lifecycle | Accepted | Planned, Done, Skipped, Cancelled, Archive, and Restore have separate meanings |
| 36 | Trip expense companion | Accepted | Record payer and participants, split equally, and show derived balances per currency inside the trip |
| 37 | Independent expense product | Deferred | Revisit a full Splitwise-style experience only after trip-scoped expenses are proven |
| 38 | Admin experience redesign | Deferred | Finish and retest the trip application before rebuilding the responsive administrator experience |

## 22. Research Sources

| Source | Relevant observed capabilities |
|---|---|
| [TripIt](https://www.tripit.com/web/free) | Consolidated itinerary, documents, sharing, calendar sync, and contextual travel access |
| [TripIt feature comparison](https://help.tripit.com/en/support/solutions/articles/103000063396-tripit-or-tripit-pro-) | Separation between basic organization and paid live alerts or guidance |
| [Wanderlog](https://wanderlog.com/) | Offline trip access, realtime collaboration, reservations, checklists, maps, budgets, and flight status |
| [Tripsy](https://tripsy.app/) | Unified activities and documents, guest permissions, calendar sync, and flight updates |
| [Flighty](https://apps.apple.com/us/app/flighty-live-flight-tracker/id1358823008) | Flight-day assistants, contextual check-in, inbound-aircraft context, private sharing, and live alerts |
| [KAYAK Trips](https://www.kayak.co.uk/help/tripshelp) | Email-forwarded booking import and flight status alert emails |
| [OpenSky FAQ](https://opensky-network.org/about/faq) | Personal API availability and explicit absence of schedules, delays, and cancellations |
| [Flightradar24 API](https://fr24api.flightradar24.com/docs/getting-started) | Paid API plans including an Explorer option intended for hobby projects |
| [WebKit Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) | Push support for installed Home Screen web apps on iOS and iPadOS |
| [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/) | Free Worker request allowance and limited Cron Triggers for scheduled experiments |
| [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started) | Cross-platform search, directions, display, and Street View links that require no API key |
| [Google Maps Static API](https://developers.google.com/maps/documentation/maps-static/start) | Static map images require an API key and billing-enabled project |
| [Google Maps pricing](https://developers.google.com/maps/billing-and-pricing/pricing) | Current free monthly usage caps and pay-as-you-go billing for map and geocoding services |
| [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/) | Attribution, caching, and usage rules; bulk or offline download is prohibited on the standard tile service |
| [MDN PWA caching](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Caching) | Service workers and Cache Storage can supply application resources without network access |
| [MDN Origin Private File System](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) | Origin-private document storage, quota behavior, and deletion when site data is cleared |
| [web.dev offline data](https://web.dev/learn/pwa/offline-data) | IndexedDB, Cache Storage, quota estimates, and persistent-storage requests for offline PWAs |
| [WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/) | Safari storage quota, eviction behavior, and persistent mode for Home Screen web apps |
| [Supabase RBAC](https://supabase.com/docs/guides/api/custom-claims-and-role-based-access-control-rbac) | Application roles and permissions enforced with Auth identity and Row Level Security |
| [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) | Database-enforced separation between unauthenticated, authenticated, and authorized row access |
| [MDN prefers-color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-color-scheme) | Device light/dark preference detection for System theme mode |
| [Tailwind transitions](https://tailwindcss.com/docs/transition-property) | Property-specific transitions and reduced-motion variants for restrained interaction feedback |
| [W3C animation from interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) | Avoiding non-essential interaction motion and respecting the user's ability to reduce it |
| [Supabase Storage limits](https://supabase.com/docs/guides/storage/uploads/file-limits) | Global and per-bucket upload-size restrictions |
| [MDN canvas `toBlob`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob) | Browser-side JPEG/WebP quality control is explicitly lossy and therefore requires user review |

## Source File Index

Feature behavior is implemented under `src/features/` and exposed through `src/pages/`. Automated tests are co-located; redesign decisions are tracked separately until accepted.

| Resource | Path | Responsibility |
|---|---|---|
| Feature catalog | `docs/FEATURES.md` | Priority, release, and acceptance scope |
| High-level design | `docs/HIGH_LEVEL_DESIGN.md` | Architecture and system boundaries |
| Low-level design | `docs/LOW_LEVEL_DESIGN.md` | Detailed behavior and implemented contract |
| Application source | `src/` | Routes, feature logic, local-first persistence, and co-located tests |
| Supabase schema | `supabase/migrations/` | Database, authorization, object Storage, and server functions |
| Redesign checklist | `docs/REDESIGN_CHECKLIST.md` | Proposed decisions, schema impact, and small preview slices |
| Documentation conventions | `docs/doc-conventions.md` | Decision and maintenance rules |
