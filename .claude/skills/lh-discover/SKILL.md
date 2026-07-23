---
name: lh-discover
description: Perform LeanHarness on-demand discovery for an existing codebase and produce a focused change boundary. Use when the user invokes /lh-discover or needs relevant files, tests, commands, constraints, risks, and unknowns before planning.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, Skill, TaskCreate, TaskUpdate, AskUserQuestion
---

# lh-discover

## Purpose

Produce a focused discovery report and change boundary for a feature using graphify. Discovery identifies only the files, tests, commands, constraints, risks, and unknowns relevant to the active feature. It avoids full-repo mapping.

All D1–D4 discovery is performed via the graphify skill — never via grep or glob.

## Inputs

Accept any of:

- Feature ID (e.g., \`F001\`)
- Feature folder path
- File hints (e.g., "Start near src/billing")
- Area hints (e.g., "Focus on auth middleware")
- Risk hints (e.g., "Touches payment processing")

Examples:

\`\`\`
/lh-discover F001
/lh-discover F001 --hint src/routes/auth.ts
\`\`\`

## Task Tooling

**On Claude Code:** As the very first action (before any Read, Bash, or other tool call), call TaskCreate for each step below all at once, so the user sees the full roadmap immediately. Before starting each step, call TaskUpdate to mark it in_progress. After completing each step, call TaskUpdate to mark it completed. Use the activeForm field as the spinner label.

**On OpenCode:** Before starting each step, emit a step header:

    ---
    **Step N/M — <Step Name>**

where N is the current step number and M is the total step count.

**Steps:**

| # | Subject | activeForm |
|---|---------|------------|
| 1 | Read spec + config + memory | Reading artifacts |
| 2 | Graphify — build or verify | Checking graph |
| 3 | D1 — Seed files via graphify | Querying graph for seed files |
| 4 | Coverage check + user prompt | Evaluating graph coverage |
| 5 | Conditional research — web + deeper discovery | Researching unknowns |
| 6 | D2–D3 — Dependency + risk probes | Traversal and risk probes |
| 7 | Risk gate review + user prompt | Reviewing risk areas |
| 8 | Aggregate → write artifacts | Writing discovery and boundary |
| 9 | Report | Reporting |

## Workflow

1. **Locate feature.** Find the feature folder under \`.lh/features/\`.
2. **Read spec.** Read \`spec.md\` for goal, acceptance criteria, constraints, and hints.
3. **Read config.** Read \`.lh/config.yml\` for discovery settings and risk gates.
4. **Read memory.** Check relevant memory files:
   - \`.lh/memory/project.md\`
   - \`.lh/memory/decisions.md\`
   - \`.lh/memory/patterns.md\`
   - \`.lh/memory/cave.md\`

### Step 2 — Graphify Setup

Check if graphify graph exists:

```bash
test -f graphify-out/graph.json && echo "exists" || echo "missing"
```

- **If missing:** Run \`Skill(skill: "graphify", args: "path .")\` to build the graph. This may take a while on large codebases — inform the user.
- **If present:** Continue to Step 3.

### Step 3 — D1 Seed Discovery via Graphify

Run the graphify skill to find seed files related to the feature:

```
Skill(skill: "graphify", args: "query: <feature description from spec.md>")
```

Use the feature's goal or title from \`spec.md\` as the query. Extract file paths and node labels from the graphify output.

### Step 4 — Coverage Check

Evaluate graphify results. Ask for graph update if:

- Fewer than 5 relevant files returned for D1
- Spec hints (\`--hint\` paths) are not represented in the results
- Graphify output indicates the relevant area may not be covered (e.g., a monorepo package not in the graph)

Use the \`AskUserQuestion\` tool:

\`\`\`json
{
  "header": "Graph coverage",
  "question": "The graph may be stale or incomplete for this feature. Rebuild it to get better results?",
  "options": [
    { "label": "Update graph (Recommended)", "description": "Run graphify --update to incrementally refresh. Better coverage, more accurate boundaries." },
    { "label": "Continue anyway", "description": "Proceed with the current graph. Results may be incomplete. Discovery confidence may be lower." }
  ]
}
\`\`\`
.lh/features/<feature-id>-<slug>/discovery.md
.lh/features/<feature-id>-<slug>/boundary.json
.lh/features/<feature-id>-<slug>/cavebus.log
\`\`\`

Note: \`events.jsonl\` is auto-managed by LeanHarness hooks. Do not write to it.

## CaveBus Summary

Append a compact discovery summary to \`cavebus.log\` following \`.lh/templates/cavebus-message.md\` format. Example:

```
DISC F001 conf:med depth:D2
touch:
- src/routes/reset.ts reason:reset flow entry point
- src/services/email.ts reason:email dispatch
read:
- src/middleware/auth.ts reason:middleware ordering
tests:
- tests/routes/reset.test.ts
risk:
- security_sensitive_change
unknown:
- token storage mechanism
next: plan
```

Use actual discovered values. Do not hardcode project-specific content.

## Non-Goals

- Discovery uses graphify directly for D1–D4.
- Do not implement the feature.
- Do not refactor code.
- Do not update dependencies.
- Do not create broad architecture maps.
- Do not mark the feature discovered unless the boundary is sufficient.

## Final Response Format

Every \`/lh-discover\` run must end with:

- **Feature ID** — The feature identifier
- **Discovery status** — \`discovered\` or \`insufficient\`
- **Confidence** — \`low\`, \`medium\`, or \`high\`
- **Likely touch files** — Files that will be modified
- **Read-only files** — Files needed for context but not changed
- **Relevant tests** — Test files and commands
- **Commands discovered** — Build, test, lint commands
- **Risk gates** — Triggered risk gates
- **Unknowns** — Unresolved questions about the codebase
- **Boundary path** — Path to \`boundary.json\`
- **NEXT SESSION block** — End every \`/lh-discover\` response with:

\`\`\`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  NEXT SESSION — Discovery complete
  Paste this to continue:

  /new
  /lh-plan <feature-id>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
\`\`\`
