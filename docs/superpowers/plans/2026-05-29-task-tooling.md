# Task Tooling for LeanHarness Skills — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `## Task Tooling` section to all 7 LeanHarness SKILL.md files and their corresponding TypeScript generator functions so users see live progress in every skill.

**Architecture:** Each skill change touches two files: (1) `.claude/skills/<skill>/SKILL.md`, which is the canonical version used by this repo's own Claude Code integration; and (2) the corresponding `createCCSkill*()` function in `src/commands/init-claude-code.ts`, which generates the identical content that `lh init` writes to user projects. Skills with an explicit `allowed-tools` frontmatter field also need `TaskCreate, TaskUpdate` added to that list. The inserted section is placed after `## Inputs` and before `## Workflow` in every skill.

**Tech Stack:** TypeScript, Vitest, Node.js fs, markdown skill files.

---

## KEY ARCHITECTURAL NOTE

`installBundledScaffold()` in `src/core/bundled-scaffold.ts` only bundles `.lh/templates`, `.lh/protocols`, and some `.lh/policies`. It does NOT read `.claude/skills/`. Skill content for `lh init` comes from hardcoded TypeScript template-literal functions in `src/commands/init-claude-code.ts` (`createCCSkillSpec()`, `createCCSkillDiscover()`, etc.). Editing only SKILL.md files would leave user bundles unchanged. **Both the SKILL.md file and the matching TypeScript function must be updated for every skill.**

---

## SHARED TASK TOOLING SECTION (standard 6-step form)

The following block is inserted verbatim into each skill (except lh-build and lh-status which have their own step tables below). Substitute the correct step table for each skill.

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
| 1 | ... | ... |
...
```

---

## Task 1: Update lh-spec

**Files:**
- Modify: `.claude/skills/lh-spec/SKILL.md`
- Modify: `src/commands/init-claude-code.ts` (function `createCCSkillSpec`, around line 1711)

- [ ] **Step 1: Add TaskCreate and TaskUpdate to the allowed-tools frontmatter in SKILL.md**

In `.claude/skills/lh-spec/SKILL.md`, change line 5:

```
allowed-tools: Read, Write, Edit, Glob, Grep, AskUserQuestion
```

to:

```
allowed-tools: Read, Write, Edit, Glob, Grep, AskUserQuestion, TaskCreate, TaskUpdate
```

- [ ] **Step 2: Insert the Task Tooling section in SKILL.md**

In `.claude/skills/lh-spec/SKILL.md`, find the text `## Workflow` (the heading before step 1 which says "Read context") and insert the following block immediately before it:

```markdown
## Task Tooling

**On Claude Code:** As the very first action (before any Read, Bash, or other tool call), call TaskCreate for each step below all at once, so the user sees the full roadmap immediately. Before starting each step, call TaskUpdate to mark it in_progress. After completing each step, call TaskUpdate to mark it completed. Use the activeForm field as the spinner label.

**On OpenCode:** Before starting each step, emit a step header:

    ---
    **Step N/M — <Step Name>**

where N is the current step number and M is the total step count.

**Steps:**

| # | Subject | activeForm |
|---|---------|------------|
| 1 | Read config + project context | Reading config and context |
| 2 | Determine scope | Determining scope |
| 3 | Generate feature ID + directory | Generating feature ID |
| 4 | Ask clarifying questions | Asking clarifying questions |
| 5 | Write spec | Writing spec |
| 6 | Update state + report | Updating state |

Step 4 is created at skill start like all others. If no clarifying questions are needed, mark it completed immediately without user interaction.

```

The result around the insertion point should look like:

```markdown
/lh-spec Refactor billing validation — constraint: do not change public API
```

## Task Tooling

**On Claude Code:** As the very first action ...

...

| 6 | Update state + report | Updating state |

Step 4 is created at skill start like all others. If no clarifying questions are needed, mark it completed immediately without user interaction.

## Workflow

