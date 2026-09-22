# Trip Vault

Trip Vault is a personal, installable travel web app for keeping trips, bookings, travelers, readiness checks, costs, notes, and the documents needed at each moment. It uses React as a PWA, Supabase for identity/database/private files, IndexedDB plus OPFS for local-first use, and Cloudflare Workers Static Assets for eventual hosting.

The application uses a timeline-first trip experience. Product scope, architecture, and implementation decisions are maintained in the canonical [feature catalog](docs/FEATURES.md), [high-level design](docs/HIGH_LEVEL_DESIGN.md), and [low-level design](docs/LOW_LEVEL_DESIGN.md).

## Implemented

- Email sign-up/sign-in with display name, two password fields, and visibility controls
- Trips / Vault / Profile navigation, compact attention alerts, and fresh-launch opening of a single trip within its ten-day pre-departure window; overlapping trips remain a user choice
- Trips, date-grouped/reorderable itinerary, calendar export, bookings, manual flight operations, airline actions, travelers, editable readiness, notes, and costs
- Unified date-grouped expandable timeline, date/type/display filters, event-type and flexible-date search, centered focus with three pulses over 3.5 seconds, explicit nested Back/scroll restoration, and sectioned Trip details
- Compact timeline type icons, animated bottom-right silhouettes in expanded/detail surfaces, event-colored heroes, neutral ordinary borders, and a persistent current-event/task distinction with reduced-motion support
- Document-first event details, hotel/driver contacts, responsive navigation/Call/WhatsApp shortcuts, hotel days/nights, and typed top-level Edit actions
- Light-teal/dark-text trip hero in dark mode and Indian lakh/crore grouping for INR amounts
- Progressive event forms with Direct/Connecting Flight, Single/Connecting Train/Bus/Ferry, simplified Ferry capture, ordered Cab stops, planned/walk-up/booked intent, optional ground-journey arrival, typed ticket details, and strict International endpoint zones without Domestic country/time-zone prompts
- Bundled offline operator/company suggestions with reversible Other/manual entry for Train, Bus, Ferry, and Cab; booking sellers remain separate under Booked via
- Per-traveler, per-leg ticket details where they apply: Flight seat, boarding group and ticket number; Train seat/berth, coach and reference; Bus seat and reference; Ferry reference plus seat/cabin only for assigned seating; and no Cab seat grid
- Atomic Hotel check-in/checkout milestones, preparation events, per-event documents and costs, booked-via metadata, and Call/WhatsApp contact actions
- QR invitation links generated from existing expiring one-time codes, with sign-in preserving the prefilled code
- One-time traveler or non-traveling collaborator join codes with owner/editor/viewer roles
- Consent-required trip offers for accounts that have already shared an accepted trip
- Managed parent/child delegation and participant selection
- Everyone/one-traveler presentation filtering across timeline, reservations, readiness, costs, seats, and documents
- Private, traveler-and-manager, trip-wide, and selected-member document access
- Strict files smaller than 5,000,000 bytes, immutable versions, archive-with-local-copy, checksum verification, a large touch/keyboard/drop picker, generic phone-MIME recovery, and local-first PDF/image preview
- In-app vertical multi-page PDF stack with lazy rendering, per-page retry, zoom/fit and supported fullscreen; image zoom, document facts behind Info, and device Open fallback
- Several documents per itinerary event, grouped by Everyone and traveler usage, with travel-specific types, traveler assignment, and exact-duplicate reuse
- Prepared offline trip packs, cold-start device enrollment, offline structured edits/uploads, foreground synchronization, and explicit conflict resolution
- In-app reminders/alerts, unread count, dismiss, restore, and snooze
- Bundled airline and airport fallbacks, restrained theme-safe airline accents, keyless Google Maps hand-off, and external-domain confirmation
- System/Light/Dark device modes plus atomically published administrator palettes and metadata
- Online-only administrator catalogs with validated airline artwork, drafts, publication history, audit trail, and rollback
- Profile install action with iPhone/iPad and Android guidance, PWA update prompt, and a fully synthetic `/preview` trip with watermarked sample documents

The reconciled implementation contract is in [LOW_LEVEL_DESIGN.md](docs/LOW_LEVEL_DESIGN.md), with the product inventory in [FEATURES.md](docs/FEATURES.md).

See [CHANGELOG.md](CHANGELOG.md) for enhancement history. Web Push and scheduled Supabase delivery are proposed, not implemented; the existing alert engine is in-app.

## Run locally

Requirements: Node.js 20 or newer and npm.

```bash
nvm use
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://127.0.0.1:5173`. Follow the [Supabase database workflow](supabase/README.md): new projects use the single `TRIP_VAULT_COMPLETE_SETUP.sql` installer, then the SQL smoke tests. Never rerun it on an existing database; apply only reviewed missing sections after backup. Real signed-in flows also require the two browser-safe values in `.env.local`.

## Verify

```bash
npm run typecheck
npm test
npm run build
.venv/bin/python scripts/verify_demo_pdfs.py
```

Use the compact MVP exit matrix in [FEATURES.md](docs/FEATURES.md) for the three-member phone/desktop acceptance run; executable verification details remain in [LOW_LEVEL_DESIGN.md](docs/LOW_LEVEL_DESIGN.md).

Current documentation-change validation: TypeScript type-check, production PWA build, and Markdown formatting pass. The full test run has 503 passing tests across 85 passing files, with one existing Flight connection-card selector failure and one form timeout that passed when rerun in isolation; the exact record is in the LLD. Synthetic-PDF verification, remote SQL, phone/desktop, Storage, and airplane-mode checks remain separate release gates.

For a real offline cold-start test, build first and use `npm run preview -- --host 127.0.0.1`; Vite's development server is not the service-worker acceptance environment.

The sample PDF source, renderer, and safety checks live under `scripts/`:

```bash
.venv/bin/python scripts/generate_demo_pdfs.py
.venv/bin/python scripts/render_demo_pdfs.py
.venv/bin/python scripts/verify_demo_pdfs.py
```

## Deployment

`wrangler.jsonc` serves `dist/` as a Cloudflare SPA. Add the same browser-safe Supabase URL and publishable key during the Cloudflare build. Never put a Supabase secret/service-role key in this project or browser bundle.
