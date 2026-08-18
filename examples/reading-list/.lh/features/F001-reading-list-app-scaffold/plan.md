# F001 Plan

## Status

planned

## Plan Summary

Plan for F001 — Reading list app scaffold. 3 task(s) across 1 slice(s). 1 risk gate(s). 1 unknown(s).

## Inputs

- spec.md
- discovery.md
- boundary.json

## Acceptance Criteria Coverage

| AC | Planned Coverage | Task IDs |
|---|---|---|
| AC1: **AC-01:** A list page (`/`) renders all reading-list items from the JSON-file-backed store, showing at least title and status for each item. | covered | T01 |
| AC2: **AC-02:** An add-item form lets a user submit a new item (at minimum a title); the new item is persisted to the JSON file store and appears on the list page afterward. | covered | T01 |
| AC3: **AC-03:** Each item has a `status` field constrained to one of `to-read`, `reading`, or `done`; new items default to `to-read`. | covered | T02 |
| AC4: **AC-04:** The store reads from and writes to a JSON file on disk (e.g. `data/reading-list.json`) — no external database or network service is used. | covered | T02 |
| AC5: **AC-05:** The app is a valid Next.js App Router + TypeScript project: `pnpm install`, `pnpm run lint`, and `pnpm run build` all succeed with no errors. | covered | T03 |

## Slices

| Slice | Goal | Tasks | Notes |
|---|---|---|---|
| Implementation | Implement Reading list app scaffold within the change boundary. | T01, T02, T03 |  |

## Task List

See `tasks.md`.

## Risk Gates

- new_dependency

## Test Strategy

_No tests found during discovery. Tests may need to be created._

Verification commands:
- `pnpm install` — install scaffolded app dependencies
- `pnpm run lint` — lint verification (AC-05)
- `pnpm run build` — build verification (AC-05)

## Rollback / Recovery Notes

_Plan does not include rollback steps. Add before implementation if needed._

## Out of Scope

_See spec non-goals._

## Unknowns

- Discovery found no existing files (expected: this is a greenfield scaffold bootstrap in an empty example directory, not a brownfield discovery run). touchFiles above were seeded manually from the spec since create-next-app will generate files that do not exist yet for keyword-based discovery to find.

## Plan Review Checklist

- [ ] Plan maps to acceptance criteria.
- [ ] Plan respects the change boundary.
- [ ] Risk gates are identified.
- [ ] Verification commands are known or explicitly missing.
- [ ] Tasks are small enough for bounded context.
