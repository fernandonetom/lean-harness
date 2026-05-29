# lh-build Execution Mode Choice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit execution mode choice to `/lh-build` (subagents vs current agent) and enforce mandatory review after every task in both hosts.

**Architecture:** Three content-only edits — the dev reference SKILL.md, the TypeScript generator function in init-claude-code.ts (which produces the same content as a template literal), and the OpenCode bundle. No new files, no structural changes to anything outside these three locations.

**Tech Stack:** TypeScript (template literal string generation), Markdown (skill/command content)

---

### Task 1: Update `.claude/skills/lh-build/SKILL.md` — add execution mode question and two-branch loop

**Files:**
- Modify: `.claude/skills/lh-build/SKILL.md`

This is the dev-reference copy of the skill. It must match what `createCCSkillBuild()` generates.

Two sections change: the **Workflow** numbered list (add step 4, renumber, split step 5 into two branches) and the **Review Behavior** section (split into subagents vs current-agent language).

- [ ] **Step 1: Replace the Workflow steps 4–9 block**

Find this exact block (starting at "4. **Determine task scope**"):

```
4. **Determine task scope:**
   - One specified task
   - Next `pending` task in order
   - All remaining `pending` tasks
   - Fix tasks from review findings
5. **For each task:**
   a. Compile bounded context from artifacts. Read only relevant files.
   b. Confirm expected edit files are inside the change boundary.
   c. **Implement:** Invoke the Agent tool with `subagent_type: "lh-builder"`, passing the compiled bounded context (feature ID, task ID, task goal, expected files, read-only context, verification commands, prior task summaries). If `lh-builder` is unavailable, implement the task directly; prefer writing or updating tests first if behavior changes.
   d. Run task verification commands when available.
   e. Record commands and results.
   f. **Review:** Invoke the Agent tool with `subagent_type: "lh-reviewer"`, passing feature ID, task ID, changed files list, task summary path, and boundary path. If `lh-reviewer` is unavailable, perform self-review inline.
   g. **Compress:** Invoke the Agent tool with `subagent_type: "lh-compressor"`, passing the verbose task summary. Append the returned compact CaveBus entry to `cavebus.log`. If `lh-compressor` is unavailable, write the CaveBus summary directly.
   h. Write task summary to `task-summaries/<task-id>.md`.
   i. Update task status in `tasks.md`.
6. **Boundary enforcement.** If the task requires files outside the boundary:
```

Replace with:

```
4. **Ask execution mode.** Before implementing any task, ask the user how this build should run using the `AskUserQuestion` tool:
   - `header`: `"Exec mode"`
   - `question`: `"How should this build run?"`
   - `options`:
     - label: `"Subagents"`, description: `"Dispatch lh-builder for implementation, lh-reviewer for review after every task, lh-compressor for compression — each task runs in a fresh, isolated agent."`
     - label: `"Current agent"`, description: `"Implement, review, and compress directly in this session without subagent dispatch."`
5. **Determine task scope:**
   - One specified task
   - Next `pending` task in order
   - All remaining `pending` tasks
   - Fix tasks from review findings
6. **For each task (subagents mode):**
   a. Compile bounded context from artifacts. Read only relevant files.
   b. Confirm expected edit files are inside the change boundary.
   c. **MUST implement:** Invoke the Agent tool with `subagent_type: "lh-builder"`, passing: feature ID, task ID, task goal, expected files, bounded context (relevant spec sections, boundary entries, memory entries, file content), verification commands, prior task summaries. Do NOT implement inline. If the Agent tool itself errors or reports the subagent type is not registered, report the error to the user and stop.
   d. Run task verification commands when available.
   e. Record commands and results.
   f. **MUST review:** Invoke the Agent tool with `subagent_type: "lh-reviewer"` after every task without exception, passing: feature ID, task ID, changed files list, task summary path, boundary path.
   g. **MUST compress:** Invoke the Agent tool with `subagent_type: "lh-compressor"`, passing the verbose task summary. Append the returned compact CaveBus entry to `cavebus.log`.
   h. Write task summary to `task-summaries/<task-id>.md`.
   i. Update task status in `tasks.md`.
7. **For each task (current-agent mode):**
   a. Compile bounded context from artifacts. Read only relevant files.
   b. Confirm expected edit files are inside the change boundary.
   c. Implement directly. Prefer writing or updating tests first for behavior changes.
   d. Run task verification commands when available.
   e. Record commands and results.
   f. Self-review inline: acceptance criteria coverage, boundary violations, missing tests, security issues, regressions, overengineering, accidental broad refactors.
   g. Write CaveBus summary directly to `cavebus.log`.
   h. Write task summary to `task-summaries/<task-id>.md`.
   i. Update task status in `tasks.md`.
8. **Boundary enforcement.** If the task requires files outside the boundary:
```

