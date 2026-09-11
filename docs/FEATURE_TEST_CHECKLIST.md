---
title: "Trip Vault Feature Test Checklist"
description: "Short manual acceptance checklist for the timeline-first Trip Vault release on phone and desktop."
scope: [service-wide]
agents: [tester, reviewer]
tags: [manual-testing, acceptance, timeline, mobile, admin]
last_verified: 2026-09-11
---

# Trip Vault Feature Test Checklist

Run `202609110001_timeline_redesign.sql` first, then sign in with three test accounts. Use synthetic names and documents smaller than 5 MB.

## Organizer and Timeline

- [ ] Create a trip, add three travelers, click its card, and confirm Timeline opens first.
- [ ] Add preparation tasks before departure and confirm the separate Trip readiness summary remains above the timeline.
- [ ] Add a readiness check, complete it, and confirm the readiness count changes.
- [ ] Add an activity, meal, and custom event; include a map link and attach several documents to one event.
- [ ] Add a hotel and confirm one reservation creates separate check-in and checkout timeline milestones.
- [ ] Add a free event cost (`0`), a paid cost, and leave one event without cost; confirm `Free`, totals, and `Cost missing` are distinct.
- [ ] Confirm the timeline has day separators, a vertical line on phone, and only the current/next item is highlighted.
- [ ] Reopen the trip and confirm it scrolls to the current/next item; switch to Trip details and back and confirm the position is restored.
- [ ] Search by title, PNR, airport code, vendor, traveler, document, and readiness item; open or jump to each result.
- [ ] Open Trip details and review Overview, Reservations, Costs, People, Readiness, Documents, Offline, Travel data, and Notes.

## Journeys and Bookings

- [ ] Add an international flight with a mandatory PNR, booking vendor, phone, origin/destination time zones, and two connected legs.
- [ ] Confirm each flight shows the provider-local departure/arrival time, correct elapsed duration, and next-day marker where applicable.
- [ ] Add boarding lead minutes, then manually add an exact boarding time; confirm exact time takes precedence.
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
