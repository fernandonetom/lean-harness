# Design: Graphify Skill Integration

**Date:** 2026-05-29  
**Branch:** `feature/graphify-skill`  
**Status:** Approved

## Goal

Replace LeanHarness's internal graph system with [Graphify](https://graphify.net), a Python-based LLM-powered knowledge graph tool. Graphify is installed during `lh init` and integrated via agent skills. The internal graph (`src/graph/`) is fully removed. Discovery uses graphify exclusively for D1–D4 graph traversal.

## Non-goals

- Supporting graphify's CLI for graph querying (CLI requires LLM tokens; skill-based integration is used instead)
- Keeping any part of the internal graph system (`src/graph/`, `graph-scorer.ts`, MCP server)
- Building the graph on a schedule or on a trigger from LeanHarness (graphify manages its own freshness)

## Acceptance Criteria

- [ ] **AC-01:** `lh init` checks for Python ≥ 3.10 and aborts with clear instructions if not met
- [ ] **AC-02:** `lh init` checks if graphify is already installed before attempting to install it
- [ ] **AC-03:** `lh init` installs graphify via `pip install graphifyy && graphify install` when not already present
- [ ] **AC-04:** `lh init --host opencode` and `lh init --host all` run `graphify opencode install` after the base install
- [ ] **AC-05:** All internal graph source files are deleted (`src/graph/`, `src/discovery/graph-scorer.ts`, `src/adapters/mcp-server.ts`, `src/commands/graph.ts`)
- [ ] **AC-06:** All internal graph tests are deleted (`tests/graph/`, `tests/discovery/graph-scorer.test.ts`)
- [ ] **AC-07:** The `graph:` section is removed from the default `.lh/config.yml` template
- [ ] **AC-08:** `docs/graph.md` is replaced with a graphify integration guide
- [ ] **AC-09:** The `lh-discover` Claude Code skill uses graphify for D1–D4; D0 retains minimal file existence checks
- [ ] **AC-10:** The `lh-discover` OpenCode command uses graphify for D1–D4
- [ ] **AC-11:** The `lh-scout` agent prompt (Claude Code + OpenCode) references graphify as the primary graph tool
- [ ] **AC-12:** All existing tests pass after graph removal (no broken imports or references)

## Constraints

- Graphify installation is **required**, not optional. `lh init` fails clearly if Python check or install fails.
- The `/graphify` skill is owned by graphify's installer — LeanHarness does not bundle or maintain it.
- LeanHarness does not trigger graph builds; graphify handles its own freshness.
- D0 discovery (repo shape detection) retains `find`/`ls` for config file checks — this is not graph traversal.

## Assumptions

- `graphify --version` is the correct command to detect an existing graphify installation.
- `pip install graphifyy` (double-y) is the correct PyPI package name.
- `graphify install` sets up the Claude Code skill integration.
- `graphify opencode install` sets up the OpenCode integration and is idempotent.
- The `/graphify` skill (installed by graphify) is invokable from the `lh-discover` skill via skill delegation.

## Architecture

### Init installation flow

```
lh init --host <claude-code|opencode|all>
  │
  ├─ 1. python3 --version → fail if < 3.10
  │
  ├─ 2. graphify --version → if installed, skip to step 4
  │
  ├─ 3. pip install graphifyy && graphify install
  │
  └─ 4. if host == opencode or all:
           graphify opencode install
```

### Discovery flow (updated)

| Level | Method |
|-------|--------|
| D0 — Repo shape | `find`/`ls` for `package.json`, `pyproject.toml`, `go.mod`, etc. |
| D1 — Seed files | graphify semantic search on the feature description |
| D2 — Dependency boundary | graphify neighbor traversal from seed files |
| D3 — Risk probes | graphify symbol lookup + targeted reads |
| D4 — Deep dive | graphify relationship queries |

### Files removed

**Source:**
- `src/graph/import-graph.ts`
- `src/graph/symbol-graph.ts`
- `src/graph/knowledge-graph.ts`
- `src/graph/export.ts`
- `src/graph/index.ts`
- `src/discovery/graph-scorer.ts`
- `src/adapters/mcp-server.ts`
- `src/commands/graph.ts`

**Tests:**
- `tests/graph/import-graph.test.ts`
- `tests/graph/knowledge-graph.test.ts`
- `tests/graph/symbol-graph.test.ts`
- `tests/discovery/graph-scorer.test.ts`

**Config/docs:**
- `graph:` section from `.lh/config.yml` default template (in `src/core/config.ts`)
- `docs/graph.md` → replaced with graphify integration guide

### Files changed

| File | Change |
|------|--------|
| `src/commands/init.ts` | Add graphify installation phase (Python check, install, host-specific setup) |
| `src/commands/init-claude-code.ts` | Update `lh-discover` skill and `lh-scout` agent with graphify steps |
| `src/core/config.ts` | Remove `graph:` from `createDefaultConfigYaml()` |
| `src/cli.ts` | Remove `runGraphCommand`, `runMcpServer` imports and `mcp-server` case |
| `src/discovery/index.ts` | Remove `ensureGraphBuilt`, `LHImportGraph`, `applyGraphScoring` imports and usage |
| `src/discovery/boundary.ts` | Remove `LHImportGraph` and `graphBoundaryClose` imports and usage |
| `src/context/compiler.ts` | Remove `queryKnowledge`, `renderKnowledgeSection`, `KnowledgeNode` imports and usage |
| `src/memory/index.ts` | Remove `knowledge-graph` imports and usage |
| `src/commands/doctor.ts` | Remove `ensureGraphBuilt` import and graph health check step |
| `docs/graph.md` | Replace with graphify integration guide |

## Risk notes

- **Graphify availability at init time:** If the user's network is unavailable, `pip install` will fail. Error message must be clear with manual install instructions.
- **Graphify API changes:** The `/graphify` skill interface is owned by graphify. If they change their skill interface, the `lh-discover` instructions may become stale. This is accepted — LH does not own graphify.
- **Removal of MCP tools:** Agents that currently rely on `lh_graph_neighborhood`, `lh_symbol_lookup`, `lh_boundary_gaps`, `lh_knowledge_query` will lose those tools. The graphify skill replaces this capability.

## Verification

```bash
# Python check
python3 --version

# Graphify install check
graphify --version

# Unit tests pass after graph removal
npm test

# Type check passes
npm run typecheck

# No broken imports from removed graph modules
npm run lint
```
