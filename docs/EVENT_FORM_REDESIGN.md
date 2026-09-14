---
title: "Trip Vault Event Form Redesign"
description: "Accepted progressive forms, ticket handling, timeline summaries, and implemented data changes for every Trip Vault event type."
scope: [service-wide]
agents: [coder, reviewer, planner]
tags: [redesign, forms, journeys, bookings, documents, timeline]
last_verified: 2026-09-14
---

# Trip Vault Event Form Redesign

Status: **Accepted and implemented locally.** The shared form architecture, journey-specific fields, document completion path, and the single forward schema migration are in the repository. Automated component/type checks cover the core branches; phone, desktop, real Supabase, and airplane-mode acceptance remain manual release gates. Explicit follow-ups are called out rather than being presented as complete.

The redesign uses a private train ticket and bus ticket only as structural references. Passenger names, ages, booking references, transaction identifiers, and other private values are deliberately excluded from this repository.

## 1. Outcome

Adding a simple event should be short. A more detailed booking should become richer only when the user says a booking exists.

Every form follows the same progressive sequence without showing the same fields:

1. **What is it?** Choose the event type and give it a useful timeline name.
2. **Is it booked?** Record the type-appropriate intent before revealing reservation-only fields.
3. **Who is included?** Choose Everyone or selected travelers before any traveler ticket fields.
4. **When and where?** Use labels that fit that event: station, terminal, boarding point, pickup, property, or venue; journey allocations are limited to the included travelers.
5. **What should be available later?** Add the official document, traveler details, cost, navigation, or notes now or after saving.

The first save creates a usable timeline item. It must not depend on optional cost, document, seat, contact, or provider information.

## 2. Form Architecture

### 2.1 Event chooser

Keep the most-used choices first:

1. Flight
2. Hotel
3. Activity
4. Bus
5. Cab
6. Ferry / boat
7. Train
8. Meal
9. Preparation
10. Other transport
11. Other

The order is a convenience choice, not a data priority. Every type remains searchable and keyboard accessible on desktop.

### 2.2 Progressive sections

| Section | When shown | Purpose |
|---|---|---|
| Basics | Always | Type-specific name and minimum route/place information |
| Reservation intent | Where the type supports it | Plan/no reservation, local/walk-up, or Booked; Flight is fixed Booked and Hotel starts Booked but may switch to Plan |
| Travelers | Always, before journey detail | Everyone or selected travelers, stored as an explicit scope; only included travelers feed allocation fields |
| Route structure | Flights, trains, buses, and ferries | Direct/Connecting for Flight and Single/Connecting service for ground journeys, without exposing connection rows for a one-leg journey |
| Timing | Always | Exact, date-only, relative, or unscheduled timing as allowed by the type |
| Booking details | Only for Booked/Reserved, plus actual/reference capture for a completed Cab | Booked via, reference, manage-booking link, contact, and booking-specific fields; the actual operator/property stays in its domain section |
| Traveler ticket details | Only where applicable, after traveler scope | Flight seat, boarding group and ticket number; Train seat/berth, coach and reference; Bus seat and reference; Ferry reference plus seat/cabin only for assigned seating; never a Cab seat grid |
| More details | Collapsed | Navigation, contacts, reminders, luggage, notes, and uncommon fields |
| Cost | Optional collapsed section | Known amount, free, or leave missing for later |
| Official documents | After the core row can be saved | Ticket, voucher, confirmation, boarding pass, receipt, or other typed document |

### 2.3 Save behavior

The primary action is **Save to timeline**. The save completes the core record first; document transfer never blocks that save.

After saving, the implemented compact completion screen offers **Add official document** and **Done**. Traveler seats and ticket details can be included during creation, while event details remain the later entry point for booking enrichment, seats, costs, and flight connections. A dedicated one-tap return-sailing completion action remains a follow-up. This avoids making document upload part of the core transaction and gives it a real booking/event identifier before Storage work begins.

### 2.4 Reservation state and event status

Use plain language in the UI and a small stable state in data.

| UI choice | Reservation state | Event status | Meaning |
|---|---|---|---|
| Plan only | `planned` | Planned | The event or journey is intended but no reservation exists yet |
| Buy / arrange locally | `walk_up` | Planned | A Train, Bus, or Ferry journey will be obtained when needed rather than reserved now |
| Booked / ticket ready | `booked` | Planned | A provider or seller has confirmed it |
| Already took this ride | `walk_up` | Done | A completed Cab is being logged and may include actual route, provider, reference, time, cost, or receipt details |

