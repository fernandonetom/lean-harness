---
description: Execute LeanHarness feature tasks with bounded context, boundary discipline, tests, compact summaries, and verification evidence. Use when the user invokes /lh-build or wants OpenCode to implement planned tasks.
agent: lh-builder
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
- Feature ID plus `--wave N` to execute a specific wave (e.g., `F001 --wave 1`)
- Natural language variants of the above

Examples:

```
/lh-build F001
/lh-build F001 T-02
/lh-build F001 --resume
/lh-build F001 --fix-review
/lh-build F001 --wave 1
/lh-build F001 --wave 2
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

3a. **Read checkpoint.** If `.lh/features/<id>/checkpoint.md` exists, read it to determine which tasks have already completed in the current wave. Skip completed tasks. Resume from `next_task`.

4. **For each task:**
   a. Compile bounded context from artifacts. Read only relevant files.
   b. Confirm expected edit files are inside the change boundary.
   c. If behavior changes, prefer writing or updating tests first.
   d. Implement the task.
   e. Run task verification commands when available.
   f. Record commands and results.
   g. Write task summary to `task-summaries/<task-id>.md`.
   h. Append CaveBus summary to `cavebus.log`.
   i. Update task status in `tasks.md`.

   4j. **Write checkpoint.** After each task completes, write `.lh/features/<id>/checkpoint.md`:

   ```markdown
   # Build Checkpoint
   feature: <feature-id>
   wave: <N>
   wave_total: <total>
   completed_tasks: [T-01, T-02]
   next_task: <next-pending-task-or-none>
   resume_command: /lh-build <feature-id> --wave <N>
   updated: <ISO timestamp>
   ```

5. **Boundary enforcement.** If a file is outside the boundary (guardrail plugin will deny the edit):
   - Edit `boundary.json` first — add the path to both `touchFiles` (as `{"path": "<file>", "reason": "<why>", "confidence": "high"}`) and `allowedEditGlobs`. The boundary file is under `.lh/` so edits are always allowed.
   - Update `discovery.md` explaining why this file is needed.
   - Retry the original edit.
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

## Question Format

When you need to ask a clarifying question or seek risk gate approval, format it as a numbered list so the user can reply with a single digit.

> **[Topic]:** [Question?]
> 1. [Short label] — [one-sentence description]
> 2. [Short label] — [one-sentence description]
> 3. Other — describe your preference

Ask one question at a time. Wait for the reply before continuing.

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

After every task, perform self-review. This is mandatory — not optional, not "when helpful".

Check:

- Acceptance criteria coverage
- Boundary violations
- Missing tests
- Security issues
- Regressions
- Overengineering
- Accidental broad refactors

Record review findings in the task summary.

### Auto-Fix Loop

If self-review found issues (`needs-fix` verdict):

1. **Iteration.** Increment fix iteration (v1 → v2 → v3).
2. **Max iterations.** If iteration > 3, stop. Write BLOCK entry to `cavebus.log`:
   ```
   BLOCK <FEATURE_ID> <TASK_ID> reason:max fix iterations reached
   need: human review
   iter: v3
   next: review BLOCK, fix manually, then re-run /lh-build
   ```
   Mark task as `needs-fix` and stop the build.
3. **Fix agent.** Dispatch `lh-builder-fix` subagent with:
   - original task goal
   - review findings (critical/major/minor structured list)
   - changed files so far
   - boundary path
   - fix iteration number
4. **Verification.** Run verification commands after fix. Record results.
5. **Re-review.** Repeat self-review on the fixed code. Use the same checklist above.
6. **Loop.** If still `needs-fix`, go back to step 1. If `pass`, continue to next task.

The fix loop runs up to 3 times per task. Each iteration gets a fresh subagent with the review findings. Do not attempt to fix inline in the same session — always dispatch the fix agent.

### Fix Agent Context

When dispatching `lh-builder-fix`, pass structured context:

```
feature: <FEATURE_ID>
task: <TASK_ID>
iteration: v<1|2|3>
original_goal: <task description from tasks.md>
review_findings:
  critical:
    - <finding> file:<path> evidence:<line/symbol>
  major:
    - <finding> file:<path> evidence:<line/symbol>
  minor:
    - <finding> file:<path> evidence:<line/symbol>
changed_files: [<file1>, <file2>]
boundary: .lh/features/<id>/boundary.json
verification_commands: [<command1>, <command2>]
```

## Output Artifacts

Create or update:

```
.lh/features/<feature-id>-<slug>/tasks.md
.lh/features/<feature-id>-<slug>/task-summaries/<task-id>.md
.lh/features/<feature-id>-<slug>/cavebus.log
```

If fix iterations occurred, also create:
```
.lh/features/<feature-id>-<slug>/task-summaries/<task-id>-fix-v1.md
.lh/features/<feature-id>-<slug>/task-summaries/<task-id>-fix-v2.md
.lh/features/<feature-id>-<slug>/task-summaries/<task-id>-fix-v3.md
```

Note: `events.jsonl` is auto-managed by LeanHarness hooks. Do not write to it.

May update these only when execution reveals plan-invalidating information:

```
.lh/features/<feature-id>-<slug>/discovery.md
.lh/features/<feature-id>-<slug>/boundary.json
.lh/features/<feature-id>-<slug>/plan.md
```

## Final Response Format

Every `/lh-build` run must end with:

- **Feature ID** — The feature identifier
- **Wave** — Which wave ran (e.g., "Wave 1 of 2")
- **Tasks attempted** — Which tasks were worked on
- **Task statuses** — Current status of each attempted task
- **Fix iterations** — Per-task iteration count if fix loop was triggered (e.g., "T-01: v1 pass, T-02: v1→v2 pass, T-03: v1→v2→v3 needs-fix")
- **Files changed** — Source files created, modified, or deleted
- **Tests added or updated** — Test files touched
- **Commands run** — Verification commands and results
- **Review findings** — Issues found during self-review
- **Blockers or follow-ups** — Unresolved issues
- **NEXT SESSION block** — Always end with one of:

If more waves remain:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  NEXT SESSION — Wave N/M complete
  Paste this to continue:

  /new
  /lh-build <feature-id> --wave <N+1>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

If all waves complete:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  NEXT SESSION — Build complete
  Paste this to continue:

  /new
  /lh-check <feature-id>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

If blocked or needs-fix (including max fix iterations reached):
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  NEXT SESSION — Build paused (<reason>)
  Paste this to continue after fixing:

  /new
  /lh-build <feature-id> --wave <N>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

If blocked due to max fix iterations:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  NEXT SESSION — Max fix iterations reached for <TASK_ID>
  Human review required. Fix manually, then re-run:

  /new
  /lh-build <feature-id> <TASK_ID>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```