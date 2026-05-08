---
description: Verify a LeanHarness feature against acceptance criteria, changed files, risk gates, review findings, and command evidence. Use when the user invokes /lh-check or wants a final pass, needs-fix, or blocked verdict.
agent: lh-verifier
---

# lh-check

## Purpose

Verify a LeanHarness feature against acceptance criteria, changed files, risk gates, reviews, and command evidence. Produce a final verdict: `pass`, `needs-fix`, or `blocked`.

## Inputs

Accept any of:

- Feature ID (e.g., `F001`)
- Feature folder path
- Request to check all active features

Examples:

```
/lh-check F001
/lh-check all
```

## Workflow

1. **Locate feature.** Find the feature folder under `.lh/features/`.
2. **Read artifacts.** Read:
   - `spec.md` — Acceptance criteria
   - `discovery.md` — Expected files and tests
   - `boundary.json` — Change boundary
   - `plan.md` — Implementation approach
   - `tasks.md` — Task statuses
   - `task-summaries/` — Per-task completion records
   - `cavebus.log` — Compressed history
   - `events.jsonl` — Event log if present
3. **Determine changed files.** Use available evidence:
   - Task summaries (files listed as changed)
   - `git diff` if available
   - Events log if available
4. **Check acceptance criteria.** Evaluate each AC one by one against evidence.
5. **Check task statuses.** Confirm all planned tasks are `done` or `skipped` with justification.
6. **Check verification commands.** Review commands run and their results from task summaries.
7. **Run verification commands.** When appropriate and safe, run relevant verification commands (tests, lint, type check).
8. **Check boundary compliance.** Confirm all changed files are inside the approved boundary.
9. **Check risk gates.** Confirm all triggered risk gates were resolved or approved.
10. **Check review findings.** Confirm no blocking review findings remain.
11. **Write checks.** Write `checks.md` using `.lh/templates/checks.md`.
12. **Write result.** Write or update `result.md` using `.lh/templates/result.md`.
13. **Set verdict.** Assign final verdict: `pass`, `needs-fix`, or `blocked`.

## Verdict Rules

**pass:**
- Acceptance criteria are checked and pass
- Required verification ran, or skips are justified
- Implementation files changed
- No unresolved blocking review findings
- No unapproved boundary or risk gate violations

**needs-fix:**
- Implementation exists but acceptance criteria are partial or failing
- Tests fail and can likely be fixed
- Review found non-blocking but required fixes
- Boundary needs correction

**blocked:**
- Missing required information
- Required approval is missing
- Verification cannot run for reasons outside task scope
- Dependency, environment, or access issue prevents completion
- High-risk decision requires user input

## Do-Not-Pass Rules

Do not mark `pass` if:

- No implementation files changed
- Acceptance criteria are unchecked
- Required checks did not run and skips are not justified
- Blocking review findings remain
- Risk gates are unresolved
- Boundary violations are unresolved
- The verdict is based only on confidence instead of evidence

## Acceptance Criteria Coverage

Use table format from `.lh/templates/checks.md`:

| AC | Status | Evidence | Notes |
|---|---|---|---|
| AC-01 | pass | Test output, code review | — |
| AC-02 | fail | Test failure in reset.test.ts | Token validation wrong |

Status values: `pass`, `fail`, `partial`, `not checked`

## Verification Commands

Record all verification commands:

- Command run
- Result (pass/fail/error)
- Evidence (output summary)
- Notes

Do not hide failed commands. Record them honestly.

## Output Artifacts

Create or update:

```
.lh/features/<feature-id>-<slug>/checks.md
.lh/features/<feature-id>-<slug>/result.md
.lh/features/<feature-id>-<slug>/events.jsonl
.lh/features/<feature-id>-<slug>/cavebus.log
.lh/state.json
```

## CaveBus Check Summary

Append a compact verification summary to `cavebus.log`:

```
VERIFY F001 verdict:pass
ac: AC-01 pass, AC-02 pass
cmd: pnpm test pass; pnpm lint pass
risk: none
next: done
```

Use actual values. Do not hardcode project-specific content.

## Final Response Format

Every `/lh-check` run must end with:

- **Feature ID** — The feature identifier
- **Verdict** — `pass`, `needs-fix`, or `blocked`
- **Acceptance criteria status** — Table of AC results
- **Commands run** — Verification commands and results
- **Changed files summary** — Files created, modified, or deleted
- **Risk gate status** — Resolved, pending, or not triggered
- **Blocking issues** — Unresolved problems preventing pass
- **Result path** — Path to `result.md`
- **NEXT SESSION block** — End every `/lh-check` response with one of:

If verdict is `pass`:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  DONE — <feature-id> passed verification
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

If verdict is `needs-fix`:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  NEXT SESSION — Needs fix
  Paste this to continue:

  /lh-build <feature-id> --fix-review
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

If verdict is `blocked`:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  BLOCKED — <feature-id> — resolve issues above before continuing
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```