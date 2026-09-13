---
title: "Trip Vault Feature Test Checklist"
description: "Short manual acceptance checklist for the timeline-first Trip Vault release on phone and desktop."
scope: [service-wide]
agents: [tester, reviewer]
tags: [manual-testing, acceptance, timeline, mobile, admin]
last_verified: 2026-09-13
---

# Trip Vault Feature Test Checklist

For an existing Supabase project, run every not-yet-applied migration in filename order through `supabase/migrations/202609130006_trip_storage_cleanup_queue.sql`. If the database is current through `202609130004_account_document_storage_state.sql`, run `202609130005` and then `202609130006`; if it is already current through `202609130005`, run only `202609130006`. Then run the schema smoke test. The catalog addition requires the published regional release from `202609130002` and an active `app_admins` row.

For a fresh project, run `supabase/TRIP_VAULT_COMPLETE_SETUP.sql`—it already includes the `202609130006` schema contract—bootstrap the dedicated active administrator, run `202609130002_regional_travel_catalog.sql`, run `202609130005_booking_vendor_catalog_additions.sql`, and then run `supabase/tests/001_schema_smoke.sql`. Sign in with three test accounts and use synthetic names and documents smaller than 5 MB.

## Organizer and Timeline

- [ ] Open Create trip and confirm Start initially suggests 15 days from today and End seven days after Start. Change Start and confirm the untouched End follows; edit End deliberately, change Start again, and confirm the chosen End is preserved.
- [ ] Create a trip, add three travelers, click its card, and confirm Timeline opens first.
- [ ] Open Add Event and confirm the order is Flight, Hotel, Activity, Bus, Train, Ferry/Boat, Cab, Meal, Preparation, Other transport, and Custom.
- [ ] Add preparation tasks before departure and confirm the separate Trip readiness summary remains above the timeline.
- [ ] Add a readiness check, complete it, and confirm the readiness count changes.
- [ ] Add an activity, meal, and custom event; include a map link and attach several documents to one event.
- [ ] Add exact-time, date-only, all-day, before/after, and unscheduled events. Confirm relative events sit beside their anchor and undated work stays under Unscheduled.
- [ ] Add an activity end time and confirm it remains current until the end time.
- [ ] Try an event before the trip starts and after it ends; confirm saving is blocked.
- [ ] Open Add Hotel and confirm property name is primary; check-in starts at 15:00 on the trip start date and checkout starts at 11:00 the following day. Confirm no service-provider, time-zone, or repeated-clock control appears and Booked via remains available.
- [ ] Set a deliberate later checkout, move check-in while it remains earlier, and confirm the chosen checkout is preserved.
- [ ] Move check-in to the same time as or after checkout and confirm checkout advances to 11:00 the following day.
- [ ] Manually set checkout equal to and earlier than check-in; confirm saving is blocked, no partial reservation appears, and the form remains open for correction.
- [ ] Correct checkout, save, and confirm one hotel reservation creates separate check-in and checkout timeline milestones using the app's hidden local compatibility zone; no zone choice should be required.
- [ ] Add a free event cost (`0`), a paid cost in a non-trip currency selected from the dropdown, and leave one event without cost; confirm `Free`, per-currency totals, and `Cost missing` are distinct.
- [ ] Add costs with different payers and participant combinations. Confirm equal-split balances conserve every minor unit and currencies remain separate.
- [ ] Confirm Home and the trip header each show the compact readable per-currency total. Activate each and confirm both open the same itemized Trip expenses section with cost rows, payer/participant balances, and actions.
- [ ] Edit a prefilled cost name, archive an incorrect cost, and restore it from Archived trip items.
- [ ] Confirm the timeline has day separators, a vertical line on phone, and only the current/next item is highlighted.
- [ ] Reopen the trip and confirm it scrolls to the current/next item; switch to Trip details and back and confirm the position is restored.
- [ ] Scroll far down the timeline, then open Home, Profile, Vault, and a different trip. Confirm each unrelated pathname starts at the top and does not inherit the original timeline position.
- [ ] Fresh-launch the installed app during an active trip and confirm it opens that trip immediately. With overlapping current trips, confirm an eligible saved focus wins; without one, confirm earliest end, then earliest start, then stable ID decides consistently. Navigate explicitly to Home and confirm it stays there instead of reopening the trip.
- [ ] Open event details, then Edit, Add cost, or Upload. Press browser/device Back and confirm it returns to event details before leaving the trip.
- [ ] Mark events Planned, Done, Skipped, and Cancelled; confirm status does not archive them and inactive events do not become current.
- [ ] Archive a standalone event and a hotel/booking milestone. Confirm the full booking group leaves the timeline, linked documents and costs remain, and the item restores from Archived trip items.
- [ ] As owner, type the exact trip name into the temporary permanent-delete control and remove one stale test trip that has both a legacy trip document and an inbox-originated document. Confirm the database transaction leaves legacy paths in `trip_storage_cleanup_queue` while deleting the trip, successful Storage cleanup removes those queue rows afterward, and the account-inbox bytes/receipt disappear after association clears. Interrupt legacy Storage cleanup and confirm the trip stays deleted while the queue row remains; restore connectivity and load Trips/Home to confirm a later online trip-list read retries and acknowledges it. Separately interrupt account-inbox cleanup and confirm its now-unassociated receipt remains visible in Profile.
- [ ] Search by title, PNR, airport code, vendor, traveler, document, and readiness item; open or jump to each result.
- [ ] Open Trip details and review Overview, Reservations, Costs, People, Readiness, Documents, Offline, Travel data, and Notes.
- [ ] Create an exact-time Activity without a booking, reopen its event details while online, add reservation details, and confirm one linked booking appears without a duplicate timeline event. Confirm the action disables itself offline.
- [ ] Repeat with date-only, all-day, before/after, and unscheduled Activities. Confirm each offers Set exact time instead of copying its synthetic ordering instant into a booking; set an exact time and then confirm booking details can be added online.

