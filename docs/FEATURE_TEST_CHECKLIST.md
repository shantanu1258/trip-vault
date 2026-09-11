---
title: "Trip Vault Feature Test Checklist"
description: "Short manual acceptance checklist for the timeline-first Trip Vault release on phone and desktop."
scope: [service-wide]
agents: [tester, reviewer]
tags: [manual-testing, acceptance, timeline, mobile, admin]
last_verified: 2026-09-12
---

# Trip Vault Feature Test Checklist

For an existing Supabase project, apply migrations through `202609110003_document_experience.sql`; for a fresh project, run `supabase/TRIP_VAULT_COMPLETE_SETUP.sql`. Then sign in with three test accounts. Use synthetic names and documents smaller than 5 MB.

## Organizer and Timeline

- [ ] Create a trip, add three travelers, click its card, and confirm Timeline opens first.
- [ ] Add preparation tasks before departure and confirm the separate Trip readiness summary remains above the timeline.
- [ ] Add a readiness check, complete it, and confirm the readiness count changes.
- [ ] Add an activity, meal, and custom event; include a map link and attach several documents to one event.
- [ ] Open Add Hotel and confirm check-in starts at 15:00 on the trip start date while checkout starts at 11:00 the following day.
- [ ] Set a deliberate later checkout, move check-in while it remains earlier, and confirm the chosen checkout is preserved.
- [ ] Move check-in to the same time as or after checkout and confirm checkout advances to 11:00 the following day.
- [ ] Manually set checkout equal to and earlier than check-in; confirm saving is blocked, no partial reservation appears, and the form remains open for correction.
- [ ] Correct checkout, save, and confirm one hotel reservation creates separate check-in and checkout timeline milestones in the selected hotel time zone.
- [ ] Add a free event cost (`0`), a paid cost in a non-trip currency selected from the dropdown, and leave one event without cost; confirm `Free`, per-currency totals, and `Cost missing` are distinct.
- [ ] Confirm the timeline has day separators, a vertical line on phone, and only the current/next item is highlighted.
- [ ] Reopen the trip and confirm it scrolls to the current/next item; switch to Trip details and back and confirm the position is restored.
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
- [ ] Tap Call and WhatsApp on a real phone and confirm the correct number is passed to the installed handler.
- [ ] Tap Navigate for a hotel, activity, meal, and other location and confirm Google Maps opens without an API key.

## Sharing, Documents, and Offline

- [ ] Create a traveler invitation, scan its QR on a second phone, sign in, and confirm the code remains prefilled and joins the intended traveler.
- [ ] Create a non-traveling helper invitation and confirm it joins without being assigned as a traveler.
- [ ] Confirm a used, revoked, expired, or regenerated code cannot be reused.
- [ ] Use the floating People control to switch between Everyone and each traveler without another permission prompt.
- [ ] Upload PDF/JPEG/PNG/WebP documents; confirm 5 MB or larger and unsupported files are rejected.
- [ ] Change document type and Who is it for and confirm the generated Vault name updates while the original filename remains in Info.
- [ ] Open a PDF and image from cloud and from the device copy; confirm the embedded preview renders and Open launches a zoomable full-screen viewer without requiring a download.
- [ ] Turn the network off, create/edit an event and upload a document; confirm it remains available locally and reports queued synchronization.
- [ ] Prepare the offline pack, reload while offline, and open the timeline plus a pinned document.
- [ ] Restore the network and confirm queued work synchronizes without duplicate events or costs.

## Admin

- [ ] Sign in through the separate Admin entry and confirm a normal member cannot open it.
- [ ] Create a draft; add/edit/disable airlines, airports, booking vendors, and both light/dark palettes.
- [ ] Enter unknown airline, airport, operator, and vendor values in a trip and confirm privacy-safe suggestions appear in Admin.
- [ ] Promote, merge, or reject suggestions; publish the draft; confirm pickers use the published values.
- [ ] Roll back a prior release and confirm trip PNRs, dates, travelers, and documents never appear in Admin or its audit history.

## Responsive Exit Gate

- [ ] Complete the checklist at a phone width and a desktop width in both light and dark mode.
- [ ] Install the PWA on a phone and confirm Add Event/People controls do not overlap browser or app safe areas.
