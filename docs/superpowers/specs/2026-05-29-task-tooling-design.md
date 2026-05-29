# Task Tooling for LeanHarness Skills

**Date:** 2026-05-29  
**Status:** Approved  
**Scope:** All 7 LeanHarness skills, both Claude Code and OpenCode hosts

---

## Problem

LeanHarness skills execute multi-step workflows silently. Users have no visibility into what step a skill is on, how many steps remain, or whether progress is being made. This is especially acute for long-running skills like `lh-build`, which may execute many plan tasks across a full session.

---

## Goal

Add per-skill task visibility so users see a live progress list for every skill and command, with step names matching the skill's actual workflow. For `lh-build` specifically, task entries must reflect the feature's actual plan tasks (T-01, T-02, etc.) rather than generic labels.

---

## Non-Goals

- No new runtime infrastructure or CLI commands
- No changes to how skills execute their work — only progress visibility is added
- No changes to artifact formats (tasks.md, spec.md, etc.)
- No OpenCode native task panel (OpenCode gets markdown step headers instead)

---

## Approach: Direct Embed in Each SKILL.md

Every `SKILL.md` gets a `## Task Tooling` section inserted near the top (after the inputs block, before the workflow steps). The section contains two things: a host-dispatch rule (same boilerplate in every skill) and a step list specific to that skill.

This approach keeps each skill self-contained — no cross-file indirection, no separate protocol file to bundle.

---

## Shared Host-Dispatch Rule

The following boilerplate is embedded in every SKILL.md's `## Task Tooling` section:

```
**On Claude Code:** As the very first action (before any Read, Bash, or other tool
call), call TaskCreate for each step below all at once, so the user sees the full
roadmap immediately. Before starting each step, call TaskUpdate to mark it
in_progress. After completing each step, call TaskUpdate to mark it completed. Use
the activeForm field as the spinner label.

**On OpenCode:** Before starting each step, emit a step header:
  ---
  **Step N/M — <Step Name>**

where N is the current step number and M is the total step count.
```

---

## Per-Skill Step Lists

### lh-spec (6 steps)

| # | Subject | activeForm |
|---|---------|------------|
| 1 | Read config + project context | Reading config and context |
| 2 | Determine scope | Determining scope |
| 3 | Generate feature ID + directory | Generating feature ID |
| 4 | Ask clarifying questions | Asking clarifying questions |
| 5 | Write spec | Writing spec |
| 6 | Update state + report | Updating state |

Step 4 (clarifying questions) is created at skill start like all others. If no clarifying questions are needed, it is marked completed immediately without user interaction.

### lh-discover (5 steps)

| # | Subject | activeForm |
|---|---------|------------|
| 1 | Read spec + config | Reading spec and config |
| 2 | D0 — Repo shape | Mapping repo shape |
| 3 | D1–D4 — Semantic discovery | Running semantic discovery |
| 4 | Write boundary | Writing boundary |
| 5 | Report | Reporting |

### lh-plan (5 steps)

| # | Subject | activeForm |
|---|---------|------------|
| 1 | Read spec + discovery + boundary | Reading artifacts |
| 2 | Design tasks and wave grouping | Designing tasks |
| 3 | Check session budget | Checking session budget |
| 4 | Write plan.md + tasks.md | Writing plan |
| 5 | Update state + report | Updating state |

### lh-build (dynamic — two phases)

See dedicated section below.

### lh-check (5 steps)

| # | Subject | activeForm |
|---|---------|------------|
| 1 | Read all artifacts | Reading artifacts |
| 2 | Run verification commands | Running verification |
| 3 | AC-by-AC evaluation | Evaluating acceptance criteria |
| 4 | Write checks.md + result.md | Writing check results |
| 5 | Report verdict | Reporting verdict |

### lh-status (3 steps)

| # | Subject | activeForm |
|---|---------|------------|
| 1 | Read state.json + feature dirs | Reading state |
| 2 | Analyze consistency + blockers | Analyzing consistency |
| 3 | Report | Reporting |

### lh-do (5 steps — one per workflow stage)

