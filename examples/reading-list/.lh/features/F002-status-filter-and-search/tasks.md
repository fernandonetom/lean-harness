# F002 Tasks

## Status

planned

## Task Rules

- Each task must map to acceptance criteria or a technical prerequisite.
- Each task should stay inside the approved change boundary.
- Behavior changes should prefer tests first.
- A task is not done without verification evidence.
- If a task needs files outside the boundary, update discovery and boundary first.

## Tasks

### T01: Update web/lib files

- Status: done
- Acceptance criteria:
  - AC1
  - AC2
  - AC3
  - AC4
  - AC5
  - AC6
- Slice: Implementation
- Goal: Implement changes in web/app/page.tsx, web/lib/filter.ts.
- Expected files:
  - web/app/page.tsx
  - web/lib/filter.ts
- Read-only context:
  - web/lib/store.ts
  - web/lib/types.ts
  - web/data/reading-list.json
  - README.md
  - opencode.json
  - web/tsconfig.json
  - web/README.md
  - web/package.json
  - web/pnpm-lock.yaml
  - .opencode/README.md
- Test expectation: Add or update tests for changed behavior.
- Verification commands:
  - pnpm --dir web run lint
  - pnpm --dir web run build
- Risk notes: none
- Dependencies: none
- Summary file:
  - .lh/features/F002-status-filter-and-search/task-summaries/T01.md
