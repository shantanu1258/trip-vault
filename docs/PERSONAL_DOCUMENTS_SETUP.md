# Personal documents and incoming shares

## Deployment

1. Personal Vault support is included in `supabase/TRIP_VAULT_COMPLETE_SETUP.sql`. For new projects, use that installer once. For existing projects missing it, back up and review only `SECTION: PERSONAL DOCUMENTS` through its `commit`; do not rerun the installer. This preserves owner-only account storage and blocks trip association of personal originals. No new bucket, key, Cron, or environment variable is needed.
2. Deploy the app normally to Cloudflare and activate the updated service worker using Reload and update.
3. Test with a harmless sample file first: Vault → Add document → Personal documents → Save privately. Confirm it appears under Personal documents, can be opened/downloaded, and does not appear in Profile's unfinished trip inbox or another account's Vault.
4. On an installed Android Chrome PWA, share one PDF/image from Files or another app and choose Trip Vault. Review its fields and choose Personal documents or a trip. The OS must update the installed app's manifest before the new share target appears; if it remains absent after updating, reinstall only after all pending uploads have synced. No browser-data clearing is needed. The app's “Reload and update” refreshes its service worker, not necessarily Android's share-menu registration.
5. Test both a downloaded PDF and a JPEG/PNG/WebP image from Files, then the original sending app. Confirm the filename appears before saving and the saved file opens. A link-only share cannot supply file bytes: download it first. The receiver distinguishes missing attachments, text/link-only shares, and multiple files; it does not fetch shared links automatically. The image wildcard makes the app discoverable for generic gallery shares, but unsupported formats (for example GIF/HEIC) still cannot be saved.

`supabase/tests/003_personal_documents_smoke.sql` provides rollback-only owner/isolation/constraint probes for an isolated test project. It passes locally in PGlite using Supabase schema stand-ins; actual Storage API behaviour still needs hosted verification. It does not upload real files.

## Behavior and limits

- Personal documents require no trip. Types: Passport, Aadhaar, Other identity document, Insurance, Other. Name and optional label only; no identity-number extraction or public sharing.
- Existing account-owned storage, checksums, and offline upload retry are reused. Bytes are stored in private Storage, not database columns. Local copies remain subject to the existing device-storage/sign-out choices; this is not end-to-end encryption.
- Personal originals are private-only. They are not listed as trip-linked expense documents; upload a separate copy explicitly if needed for a trip. Personal deletion is permanent and requires confirmation, unlike trip document archival.
- One non-empty PDF/JPEG/PNG/WebP smaller than 5 MB per incoming share. Multiple files are rejected together, never silently partially imported.
- The temporary handoff has random identifiers, a maximum of five pending files, and a 15-minute expiry. Expired bytes are removed during subsequent cleanup/read activity; Save, Cancel, and explicit sign-out remove the handoff immediately. No cloud upload happens on receipt.
- Authentication is required to review/save. Sign-in retains the incoming route. Incoming trip uploads default to Only me and reuse the existing type/traveler/visibility review form.
- iPhone PWAs retain manual file upload; native iOS share extensions are not part of this implementation.

## Acceptance still needed after deployment

- Real Android OS share → installed PWA → sign-in if needed → Save/Cancel.
- Both personal and trip destinations, PDF and image, invalid size/type, multiple files, and offline save/retry.
- Owner-only personal file access and normal shared-trip document access after the new Storage policy.
- An expired share produces a useful message without creating a cloud record.
