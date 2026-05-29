---
description: Perform LeanHarness on-demand discovery for an existing codebase and produce a focused change boundary. Use when the user invokes /lh-discover or needs relevant files, tests, commands, constraints, risks, and unknowns before planning.
agent: lh-scout
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

## Workflow

1. **Locate feature.** Find the feature folder under `.lh/features/`.
2. **Read spec.** Read `spec.md` for goal, acceptance criteria, and constraints.
3. **Read config.** Read `.lh/config.yml` for discovery settings and risk gates.
4. **Read memory.** Check relevant memory files:
   - `.lh/memory/project.md`
   - `.lh/memory/decisions.md`
   - `.lh/memory/patterns.md`
   - `.lh/memory/cave.md`
5. **Perform discovery.** Explore in levels, starting at the configured default depth (usually D2):
   - **D0 — Repo shape:** Check for package.json, pyproject.toml, go.mod, Cargo.toml, Makefile using find/ls. Identify package manager, framework, and test commands.
   - **D1 — Seed files:** Use graphify semantic search with the feature description to identify relevant files. Do not use grep or glob for D1.
   - **D2 — Dependency boundary:** Use graphify neighbor traversal from D1 seeds to find imports, callees, tests, and utilities.
   - **D3 — Risk probes:** Use graphify symbol lookup for auth, payment, security paths. Run targeted test commands.
   - **D4 — Deep dive:** Use graphify relationship queries for broader inspection only when D0–D3 is insufficient.
6. **Stop when sufficient.** Stop when the change boundary is sufficient for a safe plan. Escalate only when the current boundary is insufficient.
7. **Write discovery.** Write `discovery.md` using `.lh/templates/discovery.md`.
8. **Write boundary.** Write `boundary.json` using `.lh/templates/boundary.json`.
9. **Update status.** Set feature status to `discovered` when sufficient.
10. **Report.** Present confidence and next action.

## On-Demand Discovery Rules

- Do not create a full repo map by default.
- Do not read large unrelated files.
- Prefer exact paths and commands.
- Record why each file is relevant.
- Mark confidence as `low`, `medium`, or `high`.
- If no tests are found, record that explicitly.
- If verification commands are unknown, record that explicitly.
- Use graphify for D1–D4. Do not use grep or glob for graph-aware discovery.
- D0 only: use find/ls for config file existence checks.
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
- **NEXT SESSION block** — End every `/lh-discover` response with:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  NEXT SESSION — Discovery complete
  Paste this to continue:

  /lh-plan <feature-id>
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```