# Spec: F001 — Reading list app scaffold

**Status:** draft

> Created by the **specify** step. Source of truth for what this feature does.

## Summary

Scaffold a small Next.js (App Router, TypeScript) reading list application under `web/` inside this example. The app shows a list of reading-list items, lets a user add a new item via a form, and persists items to a JSON file on disk (no external database). Each item tracks a status of `to-read`, `reading`, or `done`.

## Acceptance Criteria

<!-- Each criterion gets a unique ID for traceability in checks.md -->

- [ ] **AC-01:** A list page (`/`) renders all reading-list items from the JSON-file-backed store, showing at least title and status for each item.
- [ ] **AC-02:** An add-item form lets a user submit a new item (at minimum a title); the new item is persisted to the JSON file store and appears on the list page afterward.
- [ ] **AC-03:** Each item has a `status` field constrained to one of `to-read`, `reading`, or `done`; new items default to `to-read`.
- [ ] **AC-04:** The store reads from and writes to a JSON file on disk (e.g. `data/reading-list.json`) — no external database or network service is used.
- [ ] **AC-05:** The app is a valid Next.js App Router + TypeScript project: `pnpm install`, `pnpm run lint`, and `pnpm run build` all succeed with no errors.

## Out of Scope

- User authentication or multi-user support.
- Editing or deleting existing items (only listing and adding are required).
- Any database or external persistence layer other than the local JSON file.
- Styling polish beyond basic usability.

## Constraints

- Must use Next.js App Router with TypeScript (per the original request).
- Must be scaffolded as a **new** app under `web/` inside `examples/reading-list/` — this example directory already contains LeanHarness state (`.lh/`, `.claude/`, `.opencode/`) that `create-next-app` refuses to scaffold into directly, so the app must be generated into a throwaway subdirectory (e.g. `_scaffold_tmp/`) and then moved into place as `web/`.
- Change boundary must stay scoped to `examples/reading-list/web/**` and must not touch `hosts/**`, `packages/**`, or other monorepo paths outside this example.

## Dependencies

_None. This is a standalone greenfield scaffold with no dependency on other features._

## Risk Flags

<!-- Anything that matches a risk_gate from config.yml -->

_None identified._

## Notes

_Additional context for discovery and planning._

## Original Request

Scaffold a Next.js reading list app (App Router, TypeScript) with a list page, an add-item form, and a JSON-file-backed store. Track each item's status as to-read, reading, or done.
