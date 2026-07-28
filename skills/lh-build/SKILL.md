---
name: lh-build
description: Execute LeanHarness feature tasks with bounded context, boundary discipline, tests, compact summaries, and verification evidence. Use when the user invokes /lh-build or wants Claude Code to implement planned tasks.
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

## Task Tooling

**On Claude Code:** Task creation happens in two phases.

**Phase 1 — At skill start** (before any Read, Bash, or other tool call), call TaskCreate for these three fixed setup tasks:

| # | Subject | activeForm |
|---|---------|------------|
| 1 | Read artifacts + boundary | Reading artifacts |
| 2 | Worktree setup | Setting up worktree |
| 3 | Choose execution mode | Choosing execution mode |

**Phase 2 — After reading tasks.md**, call TaskCreate for each T-## row using the task description as the subject (e.g., `T-01 Add reset route`), then add a final task: `Verify + build summary` (activeForm: `Verifying and summarizing`).

Invocation variants:
- `/lh-build F001` — create tasks for all pending T-## entries
- `/lh-build F001 T-02` — create only the T-02 task + verify task
- `/lh-build F001 --resume` — mark already-done tasks `completed` on creation; create tasks for remaining pending ones
- `/lh-build F001 --fix-review` — create only tasks marked `needs-fix` + verify task

Mark each task `in_progress` before starting its work and `completed` after finishing.

**On OpenCode:** Before starting each step, emit a step header:

    ---
    **Step N/M — <Step Name>**

Update the total step count (M) after Phase 2 completes and the full task list is known.

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
3. **Worktree Setup.** Confirm where the work will run before writing any code (see Worktree Setup section).
4. **Ask execution mode.** Before implementing any task, ask the user how this build should run using the `AskUserQuestion` tool:
   - `header`: `"Exec mode"`
   - `question`: `"How should this build run?"`
   - `options`:
     - label: `"Subagents"`, description: `"Dispatch lh-builder for implementation, lh-reviewer for review after every task, lh-compressor for compression — each task runs in a fresh, isolated agent."`
     - label: `"Current agent"`, description: `"Implement, review, and compress directly in this session without subagent dispatch."`
4b. **Ask subagent model** (subagents mode only). If the user chose **Subagents**, immediately ask which model to use with the `AskUserQuestion` tool:
   - `header`: `"Model"`
   - `question`: `"Which model should subagents use?"`
   - `options`:
     - label: `"Sonnet (Recommended)"`, description: `"Best reasoning and implementation quality. Handles complex logic, multi-file changes, and edge cases reliably. Higher token cost."`
     - label: `"Haiku"`, description: `"Fast and lightweight. Good for well-scoped tasks with clear boundaries. Lower cost — may miss subtle edge cases or require extra review passes."`
5. **Determine task scope:**
   - One specified task
   - Next `pending` task in order
   - All remaining `pending` tasks
   - Fix tasks from review findings
