# Workflow

LeanHarness uses a four-phase workflow for every feature:

```
Specify → Discover → Build → Check
```

Each phase produces artifacts stored in `.lh/features/<feature-id>/`. Each phase has explicit inputs, outputs, and transition criteria.

This document describes each phase in detail. None of this is implemented yet — it describes the intended behavior.

---

## Phase 1: Specify

**Input:** A user request in natural language.

**Output:** `spec.md` — a structured feature specification.

**Purpose:** Turn a vague or incomplete request into a clear, bounded feature definition that the agent can work against.

### What the spec captures

| Field | Description |
|-------|-------------|
| Goal | One sentence describing what the feature does |
| Non-goals | What this feature explicitly does not do |
| Acceptance criteria | Observable behaviors that prove the feature works |
| Constraints | Technical or business limitations the implementation must respect |
| Assumptions | Beliefs about the codebase or environment that should be validated during discovery |
| Verification expectations | How the feature should be checked (tests, manual steps, commands) |

### How it works

1. The user provides a request. Examples:
   - "Add password reset without replacing existing auth"
   - "Fix the date picker so it handles timezone offsets"
   - "Add rate limiting to the public API endpoints"

2. LeanHarness parses the request and drafts a spec.

3. If the request is ambiguous, LeanHarness asks clarifying questions before producing the spec. It does not guess.

4. The spec is written to `.lh/features/<feature-id>/spec.md`.

5. The user reviews and approves the spec before discovery begins.

### Transition to Discover

The spec is approved when:
- The goal is clear and bounded.
- At least one acceptance criterion exists.
- The user has confirmed the spec (or the harness has high confidence in an unambiguous request).

### Example spec

```markdown
# F001: Password Reset

## Goal
Allow users to reset their password via email without replacing the existing authentication system.

## Non-goals
- Do not add social login.
- Do not modify the existing login flow.
- Do not add two-factor authentication.

## Acceptance criteria
- A user can request a password reset from the login page.
- The system sends a reset link to the user's registered email.
- The reset link expires after 1 hour.
- After resetting, the user can log in with the new password.
- Existing sessions are not invalidated by a password reset.

## Constraints
- Must use the existing email service (SendGrid integration in src/services/email.ts).
- Must not add new dependencies.

## Assumptions
- The project has an existing user model with an email field.
- The project has an existing authentication middleware.

## Verification expectations
- Unit tests for the reset token generation and validation.
- Integration test for the full reset flow.
- Manual verification: trigger a reset and complete it in a browser.
```

---

## Phase 2: Discover

**Input:** An approved `spec.md`.

**Output:** `discovery.md` — a change boundary with relevant files, tests, risks, and context.

**Purpose:** Understand enough of the existing codebase to build the feature safely, without scanning the entire project.

### What discovery produces

| Field | Description |
|-------|-------------|
| Touch files | Files that will likely be created or modified |
| Read-only files | Files needed for context but not changed |
| Relevant tests | Existing test files and commands that cover the change area |
| Test commands | How to run the relevant tests |
| Project conventions | Patterns, naming conventions, or structures observed in the area |
| Risks | Things that could go wrong or need special attention |
| Unknowns | Questions that could not be answered from the codebase alone |

### How it works

1. LeanHarness reads the spec's goal, constraints, and assumptions.

2. It uses targeted discovery to find relevant files:
   - Search for files related to key terms from the spec.
   - Read imports and dependencies of likely touch files.
   - Identify test files that cover the touch files.
   - Check for project conventions (naming, structure, patterns).

3. It produces a change boundary — the explicit set of files that may be modified.

4. If discovery reveals that the spec's assumptions are wrong, LeanHarness reports this and may suggest spec amendments.

### Escalation

Discovery starts narrow and widens only when needed:

```
Narrow:   Grep for key terms, read obvious files
          ↓ (if insufficient)
Medium:   Follow imports, check test directories, read configs
          ↓ (if insufficient)
Wide:     Search broader directories, check related subsystems
          ↓ (if insufficient)
Escalate: Ask the user for guidance
```

Each escalation level is logged. The goal is to stop as early as possible.

### Risk gates

Discovery may trigger a risk gate — a pause point where the harness asks the user for a decision before proceeding. Risk gates activate when:

- The change boundary is larger than expected (many touch files).
- Discovery reveals conflicting conventions in the codebase.
- The spec's assumptions are contradicted by what exists.
- The area has no existing tests.
- The area has recent, uncommitted changes.

### Transition to Build

Discovery is complete when:
- The change boundary is defined.
- All spec assumptions have been validated or flagged.
- No unresolved risk gates remain.
- The user has approved the change boundary (for features that triggered risk gates).

---

## Phase 3: Build

