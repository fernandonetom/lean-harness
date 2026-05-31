---
description: Perform LeanHarness on-demand discovery for an existing codebase and produce a focused change boundary. Use when the user invokes /lh-discover or needs relevant files, tests, commands, constraints, risks, and unknowns before planning.
agent: none
---

# lh-discover

## Purpose

Produce a focused discovery report and change boundary for a feature using graphify. Discovery identifies only the files, tests, commands, constraints, risks, and unknowns relevant to the active feature. It avoids full-repo mapping.

All D1–D4 discovery is performed via graphify — never via grep, glob, or a scout agent.

## Inputs

Accept any of:

- Feature ID (e.g., `F001`)
- Feature folder path
- File hints (e.g., "Start near src/billing")
- Area hints (e.g., "Focus on auth middleware")
- Risk hints (e.g., "Touches payment processing")

Examples:

```
/lh-discover F001
/lh-discover F001 --hint src/routes/auth.ts
```

## Phase Detection

Before running, inspect the feature folder:

| Artifacts present | Action |
|---|---|
| No `spec.md` | Stop — run `/lh-spec` first |
| `spec.md` only | Continue with discovery |
| `discovery.md` + `boundary.json` | Discovery already done — report and suggest `/lh-plan` |

---

## Steps

| # | Subject |
|---|---------|
| 1 | Read spec + config + memory |
| 2 | Graphify — build or verify |
| 3 | D1 — Seed files via graphify |
| 4 | Coverage check + user prompt |
| 5 | Conditional research — web + deeper discovery |
| 6 | D2–D3 — Dependency + risk probes |
| 7 | Risk gate review + user prompt |
| 8 | Aggregate → write artifacts |
| 9 | Report |

---

## Workflow

1. **Locate feature.** Find the feature folder under `.lh/features/`.
2. **Read spec.** Read `spec.md` for goal, acceptance criteria, constraints, and hints.
3. **Read config.** Read `.lh/config.yml` for discovery settings and risk gates.
4. **Read memory.** Check relevant memory files:
   - `.lh/memory/project.md`
   - `.lh/memory/decisions.md`
   - `.lh/memory/patterns.md`
   - `.lh/memory/cave.md`

### Step 2 — Graphify Setup

Check if graphify graph exists:

```bash
test -f graphify-out/graph.json && echo "exists" || echo "missing"
```

- **If missing:** Run `graphify .` to build the graph. This may take a while on large codebases — inform the user.
- **If present:** Continue to Step 3.

### Step 3 — D1 Seed Discovery via Graphify

Run graphify to find seed files related to the feature:

```bash
graphify query "<feature description from spec.md>"
```

Use the feature's goal or title from `spec.md` as the query. Extract file paths and node labels from the graphify output.

### Step 4 — Coverage Check

Evaluate graphify results. Ask for graph update if:

- Fewer than 5 relevant files returned for D1
- Spec hints (`--hint` paths) are not represented in the results
- Graphify output indicates the relevant area may not be covered (e.g., a monorepo package not in the graph)

Ask the user:

> **[Graph coverage]:** The graph may be stale or incomplete for this feature. Rebuild it to get better results?
> 1. **Update graph (Recommended)** — Run `graphify --update` to incrementally refresh. Better coverage, more accurate boundaries.
> 2. **Continue anyway** — Proceed with the current graph. Results may be incomplete. Discovery confidence may be lower.

If the user selects "Update graph":

```bash
graphify --update
```

Then re-run the D1 query from Step 3. If results are still sparse after update, record the gap as an `unknown` in the discovery report and proceed.

### Step 5 — Conditional Research

After initial graphify discovery, evaluate whether additional research is needed. **Ask the user if research should proceed** — never assume. Use the question format with AI-recommended options.

**Research triggers — ask the user for each applicable case:**

#### A. Unknown libraries or dependencies

If the spec or discovery mentions external libraries, packages, or services not in the project:

> **[Library research]:** Found unknown library/package `xyz`. Should I research its documentation and patterns online?
> 1. **Yes — research library (Recommended)** — Look up the library's API, best practices, and common patterns. Update the discovery with findings.
> 2. **No — skip research** — Proceed with assumptions. Discovery confidence may be lower.
> 3. **Specify focus** — Tell me specifically what to research about this library.

#### B. Low confidence or sparse results

If D1 returned fewer than 5 files or confidence is `low`:

> **[Discovery depth]:** Initial discovery found only X files with low confidence. Should I deepen the search?
> 1. **Yes — deepen to D3/D4 (Recommended)** — Run more comprehensive graph queries. Better boundary accuracy.
> 2. **No — add hint paths** — Skip deepening. Provide hint paths to narrow focus.
> 3. **No — proceed as-is** — Continue with current results. Record confidence as `low`.

#### C. Unknown tech stack after D0

If D0 shows unfamiliar package managers, frameworks, or tooling:

> **[Tech stack]:** Found unfamiliar tech stack: `xyz`. Should I research it online?
> 1. **Yes — research tech stack (Recommended)** — Look up patterns, conventions, and best practices for this stack.
> 2. **No — use common patterns** — Proceed with standard conventions. May need adjustments later.
> 3. **Specify** — Tell me what aspects to research specifically.

#### D. Many unknowns or gaps

If the unknowns count exceeds 3:

