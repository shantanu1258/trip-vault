# Trip Vault manual functional test suite

This is the release acceptance checklist for Trip Vault. Every case is manual and is intended to be run against the deployed Cloudflare URL on real desktop and phone browsers.

Trip Vault is an independent product deployment:

- Its own GitHub repository.
- Its own Cloudflare application and HTTPS URL.
- Its own Supabase project, authentication users, database, and storage.
- No shared runtime, route, environment variables, or deployment with StudyDesk.

## 1. Test environment and accounts

Record these before testing:

| Item | Test value |
| --- | --- |
| Git commit | |
| Trip Vault Cloudflare URL | |
| Supabase project reference | |
| Desktop browser and version | |
| Android browser and version | |
| iPhone/Safari version | |
| Tester | |
| Test date | |

Use three separate email accounts in isolated browser profiles or devices. Do not test all roles in tabs sharing one browser session.

| Account | Trip role | Linked traveler | Purpose |
| --- | --- | --- | --- |
| Member A | Owner/organizer | Traveler A | Creates and manages the trip |
| Member B | Editor | Traveler B | Helps plan and manages trip content |
| Member C | Viewer | Traveler C | Views the trip and manages their own private document |

### Suggested trip data

- Trip: `Southeast Asia Escape`
- Route: `Delhi → Singapore → Kuala Lumpur → Bali → Delhi`
- Status: Upcoming
- Base currency: `INR`
- Primary timezone: `Asia/Singapore`
- Travelers: Traveler A, Traveler B, and Traveler C
- Flights: at least three segments, including one delayed segment
- Hotels: one stay in each destination
- Activities: Gardens by the Bay, Petronas Towers, and an Ubud day tour
- Meals: welcome dinner, reserved lunch, and one unreserved meal plan
- Transfers: airport pickup and one intercity/airport transfer
- Requirements: passport, visa, travel insurance, and flight check-in
- Costs: flights, hotels, activities, meals, transfers, and one refund

### Suggested test files

Prepare non-sensitive sample files only:

- One flight ticket PDF
- One boarding-pass PDF or image
- Three sample passport/visa images, one per traveler
- One hotel confirmation PDF
- One insurance PDF
- One restaurant reservation image
- Two different files attached to the same itinerary event
- One supported file just below 5 MB
- One file of 5 MB or larger
- One unsupported file type, such as `.zip`

## 2. Preflight and deployment

- [ ] `PRE-01` — Open the dedicated Trip Vault Cloudflare HTTPS URL on desktop and phone.
  - Pass when the app loads without a blank page, certificate warning, or StudyDesk content.

- [ ] `PRE-02` — Confirm the Trip Vault URL and StudyDesk URL are different, then open both.
  - Pass when each URL serves only its own application and signing into one does not sign into the other.

- [ ] `PRE-03` — Open a nested Trip Vault route, refresh it, and use the browser Back and Forward buttons.
  - Pass when Cloudflare returns the app for the deep link and navigation remains usable.

- [ ] `PRE-04` — Confirm Supabase migrations `202609100001`, `202609100002`, and `202609100003` have been applied, then run the schema smoke test.
  - Pass when the result says `Trip Vault schema smoke test passed`.

- [ ] `PRE-05` — Check the deployed browser console and network panel while loading the app.
  - Pass when there are no missing environment-variable errors, failed JavaScript bundles, or repeated unauthorized requests.

- [ ] `PRE-06` — Sign in with each of the three accounts in separate sessions.
  - Pass when each account has its own session and cannot see another account's private local state.

- [ ] `PRE-07` — If the free Supabase project has paused, restore it, reopen Trip Vault, and run a normal foreground synchronization.
  - Pass when the app recovers without data loss, the trip reloads, and a fresh offline preparation can be verified before departure.

## 3. Authentication, profile, and installation

- [ ] `AUTH-01` — Create Member A's account with name, email, password, and password confirmation.
  - Pass when mismatched passwords are rejected and matching valid passwords create the account.

- [ ] `AUTH-02` — Use both eye icons on the sign-up form.
  - Pass when each password field can be shown or hidden independently without changing its value.

- [ ] `AUTH-03` — Sign out, attempt an incorrect password, then sign in with the correct password.
  - Pass when the incorrect attempt is rejected clearly and the correct attempt succeeds.

