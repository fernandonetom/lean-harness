---
name: lh-plan
description: Create a LeanHarness implementation plan and task list from an existing feature spec, discovery report, and change boundary. Use when the user invokes /lh-plan or needs planned tasks before building.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep
---

# lh-plan

## Purpose

Create a plan and task list from the spec, discovery report, and change boundary. The plan maps every task to acceptance criteria and provides bounded context for implementation.

## Inputs

Accept any of:

- Feature ID (e.g., `F001`)
- Feature folder path
- Optional planning constraints (e.g., "Keep tasks small", "Vertical slices")
- Optional task sizing preference

Examples:

```
/lh-plan F001
/lh-plan F001 --small-tasks
```

## Workflow

1. **Locate feature.** Find the feature folder under `.lh/features/`.
2. **Read artifacts.** Read:
   - `spec.md` — Goal, acceptance criteria, constraints
   - `discovery.md` — Relevant files, tests, risks
   - `boundary.json` — Change boundary
   - Relevant memory files from `.lh/memory/`
3. **Check prerequisites.** If discovery is missing or insufficient, stop and recommend `/lh-discover <feature-id>`.
4. **Create plan.** Write `plan.md` using `.lh/templates/plan.md`. Include:
   - Implementation approach
   - Task breakdown
   - Task dependencies
   - Acceptance criteria mapping
   - Risk mitigations
   - Open questions
5. **Create tasks.** Write `tasks.md` using `.lh/templates/tasks.md`. Map every task to acceptance criteria or a technical prerequisite.
6. **Prefer vertical slices** when feature work is large enough to warrant them.
7. **Size tasks for bounded context.** Each task should be small enough that an agent can hold its full context without loading the entire codebase.
8. **Update status.** Set feature status to `planned` when the plan is actionable.

## Task Design Rules

Each task must include:

- **Task ID** — Unique within the feature (T-01, T-02, ...)
- **Status** — `pending`, `active`, `done`, `blocked`, `skipped`
- **Acceptance criteria covered** — Which AC items this task addresses
- **Slice** — If applicable, which vertical slice this belongs to
- **Goal** — What this task accomplishes
- **Expected files** — Files expected to be created or modified
- **Read-only context** — Files needed for reference but not changed
- **Test expectation** — Tests to write, update, or run
- **Verification commands** — Commands to confirm the task works
- **Risk notes** — Risk gates or concerns
- **Dependencies** — Other tasks that must complete first
- **Summary file path** — Where the task summary will be written

## Task Sizing Guidance

- **Small bug fix:** 1 to 3 tasks
- **Medium feature:** 3 to 7 tasks
- **Large feature:** Split into vertical slices, then tasks per slice
- **Risky change:** Smaller tasks with stronger verification
- **Refactor:** Tasks should preserve behavior and emphasize tests

## Planning Rules

- Do not plan edits outside the change boundary.
- If the plan needs files outside the boundary, update discovery and boundary first.
- Do not hide unknowns. Record them in Open Questions.
- Do not create tasks that cannot be verified.
- Do not over-plan speculative architecture.
- Preserve existing architecture by default.

## Output Artifacts

Create or update:

```
.lh/features/<feature-id>-<slug>/plan.md
.lh/features/<feature-id>-<slug>/tasks.md
.lh/features/<feature-id>-<slug>/events.jsonl
.lh/features/<feature-id>-<slug>/cavebus.log
```

## CaveBus Summary

Append a compact plan summary to `cavebus.log` following `.lh/templates/cavebus-message.md` format. Example:

```
PLAN F001 status:planned
tasks: T-01, T-02, T-03
ac: AC-01->T-01 AC-02->T-02,T-03
risk: none
verify: pnpm test, pnpm lint
next: T-01
```

Use actual planned values. Do not hardcode project-specific content.

## Task Weight Assignment

Assign a complexity weight to every task. Use this table:

| Weight | When to assign |
|--------|----------------|
| 1 | Read-only, config tweak, comment change |
| 2 | Small isolated change, 1–3 files, low coupling |
| 3 | Mid-size change, wiring across 2–4 files, or moderate risk |
| 5 | New module, complex logic, risky area (auth, payments, migration), or 5+ files |

Signals that push a task toward 5: `escalate_on` hits in `discovery.md`, `risk_flags` in spec, unknown test coverage, broad cross-cutting concern.

Record the weight in the task row in `tasks.md` and in the plan's Task Breakdown list.

## Wave Grouping

After assigning weights, group tasks into waves. Read `build.session_budget` from `.lh/config.yml` (default: 15).

Rules:
- Fill each wave greedily in task order until the next task would exceed the budget.
- Never split a single task across waves.
- A task with weight > session_budget gets its own wave (document why).
- Record waves in the `## Waves` section of `plan.md`.

Example with session_budget 15:
```
Wave 1 (weight: 13): T-01 w:3, T-02 w:5, T-03 w:5
Wave 2 (weight: 8):  T-04 w:3, T-05 w:5
```

## Final Response Format

Every `/lh-plan` run must end with:

- **Feature ID** — The feature identifier
- **Plan path** — Path to `plan.md`
- **Tasks path** — Path to `tasks.md`
- **Task count** — Number of tasks created
- **Acceptance criteria coverage** — Summary of which AC maps to which tasks
- **Risk gates** — Any triggered risk gates
- **First recommended task** — Which task to start with
- **Recommended next command** — `/lh-build <feature-id>`
- **Wave summary** — Number of waves and total weight
- **NEXT SESSION block** — End every `/lh-plan` response with:

````
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  NEXT SESSION — Plan complete (N waves)
  Paste this to continue:

  /lh-build <feature-id> --wave 1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
````