Done, Cancelled, and Skipped remain timeline statuses, not reservation states. Flight is always booked and Hotel defaults to booked; a planned Activity, Meal, Hotel, Train, Bus, Ferry, Cab, or eligible transport/custom event can receive booking details later without creating another timeline item. An unbooked Activity or Meal does not need an empty booking row; journey and stay records may still use `bookings` internally as their route/milestone container.

Flight remains booking-first for the initial release. Its PNR is mandatory when a booked flight is saved. A future flight-planning mode must not weaken that rule for confirmed flights.

## 3. Language and Placeholder Rules

Labels explain the domain. Placeholders explain what to enter or where to find it; they do not contain invented example values.

| Avoid | Use |
|---|---|
| Service provider | Airline, Hotel / property, Bus operator, Train operator, Ferry operator, Cab company, Restaurant, or Activity provider |
| Booking website | Booked via |
| URL | Manage booking link or Google Maps link |
| Origin | Departure airport, Boarding station, Boarding point, Departure terminal, or Pickup |
| Destination | Arrival airport, Destination station, Drop-off point, Arrival terminal, or Drop-off |
| Reference | PNR, Ticket / order number, Booking reference, or Ride ID |
| Enter a value such as … | Describe the source: “Enter the number printed on the ticket” |

Recommended placeholders include:

| Field | Placeholder |
|---|---|
| Event title | Describe what should appear on the timeline |
| Station | Search by station name or code |
| Train number | Enter the train number printed on the ticket |
| Train name | Enter the train name printed on the ticket |
| Bus boarding point | Enter the pickup point printed on the ticket |
| Ferry terminal | Search for the departure terminal or pier |
| Cab pickup | Enter where the cab should collect you |
| Booking reference | Enter the reference shown on the confirmation |
| Notes | Add instructions you may need during the trip |

## 4. Shared Time and Route Rules

### 4.1 Exact and flexible timing

- Activity, Meal, Preparation, Other transport, and Other keep exact, date-only, all-day, before/after another event, and unscheduled timing.
- Start time and duration remain optional even when an event is positioned before or after another event.
- Flight normally requires printed departure and arrival times.
- Train, Bus, and Ferry require a departure for timeline placement. Arrival remains optional whether planning or transcribing a ticket when the source does not provide it.
- Cab requires pickup timing or a relative position. Drop-off time and duration are optional.
- Hotel requires check-in and checkout dates; printed check-in and checkout times are optional.

The app never invents a visible arrival time merely to satisfy storage. If a journey arrival is unknown, the timeline says **Arrival time not added** and orders it from its departure plus explicit relations.

### 4.2 Domestic, international, and zones

- Domestic journeys never show country or timezone controls; their stored endpoint zones use the trip's hidden compatibility fallback until reviewed place metadata exists.
- Flight keeps an explicit Domestic / International choice and infers zones from selected airports.
- Train, Bus, and Ferry keep Domestic / International because a direct service may cross a border.
- The current release has no station, bus-stop, or ferry-terminal catalog. International non-flight endpoints therefore collect country and strict IANA timezone explicitly; a later reviewed place catalog may infer them.
- Cab has no Domestic / International question. A rare **Cross-border ride** switch under More details reveals the necessary endpoint country/zone fields.
- All printed departure and arrival values are interpreted as local time at their respective endpoints.

### 4.3 Direct, connecting, and return

- Flight asks Direct or Connecting before showing its legs.
- Train, Bus, and Ferry ask Single service or Connecting services. A direct journey never displays **First train**, **First bus**, or **First ferry**.
- A separately ticketed connection with a different primary booking reference is a separate timeline event linked by before/after positioning.
- Ferry One-way / Return is separate from Direct / Connecting. Each sailing is a separate timeline event, and the current form records its direction. Automatic creation/linking of the paired return sailing is not implemented; add the return as another event and reuse the same document where appropriate.
- Cab does not ask Direct / Connecting.

## 5. Flight

Flight retains the current ticket-first structure but follows the new layering.

### First screen

- Timeline title
- Included travelers
- Domestic / International
- Direct / Connecting
- PNR
- Airline
- Flight number
- Departure and arrival airports
- Printed departure and arrival times

### Booked details

- Booked via and manage-booking link
- Boarding lead or exact boarding time
- Gate and terminal when known
- Cost
- Official ticket

### Per traveler and per leg

