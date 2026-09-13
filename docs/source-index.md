---
title: "Trip Vault Documentation Source Index"
description: "Authoritative implementation and verification sources used by the Trip Vault design documents."
scope: [service-wide]
agents: [coder, reviewer, planner]
tags: [documentation, sources, traceability]
last_verified: 2026-09-13
---

# Trip Vault Documentation Source Index

| Subject | Authoritative source | Used by |
|---|---|---|
| Product scope | `docs/FEATURES.md` | HLD, LLD, manual acceptance |
| Accepted timeline decisions | `docs/REDESIGN_CHECKLIST.md` | HLD, LLD, implementation |
| System architecture | `docs/HIGH_LEVEL_DESIGN.md` | LLD, deployment guidance |
| Routes, data, security, and offline contract | `docs/LOW_LEVEL_DESIGN.md` | Implementation and review |
| Database schema | `supabase/migrations/*.sql` in filename order | LLD and SQL smoke test |
| Document experience and assignment | `src/features/workspace/documentModel.ts`, `src/features/workspace/DocumentInboxPanel.tsx`, `src/features/workspace/api.ts`, `src/features/sync/localSync.ts`, `src/pages/DocumentPage.tsx`, `supabase/migrations/202609130003_account_document_inbox.sql`, `supabase/migrations/202609130004_account_document_storage_state.sql` | HLD and LLD account-first staging, retry, association/cache reconciliation, stale-local suppression, append-only Storage, and online/offline deletion contract |
| Current incremental schema | `supabase/migrations/202609120001_traveler_focus_and_known_accounts.sql`, `supabase/migrations/202609130001_timeline_lifecycle_and_trip_expenses.sql`, `supabase/migrations/202609130002_regional_travel_catalog.sql`, `supabase/migrations/202609130003_account_document_inbox.sql`, `supabase/migrations/202609130004_account_document_storage_state.sql`, `supabase/migrations/202609130005_booking_vendor_catalog_additions.sql`, `supabase/migrations/202609130006_trip_storage_cleanup_queue.sql`, `supabase/migrations/202609130007_relative_event_timing.sql` | Existing-project deployment order; `202609130005` requires the regional published release and an active administrator, `202609130006` installs cleanup/connection hardening, and `202609130007` separates relative placement from schedule precision |
| Timeline and booking implementation | `src/features/timeline/TimingFields.tsx`, `src/features/timeline/model.ts`, `src/features/trips/TripForms.tsx`, `src/features/trips/api.ts`, `src/features/workspace/AddActivityBookingForm.tsx`, `src/pages/TripPage.tsx`, `src/pages/FlightPage.tsx`, `src/pages/BookingPage.tsx` | Relative timing parsing, stable named anchor groups, generic booking-later behavior, endpoint-zone presentation, and acceptance |
| Card interaction hierarchy and expense detail | `src/pages/TripPage.tsx`, `src/pages/TripPage.test.tsx`, `src/pages/BookingPage.tsx`, `src/pages/FlightPage.tsx`, `src/pages/FlightPage.test.tsx`, `src/pages/ReadinessPage.tsx`, `src/features/workspace/TripAirlinesPanel.tsx`, `src/features/workspace/TripAirlinesPanel.test.tsx` | Whole-card reservation navigation, read-first booking/event/expense detail for every trip role, payer/linkage/share/note detail, opt-in balances, Owner trip-overview settings, readiness direct edit with independent controls, other shallow direct-edit cards, and independent phone/map/archive actions |
| Trip date defaults | `src/pages/CreateTripPage.tsx` | Suggested +15-day Start, seven-day trip, and preservation of an explicitly edited End |
| Journey entry and conditional fields | `src/features/timeline/AddEventForm.tsx`, `src/features/metadata/AirportPicker.tsx`, `src/features/metadata/VendorPicker.tsx`, `src/features/workspace/AddFlightConnectionForm.tsx`, `supabase/migrations/202609130006_trip_storage_cleanup_queue.sql` | Direct/Connecting setup, fixed appended-flight origin, client/server endpoint-continuity validation, Domestic country filtering, Domestic/International timezone controls, and reversible Other entry |
| Journey and cost presentation | `src/features/timeline/model.ts`, `src/components/TripUi.tsx`, `src/pages/HomePage.tsx`, `src/pages/TripPage.tsx` | Full route and duration labels plus compact links to itemized trip expenses |
| Journey detail zones and flight editing | `src/pages/FlightPage.tsx`, `src/pages/BookingPage.tsx`, `src/pages/FlightPage.test.tsx`, `src/pages/BookingPage.test.tsx` | Origin-zone departure, destination-zone arrival/end, and hidden Domestic repeated-clock controls |
| Generic event booking enrichment | `src/features/workspace/AddActivityBookingForm.tsx`, `src/features/workspace/AddActivityBookingForm.test.tsx`, `src/features/trips/TripForms.tsx`, `src/features/trips/api.ts` | Activity/Meal/Transport/Preparation/Custom eligibility, nullable untimed schedule, existing/new booking paths, linked creation, and compensating archive |
| Relative-event timing contract | `src/features/timeline/TimingFields.tsx`, `src/features/timeline/TimingFields.test.tsx`, `src/features/timeline/model.ts`, `src/features/trips/calendar.ts`, `supabase/migrations/202609130007_relative_event_timing.sql` | Relation-only/duration-only/later explicit timing, derivation and bounds checks, stable display order, current-state exclusion, and calendar omission |
| Permanent trip purge | `src/features/trips/api.ts`, `supabase/migrations/202609130006_trip_storage_cleanup_queue.sql` | Atomic legacy-path queue plus database deletion, post-commit object cleanup/acknowledgement, later trip-list retry, and post-association account-inbox cleanup |
| Route scroll ownership | `src/app/RouteScrollManager.tsx`, `src/pages/TripPage.tsx` | Top reset between pathnames and same-trip Timeline/Details position restoration |
| Booking-vendor fallback and publication | `src/features/metadata/VendorPicker.tsx`, `src/features/workspace/WorkspaceForms.tsx`, `src/features/metadata/starter-vendors.json`, `supabase/migrations/202609130005_booking_vendor_catalog_additions.sql` | Create/edit website reconciliation plus Airbnb and Trip.com in bundled and published catalogs without rewriting booking snapshots |
| Fresh-launch trip routing | `src/components/RootRoute.tsx`, `src/components/RootRoute.test.tsx`, `src/features/trips/presentation.ts` | D-1 candidate resolution, saved-focus preference, deterministic overlap fallback, and explicit `/home` staying on Home |
| Administrator configuration | `src/features/admin/`, `src/pages/AdminPage.tsx` | HLD and LLD |
| Account-inbox deletion verification | `src/features/workspace/api.document-inbox-delete.test.ts`, `supabase/tests/001_schema_smoke.sql` | Never-attempted offline discard, online-only cloud cleanup, and append-only Storage policy checks |
| Automated verification | `src/**/*.test.ts`, `src/**/*.test.tsx`, `supabase/tests/001_schema_smoke.sql` | Release evidence; current local Vitest baseline is 47 files and 247 tests |
| Manual acceptance | `docs/FEATURE_TEST_CHECKLIST.md` | Phone, desktop, offline, sharing, and Admin release gate |

External behavior references are deliberately narrow: provider-local travel schedules follow airline ticket conventions; Call uses the platform `tel:` handler; WhatsApp uses its official `wa.me` click-to-chat format; map actions use Google Maps URLs without an embedded Maps API key.

The September 2026 document-model review used a temporary, user-supplied set of visa, accommodation, flight, activity-admission, meal-voucher, and receipt PDFs. Those private files are neither copied into this repository nor named in design documentation; only generalized structural findings are retained.
