# Spec: F002 — Status filter and search

**Status:** draft

> Created by the **specify** step. Source of truth for what this feature does.

## Summary

Enhance the existing reading list page (`web/app/page.tsx`) so a user can narrow the displayed items by status (`to-read`, `reading`, `done`) and/or by a text search that matches a keyword in the item title. Filtering happens on the existing list page using URL search params so the filtered view is shareable/bookmarkable; no new routes, pages, or persistence changes are required.

## Acceptance Criteria

<!-- Each criterion gets a unique ID for traceability in checks.md -->

- [ ] **AC-01:** The list page (`/`) supports a status filter control (e.g. a select/links for `all`, `to-read`, `reading`, `done`) that, when set, shows only items whose `status` matches the selected value.
- [ ] **AC-02:** The list page supports a text search input that, when given a keyword, shows only items whose `title` contains that keyword (case-insensitive substring match).
- [ ] **AC-03:** Status filter and text search can be combined (both applied together as an AND).
- [ ] **AC-04:** When no filter/search is applied, all items are shown (existing behavior is preserved).
- [ ] **AC-05:** Filtering is implemented client-side or via URL `searchParams` on the existing list page — no changes to `web/app/api/items/route.ts`, `web/lib/store.ts`'s on-disk JSON persistence format, or `web/data/reading-list.json` are required.
- [ ] **AC-06:** `pnpm --dir web run lint` and `pnpm --dir web run build` both succeed with no errors after the change.

## Out of Scope

- Persisting the user's filter/search choice server-side or across sessions.
- Full-text search across fields other than `title`.
- Changing the add-item form, the API route, or the on-disk JSON store format.
- Styling polish beyond basic usability.

## Constraints

- Change boundary must stay scoped to `examples/reading-list/web/**`, and within that, primarily to `web/app/page.tsx` (plus an optional small new helper such as `web/lib/filter.ts`). Do not touch `web/app/api/items/route.ts`, `web/app/add/page.tsx`, `web/app/layout.tsx`, or any config/build files (`next.config.ts`, `eslint.config.mjs`, `tsconfig.json`, `next-env.d.ts`) — this feature does not require changes to routing, layout, config, or the API.
- No new npm dependencies — implement filtering with plain React/Next.js primitives already in use.
- Must not touch `hosts/**`, `packages/**`, or other monorepo paths outside this example.

## Dependencies

_None. Builds on the existing F001 reading-list app scaffold (list page, JSON-backed store)._

## Risk Flags

<!-- Anything that matches a risk_gate from config.yml -->

_None identified. This is an additive, client-facing UI change with no API, auth, payment, migration, or security surface._

## Notes

This is a small, additive UI feature on top of the existing `web/app/page.tsx` list page and `web/lib/store.ts` / `web/lib/types.ts` types. It should not require touching the API route, add-item page, layout, or build config.

## Original Request

Add a status filter and text search to the reading list so users can narrow the list to a specific status (to-read/reading/done) or a keyword in the title.