- Seat
- Boarding group
- Passenger ticket number
- Boarding pass
- Baggage tag

Connections, route summary, and relevant traveler seats appear near the top of the event detail. Additional flight legs remain addable after creation.

## 6. Hotel

Hotel uses property language, not a generic service-provider section.

### First screen

- Hotel / property name
- Plan only or Booked
- Included travelers
- Check-in date and optional printed check-in time
- Checkout date and optional printed checkout time
- Place or address

### Booking section

- Booked via
- Booking reference
- Manage booking link
- Property phone
- Room type and number of rooms, optional
- Lead guest, optional
- Cost and confirmation document

One hotel booking still creates check-in and checkout milestones. Editing the stay must update the booking and both milestones in one operation. Hotels do not show clock-repeat controls.

## 7. Activity

### First screen

- Activity name
- Plan only or Booked
- Included travelers
- Exact, date-only, relative, or unscheduled timing
- Optional duration or end time
- Venue/place and Navigation

### Optional booking section

- Activity provider or venue
- Booked via
- Booking reference and manage-booking link
- Entry or meeting instructions
- Contact phone
- Cost and official voucher/ticket

A planned Activity always exposes **Add booking** later. Adding it enriches the same timeline event.

## 8. Meal

### First screen

- Meal or restaurant name
- No reservation or Reserved
- Included travelers
- Exact, date-only, relative, or unscheduled timing
- Optional end time or duration
- Venue and Navigation

### Optional reservation section

- Reservation name/reference
- Party size, derived from travelers but editable
- Restaurant phone
- Dietary or arrival notes
- Booked via and manage-booking link only when relevant
- Estimated/paid cost and confirmation

The UI uses **Restaurant or venue**, not Service provider.

## 9. Train

The official ticket remains the authoritative record. Trip Vault captures the fields needed while traveling.

### First screen

- Plan only or Ticket booked
- Included travelers
- Domestic / International
- Single train / Connecting trains
- Train number and train name
- **Boarding station** and destination station
- Printed departure and optional arrival, whether planned or ticketed

**Booked from station** is optional and appears only when it differs from Boarding station. The timeline always uses the actual Boarding station.

### Ticket section

- PNR or primary booking reference
- Operator; default Indian Railways and keep the picker visible so another operator can be selected
- Booked via; for example IRCTC is the seller, not the train operator
- Travel class
- Quota, optional
- Booking status and current status, optional manual values
- Cost
- Official e-ticket or reservation slip

### Per traveler and per train

- Coach
- Berth or seat
- Berth type, optional
- Passenger ticket/reference, optional

Passenger age and gender are not copied from the ticket because the current product does not need them. A connection with a separate PNR becomes a separate event; a shared booking may use ordered legs.

## 10. Bus

### First screen

- Plan only or Ticket booked
- Included travelers
- Domestic / International
- Single bus / Connecting buses
- Bus operator
- Boarding point and drop-off point
- Printed departure and optional arrival

Domestic Bus shows no Journey country field. A single service is labelled **Bus details** or with its route, never **First bus**.

### Ticket section

- Booked via
- Shared ticket/order number
- Optional service number
- Bus class/layout
- Boarding reminder
- Operator/support phone with Call and WhatsApp actions
- Cost and official ticket

### Per traveler and per bus

- Seat
- Passenger booking reference/PNR, optional

Seats remain editable later because assignments may arrive or change after the event is created.

## 11. Ferry / Boat

Ferry uses sailing and terminal language. Trip.com is **Booked via**; the ferry company remains **Operator**.

### First screen

- Plan only or Ticket booked
- Included travelers
- Domestic / International
- Single sailing / Connecting sailings
- One-way / Return
- Departure terminal or pier
- Arrival terminal or pier
- Printed local departure and optional arrival

### Ticket section

- Ferry operator
- Booked via
- Ticket timing: Fixed, Open date, or Open return
- Seller order/reference
- Operator confirmation/ticket reference, optional
- Class/accommodation
- Seating: Free seating, Assigned, or Unknown
- Check-in reminder, using operator metadata as a suggestion that the user can override
- Cost
- Official confirmation, e-voucher, or ferry ticket

At least one useful proof should be present for a booked ferry: a primary reference or an uploaded confirmation. Do not force both seller and operator reference fields.

### Conditional and advanced fields

- Per-traveler seat only when Assigned seating is selected
- Cabin, when relevant
- Vessel/service number
- Departure gate
- Baggage allowance
- Vehicle toggle with vehicle type, registration, and dimensions

