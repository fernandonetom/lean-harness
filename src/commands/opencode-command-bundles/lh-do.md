---
description: Run the full LeanHarness feature workflow for an existing codebase: specify, discover, plan, build, and check. Use when the user invokes /lh-do with a feature request or asks OpenCode to complete a feature through LeanHarness.
agent: lh-builder
---

# lh-do

## Purpose

`/lh-do <feature request>` runs the full LeanHarness workflow:

**Specify -> Discover -> Plan -> Build -> Check**

The public-facing workflow is Specify -> Discover -> Build -> Check. Internally, Build includes planning when a plan does not yet exist.

This command orchestrates the entire feature lifecycle. Use it when the user wants end-to-end feature delivery through LeanHarness.

## Inputs

Accept any of:

- A raw feature request in natural language
- An existing feature ID (e.g., `F001`)
- A feature request plus constraints
- A feature request plus file or area hints

Examples:

```
/lh-do Add password reset without replacing existing auth
/lh-do F001
/lh-do Refactor billing validation, but do not change public API
/lh-do Fix the checkout total rounding bug. Start near src/billing.
```

## Phase Detection

Before running any step, inspect the feature folder to determine the current phase:

| Artifacts present | Detected phase | Action |
|-------------------|----------------|--------|
| None | Not started | Run `lh-spec` workflow |
| `spec.md` only | Spec done | Run `lh-discover` workflow |
| `spec.md` + `discovery.md` + `boundary.json` | Discovery done | Run `lh-plan` workflow |
| `plan.md` + `tasks.md`, no checkpoint | Plan done | Run `lh-build` wave 1 |
| `plan.md` + `checkpoint.md` | Mid-build | Read checkpoint; run `lh-build` from `next_task` |
| All tasks `done`, no `checks.md` | Build done | Run `lh-check` workflow |
| `checks.md` with verdict `pass` | Feature done | Show status; no action needed |
| `checks.md` with verdict `needs-fix` | Needs fix | Run `lh-build --fix-review` workflow |
| `checks.md` with verdict `blocked` | Blocked | Report blockers; ask user to resolve |

## Workflow

1. **Determine scope.** Check whether the user provided a feature ID or a new request.
2. **Detect phase.** Use the phase detection table to find where this feature is.
3. **Run the next phase only.** Do not skip ahead or re-run completed phases.
4. **End with NEXT SESSION block.** Every run ends with a NEXT SESSION block pointing to the next invocation.

## Operating Rules

- Prefer useful progress over excessive clarification.
- Ask clarifying questions only for blocking ambiguity or high-risk decisions.
- Record assumptions in the feature spec.
- Do not skip discovery for brownfield work.
- Do not skip check.
- Respect risk gates from `.lh/config.yml`.
- Use bounded context for implementation tasks.
- If subagents exist (e.g., `.opencode/agents/lh-*.md`), use them when helpful.
- If subagents do not exist yet, perform the steps directly.
- If guardrail plugin exists, respect its outcomes.
- If CLI commands exist later, prefer them for deterministic file operations.
- If CLI commands do not exist yet, manually create or update artifacts using templates from `.lh/templates/`.

## Question Format

When you need to ask a clarifying question, format it as a numbered list so the user can reply with a single digit.

> **[Topic]:** [Question?]
> 1. [Short label] — [one-sentence description]
> 2. [Short label] — [one-sentence description]
> 3. Other — describe your preference

Ask one question at a time. Wait for the reply before continuing.

## Required Artifacts

Each feature produces artifacts under `.lh/features/<feature-id>-<slug>/`:

```
spec.md            # Feature specification
discovery.md       # On-demand discovery report
boundary.json      # Change boundary
plan.md            # Implementation plan
tasks.md           # Task list
checks.md          # Verification results
result.md          # Final outcome record
events.jsonl       # Event log
cavebus.log        # Compressed agent messages
task-summaries/    # Per-task completion summaries
```

Artifacts are created progressively as each workflow step runs. Not all artifacts exist at every stage.

## Feature ID Rule

Before CLI tooling exists, create feature IDs manually:

1. Read `.lh/state.json`.
2. Use `nextFeatureNumber` if present. Otherwise, scan `.lh/features/` and pick the next unused number.
3. Format as `F###` (e.g., `F001`, `F002`).
4. Create a short lowercase slug from the feature title (e.g., `password-reset`).
5. Create the folder `.lh/features/F###-slug/`.
6. Update `.lh/state.json` conservatively: set `active_feature` and add the feature to `features`.
7. If the state update is risky or unclear, create the folder and record the discrepancy in the final response.

## CaveBus Usage

Use CaveBus only for compact internal handoffs and summaries written to `cavebus.log`. Follow the format in `.lh/templates/cavebus-message.md`.

Do not use CaveBus for canonical specs, plans, or final reports. Those remain human-readable in their respective artifact files.

## Completion Rules

Do not call a feature done unless:

- `checks.md` exists
- Verdict is `pass`
- Acceptance criteria have verification evidence
- Required checks ran, or skips are justified
- No blocking review findings remain
- Boundary violations are resolved or approved

## Final Response Format

Every `/lh-do` run must end with:

- **Feature ID** — The assigned feature identifier
- **Phase run** — Which phase executed this session
- **Status** — Current workflow status after this run
- **Files created or changed** — Artifact and source file list
- **Verification verdict** — `pass`, `needs-fix`, or `blocked` (if check ran)
- **Commands run** — Verification commands and their results
- **Blockers or follow-ups** — Unresolved issues
- **NEXT SESSION block** — Always end with:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  NEXT SESSION — <Phase> complete
  Paste this to continue:

  /lh-do <feature-id>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

When done:
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  DONE — <feature-id> passed verification
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```