- [ ] `AUTH-04` — Refresh the page and close/reopen the browser after signing in.
  - Pass when the valid Supabase session is restored without showing another user's data.

- [ ] `AUTH-05` — Edit the profile name, refresh, and sign in again.
  - Pass when the updated name persists and is displayed consistently.

- [ ] `AUTH-06` — Open the Profile installation help on iPhone and Android.
  - Pass when the instructions match the current browser: Add to Home Screen on iPhone and the install prompt/menu path on Android.

- [ ] `AUTH-07` — Install Trip Vault from the supported browser and launch it from the phone home screen.
  - Pass when it opens as a standalone app with the Trip Vault name, icon, theme, and an authenticated session.

- [ ] `AUTH-08` — Sign out from the installed app.
  - Pass when protected trip content disappears and returning to the app requires authentication.

- [ ] `AUTH-09` — Test both sign-out choices: keep local files once, then sign in and choose clear local files.
  - Pass when both choices explain their effect, online authentication always ends, kept data still requires the enrolled profile, and clearing removes the device copies.

- [ ] `AUTH-10` — Set a home timezone in Profile, create a new trip, and inspect existing provider-issued flight times.
  - Pass when the timezone becomes the new-trip default without rewriting an existing flight's source timezone or instant.

## 4. Public synthetic demo

Run these while signed out. The demo is a public product preview only; it must never be mixed with a real signed-in account.

- [ ] `DEMO-01` — Complete, skip, and resume the welcome/onboarding flow.
  - Pass when a new visitor sees the value, offline, and collaboration explanations; skip works; and an interrupted onboarding resumes sensibly.

- [ ] `DEMO-02` — Open the Mediterranean demo and browse every trip section and Home mode.
  - Pass when its four stops, traveler/collaborator examples, itinerary, bookings, readiness, and documents work without a Supabase request.

- [ ] `DEMO-03` — Switch the demo clock through planning, pre-departure, travel-day, in-trip, and post-trip modes.
  - Pass when Home and Trip Home change predictably without changing the real device clock.

- [ ] `DEMO-04` — Open every sample demo document and inspect any ticket/barcode-like content.
  - Pass when each file is small, clearly watermarked as synthetic/non-functional, and contains no usable identity, booking, ticket, or barcode data.

- [ ] `DEMO-05` — Change demo state, reset it, then run the demo offline.
  - Pass when reset restores the same fixtures and the bundled demo continues working with no network.

- [ ] `DEMO-06` — Sign in after viewing the demo and visit Home, Trips, and Add.
  - Pass when real authenticated screens do not repeatedly show `Explore demo trip`; an empty account instead receives useful Create trip and Join trip actions.

## 5. Trip and three-member setup

- [ ] `TRIP-01` — As Member A, create `Southeast Asia Escape` with the suggested dates, route, timezone, and currency.
  - Pass when it appears in Trips and becomes the active trip without an RLS error.

- [ ] `TRIP-02` — Try to create a trip with a missing title and then with an end date before the start date.
  - Pass when both invalid forms are blocked with useful field messages and no partial trip is created.

- [ ] `TRIP-03` — Edit the destination summary, dates, timezone, and currency.
  - Pass when the changes persist after refresh and are visible to permitted members.

- [ ] `TRIP-04` — Add exactly three traveler profiles and link Member A to Traveler A.
  - Pass when all three travelers appear once, with no duplicate profile created on refresh.

- [ ] `TRIP-05` — Switch the planning context among Everyone, Traveler A, Traveler B, and Traveler C.
  - Pass when the selected context is obvious, relevant document summaries change, and the selection persists for that trip.

- [ ] `TRIP-06` — Select Traveler B, begin adding a document or traveler-specific item, cancel, and repeat for Traveler C.
  - Pass when the selected traveler is prefilled correctly and canceling does not create a record.

- [ ] `TRIP-07` — Create a second future trip.
  - Pass when both trips remain independent and switching trips also restores each trip's own selected traveler context.

- [ ] `TRIP-08` — Archive the second trip and then restore it.
  - Pass when it leaves the active list, appears in the archive, restores successfully, and the main test trip is unaffected.

- [ ] `TRIP-09` — Move a disposable trip into Recently deleted and restore it before the retention period ends.
  - Pass when normal lists exclude it, the UI explains the 30-day recovery window, and restoration brings back its child records.

