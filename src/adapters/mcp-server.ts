import readline from "node:readline";
import { loadImportGraph, graphNeighborhood, graphBoundaryClose } from "../graph/import-graph.js";
import { loadSymbolGraph, findSymbol } from "../graph/symbol-graph.js";
import { queryKnowledge } from "../graph/knowledge-graph.js";
import type { SymbolKind } from "../graph/symbol-graph.js";
import type { KnowledgeKind } from "../graph/knowledge-graph.js";

const SERVER_INFO = { name: "leanharness", version: "0.1.0" };

const TOOLS = [
  {
    name: "lh_graph_neighborhood",
    description: "Find graph neighbors of given files (imports and importers) up to maxDepth hops.",
    inputSchema: {
      type: "object",
      properties: {
        paths: { type: "array", items: { type: "string" }, description: "Relative file paths to start from" },
        maxDepth: { type: "number", description: "Max hops (default: 2)" },
      },
      required: ["paths"],
    },
  },
  {
    name: "lh_symbol_lookup",
    description: "Find all files that declare a given symbol name (class, function, interface, etc).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Symbol name to search for" },
        kind: { type: "string", enum: ["class", "interface", "function", "const", "type", "enum"], description: "Optional symbol kind filter" },
      },
      required: ["name"],
    },
  },
  {
    name: "lh_boundary_gaps",
    description: "Find files imported by touch files that are not in the current boundary (closure gaps).",
    inputSchema: {
      type: "object",
      properties: {
        touchFiles: { type: "array", items: { type: "string" }, description: "Current boundary touch files (relative paths)" },
      },
      required: ["touchFiles"],
    },
  },
  {
    name: "lh_knowledge_query",
    description: "Look up cross-feature knowledge nodes related to given file paths.",
    inputSchema: {
      type: "object",
      properties: {
        relatedFiles: { type: "array", items: { type: "string" }, description: "File paths to find related knowledge for" },
        kinds: { type: "array", items: { type: "string" }, description: "Optional filter: pattern, decision, constraint, convention, failure" },
      },
      required: ["relatedFiles"],
    },
  },
];

function send(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function errorResponse(id: unknown, code: number, message: string): void {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

export async function runMcpServer(root: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    type Msg = { jsonrpc?: string; id?: unknown; method?: string; params?: unknown };
    let msg: Msg | null = null;
    try {
      msg = JSON.parse(trimmed) as Msg;
    } catch {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      continue;
    }

    if (!msg) continue;

    const id: unknown = msg.id;
    const method: string | undefined = msg.method;
    const params: unknown = msg.params;

    if (method === "initialize") {
      send({
        jsonrpc: "2.0", id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        },
      });
      continue;
    }

    if (method === "notifications/initialized" || method?.startsWith("notifications/")) continue;

    if (method === "ping") { send({ jsonrpc: "2.0", id, result: {} }); continue; }

    if (method === "tools/list") {
      send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
      continue;
    }

    if (method === "tools/call") {
      const p = params as { name?: string; arguments?: Record<string, unknown> };
      const toolName = p?.name;
      const args = p?.arguments ?? {};

      try {
        const text = await callTool(root, toolName ?? "", args);
        send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text }] } });
      } catch (err) {
        errorResponse(id, -32603, String(err));
      }
      continue;
    }

    errorResponse(id, -32601, `Method not found: ${method}`);
  }
}

async function callTool(root: string, name: string, args: Record<string, unknown>): Promise<string> {
  if (name === "lh_graph_neighborhood") {
    const graph = await loadImportGraph(root);
    if (!graph) return "No import graph found. Run: lh graph build";
    const paths = args["paths"] as string[];
    const maxDepth = typeof args["maxDepth"] === "number" ? args["maxDepth"] : 2;
    const result = graphNeighborhood(graph, paths, maxDepth);
    const entries = Object.entries(result.hops)
      .sort((a, b) => a[1] - b[1])
      .map(([p, hops]) => `${p} (${hops} hop${hops !== 1 ? "s" : ""})`);
    return `Graph neighborhood (${entries.length} files):\n${entries.join("\n")}`;
  }

  if (name === "lh_symbol_lookup") {
    const graph = await loadSymbolGraph(root);
    if (!graph) return "No symbol graph found. Run: lh graph build";
    const symbolName = args["name"] as string;
    const kind = args["kind"] as SymbolKind | undefined;
    const results = findSymbol(graph, symbolName, kind);
    if (results.length === 0) return `No symbol "${symbolName}" found.`;
    return `Symbol "${symbolName}" found in:\n${results.map((s) => `  ${s.filePath}:${s.line ?? "?"} (${s.kind})`).join("\n")}`;
  }

  if (name === "lh_boundary_gaps") {
    const graph = await loadImportGraph(root);
    if (!graph) return "No import graph found. Run: lh graph build";
    const touchFiles = args["touchFiles"] as string[];
    const gaps = graphBoundaryClose(graph, touchFiles);
    if (gaps.length === 0) return "No closure gaps found.";
    return `Closure gaps (${gaps.length}):\n${gaps.map((g) => `  ${g.path}\n    required by: ${g.requiredBy.join(", ")}`).join("\n")}`;
  }

  if (name === "lh_knowledge_query") {
    const relatedFiles = args["relatedFiles"] as string[];
    const kinds = args["kinds"] as KnowledgeKind[] | undefined;
    const nodes = await queryKnowledge(root, relatedFiles, kinds);
    if (nodes.length === 0) return "No relevant knowledge nodes found.";
    return nodes
      .slice(0, 8)
      .map((n) => `[${n.kind}] ${n.title} (${n.featureId})\n  ${n.body.slice(0, 200)}`)
      .join("\n\n");
  }

  throw new Error(`Unknown tool: ${name}`);
}
