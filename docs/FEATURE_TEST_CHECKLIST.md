---
title: "Trip Vault Feature Test Checklist"
description: "Short manual acceptance checklist for the timeline-first Trip Vault release on phone and desktop."
scope: [service-wide]
agents: [tester, reviewer]
tags: [manual-testing, acceptance, timeline, mobile, admin]
last_verified: 2026-09-15
---

# Trip Vault Feature Test Checklist

For an existing Supabase project, run every not-yet-applied migration in filename order through `supabase/migrations/202609150002_participant_trigger_row_types.sql`, then run the schema smoke test. The earlier catalog addition still requires the published regional release from `202609130002` and an active `app_admins` row.

For a fresh project, run `supabase/TRIP_VAULT_COMPLETE_SETUP.sql`—it includes the readiness-timeline and document-visibility contract—bootstrap the dedicated active administrator, run `202609130002_regional_travel_catalog.sql`, run `202609130005_booking_vendor_catalog_additions.sql`, and then run `supabase/tests/001_schema_smoke.sql`. Sign in with three test accounts and use synthetic names and documents smaller than 5 MB.

## Database Gate

- [ ] On an existing project current through `202609140001`, run `202609150001_readiness_timeline_and_document_visibility.sql` once and then run `supabase/tests/001_schema_smoke.sql`; confirm the smoke test passes before testing tasks or access changes.
- [ ] Run `202609150002_participant_trigger_row_types.sql`, then create a Flight for Selected travelers with per-person flight details, an event cost with participants, and an attached document. Confirm the whole flow saves without a `NEW.itinerary_item_id` row-type error and all selected travelers remain attached to the booking and timeline event.
- [ ] On a fresh project, run the complete setup and smoke test; confirm readiness timing columns/guard, `update_document_visibility`, reservation state, participant scope, typed ground details, per-leg traveler allocations, and `save_hotel_stay` are present.

## Organizer and Timeline