- [ ] `TRIP-10` — Create trips representing Draft, Upcoming, Active, Completed, and Archived lifecycle states.
  - Pass when Trips groups them correctly and Home selects only an eligible upcoming/current trip.

- [ ] `TRIP-11` — Complete and reopen readiness items that contribute to trip progress.
  - Pass when progress uses an explained checklist count and changes deterministically rather than showing an unexplained percentage.

- [ ] `TRIP-12` — Open the same trip in two Editor sessions, edit the same versioned field in both, and submit the older form last.
  - Pass when the stale edit does not silently overwrite the newer value and a conflict/reload path is presented.

## 6. Sharing, trip codes, and roles

- [ ] `SHARE-01` — While signed out, try to open a copied Trip Vault trip or join link.
  - Pass when sign-in is required and no itinerary, traveler, cost, or document metadata is exposed.

- [ ] `SHARE-02` — As Member A, generate a one-time Editor code linked specifically to Traveler B.
  - Pass when the UI identifies the intended role and traveler and provides a copyable code.

- [ ] `SHARE-03` — Sign in as Member B and redeem that code.
  - Pass when Member B joins once as Editor, is linked to Traveler B, and the trip appears immediately or after one normal refresh.

- [ ] `SHARE-04` — Attempt to redeem Member B's code again from Member B and Member C.
  - Pass when both attempts fail safely because the code has already been used.

- [ ] `SHARE-05` — Generate a one-time Viewer code linked specifically to Traveler C and redeem it as Member C.
  - Pass when Member C joins as Viewer and is linked to Traveler C only.

- [ ] `SHARE-06` — As Member B, add and edit an itinerary event, hotel, or activity.
  - Pass when Editor changes save and synchronize to Members A and C.

- [ ] `SHARE-07` — As Member B, try owner-only membership actions such as removing the owner or changing protected ownership settings.
  - Pass when the action is hidden or rejected.

- [ ] `SHARE-08` — As Member C, try to add, edit, archive, or delete shared itinerary and booking data.
  - Pass when Viewer mutation controls are hidden or rejected while normal viewing still works.

- [ ] `SHARE-09` — As Member A, change Member C from Viewer to Editor, then have Member C add a meal event.
  - Pass when the new permission takes effect and the event is visible to all three accounts.

- [ ] `SHARE-10` — Change Member C back to Viewer.
  - Pass when later shared-content edits are blocked without requiring a new invitation.

- [ ] `SHARE-11` — Remove Member C from the trip while their session is open, then refresh Member C's app.
  - Pass when the owner first sees the warning about previously downloaded copies, then the trip and future cloud access are no longer available to Member C online.

- [ ] `SHARE-12` — Create another Viewer code for Traveler C and revoke it before use.
  - Pass when redemption is rejected and no membership is created.

- [ ] `SHARE-13` — Optional collaborator case: invite a fourth test account as a non-traveling Editor without linking a traveler profile.
  - Pass when the collaborator can help edit the itinerary but is not counted as a traveler and has no personal document identity.

- [ ] `SHARE-14` — Change a shared itinerary item in Member A's session while Member B and Member C remain on the trip.
  - Pass when connected authorized sessions refresh the metadata without requiring a manual page reload.

- [ ] `SHARE-15` — Create a code, make it expired using a controlled test setup, and attempt redemption.
  - Pass when the app returns the same generic failure as an invalid, revoked, or used code and reveals no trip details.

- [ ] `SHARE-16` — Enter invalid codes six times within fifteen minutes from one account.
  - Pass when attempts are rate-limited after the documented threshold and every response remains generic.

- [ ] `SHARE-17` — Have two signed-in test sessions submit the same valid unused code as close together as possible.
  - Pass when exactly one membership/traveler claim is created and the other attempt fails generically.

- [ ] `SHARE-18` — Add one child or elderly parent as an unclaimed traveler and manage their booking, requirement, and document while signed in as Member A.
  - Pass when the person participates normally without needing an account and the UI never implies that switching traveler context is account impersonation.

## 7. Flights, hotels, activities, meals, and itinerary

- [ ] `PLAN-01` — Add a flight with airline, flight number, booking reference, origin/destination, local departure/arrival time, terminal, gate, and baggage details.
  - Pass when all values survive refresh and times display in the intended local timezone.

- [ ] `PLAN-02` — Add the remaining flight segments, including a segment crossing timezones or midnight.
  - Pass when the timeline orders segments by their actual timestamps and shows understandable local date/time values.

