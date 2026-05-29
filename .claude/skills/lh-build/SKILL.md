---
name: lh-build
description: Execute LeanHarness feature tasks with bounded context, boundary discipline, tests, compact summaries, and verification evidence. Use when the user invokes /lh-build or wants Claude Code to implement planned tasks.
disable-model-invocation: true
---

# lh-build

## Purpose

Implement planned LeanHarness tasks with bounded context, boundary discipline, tests, compact summaries, and verification evidence. This is where code gets written.

## Inputs

Accept any of:

- Feature ID (e.g., `F001`)
- Feature ID plus specific task ID (e.g., `F001 T-02`)
- Feature ID plus `--resume` to continue from the last active task
- Feature ID plus `--fix-review` to address review findings
- Natural language variants of the above

Examples:

```
/lh-build F001
/lh-build F001 T-02
/lh-build F001 --resume
/lh-build F001 --fix-review
/lh-build F001 fix the test failures from T-01
```

Do not require exact flag parsing. Interpret natural language flexibly.

## Workflow

1. **Locate feature.** Find the feature folder under `.lh/features/`.
2. **Read artifacts.** Read:
   - `spec.md` — Goal, acceptance criteria
   - `discovery.md` — Relevant files, conventions
   - `boundary.json` — Change boundary
   - `plan.md` — Implementation approach
   - `tasks.md` — Task list and statuses
   - Relevant memory files from `.lh/memory/`
   - Prior task summaries from `task-summaries/`
3. **Determine task scope:**
   - One specified task
   - Next `pending` task in order
   - All remaining `pending` tasks
   - Fix tasks from review findings
4. **For each task:**
   a. Compile bounded context from artifacts. Read only relevant files.
   b. Confirm expected edit files are inside the change boundary.
   c. **Implement:** Invoke the Agent tool with `subagent_type: "lh-builder"`, passing the compiled bounded context (feature ID, task ID, task goal, expected files, read-only context, verification commands, prior task summaries). If `lh-builder` is unavailable, implement the task directly; prefer writing or updating tests first if behavior changes.
   d. Run task verification commands when available.
   e. Record commands and results.
   f. **Review:** Invoke the Agent tool with `subagent_type: "lh-reviewer"`, passing feature ID, task ID, changed files list, task summary path, and boundary path. If `lh-reviewer` is unavailable, perform self-review inline.
   g. **Compress:** Invoke the Agent tool with `subagent_type: "lh-compressor"`, passing the verbose task summary. Append the returned compact CaveBus entry to `cavebus.log`. If `lh-compressor` is unavailable, write the CaveBus summary directly.
   h. Write task summary to `task-summaries/<task-id>.md`.
   i. Update task status in `tasks.md`.
5. **Boundary enforcement.** If the task requires files outside the boundary:
   - Stop before editing those files.
   - Update `discovery.md` and `boundary.json` with the new files.
   - Explain why the boundary changed.
6. **Risk gates.** If a risk gate is triggered:
   - Pause for approval unless the spec already explicitly approves it.
7. **Test failures.** If tests fail:
   - Diagnose and fix if within task scope.
   - Otherwise mark task as `needs-fix` or `blocked`.
8. **Verification evidence.** Do not mark a task `done` without verification evidence.

## Bounded Context Rules

- Start from the task, not the whole repo.
- Include only: relevant spec sections, boundary entries, memory entries, files listed in the task, and prior task summaries.
- Avoid pulling in unrelated architecture.
- Preserve exact paths, symbols, commands, and errors (protected tokens).
- Use compact summaries after each task for handoffs.

## Implementation Rules

- Stay inside the approved change boundary.
- Preserve existing architecture by default.
- Avoid opportunistic cleanup outside task scope.
- Avoid broad refactors unless planned.
- Avoid new dependencies unless approved.
- Do not change public API unless planned and approved.
- Do not rewrite auth, payments, persistence, or routing systems unless explicitly approved.
- Prefer tests for behavior changes.
- Keep changes reviewable.

## Task Summary

Write each task summary to:

```
.lh/features/<feature-id>-<slug>/task-summaries/<task-id>.md
```

Use `.lh/templates/task-summary.md` as the template. Include:

- Status
- CaveBus summary
- Human-readable summary
- Files changed
- Tests added or updated
- Commands run
- Acceptance criteria covered
- Review findings
- Follow-ups

## CaveBus Task Summary

Append a compact task summary to `cavebus.log`:

```
SUM F001 T-01 status:done
add: src/routes/reset.ts
chg: src/routes/index.ts
test: tests/routes/reset.test.ts
pass: pnpm test
fail: none
risk: none
next: T-02
```

Use actual values. Do not hardcode project-specific content.

## Review Behavior

After each task implementation, invoke the Agent tool with `subagent_type: "lh-reviewer"` (step 4f above), passing feature ID, task ID, changed files, task summary path, and boundary path.

If `lh-reviewer` is unavailable, perform self-review checking:

- Acceptance criteria coverage
- Boundary violations
- Missing tests
- Security issues
- Regressions
- Overengineering
- Accidental broad refactors

Record review findings in the task summary.

## Output Artifacts

Create or update:

```
.lh/features/<feature-id>-<slug>/tasks.md
.lh/features/<feature-id>-<slug>/task-summaries/<task-id>.md
.lh/features/<feature-id>-<slug>/events.jsonl
.lh/features/<feature-id>-<slug>/cavebus.log
```

May update these only when execution reveals plan-invalidating information:

```
.lh/features/<feature-id>-<slug>/discovery.md
.lh/features/<feature-id>-<slug>/boundary.json
.lh/features/<feature-id>-<slug>/plan.md
```

## Final Response Format

Every `/lh-build` run must end with:

- **Feature ID** — The feature identifier
- **Tasks attempted** — Which tasks were worked on
- **Task statuses** — Current status of each attempted task
- **Files changed** — Source files created, modified, or deleted
- **Tests added or updated** — Test files touched
- **Commands run** — Verification commands and results
- **Review findings** — Issues found during self-review
- **Blockers or follow-ups** — Unresolved issues
- **Recommended next command** — `/lh-check <feature-id>` when all tasks are done, or `/lh-build <feature-id> <next-task>` to continue