| # | Subject | activeForm |
|---|---------|------------|
| 1 | Specify | Running lh-spec |
| 2 | Discover | Running lh-discover |
| 3 | Plan | Running lh-plan |
| 4 | Build | Running lh-build |
| 5 | Check + report verdict | Running lh-check |

---

## lh-build: Two-Phase Task Creation

`lh-build` cannot know the plan tasks until it reads `plan.md`, so task creation happens in two phases.

### Phase 1 — At skill start (3 fixed tasks)

Created immediately, before reading any artifacts:

| # | Subject | activeForm |
|---|---------|------------|
| 1 | Read artifacts + boundary | Reading artifacts |
| 2 | Branch setup | Setting up branch |
| 3 | Choose execution mode | Choosing execution mode |

### Phase 2 — After reading plan.md

After Phase 1 tasks are completed and `tasks.md` has been read, create:

- One task per T-## row in `tasks.md`, using the task description as the subject
  - Example: `T-01 Add password reset route`, `T-02 Implement token expiry`
- A final task: `Verify + build summary` (activeForm: `Verifying and summarizing`)

**Total count** for the step header on OpenCode updates after Phase 2: e.g., `Step 4/8 — T-01 Add password reset route`.

### Invocation variants

| Invocation | Phase 2 behavior |
|------------|-----------------|
| `/lh-build F001` | Creates tasks for all pending T-## entries |
| `/lh-build F001 T-02` | Creates only the T-02 task + verify task |
| `/lh-build F001 --resume` | Reads current task statuses; marks already-done tasks `completed` before creating tasks for remaining pending ones |
| `/lh-build F001 --fix-review` | Creates tasks only for tasks marked `needs-fix` |

---

## lh-init Bundle Update

No changes to `init.ts` are required. The `installBundledScaffold()` function copies `.claude/skills/` as part of the Claude Code integration bundle. Updating `SKILL.md` files in this repo is sufficient — users get the updated skills on their next `lh init`.

**Implementation prerequisite:** Before editing SKILL.md files, verify that `installBundledScaffold()` reads from `.claude/skills/` directly and not from a pre-compiled snapshot in `src/scaffold/` or similar. If a separate scaffold directory exists, both locations must be updated.

The same applies to OpenCode: `.opencode/commands/` templates are bundled by init from the repo's own directory, so updating them propagates automatically.

---

## What Changes

| File | Change |
|------|--------|
| `.claude/skills/lh-spec/SKILL.md` | Add `## Task Tooling` section with 6-step list |
| `.claude/skills/lh-discover/SKILL.md` | Add `## Task Tooling` section with 5-step list |
| `.claude/skills/lh-plan/SKILL.md` | Add `## Task Tooling` section with 5-step list |
| `.claude/skills/lh-build/SKILL.md` | Add `## Task Tooling` section with two-phase dynamic task list |
| `.claude/skills/lh-check/SKILL.md` | Add `## Task Tooling` section with 5-step list |
| `.claude/skills/lh-status/SKILL.md` | Add `## Task Tooling` section with 3-step list |
| `.claude/skills/lh-do/SKILL.md` | Add `## Task Tooling` section with 5-step list |
| `src/commands/init.ts` | No change (skills bundled as-is) |
| `.opencode/commands/*.md` | No change (markdown headers are emitted by agent, not by command templates) |

---

## Acceptance Criteria

- [ ] Every skill creates all its tasks at skill start, before any work begins
- [ ] Each task is marked `in_progress` before its step starts and `completed` after
- [ ] On Claude Code, TaskCreate and TaskUpdate are called (not markdown headers)
- [ ] On OpenCode, step headers are emitted before each step
- [ ] lh-build Phase 1 tasks appear before plan.md is read
- [ ] lh-build Phase 2 tasks use T-## IDs and descriptions from the actual plan
- [ ] lh-build `--resume` marks already-done tasks `completed` on creation
- [ ] lh-build invoked with a specific task only creates that task + verify task
- [ ] lh-init bundle includes updated skills (verified by checking installBundledScaffold source)
