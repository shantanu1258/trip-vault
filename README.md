# Trip Vault

Trip Vault is a personal, installable travel web app for keeping trips, bookings, travelers, readiness checks, costs, notes, and the documents needed at each moment. It uses React as a PWA, Supabase for identity/database/private files, IndexedDB plus OPFS for local-first use, and Cloudflare Workers Static Assets for eventual hosting.

## Implemented

- Email sign-up/sign-in with display name, two password fields, and visibility controls
- Upcoming and D-1/current Home modes, overlap selection, next action, alerts, and per-currency trip totals
- Trips, date-grouped/reorderable itinerary, calendar export, bookings, manual flight operations, airline actions, travelers, editable readiness, notes, and costs
- One-time traveler or non-traveling collaborator join codes with owner/editor/viewer roles
- Managed parent/child delegation and participant selection
- Private, traveler-and-manager, trip-wide, and selected-member document access
- Strict files smaller than 5,000,000 bytes, immutable versions, archive-with-local-copy, checksum verification, and local-first preview
- Several ordered documents per itinerary event, including partial-success multi-file upload
- Prepared offline trip packs, cold-start device enrollment, offline structured edits/uploads, foreground synchronization, and explicit conflict resolution
- In-app reminders/alerts, unread count, dismiss, restore, and snooze
- Bundled airline and airport fallbacks, keyless Google Maps hand-off, and external-domain confirmation
- System/Light/Dark device modes plus atomically published administrator palettes and metadata
- Online-only administrator catalogs with validated airline artwork, drafts, publication history, audit trail, and rollback
- Profile install action with iPhone/iPad and Android guidance, PWA update prompt, and a fully synthetic `/preview` trip with watermarked sample documents

The implementation contract is in [LOW_LEVEL_DESIGN.md](docs/LOW_LEVEL_DESIGN.md). The exact Supabase and acceptance-test walkthrough is in [MANUAL_FUNCTIONAL_TEST.md](docs/MANUAL_FUNCTIONAL_TEST.md).

## Run locally

Requirements: Node.js 18 or newer and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://127.0.0.1:5173`. The safe demo at `/preview` works without Supabase. Real signed-in flows require every migration in `supabase/migrations/`, applied in filename order, and the two browser-safe values in `.env.local`.

## Verify

```bash
npm run typecheck
npm test
npm run build
.venv/bin/python scripts/verify_demo_pdfs.py
```

Current verified baseline: 17 Vitest files with 71 passing tests, a clean TypeScript check, verified synthetic PDFs, and a successful production PWA build. A production browser check also confirms that the service worker serves `/preview` after the preview server is stopped.

For a real offline cold-start test, build first and use `npm run preview -- --host 127.0.0.1`; Vite's development server is not the service-worker acceptance environment.

The sample PDF source, renderer, and safety checks live under `scripts/`:

```bash
.venv/bin/python scripts/generate_demo_pdfs.py
.venv/bin/python scripts/render_demo_pdfs.py
.venv/bin/python scripts/verify_demo_pdfs.py
```

## Deployment

`wrangler.jsonc` serves `dist/` as a Cloudflare SPA. Add the same browser-safe Supabase URL and publishable key during the Cloudflare build. Never put a Supabase secret/service-role key in this project or browser bundle.