- [ ] Open Create trip and confirm Start initially suggests 15 days from today and End seven days after Start. Change Start and confirm the untouched End follows; edit End deliberately, change Start again, and confirm the chosen End is preserved.
- [ ] Create a trip, add three travelers, click its card, and confirm Timeline opens first.
- [ ] Open Add Event and confirm the order is Flight, Hotel, Activity, Bus, Cab, Ferry/Boat, Train, Meal, Preparation, Other transport, and Custom.
- [ ] Add three tasks: Checklist only, On a date, and **3 days before** a selected flight. Leave one as the default **Everyone**, assign one to traveler A, and assign one to traveler B. Confirm the scheduled tasks appear as compact checkbox rows inside the same connected timeline while checklist-only remains in **Tasks & readiness**. Confirm only specifically assigned rows show traveler names; the Everyone row shows no audience label.
- [ ] Switch the trip from Everyone to traveler A. Confirm Everyone tasks and traveler A tasks remain in the readiness summary, checklist, search, alerts, and timeline while traveler B-only tasks disappear immediately. Switch to traveler B and confirm the inverse. Add a new traveler and confirm an Everyone task applies without editing it.
- [ ] Let the linked task become due, reopen the trip, and confirm it is the highlighted actionable row. Check it off in the timeline and confirm an in-app success message appears, its highlight disappears, the next event becomes active, and its derived alert disappears.
- [ ] Open **Tasks & readiness** and confirm pending and completed tasks remain visible. Reopen a completed task, then archive it; confirm both actions show in-app feedback and Archive removes it from the list, timeline, and alerts.
- [ ] Add an activity, meal, and custom event; include a map link and attach several documents to one event.
- [ ] Add exact-time, date-only, all-day, before/after, and unscheduled events. Create two Before and two After events for one anchor and confirm the stable order is every Before item, the named anchor, then every After item; undated work stays under Unscheduled.
- [ ] Create a relation-only event such as **After Hotel check-in**. Confirm Position and Event remain visible, Start is blank, End is disabled, and timeline plus detail say **After Hotel check-in** rather than showing the anchor's clock as this event's start.
- [ ] Create a duration-only relative event, choosing minutes, hours, and days in separate edits. Confirm the planned duration appears while Start remains unknown, the item never becomes **Current** solely at the anchor time, calendar export omits it, and adding a booking leaves booking start/end/timezone empty.
- [ ] Edit the relative event later and add Start plus Duration; confirm End is derived. Then use Start plus End and confirm Duration is derived. Supply all three consistently, then make Duration disagree and confirm saving is blocked without losing the form values.
- [ ] Try End without Start, End equal to/before Start, zero/negative duration, and a duration whose derived End crosses the trip boundary; confirm each is rejected. Confirm changing the anchor later updates only an untimed relation's placement fallback and does not overwrite a relative event's real start.
- [ ] At phone width with the keyboard open, confirm Position/Event stay above a separate full-width Optional schedule details block, labels remain readable, duration value/unit remain reachable, and End enables immediately after Start is entered. Repeat at desktop width and confirm the fields use the available two-column layout.
- [ ] Add an activity end time and confirm it remains current until the end time.
- [ ] Try an event before the trip starts and after it ends; confirm saving is blocked.
- [ ] Open Add Hotel and confirm property name is primary, Reservation confirmed is initially selected, check-in/check-out printed times are optional, and Booked via appears. Switch to Plan only and back to confirm booking fields hide/reappear without losing the stay dates; no service-provider, time-zone, or repeated-clock control should appear.
- [ ] Save a Hotel with neither printed time and confirm both check-in and checkout appear as date-only milestones without presenting a fake printed time. Repeat with one or both printed times and confirm the corresponding milestone changes to exact-time presentation.
- [ ] Set a deliberate later checkout, move check-in while it remains earlier, and confirm the chosen checkout is preserved.
- [ ] Manually set checkout equal to and earlier than check-in; confirm saving is blocked, no partial booking/traveler/milestone records appear, and the form remains open for correction.
- [ ] Correct checkout, save, and confirm one atomic save creates the Hotel reservation, selected traveler scope, and both check-in/checkout milestones using the hidden local compatibility zone; no zone choice should be required.
- [ ] Add a free event cost (`0`), a paid cost in a non-trip currency selected from the dropdown, and leave one event without cost; confirm `Free`, per-currency totals, and `Cost missing` are distinct.
- [ ] Add costs with different payers and participant combinations. Enable **Show balances** and confirm equal-split balances conserve every minor unit and currencies remain separate.
- [ ] Confirm Home and the trip header each show the compact readable per-currency total. Activate each and confirm both open the same itemized Trip expenses section with cost rows and the opt-in **Show balances** control.
- [ ] Edit a prefilled cost name, archive an incorrect cost, and restore it from Archived trip items.
- [ ] Confirm the timeline has day separators, a vertical line on phone, and only the current/next item is highlighted.
- [ ] With an Owner/Editor account, click/tap the title, blank padding, and trailing area of a timeline card and confirm each opens the same read-first event sheet rather than the edit form. Tab to the card and activate it with Enter and Space; confirm visible focus and the same result on desktop, then repeat with a phone tap.
- [ ] Open that event as a Viewer and confirm its timing, travelers, location, booking, costs, and documents remain readable while Edit event, Archive, status mutation, and other editor-only actions are absent. Repeat as Editor and confirm Edit and Archive live inside the event sheet rather than on the timeline card.
- [ ] Reopen the trip and confirm it scrolls to the current/next item; switch to Trip details and back and confirm the position is restored.
- [ ] Scroll far down the timeline, then open Home, Profile, Vault, and a different trip. Confirm each unrelated pathname starts at the top and does not inherit the original timeline position.
- [ ] Fresh-launch the installed app during an active trip and confirm it opens that trip immediately. With overlapping current trips, confirm an eligible saved focus wins; without one, confirm earliest end, then earliest start, then stable ID decides consistently. Navigate explicitly to Home and confirm it stays there instead of reopening the trip.
- [ ] Open event details, then Edit, Add cost, or Upload. Press browser/device Back and confirm it returns to event details before leaving the trip.
- [ ] Mark events Planned, Done, Skipped, and Cancelled; confirm status does not archive them and inactive events do not become current.
- [ ] Archive a standalone event and a hotel/booking milestone. Confirm the full booking group leaves the timeline, linked documents and costs remain, and the item restores from Archived trip items.
- [ ] As owner, type the exact trip name into the temporary permanent-delete control and remove one stale test trip that has both a legacy trip document and an inbox-originated document. Confirm the database transaction leaves legacy paths in `trip_storage_cleanup_queue` while deleting the trip, successful Storage cleanup removes those queue rows afterward, and the account-inbox bytes/receipt disappear after association clears. Interrupt legacy Storage cleanup and confirm the trip stays deleted while the queue row remains; restore connectivity and load Trips/Home to confirm a later online trip-list read retries and acknowledges it. Separately interrupt account-inbox cleanup and confirm its now-unassociated receipt remains visible in Profile.
- [ ] Repeat permanent deletion for a trip whose document has a current version. Confirm the pre-delete document lookup succeeds without a “more than one relationship” embedding error and deletion continues through the owner-only RPC.
- [ ] Search by title, PNR, airport code, vendor, traveler, document, and readiness item; open or jump to each result.
- [ ] Open Trip details and review Overview, Reservations, Costs, People, Readiness, Documents, Offline, Travel data, and Notes.
- [ ] In People & sharing, click a traveler card and confirm focus changes and the sheet closes. Reopen it, use that traveler's pencil action, change the traveler name, and confirm Back returns to People. Verify assignments use the new trip-local name while the linked member's Profile name is unchanged; confirm a Viewer has no pencil action.
- [ ] In an event sheet, activate a linked expense row; then activate the same or another row in the main Trip expenses section. Confirm both open `CostDetailsSheet` and show amount, payment state, category, payer, connected event/booking, every participant and equal/explicit share, and notes. As Viewer, confirm the same detail remains available but Edit expense and Archive are absent; as Editor, confirm those actions appear only inside the sheet.
- [ ] Reload the Trip expenses section and confirm **Balances by currency** is absent by default. Enable **Show balances**, verify each currency remains separate and the expected gets/owes values appear, then disable it and confirm the balances hide without changing costs. Repeat the toggle as Viewer.
- [ ] As Editor, activate the body of a trip note and a trip-airline snapshot and confirm each opens its edit surface directly because the displayed card already contains its useful detail. Confirm the note's Archive button is a separate target and does not open Edit. As Viewer, confirm both cards are static and no edit/archive controls appear.
- [ ] On **Tasks & readiness**, as Owner and Editor use each row checkbox, Edit, and Archive independently and confirm each has a phone-sized target. Confirm the schedule reads Checklist only, Due date, or the named before/after event offset. As Viewer, confirm rows remain readable while mutation controls are unavailable.
- [ ] In Trip details, as Owner click/tap the body of the **Trip information** overview and activate it by keyboard; confirm it opens Trip settings. Close it, use the explicit Settings action, and confirm the same destination opens without a duplicate activation. As Editor and Viewer, confirm the overview body is static and no Owner settings target is exposed.
- [ ] In the Admin console, confirm catalog cards continue to use their explicit named controls and have no ambiguous whole-card action. Treat this as deliberate until the Admin redesign.
- [ ] Create unbooked Activity, Meal, Other transport, Preparation, and Custom events. Use Selected travelers on one and Everyone on another. Reopen each while online, add reservation details, and confirm one type-appropriate Booked row appears without a duplicate timeline event or changed before/after placement; Selected keeps those travelers, while Everyone writes no redundant individual traveler links. Confirm the action disables itself offline.
- [ ] Repeat booking-later with date-only, all-day, unscheduled, relation-only, and duration-only relative events. Confirm booking start/end/source timezone remain empty instead of copying a synthetic ordering instant. Add a real start to the relative event, add booking details again on a fresh case, and confirm the actual event schedule is used.
- [ ] Edit an unbooked supported event when the trip already has bookings. Confirm **Link an existing booking** remains available alongside **Add new booking**, and either path preserves the event's identity and participants.

