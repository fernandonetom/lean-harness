---
name: lh-status
description: Inspect LeanHarness feature state and summarize current specs, discovery, plans, tasks, checks, blockers, and next actions. Use when the user invokes /lh-status or asks what is happening in the current LeanHarness work.
allowed-tools: Read, Glob, Grep, TaskCreate, TaskUpdate
---

# lh-status

## Purpose

Inspect LeanHarness artifacts and summarize the current state of feature work. Read-only by default. Does not modify files unless the user explicitly asks to repair state.

## Inputs

Accept any of:

- No argument: summarize active feature and recent features
- Feature ID: summarize that specific feature
- `all`: summarize all known features by state
- Status filter: summarize features in a specific state (e.g., `blocked`, `planned`)

Examples:

```
/lh-status
/lh-status F001
/lh-status all
/lh-status blocked
```

## Task Tooling

**On Claude Code:** As the very first action (before any Read, Bash, or other tool call), call TaskCreate for each step below all at once, so the user sees the full roadmap immediately. Before starting each step, call TaskUpdate to mark it in_progress. After completing each step, call TaskUpdate to mark it completed. Use the activeForm field as the spinner label.

**On OpenCode:** Before starting each step, emit a step header:

    ---
    **Step N/M — <Step Name>**

where N is the current step number and M is the total step count.

**Steps:**

| # | Subject | activeForm |
|---|---------|------------|
| 1 | Read state.json + feature dirs | Reading state |
| 2 | Analyze consistency + blockers | Analyzing consistency |
| 3 | Report | Reporting |

## Workflow

1. **Read state.** Read `.lh/state.json` if present.
2. **Scan features.** Read `.lh/features/` if present.
3. **Locate feature.** If a feature ID is provided, find the matching folder.
4. **Read artifacts.** For each relevant feature, check which artifacts exist:
   - `spec.md`
   - `discovery.md`
   - `boundary.json`
   - `plan.md`
   - `tasks.md`
   - `checks.md`
   - `result.md`
   - `task-summaries/`
   - `cavebus.log`
5. **Identify current state.** For each feature, determine:
   - Current status (from `state.json` or inferred from artifacts)
   - Last completed workflow step
   - Next missing artifact
   - Blockers
   - Failed checks
   - Triggered risk gates
   - Next recommended action
6. **Do not modify files** unless the user explicitly asks to repair state.

## Status Summary Format

For each feature, show:

- **Feature ID** — e.g., `F001`
- **Slug or title** — Short description
- **Status** — `draft`, `specified`, `discovered`, `planned`, `building`, `checking`, `pass`, `needs-fix`, `blocked`
- **Last known step** — Which workflow step completed last
- **Missing artifacts** — Which expected artifacts do not exist yet
- **Blockers** — Unresolved issues preventing progress
- **Recommended next command** — What to run next

For multiple features, use a summary table:

| Feature | Title | Status | Next Step |
|---------|-------|--------|-----------|
| F001 | Password reset | planned | `/lh-build F001` |
| F002 | Billing fix | specified | `/lh-discover F002` |

## State Consistency Rules

If `.lh/state.json` and feature folders disagree:

- Treat feature artifacts as more authoritative than state.json.
- Report the mismatch clearly.
- Suggest repair (e.g., "state.json says F001 is `specified` but `plan.md` exists, suggesting it is `planned`").
- Do not silently delete or overwrite state.

## Final Response Format

Every `/lh-status` run must end with:

- **Active feature** — Currently active feature, if any
- **Feature summary** — Table or list of features and their states
- **Current blockers** — Across all inspected features
- **Missing artifacts** — What still needs to be created
- **Suggested next command** — The most useful next step
