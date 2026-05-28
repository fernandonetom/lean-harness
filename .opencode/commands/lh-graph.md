## Graph Exploration

Use the graph-explorer agent to explore the code graph.

### Common queries

1. **Find dependencies:**
   "What files does src/auth/login.ts import?"

2. **Find dependents:**
   "What files import src/utils/helpers.ts?"

3. **Find symbol:**
   "Where is AuthService defined?"

4. **Find implementations:**
   "What classes implement the Repository interface?"

5. **Find boundary gaps:**
   "Are there any missing imports in the current boundary?"

### Graph commands

```bash
lh graph build          # Build/rebuild the graph
lh graph update         # Incremental update
lh graph inspect        # Show statistics
lh graph clear          # Remove graph files
```

### MCP tools

The graph-explorer agent has access to these MCP tools via the leanharness MCP server:

- `lh_graph_neighborhood` - Find import neighbors
  - Arguments: `{ paths: string[], maxDepth?: number }`
  - Returns: `{ paths: string[], hops: Record<string, number> }`

- `lh_symbol_lookup` - Find symbol declarations
  - Arguments: `{ name: string, kind?: string }`
  - Returns: `{ symbols: SymbolNode[] }`

- `lh_boundary_gaps` - Find closure gaps
  - Arguments: `{ touchFiles: string[] }`
  - Returns: `{ gaps: string[] }`

- `lh_knowledge_query` - Query patterns/decisions
  - Arguments: `{ relatedFiles?: string[], kinds?: string[] }`
  - Returns: `{ nodes: KnowledgeNode[] }`

### When to use

- During discovery (D2+ depth) to find related files
- Before planning to understand dependencies
- During implementation to find symbol definitions
- When expanding change boundaries