## Journeys and Bookings

- [ ] Choose Flight and confirm Domestic/International and Direct/Connecting are asked before leg details. Direct must show exactly one leg; Connecting must begin with two and allow more. Choose Train, Bus, and Ferry and confirm the wording is Single or Connecting service. Choose Cab and confirm no route-structure question appears.
- [ ] Confirm Flight is always Booked and Hotel defaults to Booked. Confirm Activity, Meal, Train, Bus, Ferry, Cab, and eligible Other transport/Custom forms begin in their non-booked choice; use each offered Plan/Walk-up/Booked option and confirm reservation-only fields appear only for Booked/Reserved without clearing common event values. For **Already took this ride**, confirm actual Cab provider/reference details can be recorded without converting it to a future booking. Confirm Preparation and Walk have no booking controls.
- [ ] Add an international connecting flight with a mandatory PNR, booking vendor, phone, and three legs. Confirm there is no generic Place/Location field.
- [ ] In a Connecting journey, make leg 2 depart from a different airport/station than leg 1 reaches and confirm save is rejected. Correct it to the same endpoint and confirm normalized code comparison succeeds; repeat without codes to exercise the normalized-name fallback.
- [ ] Search Airline and Booked via by name. In both Add Event and Edit booking, choose a saved vendor with a catalog URL and confirm Booking website is replaced with it; choose a saved vendor with no URL and confirm a stale website is cleared.
- [ ] Choose Other for Booked via and confirm the saved-value picker remains present and the prior catalog URL is cleared before manual entry. Select a saved vendor to leave Other without restarting the form; repeat with Airbnb and Trip.com.
- [ ] Choose saved From and To airports by name/code and confirm each airport name, country, zone, and disabled airport code are derived with no manual zone field. Choose an International Other airport and confirm manual name, code, country, and strict time-zone inputs appear.
- [ ] Add a Domestic flight and confirm no zone or repeated-clock selector appears and the destination list stays within the origin country. Open Update flight and confirm scheduled, estimated, actual, and boarding fields also hide daylight-saving/repeated-clock controls. For a same-country route that crosses time-zone regions, choose International and confirm separate endpoint zones become available.
- [ ] Add a Domestic Train/Bus/Ferry/Cab and confirm no journey-country, zone, or repeated-clock field appears. Add an International non-flight journey and confirm strict origin/destination zones are requested because no station/port catalog derives them.
- [ ] Enter an Other airline, airport, and booking source; save online and confirm each appears in the Admin Suggestions review without exposing the trip or PNR.
- [ ] For Flight, enter departure and arrival exactly as printed and confirm both are required. For Train, Bus, Ferry, and Cab, save with departure only and confirm the unknown arrival is not invented; then add arrival and confirm it must follow departure. When both exist, confirm departure displays in the origin zone, arrival/booking end uses the destination zone, elapsed duration is derived from both instants, and a next-day marker appears where applicable.
- [ ] Create 25-hour and eight-day examples and confirm duration labels use day and week units while retaining useful hour/day remainders.
- [ ] Add boarding lead minutes and confirm boarding is calculated from scheduled departure; then add an exact boarding time and confirm it takes precedence.
- [ ] Enter different Flight seat, boarding-group, and passenger-ticket values for each included traveler and leg. In Everyone context confirm all relevant seats appear at the top of Flight details; select one traveler and confirm only that person's seat appears, then reopen the leg detail and confirm its group/ticket values remain attached to the same traveler.
- [ ] Select specific travelers before journey details and confirm allocation inputs appear only for those travelers; switch to Everyone and confirm the selected list is cleared rather than saved as every traveler. For Train, enter seat/berth, coach, and passenger reference; for Bus, enter seat and passenger reference and confirm no coach field appears; for Ferry, confirm passenger reference remains available while seat/cabin appears only when Assigned seating is selected. Save/reopen across separate legs and confirm every allocation remains attached to the correct traveler and leg. Confirm Cab has no passenger-seat grid.
- [ ] Manually update flight delay, status, terminals, gates, baggage claim, and baggage-tag document.
- [ ] Open Flight and Train forms and confirm Contact name is absent. Confirm a type-appropriate searchable operator list is present for booked Train/Bus/Ferry entries and the Cab company/app field uses its own regional suggestions; **Other** must permit manual entry in every mode, while phone remains optional where applicable.
- [ ] Add domestic Train, Bus, Ferry/Boat, and Cab bookings and open each reservation detail.
- [ ] In Trip details, use a mouse click anywhere in a reservation card, keyboard focus plus Enter, and a phone tap on its body; confirm each opens the correct Flight or Booking details route for Owner, Editor, and Viewer. A focused reservation link should have a visible focus ring.
- [ ] Add a connected non-flight journey and confirm it is one booking with ordered legs on one grouped timeline event; cards and details must show every stop in order.
- [ ] Create a one-leg flight, open Flight details, and add a later connection. Confirm its origin is fixed to the prior arrival; for Domestic, confirm destination airports are limited to the same country. Save and confirm the full route appears at the top, seats remain correct, and the timeline ends at the new arrival.
- [ ] Attempt the same append with a modified/direct request whose origin code/name or departure zone differs from the previous arrival, whose departure is not after arrival, whose scope changes, or whose Domestic destination changes country. Confirm the server rejects it and adds no partial leg.
- [ ] Tap Call and WhatsApp on a real phone from a reservation card and confirm the correct number is passed to the installed handler without also opening reservation details. Repeat with keyboard activation on desktop and confirm each quick action remains independently named and focused.
- [ ] Tap Navigate for a hotel, activity, meal, and other location and confirm Google Maps opens without an API key.
- [ ] As Editor, activate the complete Departure, Arrival, Boarding, and Arrival details fact cards on Flight details and confirm each opens the manual Flight editor directly. As Viewer, confirm the same facts remain readable but static.