1. **Read context.** Read `.lh/config.yml` and existing project docs if present.
```

- [ ] **Step 3: Update the allowed-tools frontmatter in the TypeScript function**

In `src/commands/init-claude-code.ts`, inside `createCCSkillSpec()`, find:

```
allowed-tools: Read, Write, Edit, Glob, Grep, AskUserQuestion
```

Change it to:

```
allowed-tools: Read, Write, Edit, Glob, Grep, AskUserQuestion, TaskCreate, TaskUpdate
```

- [ ] **Step 4: Insert the Task Tooling section in the TypeScript function**

In `src/commands/init-claude-code.ts`, inside `createCCSkillSpec()`, find:

```
## Workflow

1. **Read context.** Read \`.lh/config.yml\` and existing project docs if present.
```

Insert the following immediately before `## Workflow`:

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
| 1 | Read config + project context | Reading config and context |
| 2 | Determine scope | Determining scope |
| 3 | Generate feature ID + directory | Generating feature ID |
| 4 | Ask clarifying questions | Asking clarifying questions |
| 5 | Write spec | Writing spec |
| 6 | Update state + report | Updating state |

Step 4 is created at skill start like all others. If no clarifying questions are needed, mark it completed immediately without user interaction.

```

Note: The content inside the TypeScript template literal does not need any backtick escaping because the Task Tooling section contains no code fences.

- [ ] **Step 5: Verify the SKILL.md change**

Run:
```bash
grep -n "Task Tooling" .claude/skills/lh-spec/SKILL.md
```
Expected: one match at the line before `## Workflow`.

- [ ] **Step 6: Verify the TypeScript function change**

Run:
```bash
grep -n "Task Tooling" src/commands/init-claude-code.ts | head -20
```
Expected: at least one match inside the `createCCSkillSpec` block.

- [ ] **Step 7: Commit**

```bash
git add .claude/skills/lh-spec/SKILL.md src/commands/init-claude-code.ts
git commit -m "feat: add task tooling to lh-spec skill"
```

---

## Task 2: Update lh-discover

**Files:**
- Modify: `.claude/skills/lh-discover/SKILL.md`
- Modify: `src/commands/init-claude-code.ts` (function `createCCSkillDiscover`, around line 1837)

- [ ] **Step 1: Add TaskCreate and TaskUpdate to allowed-tools in SKILL.md**

In `.claude/skills/lh-discover/SKILL.md`, change:

```
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent
```

to:

```
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, TaskCreate, TaskUpdate
```

- [ ] **Step 2: Insert Task Tooling section in SKILL.md**

In `.claude/skills/lh-discover/SKILL.md`, find `## Workflow` (the heading before step 1 "Locate feature") and insert immediately before it:

```markdown
## Task Tooling

**On Claude Code:** As the very first action (before any Read, Bash, or other tool call), call TaskCreate for each step below all at once, so the user sees the full roadmap immediately. Before starting each step, call TaskUpdate to mark it in_progress. After completing each step, call TaskUpdate to mark it completed. Use the activeForm field as the spinner label.

**On OpenCode:** Before starting each step, emit a step header:

    ---
    **Step N/M — <Step Name>**

where N is the current step number and M is the total step count.

**Steps:**

| # | Subject | activeForm |
|---|---------|------------|
| 1 | Read spec + config | Reading spec and config |
| 2 | D0 — Repo shape | Mapping repo shape |
| 3 | D1–D4 — Semantic discovery | Running semantic discovery |
| 4 | Write boundary | Writing boundary |
| 5 | Report | Reporting |

```

- [ ] **Step 3: Update allowed-tools in TypeScript function**

In `src/commands/init-claude-code.ts`, inside `createCCSkillDiscover()`, find:

```
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent
```

Change to:

```
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, TaskCreate, TaskUpdate
```

- [ ] **Step 4: Insert Task Tooling section in TypeScript function**

In `src/commands/init-claude-code.ts`, inside `createCCSkillDiscover()`, find the line starting `## Workflow` and the line after it (which starts `1. **Locate feature.**`). Insert the following immediately before `## Workflow`:

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
| 1 | Read spec + config | Reading spec and config |
| 2 | D0 — Repo shape | Mapping repo shape |
| 3 | D1–D4 — Semantic discovery | Running semantic discovery |
| 4 | Write boundary | Writing boundary |
| 5 | Report | Reporting |

