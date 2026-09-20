# Personal documents and incoming shares

## Deployment

1. In the Supabase SQL Editor, run the complete contents of `supabase/migrations/202609200003_personal_documents.sql`. This is additional to the cost association migration. It adds personal metadata to the existing private account uploads, prevents trip association for personal originals, and protects Storage reads. No new bucket, key, Cron, or environment variable is needed.
2. Deploy the app normally to Cloudflare and activate the updated service worker using Reload and update.
3. Test with a harmless sample file first: Vault → Add document → Personal documents → Save privately. Confirm it appears under Personal documents, can be opened/downloaded, and does not appear in Profile's unfinished trip inbox or another account's Vault.
4. On an installed Android Chrome PWA, share one PDF/image from Files or another app and choose Trip Vault. Review its fields and choose Personal documents or a trip. The OS must update the installed app's manifest before the new share target appears; if it remains absent after updating, reinstall only after all pending uploads have synced. No browser-data clearing is needed.

`supabase/tests/003_personal_documents_smoke.sql` provides rollback-only owner/isolation/constraint probes for an isolated test project. It has not been executed locally because PostgreSQL is unavailable. It does not upload real files.

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