## Sharing, Documents, and Offline

- [ ] Create a traveler invitation, scan its QR on a second phone, sign in, and confirm the code remains prefilled and joins the intended traveler.
- [ ] Create a non-traveling helper invitation and confirm it joins without being assigned as a traveler.
- [ ] Confirm a used, revoked, expired, or regenerated code cannot be reused.
- [ ] Use the floating People control to switch between Everyone and each traveler without another permission prompt.
- [ ] In Everyone, confirm all events/reservations/readiness/costs/documents appear. Select traveler A and confirm shared plus A's records remain while traveler B-only records disappear, including inside an opened event. Confirm the readiness checklist and timeline show names on selected-traveler tasks and no audience text on Everyone tasks.
- [ ] Open the public demo, switch among Everyone, Sam, and Leela, and confirm person-specific readiness tasks filter immediately, Everyone tasks remain, the readiness count recalculates, and checking a demo task updates both the row and summary.
- [ ] Reopen the trip and confirm its last traveler selection is restored without changing the signed-in account or role.
- [ ] After account B has joined one trip, create another trip, choose B under Known account, and confirm B sees Accept/Decline on Home and cannot open the new trip before accepting.
- [ ] Repeat the known-account offer as a non-traveling helper and confirm acceptance creates no traveler assignment.
- [ ] On trip upload and the Profile inbox, confirm the file target is large and vertically centered. Select PDF/JPEG/PNG/WebP by phone tap, keyboard Enter/Space, and desktop drag/drop; confirm the selected filename appears, busy state blocks a second selection, and unsupported or `5_000_000`-byte files are rejected before local persistence. Confirm Replace uses the smaller compact picker.
- [ ] From Profile, save a document before choosing a trip. Confirm it appears immediately in the private inbox, survives reload, and reports queued rather than stored if the Storage request fails.
- [ ] Interrupt or block one Storage upload, restore the connection on the same device, and press Retry cloud. Confirm the receipt is marked stored only after the object exists and no duplicate object or document is created. On a phone, also retry one PDF and one image reported by the picker or restored device storage as `application/octet-stream`; confirm the allowlisted filename extension restores the correct upload MIME and avoids a 415 response.
- [ ] Interrupt a successful Storage upload before its completion receipt is recorded, then open the inbox on another signed-in device. Confirm Check cloud/server verification recovers the object without re-uploading it.
- [ ] Open a receipt whose Storage upload genuinely failed on another signed-in device. Confirm it does not claim the missing bytes are stored and, after checking Supabase, tells you to use the original device or reselect the original; reconnect before using Delete and confirm it removes the unassociated receipt.
- [ ] While offline, delete a pending local inbox upload before its first cloud attempt and confirm both its device copy and queued operation disappear. Repeat after one failed/partial attempt and with a cloud-stored upload; confirm both are retained with a reconnect-to-delete message so they cannot reappear during sync.
- [ ] Attach a successfully stored inbox file to a trip and confirm one document/version is created. Attempt association for an unfinished receipt and confirm the server rejects it without creating a broken Vault entry.
- [ ] After association, confirm the upload no longer appears as an unfinished inbox item, pending/error state is cleared, and direct Storage UPDATE/DELETE attempts fail. Reload, reconnect, and check from another signed-in device; confirm the associated server receipt suppresses any stale unassociated cached copy instead of making the upload reappear. Manage the resulting document through Vault archive/replacement instead.
- [ ] Change document type and Who is it for and confirm the generated Vault name updates while the original filename remains in Info.
- [ ] Upload as Owner/Editor without changing access and confirm **Trip members** is the default and is visibly badged. Open Info → Change, save **Only me**, then **Selected signed-in members**, and confirm another member can open the document only in the permitted states. Repeat as Viewer and confirm their upload remains private and they cannot broaden access.
- [ ] Upload from an event and confirm the default name includes document type, traveler context, and event title. Enter a custom name and confirm the derived context still appears below it.
- [ ] Open a multi-page PDF from cloud and from the device copy; confirm its first page renders inside the app, previous/next change pages, zoom/fit work, and **Open** launches the device viewer as a fallback without a forced download. Open an image and confirm in-app zoom plus the same fallback.
- [ ] At phone width, confirm the document card's Info icon is centered in its own compact secondary button, is announced as document information rather than preview/open, and does not activate the adjacent Open action.
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
- [ ] At phone width, verify whole-card taps still leave Navigation, Call, WhatsApp, document, and destructive actions as distinct touch targets; activating one must not trigger the card underneath it.