- [ ] `PLAN-03` — Assign all three travelers to one flight and only two travelers to another.
  - Pass when each flight displays the correct participants and traveler-specific information stays attached to the right person.

- [ ] `PLAN-04` — Add seats and ticket references for each traveler.
  - Pass when switching traveler context makes the relevant seat/ticket easy to find without hiding permitted shared information.

- [ ] `PLAN-05` — Add three hotel stays with check-in/out, address, booking reference, contact details, and notes.
  - Pass when stays appear at the correct place in the itinerary and overlapping stays are not silently lost.

- [ ] `PLAN-06` — Add transport/transfer records for airport pickup and another transfer.
  - Pass when date, time, pickup, destination, booking details, and notes are retained.

- [ ] `PLAN-07` — Add activities for Gardens by the Bay, Petronas Towers, and an Ubud tour.
  - Pass when each can have a location, start/end time, participants, notes, and related booking.

- [ ] `PLAN-08` — Add a welcome dinner, reserved lunch, and an unreserved meal plan as itinerary events.
  - Pass when meal events are distinguishable, ordered correctly, and can store reservation details where available.

- [ ] `PLAN-09` — Add two events at the same time, reorder them, edit one, and archive one.
  - Pass when manual order is retained, edits synchronize, and the archived event leaves the active timeline without deleting unrelated data.

- [ ] `PLAN-10` — Link an itinerary event to a booking and then remove only the link.
  - Pass when the event and booking both remain and only their relationship is removed.

- [ ] `PLAN-11` — Use an address/map shortcut and copy important booking text.
  - Pass when the external map opens with useful location information and copied text is complete and readable.

- [ ] `PLAN-12` — Reload the app as all three roles and inspect the full timeline.
  - Pass when the owner, editor, and viewer see a consistent, chronological trip plan with no duplicate items.

- [ ] `PLAN-13` — Add a Restaurant booking and an Other booking with their type-specific and free-form details.
  - Pass when validation remains useful without forcing either record into a flight, hotel, transport, or activity shape.

- [ ] `PLAN-14` — Search for a booking using its title, provider, and confirmation reference; copy the reference and repeat while offline.
  - Pass when the record is findable through supported metadata, sensitive display is appropriately masked, and the copy action returns the complete value for an authorized member.

- [ ] `PLAN-15` — Attach more than one document to a booking.
  - Pass when each document remains governed by its own visibility and can also remain linked to itinerary events without file duplication.

- [ ] `PLAN-16` — Add and edit a shared trip note, then open it offline.
  - Pass when Owner/Editor changes synchronize, Viewer editing is blocked, and the cached note remains readable offline.

- [ ] `PLAN-17` — Export selected itinerary items and preparation deadlines to an `.ics` calendar file.
  - Pass when event identity, dates, times, and timezones are correct and no document binaries, private URLs, or sensitive metadata are exported.

- [ ] `PLAN-18` — Edit the trip-scoped airline snapshot's display name, code, color, and HTTPS action templates.
  - Pass when existing flight history remains intact, invalid/non-HTTPS links are rejected, and a neutral airline monogram appears if artwork is missing.

## 8. Manual flight state and travel-day display

- [ ] `FLIGHT-01` — Change a flight from Scheduled to Delayed and enter the delay duration or revised time.
  - Pass when the new time, time remaining, and an important alert are displayed consistently.

- [ ] `FLIGHT-02` — Add or change terminal and gate information.
  - Pass when the latest terminal/gate becomes prominent on the flight and current-trip views.

- [ ] `FLIGHT-03` — Add baggage allowance and a baggage-tag reference.
  - Pass when baggage information is easy to find but is not presented as live airline data.

- [ ] `FLIGHT-04` — Add a ticket first, then add a boarding pass later.
  - Pass when the ticket is shown before check-in and the boarding pass becomes the preferred travel-day document once available.

- [ ] `FLIGHT-05` — Change a flight through Boarding, Landed, and Cancelled states.
  - Pass when each state is clear, updates the relevant home/alert presentation, and never claims the update was automatic.

- [ ] `FLIGHT-06` — Open the configured external airline or flight-tracker link.
  - Pass when it opens safely in the browser with the most specific useful flight information supported by the template.