The common Singapore–Malaysia–Indonesia foot-passenger flow keeps vehicle and cabin fields hidden. A shared return voucher may be associated with both sailing events, while each sailing stays independently reachable on the timeline.

## 12. Cab

Cab is not a ticketed journey by default. It has no Direct / Connecting, Domestic / International, service number, boarding lead, platform, cabin, or seat fields.

### First questions

- Timeline title
- Need a cab, Booked in advance, or Already took this ride
- Included travelers
- Ride type

### Ride type

- Local ride
- Airport transfer
- Long-distance / outstation
- Hire by hour or day

### Always-visible minimum

- Pickup
- Drop-off, optional for hourly hire
- Exact pickup or before/after another event
- Optional duration
- Pickup Navigation and notes

This makes a local plan approximately five fields rather than a flight-style form.

### Booked in advance

- Cab company or app
- Optional Booked via, kept separate from the operator
- Booking reference / Ride ID, optional
- Scheduled pickup
- Vehicle/service class
- Estimated fare
- Support phone
- Confirmation or voucher

Driver name/phone, vehicle registration, and pickup instructions are **day-of details** that can be added later. They are not required at creation.

### Airport transfer

- Prefer linking an existing flight and deriving airport, terminal, and arrival time
- Pickup zone, door, meet-and-greet note, or pickup buffer after landing
- Luggage count and vehicle size, optional
- Ask for a flight number only when no flight event can be linked

### Long-distance / outstation

- One-way or round-trip
- Return date when applicable
- Vehicle category and luggage needs
- Package allowance and toll/parking notes, optional

### Hire by hour or day

- Start and duration package or end time
- Pickup/base
- Optional final drop-off or return to pickup
- Vehicle class

### Already took this ride

- Actual route and travelers
- Actual cost
- Optional provider, ride ID, times, and receipt

The saved reservation state distinguishes need/arrange/booked, and an already-taken ride can be saved as Done. Rich driver-assigned/in-progress labels remain a presentation follow-up rather than an inferred claim.

## 13. Preparation

Preparation is a task, not a reservation form.

### First screen

- Task name
- Due date, before/after event, or unscheduled
- Responsible/included travelers
- Optional notes

Place, Navigation, provider, and external booking stay under More details. Completion status remains separate from Archive. The derived Trip readiness card summarizes requirements; dated preparation tasks remain individual timeline events.

## 14. Other Transport

Ask for a subtype first:

- Metro / public transit
- Rental vehicle
- Private transfer
- Walk
- Other

Point-to-point types use From and To. Rental uses pickup and return place/date. Walk needs no booking section. All keep flexible timing, travelers, Navigation, cost, and optional notes. Booked details appear only when the subtype and state require them.

## 15. Other

Other remains the escape hatch:

- Timeline title
- Flexible timing
- Travelers
- Optional place and Navigation
- Optional booking
- Optional cost, documents, and notes

Everything after timing starts collapsed so a custom reminder stays quick to create.

## 16. Official Documents as First-Class References

The app does not use OCR or email import. Users may attach the official provider file or screenshot and treat it as the source of truth.

### Assignment

- One group ticket can be linked once to a booking/event and assigned to Everyone or selected travelers.
- Passenger-specific files remain assigned to the corresponding traveler.
- A document may link to a whole booking, one journey leg, or one timeline event.
- The document is not duplicated merely because it applies to several travelers or to outbound and return events.

### Types

| Event | Useful document purposes |
|---|---|
| Flight | Ticket, boarding pass, baggage tag, visa, passport copy |
| Train | E-ticket/reservation slip, boarding ticket, receipt |
| Bus | Ticket/e-voucher, boarding pass, receipt |
| Ferry | Booking confirmation/e-voucher, ferry ticket, boarding pass, immigration/visa document |
| Cab | Booking confirmation, transfer voucher, receipt |
| Hotel | Booking confirmation, check-in voucher, receipt |
| Activity/Meal | Entry ticket, voucher, reservation confirmation, receipt |

### Access

- The event card exposes the most useful available document as a labelled action such as **Open ticket** or **Open voucher**.
- Event detail shows all related documents and who each is for.
- Open in an in-app, zoomable preview with the device's native **Open** action retained as the fallback.
- Trip upload and the Profile inbox use a full-width, centered file-selection surface at least 128 CSS pixels tall on phone and 160 on desktop; Replace document remains compact.
- The selection surface shows file type/size guidance, then the chosen filename and measured size, and locks while hashing/uploading so the visible file cannot diverge from the submitted file.
- A locally retained copy opens offline. A cloud-only file explains that it must be opened once online or added to the offline pack.
- A failed cloud upload remains visible as a local pending document and can be retried or associated from Profile.