```

- [ ] **Step 5: Verify**

```bash
grep -n "Task Tooling" .claude/skills/lh-discover/SKILL.md
grep -c "Task Tooling" src/commands/init-claude-code.ts
```
Expected: first command shows one match; second shows count ≥ 2 (lh-spec from Task 1 + lh-discover from this task).

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/lh-discover/SKILL.md src/commands/init-claude-code.ts
git commit -m "feat: add task tooling to lh-discover skill"
```

---

## Task 3: Update lh-plan

**Files:**
- Modify: `.claude/skills/lh-plan/SKILL.md`
- Modify: `src/commands/init-claude-code.ts` (function `createCCSkillPlan`, around line 1968)

- [ ] **Step 1: Add TaskCreate and TaskUpdate to allowed-tools in SKILL.md**

In `.claude/skills/lh-plan/SKILL.md`, change:

```
allowed-tools: Read, Write, Edit, Glob, Grep
```

to:

```
allowed-tools: Read, Write, Edit, Glob, Grep, TaskCreate, TaskUpdate
```

- [ ] **Step 2: Insert Task Tooling section in SKILL.md**

In `.claude/skills/lh-plan/SKILL.md`, insert immediately before `## Workflow`:

```markdown
## Task Tooling

**On Claude Code:** As the very first action (before any Read, Bash, or other tool call), call TaskCreate for each step below all at once, so the user sees the full roadmap immediately. Before starting each step, call TaskUpdate to mark it in_progress. After completing each step, call TaskUpdate to mark it completed. Use the activeForm field as the spinner label.

**On OpenCode:** Before starting each step, emit a step header:

    ---
    **Step N/M — <Step Name>**

where N is the current step number and M is the total step count.

**Steps:**

| # | Subject | activeForm |
|---|---------|------------|
| 1 | Read spec + discovery + boundary | Reading artifacts |
| 2 | Design tasks and wave grouping | Designing tasks |
| 3 | Check session budget | Checking session budget |
| 4 | Write plan.md + tasks.md | Writing plan |
| 5 | Update state + report | Updating state |

```

- [ ] **Step 3: Update allowed-tools in TypeScript function**

In `src/commands/init-claude-code.ts`, inside `createCCSkillPlan()`, find:

```
allowed-tools: Read, Write, Edit, Glob, Grep
```

Change to:

```
allowed-tools: Read, Write, Edit, Glob, Grep, TaskCreate, TaskUpdate
```

- [ ] **Step 4: Insert Task Tooling section in TypeScript function**

In `src/commands/init-claude-code.ts`, inside `createCCSkillPlan()`, insert immediately before `## Workflow`:

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
| 1 | Read spec + discovery + boundary | Reading artifacts |
| 2 | Design tasks and wave grouping | Designing tasks |
| 3 | Check session budget | Checking session budget |
| 4 | Write plan.md + tasks.md | Writing plan |
| 5 | Update state + report | Updating state |

```

- [ ] **Step 5: Verify**

```bash
grep -n "Task Tooling" .claude/skills/lh-plan/SKILL.md
```
Expected: one match before `## Workflow`.

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/lh-plan/SKILL.md src/commands/init-claude-code.ts
git commit -m "feat: add task tooling to lh-plan skill"
```

---

## Task 4: Update lh-build (two-phase)

**Files:**
- Modify: `.claude/skills/lh-build/SKILL.md`
- Modify: `src/commands/init-claude-code.ts` (function `createCCSkillBuild`, around line 2094)

Note: `lh-build` has no `allowed-tools` frontmatter line — no frontmatter change needed.

- [ ] **Step 1: Insert Task Tooling section in SKILL.md**

In `.claude/skills/lh-build/SKILL.md`, insert immediately before `## Workflow`:

```markdown
## Task Tooling

**On Claude Code:** Task creation happens in two phases.

**Phase 1 — At skill start** (before any Read, Bash, or other tool call), call TaskCreate for these three fixed setup tasks:

| # | Subject | activeForm |
|---|---------|------------|
| 1 | Read artifacts + boundary | Reading artifacts |
| 2 | Branch setup | Setting up branch |
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

```

