---
title: "Trip Vault Documentation Conventions"
description: "Writing and decision-tracking conventions for Trip Vault planning and technical documentation."
scope: [service-wide]
agents: [coder, reviewer, planner]
tags: [documentation, conventions, decisions]
last_verified: 2026-09-19
---

# Trip Vault Documentation Conventions

These conventions keep the current design contract and future work readable. They apply to documents under `docs/`.

## Document Roles

| Document               | Purpose                                           | Should contain                                                                       |
| ---------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `HIGH_LEVEL_DESIGN.md` | System boundaries and major architectural choices | Goals, components, ownership, major flows, risks, open decisions                     |
| `LOW_LEVEL_DESIGN.md`  | Implementation contract                           | Modules, data model, routes, storage layout, sync behavior, security policies, tests |
| `FEATURES.md`          | Product scope                                     | User-facing capabilities, priority, release target, and acceptance conditions        |

Temporary redesign notes, implementation checklists, and standalone source indexes must be folded into these three canonical documents once their decisions are accepted. Do not create a second source of truth for an implemented feature.

## Decision Status

Every material choice should use one of these states:

| Status   | Meaning                                                           |
| -------- | ----------------------------------------------------------------- |
| Proposed | Current recommendation; not yet approved                          |
| Accepted | Discussed and approved for implementation                         |
| Revisit  | Previously accepted but new information requires another decision |
| Deferred | Intentionally postponed beyond the current release                |
| Rejected | Considered and intentionally excluded                             |

## Writing Rules

- Describe greenfield design as **proposed**, not as implemented behavior.
- Keep product behavior in `FEATURES.md` and implementation detail in `LOW_LEVEL_DESIGN.md`.
- Record major cross-system choices in the HLD decision register.
- Use stable feature IDs so discussions and future issues can refer to exact scope.
- Add a concrete acceptance condition to every MVP feature.
- Keep the compact manual release matrix in `FEATURES.md`; keep executable verification and rollout detail in `LOW_LEVEL_DESIGN.md`.
- Keep each canonical document's source index local to that document and remove references to retired planning files.
- Never include access tokens, credentials, real passport data, booking references, or personal addresses in documentation or sample data.
- Update `last_verified` whenever a document is reconciled with the implementation.

## Diagram and Table Style

- Use Mermaid for architecture, sequence, entity, and state diagrams.
- Use tables for field catalogs, roles, routes, decisions, and feature inventories.
- Label paths as `Proposed path` until the corresponding file exists.
- Prefer short sections that answer one question each.

## Review Sequence

Documents should normally be reviewed in this order:

1. High-level design and system boundaries.
2. Privacy, offline, and sharing decisions.
3. Feature scope and MVP boundary.
4. Low-level data and sync design.
5. UI behavior and implementation sequencing.

## Source File Index

| Resource                  | Path                        |
| ------------------------- | --------------------------- |
| Documentation conventions | `docs/doc-conventions.md`   |
| High-level design         | `docs/HIGH_LEVEL_DESIGN.md` |
| Low-level design          | `docs/LOW_LEVEL_DESIGN.md`  |
| Feature catalog           | `docs/FEATURES.md`          |