## 17. Timeline and Detail Presentation

The timeline card is a summary, not a second form.

| Event | Card front |
|---|---|
| Flight | Full airport route, next leg, local times, seat(s), gate/boarding, primary document |
| Hotel | Property, check-in/out milestone, address, Navigation, confirmation |
| Activity/Meal | Name, timing/relation, duration/current state, place, Navigation |
| Train | Boarding → destination station, train, local times, relevant coach/seat, ticket |
| Bus | Boarding → drop-off, operator, local times, relevant seat, ticket |
| Ferry | Terminal route, local times, operator, check-in reminder, ticket/voucher |
| Cab | Pickup → drop-off, pickup time/relation, booking state, Navigation, Call when available |
| Preparation | Task, due/relative position, assigned travelers, completion state |

Clicking the card opens read-first details. Edit is available from inside unless the card has no read-only detail beyond what is already visible; in that case the card may open edit directly.

## 18. Data and Schema Impact

### Implemented in one forward migration

`supabase/migrations/202609140001_event_form_data_model.sql` is the only new existing-project migration for this redesign. The consolidated fresh-project setup contains the same contract.

1. `bookings.reservation_state` stores `planned`, `walk_up`, or `booked`; completion remains in itinerary event status.
2. `bookings.participant_scope` stores explicit `everyone` or `selected`, with assignment triggers preventing contradictory participant rows. The migration canonicalizes the legacy “all active travelers selected” shape to Everyone and removes those now-redundant link rows.
3. `journey_leg_travelers` stores optional seat/berth, coach/cabin, and passenger reference columns for one traveler on one leg, with same-trip/RLS enforcement and offline caching. The UI uses Train seat/berth + coach + reference, Bus seat + reference, and Ferry reference with seat/cabin only when assigned seating is selected.
4. `journey_legs.scheduled_arrival_at` is nullable, and client validation, rendering, offline preparation, and booking end handling accept a missing non-flight arrival.
5. Validated discriminated `journey_legs.details` stores only mode-specific Train, Bus, Ferry, or Cab attributes; route, endpoint time, operator, and service number remain typed.
6. `save_hotel_stay` writes the hotel booking, explicit participants, and both milestone rows under one locked server transaction.

### Reuse without a new table

- `bookings` remains the journey/reservation container.
- Existing ordered `flight_legs` and `journey_legs` remain the route source.
- `bookings.details` may hold booking-wide optional attributes during the first slice.
- Existing document, document-version, and event/booking/leg association tables remain the file model.
- Existing trip costs remain the expense source.
- Existing catalog suggestions can receive non-sensitive operator/vendor proposals.

### Deliberately not implemented

- OCR or automatic ticket parsing
- Live bus/train/ferry/cab status
- A global station/terminal/stop database before its source and maintenance rules are accepted
- Provider-specific cancellation, waiting-fee, or baggage schemas
- Passenger age or gender copied from tickets

## 19. Implementation and Verification Slices

The owner requested one coordinated implementation run. These slices now describe testable acceptance boundaries, not separate hidden releases.

| Slice | Implemented scope | Schema / remaining gate |
|---:|---|---|
| E1 | Shared progressive shell, contextual labels/placeholders, explicit Everyone/Selected, save-completion screen | `participant_scope`; manual phone/desktop review pending |
| E2 | Cab modes/states and nullable non-flight arrival | Reservation state, nullable arrival, mode details; manual cross-border review pending |
| E3 | Train and Bus ticket-first fields plus mode-appropriate per-traveler allocations | Journey-leg travelers and mode details; real-ticket transcription pending |
| E4 | Ferry directions, open-date state, assigned/free seating, vehicle details, and seating-aware traveler fields | Mode details; automatic paired return creation remains deferred |
| E5 | Hotel optional printed times and transactional milestone writes | `save_hotel_stay`; remote SQL/manual edit run pending |
| E6 | Activity, Meal, Preparation, Other transport, and Other progressive cleanup | No additional schema; manual branch review pending |
| E7 | Official-document post-save flow, labelled in-app preview, and existing booking/event/leg assignment | No document-table replacement; real phone upload/preview pending |
| E8 | HLD, LLD, FEATURES, complete setup, forward migration, smoke test, and manual checklist reconciliation | One migration: `202609140001_event_form_data_model.sql` |