- [ ] `FLIGHT-07` — Open check-in, manage-booking, status, and public tracker actions for a configured airline.
  - Pass when every action is clearly external, expands only approved placeholders, uses HTTPS, and warns with the destination hostname when appropriate.

- [ ] `FLIGHT-08` — Update a manual flight value from Member B's account and inspect it as Members A and C.
  - Pass when the UI identifies the value as traveler-maintained and shows the updater and freshness time.

## 9. Documents and multiple event attachments

- [ ] `DOC-01` — Upload a supported PDF below 5 MB to the trip.
  - Pass when progress/error state is clear, the record appears once, and the file opens after refresh.

- [ ] `DOC-02` — Upload a supported image just below 5 MB.
  - Pass when it uploads without lossy compression and remains legible at its original useful quality.

- [ ] `DOC-03` — Attempt a file of 5 MB or larger and an unsupported `.zip` file.
  - Pass when both are rejected before or during upload with a clear size/type message and no broken database record remains.

- [ ] `DOC-04` — Upload a Private document as Member B.
  - Pass when Member B can open it and Members A and C cannot see its metadata or file.

- [ ] `DOC-05` — Upload a document for Traveler B with `Traveler and trip editors` visibility.
  - Pass when Traveler B, the owner, and editors can open it, while a Viewer linked to another traveler cannot.

- [ ] `DOC-06` — Upload a Trip-visible hotel confirmation.
  - Pass when all three trip members can open it after signing in.

- [ ] `DOC-07` — Upload a document visible only to selected Members A and C.
  - Pass when only those selected accounts can see and open it; Member B must not see even its private metadata.

- [ ] `DOC-08` — As Member C in the Viewer role, upload a private document for their own account.
  - Pass when the upload is allowed as private and does not grant Member C permission to edit shared trip data.

- [ ] `DOC-09` — Attach two different documents to the same dinner/activity itinerary event.
  - Pass when both attachments are shown and open independently from that event.

- [ ] `DOC-10` — Attach one document to two events, then unlink it from only one event.
  - Pass when the file remains available from the other event and in the Vault.

- [ ] `DOC-11` — Replace a document with a newer version.
  - Pass when the current version opens by default, version history remains understandable, and no duplicate active document is presented.

- [ ] `DOC-12` — Prepare selected essential files for offline use and inspect their status.
  - Pass when each prepared file clearly reports that an offline copy is available.

- [ ] `DOC-13` — Remove only the offline copy of a document.
  - Pass when the server document remains available online and the UI no longer promises offline access.

- [ ] `DOC-14` — Archive and restore a document.
  - Pass when it leaves normal lists, remains recoverable, and restores with its event links and visibility intact.

- [ ] `DOC-15` — Preview an allowed PDF and image, then download each original.
  - Pass when preview does not execute active uploaded content and the download keeps the original filename, MIME type, bytes, and legibility.

- [ ] `DOC-16` — In Vault, search by title, purpose, baggage short label, booking reference where supported, and category; repeat the search offline.
  - Pass when only authorized cached metadata appears, category filtering works, and document contents themselves are not searched or extracted.

- [ ] `DOC-17` — Select several valid files and one invalid/oversized file in one upload action.
  - Pass when each file has independent progress/error state, valid files finish, and one failure does not cancel or duplicate the others.

- [ ] `DOC-18` — Compare a prepared file's reported size/checksum with its manifest, then simulate or detect a bad local copy through the available integrity flow.
  - Pass when a mismatch is never marked verified; the bad copy is discarded and can be downloaded again online.

- [ ] `DOC-19` — Inspect Profile storage usage before and after preparing and removing files.
  - Pass when approximate local/cloud usage is shown in understandable units and changes in the expected direction.

## 10. Costs and trip total

The current MVP total is calculated from explicit cost records. A price written only in a flight, hotel, meal, or activity record must not be silently counted until it is added as a trip cost. This avoids accidental duplication and makes the current product behavior testable.

- [ ] `COST-01` — Add explicit costs for flights, hotels, activities, meals, and transfers.
  - Pass when every entry has a category, amount, currency, status, date, and optional note/reference.

- [ ] `COST-02` — Confirm the trip total after every new cost.
  - Pass when the total updates immediately and equals the sum of included cost records.

- [ ] `COST-03` — Add amounts in INR and SGD.
  - Pass when totals remain grouped by currency; the app must not invent an exchange rate or misleading combined total.