- [ ] **Step 2: Fix the renumbered downstream steps**

The steps that were 6, 7, 8, 9 are now 8, 9, 10, 11. Find and replace each:

Find: `6. **Boundary enforcement.**`  → Replace: `8. **Boundary enforcement.**`
Find: `7. **Risk gates.**` → Replace: `9. **Risk gates.**`
Find: `8. **Test failures.**` → Replace: `10. **Test failures.**`
Find: `9. **Verification evidence.**` → Replace: `11. **Verification evidence.**`

- [ ] **Step 3: Replace the Review Behavior section**

Find:

```
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
```

Replace with:

```
## Review Behavior

**Subagents mode:** After each task, MUST invoke the Agent tool with `subagent_type: "lh-reviewer"` (step 6f), passing feature ID, task ID, changed files, task summary path, and boundary path. Do not skip. Do not fall back to self-review unless the Agent tool itself errors.

**Current-agent mode:** After each task, perform self-review inline (step 7f) checking:

- Acceptance criteria coverage
- Boundary violations
- Missing tests
- Security issues
- Regressions
- Overengineering
- Accidental broad refactors

Record review findings in the task summary.
```

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/lh-build/SKILL.md
git commit -m "feat: add execution mode choice to lh-build skill (dev reference)"
```

---

### Task 2: Update `createCCSkillBuild()` in `src/commands/init-claude-code.ts`

**Files:**
- Modify: `src/commands/init-claude-code.ts` (lines ~2130–2165 and ~2253–2265)

This function generates the skill at `lh init` time. It must produce the same content as Task 1's SKILL.md. Backticks inside the template literal are escaped as `` \` `` — follow the existing pattern throughout the file.

- [ ] **Step 1: Replace the Workflow steps 4–9 block inside the template literal**

Find this block inside `createCCSkillBuild()` (around line 2141):

```typescript
4. **Determine task scope:**
   - One specified task
   - Next \`pending\` task in order
   - All remaining \`pending\` tasks
   - Fix tasks from review findings
5. **For each task:**
   a. Compile bounded context from artifacts. Read only relevant files.
   b. Confirm expected edit files are inside the change boundary.
   c. **Implement:** Invoke the Agent tool with \`subagent_type: "lh-builder"\`, passing the compiled bounded context (feature ID, task ID, task goal, expected files, read-only context, verification commands, prior task summaries). If \`lh-builder\` is unavailable, implement the task directly; prefer writing or updating tests first if behavior changes.
   d. Run task verification commands when available.
   e. Record commands and results.
   f. **Review:** Invoke the Agent tool with \`subagent_type: "lh-reviewer"\`, passing feature ID, task ID, changed files list, task summary path, and boundary path. If \`lh-reviewer\` is unavailable, perform self-review inline.
   g. **Compress:** Invoke the Agent tool with \`subagent_type: "lh-compressor"\`, passing the verbose task summary. Append the returned compact CaveBus entry to \`cavebus.log\`. If \`lh-compressor\` is unavailable, write the CaveBus summary directly.
   h. Write task summary to \`task-summaries/<task-id>.md\`.
   i. Update task status in \`tasks.md\`.
6. **Boundary enforcement.** If the task requires files outside the boundary:
```

Replace with:

```typescript
4. **Ask execution mode.** Before implementing any task, ask the user how this build should run using the \`AskUserQuestion\` tool:
   - \`header\`: \`"Exec mode"\`
   - \`question\`: \`"How should this build run?"\`
   - \`options\`:
     - label: \`"Subagents"\`, description: \`"Dispatch lh-builder for implementation, lh-reviewer for review after every task, lh-compressor for compression — each task runs in a fresh, isolated agent."\`
     - label: \`"Current agent"\`, description: \`"Implement, review, and compress directly in this session without subagent dispatch."\`
5. **Determine task scope:**
   - One specified task
   - Next \`pending\` task in order
   - All remaining \`pending\` tasks
   - Fix tasks from review findings
6. **For each task (subagents mode):**
   a. Compile bounded context from artifacts. Read only relevant files.
   b. Confirm expected edit files are inside the change boundary.
   c. **MUST implement:** Invoke the Agent tool with \`subagent_type: "lh-builder"\`, passing: feature ID, task ID, task goal, expected files, bounded context (relevant spec sections, boundary entries, memory entries, file content), verification commands, prior task summaries. Do NOT implement inline. If the Agent tool itself errors or reports the subagent type is not registered, report the error to the user and stop.
   d. Run task verification commands when available.
   e. Record commands and results.
   f. **MUST review:** Invoke the Agent tool with \`subagent_type: "lh-reviewer"\` after every task without exception, passing: feature ID, task ID, changed files list, task summary path, boundary path.
   g. **MUST compress:** Invoke the Agent tool with \`subagent_type: "lh-compressor"\`, passing the verbose task summary. Append the returned compact CaveBus entry to \`cavebus.log\`.
   h. Write task summary to \`task-summaries/<task-id>.md\`.
   i. Update task status in \`tasks.md\`.
7. **For each task (current-agent mode):**
   a. Compile bounded context from artifacts. Read only relevant files.
   b. Confirm expected edit files are inside the change boundary.
   c. Implement directly. Prefer writing or updating tests first for behavior changes.
   d. Run task verification commands when available.
   e. Record commands and results.
   f. Self-review inline: acceptance criteria coverage, boundary violations, missing tests, security issues, regressions, overengineering, accidental broad refactors.
   g. Write CaveBus summary directly to \`cavebus.log\`.
   h. Write task summary to \`task-summaries/<task-id>.md\`.
   i. Update task status in \`tasks.md\`.
8. **Boundary enforcement.** If the task requires files outside the boundary:
```