> **[Unknowns]:** Found X unresolved questions. Should I research these before proceeding?
> 1. **Yes — research unknowns (Recommended)** — Investigate each unknown to reduce risk and improve planning.
> 2. **No — document and proceed** — Record unknowns in discovery. Planning will need to handle gaps.
> 3. **Specify priorities** — Tell me which unknowns to focus on first.

**How to perform web research:**

When the user approves research, use web search/fetch to find:

- Library documentation and API references
- Best practices and common patterns
- Security considerations for the technology
- Integration patterns with popular frameworks
- Version compatibility and migration guides

Record findings in the discovery report under each relevant section.

### Step 6 — D2 Dependency Boundary + D3 Risk Probes

**D2 — Dependency boundary:** Run graphify to find import relationships and callers:

```bash
graphify query "<seed concept from D1 results> callers imports dependencies"
```

Distinguish likely-touch files from read-only reference files using graphify relationship data.

**D3 — Risk probes:** For auth, payment, permissions, or other security-sensitive paths detected in the spec:

```bash
graphify path "<conceptA>" "<conceptB>"
graphify explain "<symbol>"
```

Also run targeted test commands to detect failures in risk-relevant areas.

### Step 7 — Risk Gate Review

After completing D2-D3 discovery, check if any risk gates were triggered:

> **[Risk review]:** Found X risk areas: `risk-gate-1`, `risk-gate-2`. Should I research these risks before proceeding to planning?
> 1. **Yes — research risks (Recommended)** — Look up security implications, best practices, and potential pitfalls for these risk areas.
> 2. **No — acknowledge and proceed** — Record risks in discovery. Planning will handle them.
> 3. **Specify focus** — Tell me which risk areas to investigate specifically.

When the user approves research, use web search/fetch to find:

- Security implications and common vulnerabilities
- Best practices for the specific risk category
- Implementation patterns that mitigate the risk
- Recent CVEs or issues related to the technology

### Step 8 — Aggregate and Write Artifacts

From all graphify results, classify files into:

- **touch** — files likely to be modified (high graph connectivity, related to core feature)
- **read** — files needed for context but not modified (utilities, config, shared code)
- **tests** — test files and commands
- **avoid** — areas outside scope or do-not-touch zones

Identify risk gates from `.lh/config.yml` based on paths touched.

Write `discovery.md` using `.lh/templates/discovery.md`.
Write `boundary.json` using `.lh/templates/boundary.json`.

### Step 9 — Append CaveBus + Report

Append a compact discovery summary to `cavebus.log` following `.lh/templates/cavebus-message.md`:

```
DISC <FEATURE_ID> conf:<low|med|high> depth:<D0-D4>
touch:
- <file> reason:<why relevant>
read:
- <file> reason:<why relevant>
tests:
- <test file or command>
risk:
- <triggered risk gate or none>
unknown:
- <any coverage gaps or unresolved questions>
next: plan
```

Then present the final report.

## Discovery Rules

- **Graphify is mandatory for D1–D4.** Use `graphify query`, `graphify path`, `graphify explain` exclusively. Do not use grep or glob for discovery.
- **D0 only:** Use `find` / `ls` for config file existence checks (package.json, pyproject.toml, go.mod, etc.).
- Prefer exact paths and commands.
- Record why each file is relevant.
- Mark confidence as `low`, `medium`, or `high` based on graph coverage.
- If no tests are found, record that explicitly.
- If verification commands are unknown, record that explicitly.
- If graphify returns no results for a hint path, record it as an `unknown` — do not silently skip hints.
- Do not create a full repo map by default.
- Do not re-read source files to re-derive what graphify already found.

## Risk Gate Triggers

Trigger risk gates (from `.lh/config.yml`) for:

- Auth rewrites (`auth_rewrite`)
- Payment logic (`payment_logic`)
- Destructive migrations (`destructive_migration`)
- New dependencies (`new_dependency`)
- Public API breaks (`public_api_break`)
- Broad refactors (`broad_refactor`)
- Security-sensitive changes (`security_sensitive_change`)

When a risk gate is triggered, record it in `discovery.md` and in `boundary.json` under `risk_gates_triggered`.

## Output Artifacts

Create or update:

```
.lh/features/<feature-id>-<slug>/discovery.md
.lh/features/<feature-id>-<slug>/boundary.json
.lh/features/<feature-id>-<slug>/cavebus.log
```

Note: `events.jsonl` is auto-managed by LeanHarness hooks. Do not write to it.

## CaveBus Summary

Append a compact discovery summary to `cavebus.log` following `.lh/templates/cavebus-message.md` format. Example:

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

- Do not use a scout agent for discovery.
- Do not implement the feature.
- Do not refactor code.
- Do not update dependencies.
- Do not create broad architecture maps.
- Do not mark the feature discovered unless the boundary is sufficient.

## Final Response Format

Every `/lh-discover` run must end with:

- **Feature ID** — The feature identifier
- **Discovery status** — `discovered` or `insufficient`
- **Confidence** — `low`, `medium`, or `high`
- **Likely touch files** — Files that will be modified
- **Read-only files** — Files needed for context but not changed
- **Relevant tests** — Test files and commands
- **Commands discovered** — Build, test, lint commands
- **Risk gates** — Triggered risk gates
- **Unknowns** — Unresolved questions about the codebase
- **Boundary path** — Path to `boundary.json`
- **NEXT SESSION block** — End every `/lh-discover` response with:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  NEXT SESSION — Discovery complete
  Paste this to continue:

  /new
  /lh-plan <feature-id>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```