- [ ] `COST-04` — Mark costs Planned, Paid, and Refunded.
  - Pass when Planned and Paid values follow the displayed total rules and Refunded values are excluded or deducted exactly as the UI explains.

- [ ] `COST-05` — Edit an amount and archive/delete a cost.
  - Pass when totals recalculate without a refresh and no stale amount remains.

- [ ] `COST-06` — Add a price to a hotel or activity without adding a trip cost.
  - Pass for the current MVP when the total does not change automatically. Record this as a product gap if automatic booking-to-cost creation is desired before release.

## 11. Readiness, home page, and alerts

- [ ] `READY-01` — Add passport, visa, insurance, and check-in requirements for each traveler.
  - Pass when every requirement belongs to the correct traveler and supports status, deadline, notes, and a linked document.

- [ ] `READY-02` — Mark a requirement Not started, In progress, Ready, and Not required.
  - Pass when counts and readiness summaries update consistently for Everyone and each traveler.

- [ ] `READY-03` — Add a passport expiry date and a visa note through the manual input flow.
  - Pass when the app saves the information without claiming to determine visa eligibility automatically.

- [ ] `READY-04` — Link a requirement to its authorized current document and open it from the checklist.
  - Pass when the correct current document opens in one action and a member who can see readiness but not the document receives an access-denied state without metadata leakage.

- [ ] `READY-05` — Save and open an HTTPS embassy/government guidance URL and set the date it was checked.
  - Pass when the source and freshness are visible, unsafe URLs are rejected, and the app retains its advisory—not legal advice—wording.

- [ ] `READY-06` — Complete every required item for all assigned travelers, then reopen one required item.
  - Pass when the trip becomes Ready only after everyone is complete and returns to Action required when one requirement reopens.

- [ ] `HOME-01` — With the trip more than one day away, open Home.
  - Pass when it presents the upcoming trip, useful countdown/readiness information, and no `Explore demo trip` action for a signed-in user.

- [ ] `HOME-02` — Temporarily set the trip start to tomorrow and reload Home.
  - Pass when the current-trip experience begins one day early and promotes the next useful items.

- [ ] `HOME-03` — Set the trip date to today and create a near-term flight, hotel check-in, meal, and activity.
  - Pass when `Need now` prioritizes the most time-sensitive item and gives fast access to the relevant ticket, boarding pass, visa, or booking document.

- [ ] `HOME-04` — Exercise planning, pre-departure, travel-day, in-trip, and post-trip date states with the same data.
  - Pass when the Now/Next hero, Today timeline, stay/transport, preparation work, and shortcuts change contextually without changing navigation.

- [ ] `HOME-05` — Create two trips whose D-1/current windows overlap, choose a focused trip, and reload.
  - Pass when Home shows at most one current trip, preserves the manual choice on that device, and leaves the other trip available under Trips.

- [ ] `HOME-06` — Inspect an upcoming trip with several incomplete requirements and different deadlines.
  - Pass when its work queue shows the correct missing/time-sensitive count and nearest due item.

- [ ] `ALERT-01` — Trigger alerts through a manual delay, gate change, readiness deadline, and document reminder.
  - Pass when alerts are counted, ordered, linked to the right content, and do not imply live airline monitoring.

- [ ] `ALERT-02` — Mark one alert read, snooze one, dismiss one, and restore the dismissed alert.
  - Pass when counts and visibility update correctly across refresh and account sessions.

## 12. Offline, synchronization, and account isolation

Perform these cases only after visiting the deployed HTTPS app online, signing in, opening the test trip, and preparing the essential documents for offline use.

- [ ] `OFF-01` — Put the phone in airplane mode, fully close Trip Vault, and relaunch it from the home-screen icon.
  - Pass when the app shell opens without a network connection rather than showing a browser error.

- [ ] `OFF-02` — Offline, open the trip overview, itinerary, flight details, hotels, activities, meals, readiness, and cached alerts.
  - Pass when previously synchronized structured data remains readable and is clearly identified as offline/cached where helpful.

- [ ] `OFF-03` — Offline, open the prepared flight ticket, boarding pass, visa/passport sample, and hotel confirmation.
  - Pass when prepared files open fully and remain legible.

- [ ] `OFF-04` — Offline, try to open a document that was not prepared.
  - Pass when the app explains that the file is unavailable offline and does not display an endless spinner or broken preview.

