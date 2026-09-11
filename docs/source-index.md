---
title: "Trip Vault Documentation Source Index"
description: "Authoritative implementation and verification sources used by the Trip Vault design documents."
scope: [service-wide]
agents: [coder, reviewer, planner]
tags: [documentation, sources, traceability]
last_verified: 2026-09-11
---

# Trip Vault Documentation Source Index

| Subject | Authoritative source | Used by |
|---|---|---|
| Product scope | `docs/FEATURES.md` | HLD, LLD, manual acceptance |
| Accepted timeline decisions | `docs/REDESIGN_CHECKLIST.md` | HLD, LLD, implementation |
| System architecture | `docs/HIGH_LEVEL_DESIGN.md` | LLD, deployment guidance |
| Routes, data, security, and offline contract | `docs/LOW_LEVEL_DESIGN.md` | Implementation and review |
| Database schema | `supabase/migrations/*.sql` in filename order | LLD and SQL smoke test |
| Document experience and assignment | `src/features/workspace/documentModel.ts`, `src/pages/DocumentPage.tsx`, `supabase/migrations/202609110003_document_experience.sql` | HLD and LLD document contract |
| Timeline and booking implementation | `src/features/timeline/`, `src/features/trips/`, `src/features/workspace/`, `src/pages/TripPage.tsx` | Feature status and acceptance |
| Administrator configuration | `src/features/admin/`, `src/pages/AdminPage.tsx` | HLD and LLD |
| Automated verification | `src/**/*.test.ts`, `src/**/*.test.tsx`, `supabase/tests/001_schema_smoke.sql` | Release evidence |
| Manual acceptance | `docs/FEATURE_TEST_CHECKLIST.md` | Phone, desktop, offline, sharing, and Admin release gate |

External behavior references are deliberately narrow: provider-local travel schedules follow airline ticket conventions; Call uses the platform `tel:` handler; WhatsApp uses its official `wa.me` click-to-chat format; map actions use Google Maps URLs without an embedded Maps API key.

The September 2026 document-model review used a temporary, user-supplied set of visa, accommodation, flight, activity-admission, meal-voucher, and receipt PDFs. Those private files are neither copied into this repository nor named in design documentation; only generalized structural findings are retained.