**Input:** An approved `spec.md` and a completed `discovery.md`.

**Output:** Code changes within the change boundary, plus `plan.md` documenting the build process.

**Purpose:** Implement the feature in small, bounded tasks with test-first preference.

### How it works

1. LeanHarness produces a build plan — an ordered list of small tasks.

2. Each task:
   - Has a clear description and expected outcome.
   - Receives bounded context: only the spec sections, discovery sections, and files relevant to that specific task.
   - Stays within the approved change boundary.
   - Produces a compact summary when complete.

3. If a task needs to modify a file outside the change boundary, it pauses and requests boundary expansion.

4. The plan is written to `.lh/features/<feature-id>/plan.md` and updated as tasks complete.

### Task structure

Each task in the plan follows this shape:

```
Task: [short description]
Files: [files this task will read or modify]
Depends on: [previous tasks, if any]
Expected outcome: [what is true when this task is done]
```

### Build preferences

- **Test-first for behavior changes.** Write or update tests before writing production code when the feature changes observable behavior.
- **Smallest useful tasks.** Each task should be completable with bounded context. If a task requires reading 20 files, it is too large.
- **Boundary respect.** No modifications outside the approved change boundary without explicit expansion.
- **Compact summaries.** After each task, produce a short summary (what changed, what was learned, what remains). These summaries feed into the next task's context instead of the full transcript.

### Subagent isolation

Build tasks that are independent of each other may run in separate subagents. Each subagent receives:

- The subset of the spec relevant to its task.
- The subset of the discovery relevant to its task.
- The files it needs to read or modify.
- A CaveBus-formatted context envelope.

The subagent returns a CaveBus-formatted result. The orchestrator merges results and detects conflicts.

### Transition to Check

Build is complete when:
- All planned tasks are done.
- No boundary expansions are pending.
- The plan file reflects the final state of all tasks.

---

## Phase 4: Check

**Input:** The completed build, `spec.md`, `discovery.md`, and `plan.md`.

**Output:** `check.md` — a verification report with a verdict.

**Purpose:** Verify that the implementation satisfies the original acceptance criteria, not just that the code compiles.

### What check verifies

| Check | Description |
|-------|-------------|
| Acceptance criteria | Does each criterion from the spec pass? |
| Test results | Do relevant tests pass? |
| Boundary compliance | Were all changes within the approved change boundary? |
| File review | Do the changed files look correct and consistent? |
| Risk items | Were risks identified during discovery addressed? |
| Convention adherence | Do changes follow the project conventions found during discovery? |

### How it works

1. LeanHarness reads the spec's acceptance criteria and verification expectations.

2. It runs the relevant test commands identified during discovery.

3. It reviews each changed file against the spec.

4. It checks that no files outside the change boundary were modified.

5. It produces a verdict:

| Verdict | Meaning |
|---------|---------|
| **pass** | All acceptance criteria met, tests pass, boundary respected |
| **needs-fix** | Some criteria failed or issues found; specific items listed |
| **blocked** | Cannot verify; missing information or external dependency |

6. The check report is written to `.lh/features/<feature-id>/check.md`.

### Verification evidence

Each acceptance criterion gets explicit evidence:

```markdown
## Criterion: A user can request a password reset from the login page

**Status:** pass
**Evidence:** Reset button added to LoginPage.tsx (line 45).
Route /reset-password added to router.ts (line 23).
Integration test `password-reset.test.ts:12` exercises this flow.
```

### After Check

If the verdict is **pass**, the feature is complete. The `.lh/features/<feature-id>/` folder serves as a permanent record of what was requested, discovered, planned, built, and verified.

If the verdict is **needs-fix**, the harness identifies specific items to address and the workflow returns to the Build phase for targeted fixes. The change boundary and spec remain the same unless the fixes require expansion.

If the verdict is **blocked**, the harness explains what is blocking verification and asks the user for guidance.

---

## Workflow summary

```
User request
    │
    ▼
┌──────────┐     spec.md
│  Specify  │────────────►
└──────────┘
    │
    ▼
┌──────────┐     discovery.md
│ Discover  │────────────►
└──────────┘
    │
    ▼
┌──────────┐     plan.md + code changes
│  Build    │────────────►
└──────────┘
    │
    ▼
┌──────────┐     check.md (verdict)
│  Check    │────────────►
└──────────┘
    │
    ├── pass ──────► Done
    ├── needs-fix ─► Back to Build
    └── blocked ───► Ask user
```

Each arrow produces an artifact. Each artifact lives in `.lh/features/<feature-id>/`. The feature folder is the source of truth for the entire lifecycle.

## Related docs

- [Commands](../commands.md)
- [Password reset walkthrough](../examples/password-reset.md)
- [Dogfooding guide](../dogfooding.md)
