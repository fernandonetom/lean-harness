# F002 Plan

## Status

planned

## Plan Summary

Plan for F002 — Status filter and search. 1 task(s) across 1 slice(s). 0 risk gate(s). 1 unknown(s).

## Inputs

- spec.md
- discovery.md
- boundary.json

## Acceptance Criteria Coverage

| AC | Planned Coverage | Task IDs |
|---|---|---|
| AC1: **AC-01:** The list page (`/`) supports a status filter control (e.g. a select/links for `all`, `to-read`, `reading`, `done`) that, when set, shows only items whose `status` matches the selected value. | covered | T01 |
| AC2: **AC-02:** The list page supports a text search input that, when given a keyword, shows only items whose `title` contains that keyword (case-insensitive substring match). | covered | T01 |
| AC3: **AC-03:** Status filter and text search can be combined (both applied together as an AND). | covered | T01 |
| AC4: **AC-04:** When no filter/search is applied, all items are shown (existing behavior is preserved). | covered | T01 |
| AC5: **AC-05:** Filtering is implemented client-side or via URL `searchParams` on the existing list page — no changes to `web/app/api/items/route.ts`, `web/lib/store.ts`'s on-disk JSON persistence format, or `web/data/reading-list.json` are required. | covered | T01 |
| AC6: **AC-06:** `pnpm --dir web run lint` and `pnpm --dir web run build` both succeed with no errors after the change. | covered | T01 |

## Slices

| Slice | Goal | Tasks | Notes |
|---|---|---|---|
| Implementation | Implement Status filter and search within the change boundary. | T01 |  |

## Task List

See `tasks.md`.

## Risk Gates

_None identified._

## Test Strategy

_No tests found during discovery. Tests may need to be created._

Verification commands:
- `pnpm --dir web run lint` — lint the web app after the change
- `pnpm --dir web run build` — verify the web app still builds (typecheck + Next.js production build)

## Rollback / Recovery Notes

_Plan does not include rollback steps. Add before implementation if needed._

## Out of Scope

_See spec non-goals._

## Unknowns

- No relevant tests found. Tests may need to be created.

## Plan Review Checklist

- [ ] Plan maps to acceptance criteria.
- [ ] Plan respects the change boundary.
- [ ] Risk gates are identified.
- [ ] Verification commands are known or explicitly missing.
- [ ] Tasks are small enough for bounded context.
