# Graph System

LeanHarness maintains a code graph for smarter discovery and bounded context.

## Overview

The graph system tracks:
- **Import relationships** between files
- **Symbol declarations** (classes, functions, interfaces)
- **Cross-feature knowledge** (patterns, decisions, constraints)

## Commands

```bash
lh graph build          # Build graphs from scratch
lh graph update         # Incremental update (detects changes)
lh graph inspect        # Show graph statistics
lh graph clear          # Remove graph files
lh mcp-server           # Start MCP server for agent access
```

## Architecture

### Import Graph
- **Location:** `.lh/graph/import-graph.json`
- **Purpose:** File-level dependency tracking
- **Edges:** import, require, dynamic import
- **Used by:** Discovery scoring, boundary gap detection

### Symbol Graph
- **Location:** `.lh/graph/symbol-graph.json`
- **Purpose:** Symbol-level code tracking
- **Nodes:** class, interface, function, const, type, enum, method, property
- **Edges:** implements, extends, calls, references, uses
- **Used by:** Symbol lookup, code navigation, call graph analysis
- **Extraction:** TypeScript AST-based (accurate, handles all TS/JS syntax)

### Knowledge Graph
- **Location:** `.lh/graph/knowledge-graph.json`
- **Purpose:** Cross-feature knowledge tracking
- **Nodes:** pattern, decision, constraint, convention, failure
- **Edges:** uses-pattern, contradicts, extends, replaces, related-to
- **Used by:** Context compiler, memory system

## How Discovery Uses the Graph

During discovery (D2+ depth), the graph is used to:

1. **Score candidates** — Files near seed files get boosted scores
2. **Find closure gaps** — Files imported by touch files are suggested
3. **Expand boundary** — Neighborhood traversal finds related files

Example:
```
Seed: src/auth/login.ts
1-hop: src/auth/service.ts, src/auth/types.ts
2-hop: src/database/user-repo.ts, src/utils/crypto.ts

Discovery boosts scores for all neighborhood files.
```

## MCP Server

The MCP server exposes graph tools to agents:

### lh_graph_neighborhood
Find import neighbors of given files.

```json
{
  "name": "lh_graph_neighborhood",
  "arguments": {
    "paths": ["src/auth/login.ts"],
    "maxDepth": 2
  }
}
```

### lh_symbol_lookup
Find symbol declarations.

```json
{
  "name": "lh_symbol_lookup",
  "arguments": {
    "name": "AuthService",
    "kind": "interface"
  }
}
```

### lh_boundary_gaps
Find missing imports in boundary.

```json
{
  "name": "lh_boundary_gaps",
  "arguments": {
    "touchFiles": ["src/auth/login.ts", "src/auth/service.ts"]
  }
}
```

### lh_knowledge_query
Query cross-feature knowledge.

```json
{
  "name": "lh_knowledge_query",
  "arguments": {
    "relatedFiles": ["src/auth/login.ts"],
    "kinds": ["pattern", "decision"]
  }
}
```

## Performance

### Build Time
- Small projects (<100 files): <5s
- Medium projects (100-500 files): 10-30s
- Large projects (500+ files): 30-60s

### Update Time
- Incremental updates are 5-10x faster than full rebuild
- Git-based caching reduces update time further

### Memory
- Import graph: ~1MB per 1000 files
- Symbol graph: ~500KB per 1000 files
- Knowledge graph: ~100KB per feature

## Troubleshooting

### Graph is empty
**Cause:** All files were skipped or binary-only corpus  
**Fix:** Check file extensions, ensure source files exist

### Symbol lookup returns nothing
**Cause:** Regex patterns don't match your code style  
**Fix:** Verify symbol extraction patterns support your code style

### Discovery misses files
**Cause:** Graph not built or outdated  
**Fix:** Run `lh graph update` or `lh doctor --fix`

### MCP tools not available
**Cause:** MCP server not started  
**Fix:** Run `lh mcp-server` or add to OpenCode config

## Graphify vs Internal Graph

LeanHarness has two graph systems:

**Internal graph** (`lh graph`):
- Fast, deterministic import/symbol tracking
- Used by discovery and context compiler
- Works with both Claude Code and OpenCode
- No external dependencies

**Graphify** (`/graphify` skill):
- LLM-powered semantic extraction
- Multi-format (code, docs, images, video)
- Community detection and visualization
- Claude Code only (via skill)
- Requires Python and `graphify` package

**When to use each:**

Use **internal graph** for:
- Daily feature work
- Discovery and boundary scoring
- Symbol lookup during implementation
- MCP tool access from agents

Use **graphify** for:
- Deep codebase exploration
- Understanding cross-cutting concerns
- Visual graph exploration
- Multi-format corpora (code + docs + papers)