- [ ] **Step 2: Insert Task Tooling section in TypeScript function**

In `src/commands/init-claude-code.ts`, inside `createCCSkillBuild()`, find the `## Workflow` heading (followed by step 1 which starts "Locate feature"). Insert immediately before `## Workflow`:

```
## Task Tooling

**On Claude Code:** Task creation happens in two phases.

**Phase 1 — At skill start** (before any Read, Bash, or other tool call), call TaskCreate for these three fixed setup tasks:

| # | Subject | activeForm |
|---|---------|------------|
| 1 | Read artifacts + boundary | Reading artifacts |
| 2 | Branch setup | Setting up branch |
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

```

Note: The bullet list items above use backtick-wrapped code spans (`` `T-01 Add reset route` ``). In the TypeScript template literal those backticks must be escaped as `` \`T-01 Add reset route\` ``. Apply this escaping to all backtick-wrapped spans inside the list.

- [ ] **Step 3: Verify the SKILL.md change**

```bash
grep -n "Task Tooling\|Phase 1\|Phase 2" .claude/skills/lh-build/SKILL.md
```
Expected: three matches — Task Tooling heading, Phase 1 heading, Phase 2 heading — all before `## Workflow`.

- [ ] **Step 4: Verify the TypeScript function change**

```bash
grep -n "Phase 1\|Phase 2" src/commands/init-claude-code.ts
```
Expected: two matches inside the `createCCSkillBuild` block.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/lh-build/SKILL.md src/commands/init-claude-code.ts
git commit -m "feat: add task tooling to lh-build skill (two-phase)"
```

---

## Task 5: Update lh-check

**Files:**
- Modify: `.claude/skills/lh-check/SKILL.md`
- Modify: `src/commands/init-claude-code.ts` (function `createCCSkillCheck`, around line 2318)

- [ ] **Step 1: Add TaskCreate and TaskUpdate to allowed-tools in SKILL.md**

In `.claude/skills/lh-check/SKILL.md`, change:

```
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent
```

to:

```
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, TaskCreate, TaskUpdate
```

- [ ] **Step 2: Insert Task Tooling section in SKILL.md**

In `.claude/skills/lh-check/SKILL.md`, insert immediately before `## Workflow`:

```markdown
## Task Tooling

**On Claude Code:** As the very first action (before any Read, Bash, or other tool call), call TaskCreate for each step below all at once, so the user sees the full roadmap immediately. Before starting each step, call TaskUpdate to mark it in_progress. After completing each step, call TaskUpdate to mark it completed. Use the activeForm field as the spinner label.

**On OpenCode:** Before starting each step, emit a step header:

    ---
    **Step N/M — <Step Name>**

where N is the current step number and M is the total step count.

**Steps:**

| # | Subject | activeForm |
|---|---------|------------|
| 1 | Read all artifacts | Reading artifacts |
| 2 | Run verification commands | Running verification |
| 3 | AC-by-AC evaluation | Evaluating acceptance criteria |
| 4 | Write checks.md + result.md | Writing check results |
| 5 | Report verdict | Reporting verdict |

```

- [ ] **Step 3: Update allowed-tools in TypeScript function**

In `src/commands/init-claude-code.ts`, inside `createCCSkillCheck()`, find:

```
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent
```

Change to:

```
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, TaskCreate, TaskUpdate
```

- [ ] **Step 4: Insert Task Tooling section in TypeScript function**

In `src/commands/init-claude-code.ts`, inside `createCCSkillCheck()`, insert immediately before `## Workflow`:

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
| 1 | Read all artifacts | Reading artifacts |
| 2 | Run verification commands | Running verification |
| 3 | AC-by-AC evaluation | Evaluating acceptance criteria |
| 4 | Write checks.md + result.md | Writing check results |
| 5 | Report verdict | Reporting verdict |

