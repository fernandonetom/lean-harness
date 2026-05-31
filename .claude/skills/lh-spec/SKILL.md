---
name: lh-spec
description: Create or update a LeanHarness feature specification from a user request. Use when the user invokes /lh-spec or wants to define goal, non-goals, acceptance criteria, constraints, assumptions, and verification expectations before implementation.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, AskUserQuestion, TaskCreate, TaskUpdate
---

# lh-spec

## Purpose

Create a LeanHarness feature spec from a user request. The spec captures what the feature should do, what it should not do, and how to verify it, without premature implementation detail.

## Inputs

Accept any of:

- Raw feature request in natural language
- Feature title
- Feature ID for updates to an existing spec
- Constraints or non-goals
- Acceptance criteria supplied by the user
- File or area hints

Examples:

```
/lh-spec Add password reset flow for email-based accounts
/lh-spec F001
/lh-spec Refactor billing validation — constraint: do not change public API
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

## Workflow

1. **Read context.** Read `.lh/config.yml` and existing project docs if present.
2. **Determine scope.** Check whether this is a new feature or an update to an existing spec.
3. **Create feature ID.** For new features, create a feature ID and folder using the same feature ID rule as `/lh-do`:
   - Read `.lh/state.json`.
   - Use `nextFeatureNumber` if present. Otherwise scan `.lh/features/` for the next unused number.
   - Format as `F###`.
   - Create a short lowercase slug from the feature title.
   - Create `.lh/features/F###-slug/`.
4. **Fill the spec.** Use `.lh/templates/spec.md` as the template. Fill:
   - Original request (verbatim or close)
   - Goal
   - Non-goals (out of scope)
   - Users or actors
   - Acceptance criteria
   - Constraints
   - Assumptions
   - Verification expectations
   - Risk notes
   - Clarifying questions (if any remain)
5. **Stay focused.** Keep the spec about what should change, not how to implement it. Avoid premature implementation details unless the user provided them as constraints.
6. **Update state.** Update `.lh/state.json` conservatively.
7. **Report.** Return the created or updated spec path.

## Clarifying Question Policy

**Ask clarifying questions aggressively.** Only skip asking when you are 100% certain about every aspect of the feature. When in doubt, ask.

Ask questions when:

- The request is ambiguous, incomplete, or impossible to interpret safely
- No acceptance criteria are provided or they would be contradictory
- Non-goals are unclear — what should explicitly NOT be included?
- Verification expectations are vague — how will success be measured?
- Technical approach is undefined — what patterns or libraries to use?
- The user asks for a high-risk change but intent is unclear
- A legal, security, payment, or auth decision is required
- Users or actors are not specified
- Edge cases or error handling expectations are missing
- Performance, scale, or compatibility requirements are absent

**Enforce asking:** If you are not 100% certain of any critical aspect, ask. Record assumptions only as a last resort when the user declines to answer.

## Question Format

When you need to ask a clarifying question, use the `AskUserQuestion` tool — never plain text. This shows clickable option chips instead of requiring the user to type. **Always include an AI-recommended option marked with "(Recommended)"** — this should be the most sensible default based on your analysis.

Structure each question with:
- `header`: short topic label (≤12 chars, e.g., "Reset method")
- `question`: clear question ending with `?`
- `options`: 2–4 choices, each with a short `label` (1–5 words) and a one-sentence `description`. Mark the recommended option with "(Recommended)" in the label.

Example:

```json
{
  "header": "Reset method",
  "question": "Which password reset method should we use?",
  "options": [
    { "label": "Email link (Recommended)", "description": "Send reset link via email — most common approach" },
    { "label": "SMS code", "description": "Send code via SMS — requires phone verification" },
    { "label": "Other", "description": "Describe your preferred method" }
  ]
}
```

Ask one question at a time. Ask the most blocking question first. Wait for the reply before continuing.

## AI Recommendation Guidelines

When proposing a recommended option:

- Base it on common industry patterns, security best practices, or consistency with the codebase
- Consider what most users would expect in this context
- If multiple options are equally valid, recommend the safest or most reversible choice
- Mark only ONE option as recommended

## Acceptance Criteria Style

Write acceptance criteria that are testable and user-observable when possible. Use checkbox format:

```markdown
- [ ] **AC-01:** Users can request a password reset via email
- [ ] **AC-02:** Reset tokens expire after 30 minutes
- [ ] **AC-03:** Invalid tokens show a clear error message
```

Each criterion gets a unique ID (AC-01, AC-02, ...) for traceability through discovery, planning, and checks.

## Status Transition

- Set status to `specified` when the spec is useful enough for discovery.
- Set status to `draft` when major blocking questions remain.

## Output Artifacts

Create or update:

```
.lh/features/<feature-id>-<slug>/spec.md
.lh/state.json
```

Note: `events.jsonl` is auto-managed by LeanHarness hooks. Do not write to it.

## Final Response Format

Every `/lh-spec` run must end with:

- **Feature ID** — The assigned feature identifier
- **Spec path** — Full path to the spec file
- **Status** — `draft` or `specified`
- **Acceptance criteria summary** — List of AC IDs and short descriptions
- **Assumptions made** — Explicit assumptions recorded in the spec
- **Clarifying questions** — If any remain unanswered
- **Recommended next command** — `/new` then `/lh-discover <feature-id>`
