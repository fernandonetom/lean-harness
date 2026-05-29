# Graphify Integration

LeanHarness uses [Graphify](https://graphify.net) for code graph navigation. Graphify is an LLM-powered knowledge graph tool that provides semantic search, neighbor traversal, and symbol lookup.

## Installation

Graphify is installed automatically during `lh init`. Requirements:

- Python 3.10 or later
- `pip` (comes with Python)

Manual install:

```bash
pip install graphifyy && graphify install          # Claude Code
graphify opencode install                          # OpenCode (additional step)
```

## How LeanHarness uses Graphify

Graphify replaces grep/glob for all D1–D4 discovery:

| Discovery Level | Method |
|----------------|--------|
| D0 — Repo shape | `find`/`ls` for config files (`package.json`, etc.) |
| D1 — Seed files | Graphify semantic search on the feature description |
| D2 — Dependency boundary | Graphify neighbor traversal from seed files |
| D3 — Risk probes | Graphify symbol lookup + targeted reads |
| D4 — Deep dive | Graphify relationship queries |

## Graph freshness

Graphify manages its own graph freshness. LeanHarness does not trigger graph builds. If Graphify reports a stale graph, follow its instructions to rebuild.

## Troubleshooting

**`graphify` command not found**
Run: `pip install graphifyy && graphify install`

**Python version error**
Graphify requires Python 3.10+. Check: `python3 --version`

**OpenCode integration missing**
Run: `graphify opencode install`
