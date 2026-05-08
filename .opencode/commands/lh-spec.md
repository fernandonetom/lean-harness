---
description: Create or update a LeanHarness feature specification from a user request. Use when the user invokes /lh-spec or wants to define goal, non-goals, acceptance criteria, constraints, assumptions, and verification expectations before implementation.
agent: lh-builder
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

Ask questions only when:

- The request is impossible to interpret safely
- Acceptance criteria would be contradictory
- The user asks for a high-risk change but intent is unclear
- A legal, security, payment, or auth decision is required

Otherwise proceed with explicit assumptions and record them in the spec under Assumptions or Notes.

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

Optionally create:

```
.lh/features/<feature-id>-<slug>/events.jsonl
```

## Final Response Format

Every `/lh-spec` run must end with:

- **Feature ID** — The assigned feature identifier
- **Spec path** — Full path to the spec file
- **Status** — `draft` or `specified`
- **Acceptance criteria summary** — List of AC IDs and short descriptions
- **Assumptions made** — Explicit assumptions recorded in the spec
- **Clarifying questions** — If any remain unanswered
- **NEXT SESSION block** — End every `/lh-spec` response with:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  NEXT SESSION — Spec complete
  Paste this to continue:

  /lh-discover <feature-id>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```