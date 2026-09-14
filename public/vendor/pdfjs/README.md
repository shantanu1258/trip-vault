# PDF.js runtime

Trip Vault vendors the browser runtime from Mozilla PDF.js `6.3.289` so private,
offline document blobs can be rendered without sending them to another service.

- Upstream release: <https://github.com/mozilla/pdf.js/releases/tag/v6.3.289>
- Distribution mirror: <https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/legacy/build/>
- Files: `pdf.mjs`, `pdf.worker.mjs`
- License: Apache-2.0; see `LICENSE`

SHA-256 checksums:

- `pdf.mjs`: `f401927e692efc7735e0cd528c490d0dd31b7f0972c122b7040df805be45cce4`
- `pdf.worker.mjs`: `a33cfe728c584fdba4fcc1fd54bcdc2f9f2f13889ddbb5b2bd1d0f8cbe49b84e`

The legacy browser build is intentional so installed PWAs on older phones do not
depend on the newest JavaScript iterator features. When upgrading, replace both
runtime files and the license from the same official release. The worker and main
module versions must always match.