## 20. Decision Record

- [x] F1: Accept the shared progressive sequence and the post-save completion screen.
- [x] F2: Accept `planned`, `walk_up`, and `booked` as reservation state, with Done/Cancelled/Skipped kept as event status.
- [x] F3: Keep Direct/Connecting for Flight and use Single/Connecting service for Train, Bus, and Ferry; Cab has neither.
- [x] F4: Treat separately ticketed connections as separate timeline events, linked by relative position.
- [x] F5: Make journey arrival optional for Train, Bus, Ferry, and Cab where the source does not provide it. Accepted 2026-09-14.
- [x] F6: Accept the Train field set, including distinct Booked from and Boarding station.
- [x] F7: Accept mode-appropriate per-traveler journey allocations: Train seat/berth, coach and reference; Bus seat and reference; Ferry reference plus seat/cabin only for assigned seating.
- [x] F8: Keep Ferry One-way/Return separate from route connections and use one timeline event per sailing. Automatic paired-return creation remains deferred.
- [x] F9: Accept the three-state Cab flow and keep Cross-border under More details.
- [x] F10: Accept official documents as the authoritative reference without OCR, with structured fields limited to quick travel use.
- [x] F11: Accept and implement the schema direction in `202609140001_event_form_data_model.sql`.
- [x] F12: Superseded by the owner's request for one coordinated implementation run; E1–E8 remain the manual verification boundaries.

## 21. Research References

- Private user-supplied IRCTC electronic reservation slip, reviewed locally on 2026-09-14 and not copied into the repository.
- [IRCTC e-ticket booking guidance](https://contents.irctc.co.in/en/bookEticket.html)
- [Trip.com BatamFast ferry product](https://www.trip.com/things-to-do/detail/53666545/)
- [Bintan Resort Ferries schedules and local-time guidance](https://www.brf.com.sg/ferry-schedule/)
- [Bintan Resort Ferries check-in requirements](https://www.brf.com.sg/faqs/)
- [Bintan Resort Ferries classes and seating](https://www.brf.com.sg/class-of-travel/)
- [BatamFast e-ticket FAQ](https://www.batamfast.com/faq/index.ashx)
- [Grab Singapore transport](https://www.grab.com/sg/transport/)
- [Grab airport ride guidance](https://www.grab.com/global/airport-rides/changi-airport/)
- [Gojek car-booking guidance](https://www.gojek.com/en-id/help/gocar/saya-ingin-memesan-transportasi-mobil)
- [Uber scheduled ride and airport guidance](https://help.uber.com/riders/article/node-title?nodeId=ccb9a8da-9e44-4038-921f-0360bbabc518)
- [Ola Outstation](https://outstation.olacabs.com/)

## Source File Index

| Resource | Path | Relevance |
|---|---|---|
| Event form | `src/features/timeline/AddEventForm.tsx`, `src/features/timeline/EventFormCommonFields.tsx`, `src/features/timeline/JourneyEventFields.tsx` | Progressive chooser, booking states, contextual fields, journey modes, participants, allocations, cost, and completion screen |
| Flexible timing | `src/features/timeline/TimingFields.tsx` | Exact, date-only, relative, and unscheduled timing |
| Booking-later form | `src/features/workspace/AddActivityBookingForm.tsx` | Existing enrichment path for non-booked events |
| Booking and journey API | `src/features/workspace/api.ts` | Current booking, journey leg, traveler, and document writes |
| Workspace form components | `src/features/workspace/WorkspaceForms.tsx` | Current booking edit and document assignment |
| Consolidated schema | `supabase/TRIP_VAULT_COMPLETE_SETUP.sql` | Current booking, journey, traveler, cost, and document contract |
| Forward event-form migration | `supabase/migrations/202609140001_event_form_data_model.sql` | Reservation/participant state, nullable arrival, mode details, leg-traveler allocations, and atomic hotel milestones |
| Document viewer and picker | `src/components/DocumentPreview.tsx`, `src/components/FileDropzone.tsx`, `public/vendor/pdfjs/` | In-app PDF/image preview, device Open fallback, larger validated file selection, and offline PDF runtime assets |
| Redesign checklist | `docs/REDESIGN_CHECKLIST.md` | Active decision tracker and implementation gates |