```

- [ ] **Step 5: Verify**

```bash
grep -n "Task Tooling" .claude/skills/lh-check/SKILL.md
```
Expected: one match before `## Workflow`.

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/lh-check/SKILL.md src/commands/init-claude-code.ts
git commit -m "feat: add task tooling to lh-check skill"
```

---

## Task 6: Update lh-status

**Files:**
- Modify: `.claude/skills/lh-status/SKILL.md`
- Modify: `src/commands/init-claude-code.ts` (function `createCCSkillStatus`, around line 2474)

- [ ] **Step 1: Add TaskCreate and TaskUpdate to allowed-tools in SKILL.md**

In `.claude/skills/lh-status/SKILL.md`, change:

```
allowed-tools: Read, Glob, Grep
```

to:

```
allowed-tools: Read, Glob, Grep, TaskCreate, TaskUpdate
```

- [ ] **Step 2: Insert Task Tooling section in SKILL.md**

In `.claude/skills/lh-status/SKILL.md`, insert immediately before `## Workflow`:

```markdown
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

```

- [ ] **Step 3: Update allowed-tools in TypeScript function**

In `src/commands/init-claude-code.ts`, inside `createCCSkillStatus()`, find:

```
allowed-tools: Read, Glob, Grep
```

Change to:

```
allowed-tools: Read, Glob, Grep, TaskCreate, TaskUpdate
```

- [ ] **Step 4: Insert Task Tooling section in TypeScript function**

In `src/commands/init-claude-code.ts`, inside `createCCSkillStatus()`, insert immediately before `## Workflow`:

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

```

- [ ] **Step 5: Verify**

```bash
grep -n "Task Tooling" .claude/skills/lh-status/SKILL.md
```
Expected: one match before `## Workflow`.

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/lh-status/SKILL.md src/commands/init-claude-code.ts
git commit -m "feat: add task tooling to lh-status skill"
```

---

## Task 7: Update lh-do

**Files:**
- Modify: `.claude/skills/lh-do/SKILL.md`
- Modify: `src/commands/init-claude-code.ts` (function `createCCSkillDo`, around line 1554)

Note: `lh-do` has no `allowed-tools` frontmatter — no frontmatter change needed.

- [ ] **Step 1: Insert Task Tooling section in SKILL.md**

In `.claude/skills/lh-do/SKILL.md`, insert immediately before `## Workflow`:

```markdown
## Task Tooling

**On Claude Code:** As the very first action (before any Read, Bash, or other tool call), call TaskCreate for each step below all at once, so the user sees the full roadmap immediately. Before starting each step, call TaskUpdate to mark it in_progress. After completing each step, call TaskUpdate to mark it completed. Use the activeForm field as the spinner label.

**On OpenCode:** Before starting each step, emit a step header:

    ---
    **Step N/M — <Step Name>**

where N is the current step number and M is the total step count.

**Steps:**

| # | Subject | activeForm |
|---|---------|------------|
| 1 | Specify | Running lh-spec |
| 2 | Discover | Running lh-discover |
| 3 | Plan | Running lh-plan |
| 4 | Build | Running lh-build |
| 5 | Check + report verdict | Running lh-check |

```

- [ ] **Step 2: Insert Task Tooling section in TypeScript function**

In `src/commands/init-claude-code.ts`, inside `createCCSkillDo()`, find `## Workflow` (followed by step 1 "Determine scope"). Insert immediately before `## Workflow`:

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
| 1 | Specify | Running lh-spec |
| 2 | Discover | Running lh-discover |
| 3 | Plan | Running lh-plan |
| 4 | Build | Running lh-build |
| 5 | Check + report verdict | Running lh-check |

```

- [ ] **Step 3: Verify**

```bash
grep -n "Task Tooling" .claude/skills/lh-do/SKILL.md
```
Expected: one match before `## Workflow`.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/lh-do/SKILL.md src/commands/init-claude-code.ts
git commit -m "feat: add task tooling to lh-do skill"
```

---

## Task 8: Build TypeScript and verify init bundle

**Files:**
- Read: `src/commands/init-claude-code.ts` (verify all 7 createCCSkill functions have Task Tooling)
- Run: `npm run build` then `lh init` in a temp directory

- [ ] **Step 1: Check that all 7 functions now contain Task Tooling**

```bash
grep -n "Task Tooling" src/commands/init-claude-code.ts
```
Expected: exactly 7 matches (one per skill function).

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```
Expected: no TypeScript errors.