## Journeys and Bookings

- [ ] Choose Flight and confirm Domestic/International and Direct/Connecting are asked before leg details. Direct must show exactly one leg; Connecting must begin with two and allow more.
- [ ] Add an international connecting flight with a mandatory PNR, booking vendor, phone, and three legs. Confirm there is no generic Place/Location field.
- [ ] In a Connecting journey, make leg 2 depart from a different airport/station than leg 1 reaches and confirm save is rejected. Correct it to the same endpoint and confirm normalized code comparison succeeds; repeat without codes to exercise the normalized-name fallback.
- [ ] Search Airline and Booked via by name. In both Add Event and Edit booking, choose a saved vendor with a catalog URL and confirm Booking website is replaced with it; choose a saved vendor with no URL and confirm a stale website is cleared.
- [ ] Choose Other for Booked via and confirm the saved-value picker remains present and the prior catalog URL is cleared before manual entry. Select a saved vendor to leave Other without restarting the form; repeat with Airbnb and Trip.com.
- [ ] Choose saved From and To airports by name/code and confirm each airport name, country, zone, and disabled airport code are derived with no manual zone field. Choose an International Other airport and confirm manual name, code, country, and strict time-zone inputs appear.
- [ ] Add a Domestic flight and confirm no zone or repeated-clock selector appears and the destination list stays within the origin country. Open Update flight and confirm scheduled, estimated, actual, and boarding fields also hide daylight-saving/repeated-clock controls. For a same-country route that crosses time-zone regions, choose International and confirm separate endpoint zones become available.
- [ ] Add a Domestic Train/Bus/Ferry/Cab and confirm one journey-country code is asked once for the whole booking, not on every leg; confirm no zone or repeated-clock field appears. Add an International non-flight journey and confirm strict origin/destination zones are requested because no station/port catalog derives them.
- [ ] Enter an Other airline, airport, and booking source; save online and confirm each appears in the Admin Suggestions review without exposing the trip or PNR.
- [ ] Enter departure and arrival exactly as printed in their endpoint-local times. Confirm departure displays in the origin zone, each arrival and the booking/timeline end display in the destination/final-destination zone, real elapsed duration is calculated from both converted instants, and a next-day marker appears where applicable; do not expect the zone to invent an arrival time.
- [ ] Create 25-hour and eight-day examples and confirm duration labels use day and week units while retaining useful hour/day remainders.
- [ ] Add boarding lead minutes and confirm boarding is calculated from scheduled departure; then add an exact boarding time and confirm it takes precedence.
- [ ] Enter a seat for each traveler. In Everyone context confirm all seats appear at the top of Flight details; select one traveler and confirm only that person's seat appears.
- [ ] Manually update flight delay, status, terminals, gates, baggage claim, and baggage-tag document.
- [ ] Open flight and train forms and confirm Contact name is absent. Confirm operator remains present for non-flight journeys and phone remains optional.
- [ ] Add domestic Train, Bus, Ferry/Boat, and Cab bookings and open each reservation detail.
- [ ] Add a connected non-flight journey and confirm it is one booking with ordered legs on one grouped timeline event; cards and details must show every stop in order.
- [ ] Create a one-leg flight, open Flight details, and add a later connection. Confirm its origin is fixed to the prior arrival; for Domestic, confirm destination airports are limited to the same country. Save and confirm the full route appears at the top, seats remain correct, and the timeline ends at the new arrival.
- [ ] Attempt the same append with a modified/direct request whose origin code/name or departure zone differs from the previous arrival, whose departure is not after arrival, whose scope changes, or whose Domestic destination changes country. Confirm the server rejects it and adds no partial leg.
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
- [ ] From Profile, save a document before choosing a trip. Confirm it appears immediately in the private inbox, survives reload, and reports queued rather than stored if the Storage request fails.
- [ ] Interrupt or block one Storage upload, restore the connection on the same device, and press Retry cloud. Confirm the receipt is marked stored only after the object exists and no duplicate object or document is created.
- [ ] Interrupt a successful Storage upload before its completion receipt is recorded, then open the inbox on another signed-in device. Confirm Check cloud/server verification recovers the object without re-uploading it.
- [ ] Open a receipt whose Storage upload genuinely failed on another signed-in device. Confirm it does not claim the missing bytes are stored and, after checking Supabase, tells you to use the original device or reselect the original; reconnect before using Delete and confirm it removes the unassociated receipt.
- [ ] While offline, delete a pending local inbox upload before its first cloud attempt and confirm both its device copy and queued operation disappear. Repeat after one failed/partial attempt and with a cloud-stored upload; confirm both are retained with a reconnect-to-delete message so they cannot reappear during sync.
- [ ] Attach a successfully stored inbox file to a trip and confirm one document/version is created. Attempt association for an unfinished receipt and confirm the server rejects it without creating a broken Vault entry.
- [ ] After association, confirm the upload no longer appears as an unfinished inbox item, pending/error state is cleared, and direct Storage UPDATE/DELETE attempts fail. Reload, reconnect, and check from another signed-in device; confirm the associated server receipt suppresses any stale unassociated cached copy instead of making the upload reappear. Manage the resulting document through Vault archive/replacement instead.
- [ ] Change document type and Who is it for and confirm the generated Vault name updates while the original filename remains in Info.
- [ ] Upload from an event and confirm the default name includes document type, traveler context, and event title. Enter a custom name and confirm the derived context still appears below it.
- [ ] Open a PDF and image from cloud and from the device copy; confirm the embedded preview renders and Open launches a zoomable full-screen viewer without requiring a download.
- [ ] Turn the network off, create/edit an event and upload a document; confirm it remains available locally and reports queued synchronization.
- [ ] Prepare the offline pack, reload while offline, and open the timeline plus a pinned document.
- [ ] Restore the network and confirm queued work synchronizes without duplicate events or costs.
- [ ] Confirm the published catalog contains the regional airport, airline, and booking-vendor starter entries and that a selected catalog value still works after an offline reload.

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