- [ ] `OFF-05` — As Member A or B, create/edit an itinerary item while offline.
  - Pass when the UI records it as pending synchronization and prevents accidental duplicate submissions.

- [ ] `OFF-06` — Reconnect to the internet and wait for synchronization.
  - Pass when pending changes upload once, success is visible, and the other permitted accounts receive the result.

- [ ] `OFF-07` — Create a conflict by editing the same field on two devices, one offline and one online, then reconnect.
  - Pass when the app detects the conflict or applies its documented resolution rule without silently losing both versions.

- [ ] `OFF-08` — Lose connectivity during a document upload, reconnect, and retry.
  - Pass when no unusable document row remains and the user can safely retry once.

- [ ] `OFF-09` — Sign out, sign in as another account on the same device, and go offline.
  - Pass when the new account cannot access the previous account's private documents or protected cached trip data.

- [ ] `OFF-10` — While offline, open Admin.
  - Pass when admin mutation is unavailable with an explicit online-required message; admin changes are not expected to work offline.

- [ ] `OFF-11` — Before preparing the trip, review the size estimate, offline limitations, available quota, and persistent-storage result.
  - Pass when a shortfall is reported before downloading, the user can choose a reduced Essentials pack, and the UI never promises that the browser/OS cannot evict data.

- [ ] `OFF-12` — Prepare the complete pack and separately prepare a deliberately reduced pack.
  - Pass when only a fully synchronized, checksum-verified manifest says `Ready offline`; the reduced one says `Essentials ready`.

- [ ] `OFF-13` — After a pack is Ready offline, change an authorized document or structured trip record from another online account.
  - Pass when the first device marks the pack stale until it refreshes and verifies the updated manifest.

- [ ] `OFF-14` — Remove an entire trip pack from Profile and inspect cloud data online.
  - Pass when device space is reclaimed, the cloud originals and trip remain, and the trip can be prepared again.

- [ ] `OFF-15` — During an airplane-mode cold start, inspect network activity for fonts, icons, airline metadata, and other app-shell resources.
  - Pass when startup does not depend on a CDN or external runtime resource.

- [ ] `OFF-16` — Install a newer deployed app version while local trip data and pending edits exist, then accept the Update ready action.
  - Pass when the app waits for user approval, migrates local data safely, and retains the prior working state if migration cannot complete.

## 13. Administrator configuration

Before this section, add exactly one test account to the Supabase admin allowlist using the documented admin bootstrap SQL. Use a non-admin account for access-control tests.

- [ ] `ADMIN-01` — Open the Admin sign-in/route as a normal authenticated trip user.
  - Pass when access is denied without exposing drafts, audit data, or configuration controls.

- [ ] `ADMIN-02` — Sign in as the allowlisted administrator.
  - Pass when Admin opens and normal user authentication remains separate from authorization to administer configuration.

- [ ] `ADMIN-03` — Create a configuration draft from the currently published version.
  - Pass when the draft is clearly labeled, editable, and does not change the traveler app yet.

- [ ] `ADMIN-04` — Add and edit airline metadata: name, IATA/ICAO code, logo, banner/card color, tracker URL template, and sort/enabled state.
  - Pass when validation rejects malformed entries and valid metadata previews correctly in light and dark mode.

- [ ] `ADMIN-05` — Add and edit airport metadata: code, name, city, country, timezone, latitude, and longitude.
  - Pass when invalid codes/coordinates/timezones are rejected and valid airports become selectable after publication.

- [ ] `ADMIN-06` — Edit supported document MIME types, the 4,999,999-byte limit, reminder defaults, and other available app metadata.
  - Pass when unsafe/invalid values are blocked and the draft remains internally consistent.

- [ ] `ADMIN-07` — Upload a valid airline logo/banner and then try an invalid file type or oversized asset.
  - Pass when valid assets preview and invalid assets are rejected without a broken record.

- [ ] `ADMIN-08` — Configure light and dark color settings and inspect the preview at phone and desktop widths.
  - Pass when text remains readable, controls remain visible, and invalid color values cannot be published.

- [ ] `ADMIN-09` — Publish the draft.
  - Pass when it becomes the single published version, the prior version is retained in history, and the traveler app receives the new config after its normal refresh/sync.

- [ ] `ADMIN-10` — Inspect an existing trip created with older airline metadata after publishing a changed airline name/color.
  - Pass when the trip's saved booking snapshot does not change unexpectedly while new selections can use the newly published metadata.

