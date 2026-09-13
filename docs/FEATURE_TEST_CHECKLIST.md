---
title: "Trip Vault Feature Test Checklist"
description: "Short manual acceptance checklist for the timeline-first Trip Vault release on phone and desktop."
scope: [service-wide]
agents: [tester, reviewer]
tags: [manual-testing, acceptance, timeline, mobile, admin]
last_verified: 2026-09-13
---

# Trip Vault Feature Test Checklist

For an existing Supabase project, run every not-yet-applied migration through `supabase/migrations/202609130001_timeline_lifecycle_and_trip_expenses.sql`; for a fresh project, run `supabase/TRIP_VAULT_COMPLETE_SETUP.sql`. Then run `supabase/tests/001_schema_smoke.sql` and sign in with three test accounts. Use synthetic names and documents smaller than 5 MB.

## Organizer and Timeline

- [ ] Create a trip, add three travelers, click its card, and confirm Timeline opens first.
- [ ] Add preparation tasks before departure and confirm the separate Trip readiness summary remains above the timeline.
- [ ] Add a readiness check, complete it, and confirm the readiness count changes.
- [ ] Add an activity, meal, and custom event; include a map link and attach several documents to one event.
- [ ] Add exact-time, date-only, all-day, before/after, and unscheduled events. Confirm relative events sit beside their anchor and undated work stays under Unscheduled.
- [ ] Add an activity end time and confirm it remains current until the end time.
- [ ] Try an event before the trip starts and after it ends; confirm saving is blocked.
- [ ] Open Add Hotel and confirm check-in starts at 15:00 on the trip start date while checkout starts at 11:00 the following day.
- [ ] Set a deliberate later checkout, move check-in while it remains earlier, and confirm the chosen checkout is preserved.
- [ ] Move check-in to the same time as or after checkout and confirm checkout advances to 11:00 the following day.
- [ ] Manually set checkout equal to and earlier than check-in; confirm saving is blocked, no partial reservation appears, and the form remains open for correction.
- [ ] Correct checkout, save, and confirm one hotel reservation creates separate check-in and checkout timeline milestones in the selected hotel time zone.
- [ ] Add a free event cost (`0`), a paid cost in a non-trip currency selected from the dropdown, and leave one event without cost; confirm `Free`, per-currency totals, and `Cost missing` are distinct.
- [ ] Add costs with different payers and participant combinations. Confirm equal-split balances conserve every minor unit and currencies remain separate.
- [ ] Click the total at the top, edit a prefilled cost name, archive an incorrect cost, and restore it from Archived trip items.
- [ ] Confirm the timeline has day separators, a vertical line on phone, and only the current/next item is highlighted.
- [ ] Reopen the trip and confirm it scrolls to the current/next item; switch to Trip details and back and confirm the position is restored.
- [ ] Fresh-launch the installed app during an active trip and confirm it opens that trip immediately.
- [ ] Open event details, then Edit, Add cost, or Upload. Press browser/device Back and confirm it returns to event details before leaving the trip.
- [ ] Mark events Planned, Done, Skipped, and Cancelled; confirm status does not archive them and inactive events do not become current.
- [ ] Archive a standalone event and a hotel/booking milestone. Confirm the full booking group leaves the timeline, linked documents and costs remain, and the item restores from Archived trip items.
- [ ] As owner, type the exact trip name into the temporary permanent-delete control and remove one stale test trip. Confirm its database records and cloud files disappear.
- [ ] Search by title, PNR, airport code, vendor, traveler, document, and readiness item; open or jump to each result.
- [ ] Open Trip details and review Overview, Reservations, Costs, People, Readiness, Documents, Offline, Travel data, and Notes.

## Journeys and Bookings

