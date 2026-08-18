# Task Summary: {{TASK_ID}} — {{TASK_DESCRIPTION}}

> Written by the subagent that completed this task. Stored in `task-summaries/`.
> Used by the context compiler to brief the next task's subagent.

## Feature

{{FEATURE_ID}} — {{FEATURE_TITLE}}

## What Changed

_Files created, modified, or deleted by this task._

| File | Action | Lines Changed |
|------|--------|---------------|
| _path_ | created/modified/deleted | _count_ |

## Approach

_How the task was implemented. Key decisions and tradeoffs._

## Tests

_Tests added or modified. Commands to run them._

## Context for Next Task

<!-- This section is the ONLY part of this file passed forward as context to later tasks' subagents — keep it self-contained and assume the reader has no other context from this file. -->

_What the next subagent needs to know. Gotchas, state left behind, open threads._

## Acceptance Criteria Covered

_Which AC items this task addresses._

## Review Iterations

_Track fix loop iterations when lh-reviewer returned needs-fix and lh-builder-fix was dispatched._

| Iteration | Verdict | Critical | Major | Minor | Notes |
|-----------|---------|----------|-------|-------|-------|
| v1 | pass/needs-fix/blocked | _count_ | _count_ | _count_ | _notes_ |
| v2 | pass/needs-fix/blocked | _count_ | _count_ | _count_ | _notes_ |
| v3 | pass/needs-fix/blocked | _count_ | _count_ | _count_ | _notes_ |

If the auto-fix loop was triggered, also see fix reports:
- `task-summaries/{{TASK_ID}}-fix-v1.md`
- `task-summaries/{{TASK_ID}}-fix-v2.md`
- `task-summaries/{{TASK_ID}}-fix-v3.md`
