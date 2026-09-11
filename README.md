# Trip Vault

Trip Vault is a personal, installable travel web app for keeping trips, bookings, travelers, readiness checks, costs, notes, and the documents needed at each moment. It uses React as a PWA, Supabase for identity/database/private files, IndexedDB plus OPFS for local-first use, and Cloudflare Workers Static Assets for eventual hosting.

The application now uses a timeline-first trip experience. The accepted design and database decisions are recorded in [REDESIGN_CHECKLIST.md](docs/REDESIGN_CHECKLIST.md).

## Implemented

- Email sign-up/sign-in with display name, two password fields, and visibility controls
- Upcoming and D-1/current Home modes, overlap selection, next action, alerts, and per-currency trip totals
- Trips, date-grouped/reorderable itinerary, calendar export, bookings, manual flight operations, airline actions, travelers, editable readiness, notes, and costs
- Timeline-first trip opening with one current/next highlight, automatic positioning, local search, sticky Add Event and People controls, and a sectioned Trip details workspace
- Connected Flight, Train, Bus, Ferry/Boat, and Cab journeys with strict origin/destination time zones, ticket-style local display, actual elapsed duration, domestic/international state, and flight PNR enforcement
- Hotel check-in/checkout milestones, preparation events, per-event documents and costs, booked-via metadata, and Call/WhatsApp contact actions
- QR invitation links generated from existing expiring one-time codes, with sign-in preserving the prefilled code
- One-time traveler or non-traveling collaborator join codes with owner/editor/viewer roles
- Managed parent/child delegation and participant selection
- Private, traveler-and-manager, trip-wide, and selected-member document access
- Strict files smaller than 5,000,000 bytes, immutable versions, archive-with-local-copy, checksum verification, and local-first preview
- Several ordered documents per itinerary event, with travel-specific types, traveler assignment, and exact-duplicate reuse
- Prepared offline trip packs, cold-start device enrollment, offline structured edits/uploads, foreground synchronization, and explicit conflict resolution
- In-app reminders/alerts, unread count, dismiss, restore, and snooze
- Bundled airline and airport fallbacks, keyless Google Maps hand-off, and external-domain confirmation
- System/Light/Dark device modes plus atomically published administrator palettes and metadata
- Online-only administrator catalogs with validated airline artwork, drafts, publication history, audit trail, and rollback
- Profile install action with iPhone/iPad and Android guidance, PWA update prompt, and a fully synthetic `/preview` trip with watermarked sample documents

The reconciled implementation contract is in [LOW_LEVEL_DESIGN.md](docs/LOW_LEVEL_DESIGN.md), with the product inventory in [FEATURES.md](docs/FEATURES.md).

## Run locally

Requirements: Node.js 20 or newer and npm.

```bash
nvm use
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://127.0.0.1:5173`. For a new Supabase project, paste and run the single `supabase/TRIP_VAULT_COMPLETE_SETUP.sql` file in the SQL Editor. Migration-based deployments can instead apply the files in `supabase/migrations/` in filename order. Real signed-in flows also require the two browser-safe values in `.env.local`.

## Verify

```bash
npm run typecheck
npm test
npm run build
.venv/bin/python scripts/verify_demo_pdfs.py
```

Use [FEATURE_TEST_CHECKLIST.md](docs/FEATURE_TEST_CHECKLIST.md) for the short three-member phone/desktop acceptance run.

Current verified baseline: 24 Vitest files with 103 passing tests, a clean TypeScript check, verified synthetic PDFs, and a successful production PWA build. A production browser check also confirms that the service worker serves `/preview` after the preview server is stopped.

For a real offline cold-start test, build first and use `npm run preview -- --host 127.0.0.1`; Vite's development server is not the service-worker acceptance environment.

The sample PDF source, renderer, and safety checks live under `scripts/`:

```bash
.venv/bin/python scripts/generate_demo_pdfs.py
.venv/bin/python scripts/render_demo_pdfs.py
.venv/bin/python scripts/verify_demo_pdfs.py
```

## Deployment

`wrangler.jsonc` serves `dist/` as a Cloudflare SPA. Add the same browser-safe Supabase URL and publishable key during the Cloudflare build. Never put a Supabase secret/service-role key in this project or browser bundle.