- [ ] **Step 3: Build**

```bash
npm run build
```
Expected: exits 0 with no errors.

- [ ] **Step 4: Run init in a temp directory and inspect generated skills**

```bash
TMPDIR=$(mktemp -d)
node dist/index.js init --force --host claude-code --yes --cwd "$TMPDIR"
grep -n "Task Tooling" "$TMPDIR/.claude/skills/lh-spec/SKILL.md"
grep -n "Task Tooling" "$TMPDIR/.claude/skills/lh-build/SKILL.md"
grep -n "Phase 1" "$TMPDIR/.claude/skills/lh-build/SKILL.md"
```
Expected: each grep shows one match at the expected location.

- [ ] **Step 5: Verify allowed-tools in generated skills**

```bash
grep "allowed-tools" "$TMPDIR/.claude/skills/lh-spec/SKILL.md"
grep "allowed-tools" "$TMPDIR/.claude/skills/lh-check/SKILL.md"
grep "allowed-tools" "$TMPDIR/.claude/skills/lh-status/SKILL.md"
```
Expected: each line includes `TaskCreate, TaskUpdate`.

- [ ] **Step 6: Run the test suite**

```bash
npm test
```
Expected: all tests pass. The existing `init-e2e.test.ts` tests check directory existence only, so they should continue to pass.

- [ ] **Step 7: Commit**

```bash
git add dist/
git commit -m "build: rebuild dist after task tooling additions"
```

---

## Task 9: Add e2e test coverage for Task Tooling content

**Files:**
- Modify: `tests/commands/init-e2e.test.ts`

- [ ] **Step 1: Add a test that verifies Task Tooling appears in generated skills**

In `tests/commands/init-e2e.test.ts`, add a new `it` block after the existing "creates skill directories" test (around line 212):

```typescript
it("includes Task Tooling section in generated skill files", async () => {
  const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  await runInitCommand({ cwd: tmpDir, host: "claude-code" });
  spy.mockRestore();

  const skillsToCheck = ["lh-spec", "lh-discover", "lh-plan", "lh-build", "lh-check", "lh-status", "lh-do"];
  for (const skill of skillsToCheck) {
    const skillPath = path.join(tmpDir, ".claude", "skills", skill, "SKILL.md");
    const content = await fs.readFile(skillPath, "utf-8");
    expect(content, `${skill}/SKILL.md should contain Task Tooling section`).toContain("## Task Tooling");
  }
});

it("includes two-phase task tooling in lh-build", async () => {
  const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  await runInitCommand({ cwd: tmpDir, host: "claude-code" });
  spy.mockRestore();

  const skillPath = path.join(tmpDir, ".claude", "skills", "lh-build", "SKILL.md");
  const content = await fs.readFile(skillPath, "utf-8");
  expect(content).toContain("Phase 1");
  expect(content).toContain("Phase 2");
  expect(content).toContain("Verify + build summary");
});

it("includes TaskCreate and TaskUpdate in allowed-tools for skills with explicit tool lists", async () => {
  const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  await runInitCommand({ cwd: tmpDir, host: "claude-code" });
  spy.mockRestore();

  const skillsWithAllowedTools = ["lh-spec", "lh-discover", "lh-plan", "lh-check", "lh-status"];
  for (const skill of skillsWithAllowedTools) {
    const skillPath = path.join(tmpDir, ".claude", "skills", skill, "SKILL.md");
    const content = await fs.readFile(skillPath, "utf-8");
    expect(content, `${skill}/SKILL.md allowed-tools should include TaskCreate`).toContain("TaskCreate");
    expect(content, `${skill}/SKILL.md allowed-tools should include TaskUpdate`).toContain("TaskUpdate");
  }
});
```

- [ ] **Step 2: Run the test suite**

```bash
npm test -- tests/commands/init-e2e.test.ts
```
Expected: all tests pass including the three new ones.

- [ ] **Step 3: Commit**

```bash
git add tests/commands/init-e2e.test.ts
git commit -m "test: verify Task Tooling section in generated skill files"
```
