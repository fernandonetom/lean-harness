---
name: lh-discover
description: Perform LeanHarness on-demand discovery for an existing codebase and produce a focused change boundary. Use when the user invokes /lh-discover or needs relevant files, tests, commands, constraints, risks, and unknowns before planning.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, TaskCreate, TaskUpdate
---

# lh-discover

## Purpose

Produce a focused discovery report and change boundary for a feature. Discovery identifies only the files, tests, commands, constraints, risks, and unknowns relevant to the active feature. It avoids full-repo mapping.

## Inputs

Accept any of:

- Feature ID (e.g., `F001`)
- Feature folder path
- Raw feature request (only if no spec exists yet)
- File hints (e.g., "Start near src/billing")
- Area hints (e.g., "Focus on auth middleware")
- Risk hints (e.g., "Touches payment processing")

Examples:

```
/lh-discover F001
/lh-discover F001 --hint src/routes/auth.ts
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
| 1 | Read spec + config | Reading spec and config |
| 2 | D0 — Repo shape | Mapping repo shape |
| 3 | D1–D4 — Semantic discovery | Running semantic discovery |
| 4 | Write boundary | Writing boundary |
| 5 | Report | Reporting |

## Workflow

1. **Locate feature.** Find the feature folder under `.lh/features/`.
2. **Read spec.** Read `spec.md` for goal, acceptance criteria, and constraints.
3. **Read config.** Read `.lh/config.yml` for discovery settings and risk gates.
4. **Read memory.** Check relevant memory files:
   - `.lh/memory/project.md`
   - `.lh/memory/decisions.md`
   - `.lh/memory/patterns.md`
   - `.lh/memory/cave.md`
5. **Perform discovery.**
   - **Preferred:** Invoke the Agent tool with `subagent_type: "lh-scout"`, passing the feature ID, spec path, memory file paths, and any hints provided. Use the scout's structured output to populate the discovery artifacts in steps 7–8.
   - **Fallback (if `lh-scout` is unavailable, hits its turn limit, or returns incomplete results):** Explore directly in levels, starting at the configured default depth (usually D2):
     - **D0 — Repo shape:** Check for `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `Makefile`. Use `find` / `ls` for these config files only. Identify package manager, major folders, framework clues, and test command candidates.
     - **D1 — Seed files:** Check if `graphify-out/graph.json` exists. If yes, run `graphify query "<feature description>"` via Bash to find relevant files. If not, use Glob and Grep.
     - **D2 — Dependency boundary:** If graph exists, run `graphify query` for imports, callees, callers, tests, and utilities. Otherwise use Grep for import analysis.
     - **D3 — Risk probes:** If graph exists, run `graphify query` for auth, payment, and security-sensitive paths. Otherwise use Grep. Run focused test commands.
     - **D4 — Deep dive:** If graph exists, run `graphify query` for broader inspection. Only escalate when D0–D3 is insufficient.
6. **Stop when sufficient.** Stop when the change boundary is sufficient for a safe plan. Escalate only when the current boundary is insufficient.
7. **Write discovery.** Write `discovery.md` using `.lh/templates/discovery.md`.
8. **Write boundary.** Write `boundary.json` using `.lh/templates/boundary.json`.
9. **Update status.** Set feature status to `discovered` when sufficient.
10. **Report.** Present confidence and next action.

## On-Demand Discovery Rules

- Do not create a full repo map by default.
- Do not read large unrelated files.
- **D0 only:** Use `find` / `ls` for config file existence checks (package.json, pyproject.toml, go.mod, etc.).
- **D1–D4:** If `graphify-out/graph.json` exists, use `graphify query "<question>"` via Bash for semantic discovery. If not, use Glob and Grep.
- Prefer exact paths and commands.
- Record why each file is relevant.
- Mark confidence as `low`, `medium`, or `high`.
- If no tests are found, record that explicitly.
- If verification commands are unknown, record that explicitly.
- Use search (Glob, Grep, find) to identify candidate files before reading them.
- Read only enough of each file to confirm relevance.

## Risk Gate Triggers

Trigger risk gates (from `.lh/config.yml`) for:

- Auth rewrites (`auth_rewrite`)
- Payment logic (`payment_logic`)
- Destructive migrations (`destructive_migration`)
- New dependencies (`new_dependency`)
- Public API breaks (`public_api_break`)
- Broad refactors (`broad_refactor`)
- Security-sensitive changes (`security_sensitive_change`)

When a risk gate is triggered, record it in `discovery.md` under Risks Discovered and in `boundary.json` under `risk_gates_triggered`. The build step will pause for approval.

## Output Artifacts

Create or update:

```
.lh/features/<feature-id>-<slug>/discovery.md
.lh/features/<feature-id>-<slug>/boundary.json
.lh/features/<feature-id>-<slug>/events.jsonl
.lh/features/<feature-id>-<slug>/cavebus.log
```

## CaveBus Summary

Append a compact discovery summary to `cavebus.log` following `.lh/templates/cavebus-message.md` format. Example:

```
DISC F001 conf:med depth:D2
touch: src/routes/reset.ts, src/services/email.ts
read: src/middleware/auth.ts
tests: tests/routes/reset.test.ts
cmd: pnpm test, pnpm lint
risk: auth_rewrite
unknown: token storage mechanism
avoid: src/legacy/
next: plan
```

Use actual discovered values. Do not hardcode project-specific content.

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
- **Recommended next command** — `/lh-plan <feature-id>`
