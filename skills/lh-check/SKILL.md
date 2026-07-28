---
name: lh-check
description: Verify a LeanHarness feature against acceptance criteria, changed files, risk gates, review findings, and command evidence. Use when the user invokes /lh-check or wants a final pass, needs-fix, or blocked verdict.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, TaskCreate, TaskUpdate
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
3. **Delegate verification.** Invoke the Agent tool with `subagent_type: "lh-verifier"` and `description: "Verify feature <feature-id>"`, passing the feature ID and artifact paths. Use the verifier's returned verdict, AC table, command results, and CaveBus entry as the basis for steps 12–13. If `lh-verifier` is unavailable, perform steps 4–11 directly.
4. **Determine changed files.** (fallback) Use available evidence:
   - Task summaries (files listed as changed)
   - `git diff` if available
   - Events log if available
5. **Check acceptance criteria.** Evaluate each AC one by one against evidence.
6. **Check task statuses.** Confirm all planned tasks are `done` or `skipped` with justification.
7. **Check verification commands.** Review commands run and their results from task summaries.
8. **Run verification commands.** When appropriate and safe, run relevant verification commands (tests, lint, type check).
9. **Check boundary compliance.** Confirm all changed files are inside the approved boundary.
10. **Check risk gates.** Confirm all triggered risk gates were resolved or approved.
11. **Check review findings.** Confirm no blocking review findings remain.
12. **Write checks.** Write `checks.md` using `.lh/templates/checks.md`.
13. **Write result.** Write or update `result.md` using `.lh/templates/result.md`. Do not duplicate the Acceptance Results table, verification-commands table, or risk-gate section — these live only in `checks.md`; instead, include a one-line pointer back to `checks.md` for AC-level evidence. The "Decisions Made", "Patterns Discovered", and "Lessons" sections (from `.lh/templates/result.md`) are now required output — do not leave them as "_None._" placeholders unless genuinely empty after real consideration.
14. **Update project memory.** Read `.lh/memory/decisions.md` and `.lh/memory/patterns.md`. For each entry in `result.md`'s "Decisions Made" and "Patterns Discovered" sections, append it to the corresponding memory file **only if an equivalent entry is not already present** — check existing content before appending, do not blindly append. Each entry is one line, two at most, prefixed with the feature ID (e.g. `- F003: <fact>`). Record only facts that would matter to a *different* future feature — keep feature-specific detail in the feature folder, not in memory. **Hard cap: 120 lines per memory file.** If a file is already at or near the cap, consolidate/rewrite related entries into fewer lines instead of appending — do not let the file grow past 120 lines.
15. **Append CaveBus.** Invoke the Agent tool with `subagent_type: "lh-compressor"` and `description: "Compress verification summary for <feature-id>"`, passing the verification output. Append the returned compact CaveBus entry to `cavebus.log`. If `lh-compressor` is unavailable, write the CaveBus summary directly.
16. **Set verdict.** Assign final verdict: `pass`, `needs-fix`, or `blocked`.
17. **Close out stale status fields.** Once the verdict is decided: update `spec.md`'s `Status:` header (no longer `planned`) and tick each acceptance-criterion checkbox that passed. Update `boundary.json`'s `status` field, its `lastUpdated` timestamp, and resolve any `riskGates` entries still marked `unresolved` if `checks.md` shows them as passed or not-applicable. Do not leave these artifacts frozen at their pre-verification state after a `pass` or `needs-fix` verdict.

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
.lh/features/<feature-id>-<slug>/cavebus.log
.lh/features/<feature-id>-<slug>/spec.md      # status + AC checkboxes only
.lh/features/<feature-id>-<slug>/boundary.json # status/lastUpdated/riskGates only
.lh/memory/decisions.md                        # append-only, deduped
.lh/memory/patterns.md                         # append-only, deduped
.lh/state.json
```

Note: `events.jsonl` is auto-managed by LeanHarness hooks. Do not write to it.

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
- **Recommended next action** — What the user should do next