- [ ] **Step 2: Fix the renumbered downstream steps inside the template literal**

Find and replace each in the same function body:

Find: `6. **Boundary enforcement.**`  → Replace: `8. **Boundary enforcement.**`
Find: `7. **Risk gates.**` → Replace: `9. **Risk gates.**`
Find: `8. **Test failures.**` → Replace: `10. **Test failures.**`
Find: `9. **Verification evidence.**` → Replace: `11. **Verification evidence.**`

- [ ] **Step 3: Replace the Review Behavior section inside the template literal**

Find (around line 2253):

```typescript
## Review Behavior

After each task implementation, invoke the Agent tool with \`subagent_type: "lh-reviewer"\` (step 4f above), passing feature ID, task ID, changed files, task summary path, and boundary path.

If \`lh-reviewer\` is unavailable, perform self-review checking:

- Acceptance criteria coverage
- Boundary violations
- Missing tests
- Security issues
- Regressions
- Overengineering
- Accidental broad refactors

Record review findings in the task summary.
```

Replace with:

```typescript
## Review Behavior

**Subagents mode:** After each task, MUST invoke the Agent tool with \`subagent_type: "lh-reviewer"\` (step 6f), passing feature ID, task ID, changed files, task summary path, and boundary path. Do not skip. Do not fall back to self-review unless the Agent tool itself errors.

**Current-agent mode:** After each task, perform self-review inline (step 7f) checking:

- Acceptance criteria coverage
- Boundary violations
- Missing tests
- Security issues
- Regressions
- Overengineering
- Accidental broad refactors

Record review findings in the task summary.
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm typecheck
```

Expected: zero errors.

- [ ] **Step 5: Run existing tests**

```bash
pnpm test
```

Expected: all tests pass (no tests assert skill content, so this is a regression check).

- [ ] **Step 6: Commit**

```bash
git add src/commands/init-claude-code.ts
git commit -m "feat: add execution mode choice to lh-build generated skill"
```

---

### Task 3: Update `src/commands/opencode-command-bundles/lh-build.md` — mandatory review

**Files:**
- Modify: `src/commands/opencode-command-bundles/lh-build.md`

OpenCode has no subagent dispatch mechanism — the bundle always runs inline. The only change is making review mandatory (removing "when helpful").

- [ ] **Step 1: Replace the Review Behavior section**

Find (lines 159–175):

```markdown
## Review Behavior

If `.opencode/agents/lh-reviewer.md` exists, use it for review when helpful.

If no reviewer subagent exists yet, perform a self-review checking:

- Acceptance criteria coverage
- Boundary violations
- Missing tests
- Security issues
- Regressions
- Overengineering
- Accidental broad refactors

Record review findings in the task summary.
```

Replace with:

```markdown
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
```

- [ ] **Step 2: Verify build (copies bundle to dist)**

```bash
pnpm build
```

Expected: exits 0, `dist/commands/opencode-command-bundles/lh-build.md` contains the updated Review Behavior section.

- [ ] **Step 3: Confirm dist file updated**

```bash
grep -A 5 "## Review Behavior" dist/commands/opencode-command-bundles/lh-build.md
```

Expected output contains:
```
## Review Behavior

After every task, perform self-review. This is mandatory — not optional, not "when helpful".
```

- [ ] **Step 4: Commit**

```bash
git add src/commands/opencode-command-bundles/lh-build.md
git commit -m "feat: enforce mandatory self-review in lh-build OpenCode bundle"
```
