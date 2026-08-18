# F001 Tasks

## Status

planned

## Task Rules

- Each task must map to acceptance criteria or a technical prerequisite.
- Each task should stay inside the approved change boundary.
- Behavior changes should prefer tests first.
- A task is not done without verification evidence.
- If a task needs files outside the boundary, update discovery and boundary first.

## Tasks

### T01: Scaffold the Next.js project and update web/app files

- Status: done
- Acceptance criteria:
  - AC1
  - AC2
- Slice: Implementation
- Goal: Implement changes in web/package.json, web/tsconfig.json, web/next.config.ts, web/app/layout.tsx.
- Scaffolding constraint (IMPORTANT — read before running create-next-app):
  - The current directory (`examples/reading-list/`) already contains LeanHarness state (`.lh/`, `.claude/`, `.opencode/`) that is NOT on `create-next-app`'s safe-directory allow-list, so `create-next-app` will refuse to scaffold directly into `examples/reading-list/`.
  - Do NOT run `create-next-app .` in this directory.
  - Instead: run `create-next-app` into a throwaway subdirectory, e.g. `npx create-next-app@latest _scaffold_tmp --typescript --app --no-src-dir --eslint --no-tailwind --import-alias "@/*" --use-pnpm --yes`, then move its contents into place as `web/` (e.g. `mv _scaffold_tmp web && rm -rf _scaffold_tmp`), then continue editing files under `web/` per this task list.
  - After the move, verify `web/package.json`, `web/tsconfig.json`, `web/next.config.ts` (or `.mjs`/`.js`), and `web/app/layout.tsx` exist before proceeding to T02/T03.
- Expected files:
  - web/package.json
  - web/tsconfig.json
  - web/next.config.ts
  - web/app/layout.tsx
- Read-only context:
  - README.md
  - opencode.json
  - .opencode/README.md
- Test expectation: Add or update tests for changed behavior.
- Verification commands:
  - pnpm --dir web run lint
- Risk notes:
  - Risk gate: new_dependency
- Dependencies: none
- Summary file:
  - .lh/features/F001-reading-list-app-scaffold/task-summaries/T01.md

### T02: Update web/data files

- Status: done
- Acceptance criteria:
  - AC3
  - AC4
- Slice: Implementation
- Goal: Implement changes in web/app/page.tsx, web/app/add/page.tsx, web/app/api/items/route.ts, web/data/reading-list.json.
- Expected files:
  - web/app/page.tsx
  - web/app/add/page.tsx
  - web/app/api/items/route.ts
  - web/data/reading-list.json
- Read-only context:
  - README.md
  - opencode.json
  - .opencode/README.md
- Test expectation: Add or update tests for changed behavior.
- Verification commands:
  - pnpm --dir web run lint
- Risk notes: none
- Dependencies:
  - T01
- Summary file:
  - .lh/features/F001-reading-list-app-scaffold/task-summaries/T02.md

### T03: Update web/lib files

- Status: done
- Acceptance criteria:
  - AC5
- Slice: Implementation
- Goal: Implement changes in web/lib/store.ts, web/lib/types.ts.
- Expected files:
  - web/lib/store.ts
  - web/lib/types.ts
- Read-only context:
  - README.md
  - opencode.json
  - .opencode/README.md
- Test expectation: Add or update tests for changed behavior.
- Verification commands:
  - pnpm --dir web run lint
  - pnpm --dir web run build
- Risk notes: none
- Dependencies:
  - T01
- Summary file:
  - .lh/features/F001-reading-list-app-scaffold/task-summaries/T03.md
