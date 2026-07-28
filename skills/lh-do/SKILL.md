---
name: lh-do
description: Run the full LeanHarness feature workflow for an existing codebase: specify, discover, plan, build, and check. Use when the user invokes /lh-do with a feature request or asks Claude Code to complete a feature through LeanHarness.
---

# lh-do

## Purpose

`/lh-do <feature request>` runs the full LeanHarness workflow:

**Specify -> Discover -> Plan -> Build -> Check**

The public-facing workflow is Specify -> Discover -> Build -> Check. Internally, Build includes planning when a plan does not yet exist.

This skill orchestrates the entire feature lifecycle. Use it when the user wants end-to-end feature delivery through LeanHarness.

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

## Workflow

1. **Determine scope.** Check whether the user provided a feature ID or a new request.
2. **Specify.** If new request, run the `/lh-spec` workflow to create a feature spec.
3. **Discover.** Run the `/lh-discover` workflow to produce discovery and change boundary.
4. **Plan.** Run the `/lh-plan` workflow to create plan and task list.
5. **Branch Setup.** Before delegating build tasks, confirm the target branch (see Branch Setup section).
6. **Build.** Run the `/lh-build` workflow to implement tasks.
7. **Check.** Run the `/lh-check` workflow to verify completion.
8. **Report.** Present final verdict and next action.

## Operating Rules

- Prefer useful progress over excessive clarification.
- Ask clarifying questions only for blocking ambiguity or high-risk decisions.
- Record assumptions in the feature spec.
- Do not skip discovery for brownfield work.
- Do not skip check.
- Respect risk gates from `.lh/config.yml`.
- Use bounded context for implementation tasks.
- **Use the Agent tool** to delegate each workflow step to the appropriate subagent (always include the required `description` field):
    - Specify step → spawn Agent with `description: "Run lh-spec for <feature-id>"` and prompt: `"Read `.claude/skills/lh-spec/SKILL.md` and follow its workflow for: <request>"`. You may also use `Skill(skill: "lh-spec")` to load the skill directly.
    - Discover step → runs `/lh-discover` which uses graphify directly for D1–D4
    - Build step (per task) → `subagent_type: "lh-builder"`, `description: "Build <task-id> for <feature-id>"`
    - Review step (after each task) → `subagent_type: "lh-reviewer"`, `description: "Review <task-id> for <feature-id>"`
    - Check step → `subagent_type: "lh-verifier"`, `description: "Verify feature <feature-id>"`
    - Compress step (after each summary) → `subagent_type: "lh-compressor"`, `description: "Compress <task-id> summary"`
    - If a named subagent is unavailable, perform that step directly.
    - If hooks exist, respect their outcomes.
    - If CLI commands exist later, prefer them for deterministic file operations.
    - If CLI commands do not exist yet, manually create or update artifacts using templates from `.lh/templates/`.
    - For the discover step: invoke `/lh-discover` directly — it uses graphify for all D1–D4 discovery.

## Branch Setup

Before delegating build tasks, confirm the development branch.

1. Run `git branch --show-current` to get the active branch.
2. If the branch name already contains `<feature-id>` (e.g., `feature/F001-...`), skip — the branch is already set.
3. Otherwise, ask the user using the `AskUserQuestion` tool:
   - `header`: `"Branch setup"`
   - `question`: `"You're on '<current-branch>'. Where should this feature's work go?"`
   - `options`:
     - label: `"New branch (Recommended)"`, description: `"Create 'feature/<id>-<slug>'. Select Other to use a different prefix like fix/ or chore/."`
     - label: `"Stay on current branch"`, description: `"Continue on '<current-branch>' without switching."`
4. For "New branch": run `git checkout -b feature/<id>-<slug>`. If the branch already exists, run `git checkout feature/<id>-<slug>` instead.
5. For "Other" (custom name): run `git checkout -b <custom-name>`. If the branch already exists, run `git checkout <custom-name>` instead.
6. For "Stay on current branch": proceed without changes.

## Question Format

When you need to ask a clarifying question, use the `AskUserQuestion` tool — never plain text. This shows clickable option chips instead of requiring the user to type. **Always include an AI-recommended option marked with "(Recommended)"** — this should be the most sensible default based on your analysis.

Structure each question with:
- `header`: short topic label (≤12 chars, e.g., "Reset method")
- `question`: clear question ending with `?`
- `options`: 2–4 choices, each with a short `label` (1–5 words) and a one-sentence `description`. Mark the recommended option with "(Recommended)" in the label.

Example:

```json
{
  "header": "Branch setup",
  "question": "You're on 'main'. Where should this feature's work go?",
  "options": [
    { "label": "New branch (Recommended)", "description": "Create 'feature/<id>-<slug>'. Select Other to use a different prefix like fix/ or chore/." },
    { "label": "Stay on current branch", "description": "Continue on '<current-branch>' without switching." }
  ]
}
```

Ask one question at a time. Ask the most blocking question first. Wait for the reply before continuing.

## Delegation of Questions

The workflow delegates clarification and research questions to the appropriate phase:

- **Spec phase** (`/lh-spec`): Handles clarifying questions about the feature request, acceptance criteria, non-goals, verification expectations, and technical approach. The spec phase asks questions aggressively — only skip when 100% certain.
- **Discovery phase** (`/lh-discover`): Handles conditional research questions about unknown libraries, tech stack, low confidence, and risk areas. Discovery asks before deepening or researching. Web research is available for any unknown areas.
- **Build phase** (`/lh-build`): Handles branch setup and risk gate approval questions.

When orchestrating through `/lh-do`, trust that each phase will ask the appropriate questions. Do not duplicate question-asking across phases.

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
- **Status** — Current workflow status
- **Files created or changed** — Artifact and source file list
- **Verification verdict** — `pass`, `needs-fix`, or `blocked`
- **Commands run** — Verification commands and their results
- **Blockers or follow-ups** — Unresolved issues
- **Suggested next action** — What the user should do next