- [ ] Add an international flight with a mandatory PNR, booking vendor, phone, origin/destination time zones, and two connected legs.
- [ ] Search airline and Booked via by name, choose saved values, and confirm the selected booking website is filled when catalog data provides it.
- [ ] Choose saved From and To airports by name/code and confirm each airport code is derived and disabled. Choose Other and confirm manual name, code, country, and strict time-zone inputs appear.
- [ ] Enter an Other airline, airport, and booking source; save online and confirm each appears in the Admin Suggestions review without exposing the trip or PNR.
- [ ] Confirm each flight shows the provider-local departure/arrival time, correct elapsed duration, and next-day marker where applicable.
- [ ] Add boarding lead minutes and confirm boarding is calculated from scheduled departure; then add an exact boarding time and confirm it takes precedence.
- [ ] Enter a seat for each traveler. In Everyone context confirm all seats appear at the top of Flight details; select one traveler and confirm only that person's seat appears.
- [ ] Manually update flight delay, status, terminals, gates, baggage claim, and baggage-tag document.
- [ ] Add domestic Train, Bus, Ferry/Boat, and Cab bookings and open each reservation detail.
- [ ] Add a connected non-flight journey and confirm it is one booking with ordered legs on one grouped timeline event.
- [ ] Create a one-leg flight, open Flight details, add a later connection, and confirm the full route appears at the top, seats remain correct, and the timeline ends at the new arrival.
- [ ] Tap Call and WhatsApp on a real phone and confirm the correct number is passed to the installed handler.
- [ ] Tap Navigate for a hotel, activity, meal, and other location and confirm Google Maps opens without an API key.

## Sharing, Documents, and Offline

- [ ] Create a traveler invitation, scan its QR on a second phone, sign in, and confirm the code remains prefilled and joins the intended traveler.
- [ ] Create a non-traveling helper invitation and confirm it joins without being assigned as a traveler.
- [ ] Confirm a used, revoked, expired, or regenerated code cannot be reused.
- [ ] Use the floating People control to switch between Everyone and each traveler without another permission prompt.
- [ ] In Everyone, confirm all events/reservations/readiness/costs/documents appear. Select traveler A and confirm shared plus A's records remain while traveler B-only records disappear, including inside an opened event.
- [ ] Reopen the trip and confirm its last traveler selection is restored without changing the signed-in account or role.
- [ ] After account B has joined one trip, create another trip, choose B under Known account, and confirm B sees Accept/Decline on Home and cannot open the new trip before accepting.
- [ ] Repeat the known-account offer as a non-traveling helper and confirm acceptance creates no traveler assignment.
- [ ] Upload PDF/JPEG/PNG/WebP documents; confirm 5 MB or larger and unsupported files are rejected.
- [ ] Change document type and Who is it for and confirm the generated Vault name updates while the original filename remains in Info.
- [ ] Upload from an event and confirm the default name includes document type, traveler context, and event title. Enter a custom name and confirm the derived context still appears below it.
- [ ] Open a PDF and image from cloud and from the device copy; confirm the embedded preview renders and Open launches a zoomable full-screen viewer without requiring a download.
- [ ] Turn the network off, create/edit an event and upload a document; confirm it remains available locally and reports queued synchronization.
- [ ] Prepare the offline pack, reload while offline, and open the timeline plus a pinned document.
- [ ] Restore the network and confirm queued work synchronizes without duplicate events or costs.

## Deferred Admin Follow-up

The current Admin console is intentionally not an exit gate for the trip-app retest. Redesign it after the traveler experience is stable, then run this section.

- [ ] Sign in through the separate Admin entry and confirm a normal member cannot open it.
- [ ] Create a draft; add/edit/disable airlines, airports, booking vendors, and both light/dark palettes.
- [ ] Enter unknown airline, airport, operator, and vendor values in a trip and confirm privacy-safe suggestions appear in Admin.
- [ ] Promote, merge, or reject suggestions; publish the draft; confirm pickers use the published values.
- [ ] Roll back a prior release and confirm trip PNRs, dates, travelers, and documents never appear in Admin or its audit history.

## Responsive Exit Gate

- [ ] Complete the checklist at a phone width and a desktop width in both light and dark mode.
- [ ] Install the PWA on a phone and confirm Add Event/People controls do not overlap browser or app safe areas.