6. **For each task (subagents mode):**
   a. Compile bounded context from artifacts. Read only relevant files.
   b. Confirm expected edit files are inside the change boundary.
   c. **MUST implement:** Invoke the Agent tool with `subagent_type: "lh-builder"`, `model: <chosen-model>` (from step 4b, either `"sonnet"` or `"haiku"`), and `description: "Build <task-id> for <feature-id>"`, passing: feature ID, task ID, task goal, expected files, bounded context (relevant spec sections, boundary entries, memory entries, file content), verification commands, prior task summaries (only the "Context for Next Task" section from the immediately preceding completed task and any tasks this one directly depends on per the plan's dependency graph — do NOT pass full summary bodies of unrelated or non-adjacent tasks or summaries from unrelated waves). Do NOT implement inline. If the Agent tool itself errors or reports the subagent type is not registered, report the error to the user and stop.
   d. Run task verification commands when available.
   e. Record commands and results.
   f. **MUST review:** Invoke the Agent tool with `subagent_type: "lh-reviewer"`, `model: <chosen-model>`, and `description: "Review <task-id> for <feature-id>"` after every task without exception, passing: feature ID, task ID, changed files list, task summary path, boundary path.
   f-2. **Review verdict handling:**
       - If `lh-reviewer` returns `verdict: pass` → continue to step 6g
       - If `lh-reviewer` returns `verdict: needs-fix` → trigger auto-fix loop (see Auto-Fix Loop below)
       - If `lh-reviewer` returns `verdict: blocked` → stop the build, escalate
   g. Write task summary to `task-summaries/<task-id>.md`.
   h. Update task status in `tasks.md` (BOTH the task's row in the summary table AND its own detail block, together in the same edit — updating only one location is a workflow bug and must not happen).
7. **For each task (current-agent mode):**
   a. Compile bounded context from artifacts. Read only relevant files.
   b. Confirm expected edit files are inside the change boundary.
   c. Implement directly. Prefer writing or updating tests first for behavior changes.
   d. Run task verification commands when available.
   e. Record commands and results.
   f. Self-review inline: acceptance criteria coverage, boundary violations, missing tests, security issues, regressions, overengineering, accidental broad refactors.
   g. Write task summary to `task-summaries/<task-id>.md`.
   h. Update task status in `tasks.md` (BOTH the task's row in the summary table AND its own detail block, together in the same edit — updating only one location is a workflow bug and must not happen).
8. **Boundary enforcement.** If the task requires files outside the boundary:
   - Stop before editing those files.
   - Update `discovery.md` and `boundary.json` with the new files.
   - Explain why the boundary changed.
9. **Risk gates.** If a risk gate is triggered:
   - Pause for approval unless the spec already explicitly approves it.
10. **Test failures.** If tests fail:
   - Diagnose and fix if within task scope.
   - Otherwise mark task as `needs-fix` or `blocked`.
11. **Verification evidence.** Do not mark a task `done` without verification evidence.

## Bounded Context Rules

- Start from the task, not the whole repo.
- Include only: relevant spec sections, boundary entries, memory entries, files listed in the task, and prior task summaries (only the "Context for Next Task" section from the immediately preceding task and direct dependencies per the plan's dependency graph — do NOT include full summary bodies of unrelated or non-adjacent tasks or summaries from unrelated waves).
- Avoid pulling in unrelated architecture.
- Preserve exact paths, symbols, commands, and errors (protected tokens).

## Worktree Setup

Before writing any code, decide where this feature's work will live.

1. Run `lh config get workflow.require_worktree`.
   - If it prints `true`, a worktree is mandatory — go to step 3 and do not offer "stay here".
2. Run `lh worktree list --json` and check whether this feature already has an entry
   with `status: "linked"`. If it does, use its `worktreePath` and skip to step 6.
3. Ask the user with the `AskUserQuestion` tool:
   - `header`: `"Workspace"`
   - `question`: `"Where should work for <id> — <title> run?"`
   - `options`:
     - label: `"New worktree (Recommended)"`, description: `"Isolated checkout at .worktrees/feature-<id>-<slug>. Your current working tree stays untouched."`
     - label: `"New branch here"`, description: `"Run \`git checkout -b feature/<id>-<slug>\` in the current working tree."`
     - label: `"Stay on current branch"`, description: `"Continue on '<current-branch>' with no isolation."`
   - Omit the third option entirely when `require_worktree` is `true`.
4. For "New worktree": invoke `Skill(skill: "lh-worktree", args: "<id>")`.
   - Read the **Work root** and **Harness root** it reports back.
   - If it reports a failed baseline test, that's already been surfaced to the user by
     the skill — respect whatever they decided (continue or stop) before proceeding.
   - If the skill reports a hard failure (e.g. worktree creation itself failed), show the
     error and stop. Do not fall back silently.
5. For "New branch here": run `git checkout -b feature/<id>-<slug>`; if the branch already
   exists, run `git checkout feature/<id>-<slug>` instead. For a custom name via "Other",
   use that name.
6. Record two paths for the rest of this session and keep them distinct:
   - **Work root** — `worktreePath` (or the repo root when not using a worktree). All
     source edits, test runs, and `git` commands go here.
   - **Harness root** — `harnessRoot` (always the main repo). All `.lh/` artifacts live
     here: `spec.md`, `tasks.md`, `boundary.json`, `task-summaries/`, `events.jsonl`,
     `state.json`.
   `.lh/features/` and `.lh/state.json` are gitignored, so a worktree does **not** get its
   own copy. Read and write harness artifacts under the harness root, and pass
   `--cwd <harness-root>` to any `lh` command you run from inside the worktree.
7. Boundary paths in `boundary.json` are relative to the repository root and apply
   identically in a worktree. Do not rewrite them.

## Question Format

When you need to ask a clarifying question or seek risk gate approval, use the `AskUserQuestion` tool — never plain text. This shows clickable option chips instead of requiring the user to type.

Structure each question with:
- `header`: short topic label (≤12 chars, e.g., "Risk gate")
- `question`: clear question ending with `?`
- `options`: 2–4 choices, each with a short `label` (1–5 words) and a one-sentence `description`

Ask one question per invocation. If multiple are needed, ask the most blocking one first and record the rest as assumptions.

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
- Human-readable summary
- Files changed
- Tests added or updated
- Commands run
- Acceptance criteria covered
- Review findings
- Follow-ups

## CaveBus Entries

**Phase-level handoffs only.** CaveBus entries for this skill are phase-level only: one `DISC` entry from `lh-discover`, one `PLAN` entry from `lh-plan`, and one `VERIFY` entry from `lh-check`. 

`lh-build` itself does **NOT** append per-task CaveBus entries anymore. Task-level handoff information lives entirely in `task-summaries/<task-id>.md`, which is written after every task (do not remove that step).

## Review Behavior

**Subagents mode:** After each task, MUST invoke the Agent tool with `subagent_type: "lh-reviewer"`, `model: <chosen-model>` (from step 4b), and `description: "Review <task-id> for <feature-id>"` (step 6f), passing feature ID, task ID, changed files, task summary path, and boundary path. Do not skip. Do not fall back to self-review unless the Agent tool itself errors.

**Current-agent mode:** After each task, perform self-review inline (step 7f) checking:

- Acceptance criteria coverage
- Boundary violations
- Missing tests
- Security issues
- Regressions
- Overengineering
- Accidental broad refactors

Record review findings in the task summary.

### Auto-Fix Loop (Subagents Mode)

When `lh-reviewer` returns `verdict: needs-fix` (step 6f-2), the auto-fix loop activates:

1. **Increment iteration.** Set `iter = iter + 1` (v1 → v2 → v3).
2. **Max iterations check.** If `iter > 3`:
   - Write BLOCK to `cavebus.log`:
     ```
     BLOCK <FEATURE_ID> <TASK_ID> reason:max fix iterations reached
     need: human review
     iter: v3
     next: review BLOCK, fix manually, then re-run /lh-build
     ```
   - Mark task as `needs-fix`.
   - Stop the build for this task.
3. **Dispatch fix agent.** Invoke:
   ```
   Agent(subagent_type: "lh-builder-fix", model: <chosen-model>, description: "Fix <task-id> findings v<iter>")
   ```
   Pass:
   - original task goal and ID
   - review findings (critical/major/minor structured)
   - changed files so far
   - boundary path
   - iteration number
4. **Verification.** Run verification commands. Record results.
5. **Re-review.** Invoke `lh-reviewer` again on the fixed code (goto step 6f).
6. **Loop.** If still `needs-fix`, go back to step 1. If `pass`, continue to step 6g.

Max 3 iterations per task. Each iteration is a fresh subagent with full review findings.

### Auto-Fix Loop (Current-Agent Mode)

When self-review (step 7f) finds issues:

1. **Increment iteration.** Set `iter = iter + 1` (v1 → v2 → v3).
2. **Max iterations check.** If `iter > 3`:
   - Write BLOCK to `cavebus.log`:
     ```
     BLOCK <FEATURE_ID> <TASK_ID> reason:max fix iterations reached
     need: human review
     iter: v3
     next: review BLOCK, fix manually, then re-run /lh-build
     ```
   - Mark task as `needs-fix`.
   - Stop the build for this task.
3. **Dispatch fix agent.** Invoke:
   ```
   Agent(subagent_type: "lh-builder-fix", model: auto, description: "Fix <task-id> findings v<iter>")
   ```
   Pass: task goal, review findings, changed files, boundary, iteration number.
4. **Verification.** Run verification commands. Record results.
5. **Re-review.** Repeat self-review on the fixed code (goto step 7f).
6. **Loop.** If still `needs-fix`, go back to step 1. If `pass`, continue to step 7g.

### Fix Agent Context Format

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
- **Tasks attempted** — Which tasks were worked on
- **Task statuses** — Current status of each attempted task
- **Fix iterations** — Per-task iteration count if auto-fix loop was triggered (e.g., "T-01: v1 pass, T-02: v1→v2 pass, T-03: v1→v2→v3 needs-fix")
- **Files changed** — Source files created, modified, or deleted
- **Tests added or updated** — Test files touched
- **Commands run** — Verification commands and results
- **Review findings** — Issues found during review
- **Blockers or follow-ups** — Unresolved issues (including max fix iterations BLOCKs)
- **Recommended next command** — `/new` then `/lh-check <feature-id>` when all tasks are done, or `/new` then `/lh-build <feature-id> <next-task>` to continue