- [ ] `ADMIN-11` — Create another draft, make a change, and discard/delete the draft.
  - Pass when the published version and traveler app remain unchanged.

- [ ] `ADMIN-12` — Roll back to a previously published configuration.
  - Pass when a safe new published state is created/restored, there is still only one active published version, and clients receive it normally.

- [ ] `ADMIN-13` — Review the audit/history view after draft, publish, delete/discard, and rollback actions.
  - Pass when actions identify the administrator, action type, target/version, and time without leaking secrets.

- [ ] `ADMIN-14` — From Admin, attempt to browse trip itineraries, traveler documents, costs, or memberships.
  - Pass when global configuration access does not grant access to personal trip data.

- [ ] `ADMIN-15` — Disconnect the network while editing a draft and try to save or publish.
  - Pass when the operation fails clearly and safely, and reconnecting allows a deliberate retry without duplicate versions.

- [ ] `ADMIN-16` — Disable one airline and add aliases to another, publish, then open the new-flight picker.
  - Pass when the disabled airline is unavailable for new selection, alias search finds the intended airline, and an existing trip snapshot is not erased.

- [ ] `ADMIN-17` — Try to add arbitrary CSS, JavaScript, an HTTP action URL, a credential/secret, or an authorization rule through metadata/theme inputs.
  - Pass when all executable or security-sensitive configuration is impossible or rejected by both validation and backend policy.

- [ ] `ADMIN-18` — Sign in as the administrator but do not invite that account to the test trip; attempt to open the trip URL and a copied document URL.
  - Pass when both remain denied. Then invite the account normally and confirm access follows only its trip role.

## 14. Responsive design, accessibility, and interaction

- [ ] `UX-01` — Repeat the main Home, Trips, Add, Vault, Profile, trip detail, and Admin flows at narrow phone width and desktop width.
  - Pass when there is no clipped navigation, horizontal page overflow, inaccessible modal, or content hidden behind the bottom bar.

- [ ] `UX-02` — Use keyboard-only navigation on desktop through sign-in, trip creation, an add form, a document dialog, and Admin.
  - Pass when focus is visible, order is logical, dialogs trap/restore focus, and every action has a keyboard path.

- [ ] `UX-03` — Enable dark mode locally, reload, go offline, and relaunch.
  - Pass when the local theme preference persists and every tested screen remains readable.

- [ ] `UX-04` — Exercise cards, traveler switching, expandable details, dialogs, and page transitions.
  - Pass when interactions provide restrained visual feedback without excessive motion or delayed input.

- [ ] `UX-05` — Enable the operating system's Reduce Motion setting.
  - Pass when non-essential zoom/transition effects are substantially reduced and the app remains understandable.

- [ ] `UX-06` — Increase browser text size/zoom to 200% on desktop and use larger text on phone.
  - Pass when essential content and actions remain readable and operable.

- [ ] `UX-07` — Select System appearance, change the operating-system appearance while the app is open, then restart online and offline.
  - Pass when System follows the OS, Light/Dark overrides do not, and the chosen mode applies before the main UI without a visible incorrect-theme flash.

- [ ] `UX-08` — Inspect urgent, warning, success, disabled, offline, document, and current-focus states in both palettes.
  - Pass when they remain distinguishable by text/icon as well as color and maintain readable contrast and touch targets.

## 15. Cleanup and release decision

- [ ] Remove all temporary invitations and the optional collaborator.
- [ ] Remove the temporary admin allowlist entry if it should not remain an administrator.
- [ ] Archive or clearly label the test trip so it cannot be mistaken for real travel data.
- [ ] Confirm that no real passport, visa, ticket, or personal document was used.
- [ ] Record every failed case with account/role, device, exact steps, expected result, actual result, screenshot, and time.

Release acceptance requires:

1. No cross-trip, cross-member, private-document, or signed-out data exposure.
2. Three-member owner/editor/viewer sharing and one-time codes work end to end.
3. Flights, hotels, transfers, activities, meals, requirements, documents, alerts, and explicit costs persist and synchronize.
4. Essential trip data and prepared documents survive a true airplane-mode cold start.
5. Admin access is allowlist-protected, online-only, audited, and cannot expose trip data.
6. The installed phone experience and dedicated Cloudflare URL work without relying on StudyDesk.
