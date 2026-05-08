import path from "node:path";
import fsp from "node:fs/promises";
import { readJsonFile, writeJsonFile, ensureDir, fileExists, readTextFile } from "../core/fs.js";
import { harnessPath } from "../core/paths.js";

export interface GraphNode {
  path: string;
  kind: "source" | "test" | "config" | "docs" | "unknown";
  symbols: string[];
  size: number;
  lastModified: string;
  importCount: number;
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: "import" | "dynamic" | "require";
  symbol?: string | undefined;
}

export interface LHImportGraph {
  version: string;
  builtAt: string;
  rootDir: string;
  nodeCount: number;
  edgeCount: number;
  nodes: Record<string, GraphNode>;
  edges: GraphEdge[];
}

export interface GraphNeighborhoodResult {
  paths: string[];
  hops: Record<string, number>;
}

const GRAPH_FILE = "graph/import-graph.json";
const GRAPH_VERSION = "1";

const SKIP_DIRS = new Set([
  "node_modules", "dist", "build", "coverage", ".next", ".nuxt",
  ".svelte-kit", ".turbo", ".cache", "out", "vendor", "target",
  ".git", ".lh", ".claude", ".opencode",
]);

const SOURCE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"]);
const TEST_PATTERNS = /\.(test|spec)\.[tj]sx?$|__tests__/;
const CONFIG_PATTERNS = /\.(json|ya?ml|toml|config\.[tj]s)$/;

const IMPORT_PATTERNS = [
  /(?:^|\n)\s*import\s+(?:[^'"]*from\s+)?['"]([^'"]+)['"]/g,
  /(?:^|\n)\s*(?:const|let|var)\s+\w+\s*=\s*require\(['"]([^'"]+)['"]\)/g,
  /(?:^|\n)\s*export\s+(?:[^'"]*from\s+)?['"]([^'"]+)['"]/g,
  /import\(['"]([^'"]+)['"]\)/g,
];

export function graphPath(root: string): string {
  return harnessPath(root, GRAPH_FILE);
}

export async function loadImportGraph(root: string): Promise<LHImportGraph | null> {
  return readJsonFile<LHImportGraph>(graphPath(root));
}

export async function saveImportGraph(root: string, graph: LHImportGraph): Promise<void> {
  const p = graphPath(root);
  await ensureDir(path.dirname(p));
  await writeJsonFile(p, graph, { overwrite: true });
}

export async function buildImportGraph(root: string): Promise<LHImportGraph> {
  const nodes: Record<string, GraphNode> = {};
  const edges: GraphEdge[] = [];
  const edgeSet = new Set<string>();

  await walkDir(root, root, nodes);

  const filePaths = Object.keys(nodes);
  for (const filePath of filePaths) {
    const absPath = path.resolve(root, filePath);
    const content = await readTextFile(absPath);
    if (!content) continue;

    const imports = extractImports(content);
    for (const imp of imports) {
      const resolved = resolveImport(imp.specifier, filePath, root, nodes);
      if (!resolved) continue;

      const edgeKey = `${filePath}→${resolved}:${imp.kind}`;
      if (edgeSet.has(edgeKey)) continue;
      edgeSet.add(edgeKey);

      edges.push({ from: filePath, to: resolved, kind: imp.kind });

      if (nodes[resolved]) {
        nodes[resolved]!.importCount++;
      }
    }
  }

  const graph: LHImportGraph = {
    version: GRAPH_VERSION,
    builtAt: new Date().toISOString(),
    rootDir: root,
    nodeCount: Object.keys(nodes).length,
    edgeCount: edges.length,
    nodes,
    edges,
  };

  return graph;
}

export async function updateImportGraph(root: string, existing: LHImportGraph): Promise<LHImportGraph> {
  const staleFiles = new Set<string>();
  const newFiles = new Set<string>();

  const freshNodes: Record<string, GraphNode> = {};
  await walkDir(root, root, freshNodes);

  for (const filePath of Object.keys(freshNodes)) {
    const prev = existing.nodes[filePath];
    const curr = freshNodes[filePath]!;
    if (!prev || prev.lastModified !== curr.lastModified) {
      staleFiles.add(filePath);
    }
  }
  for (const filePath of Object.keys(freshNodes)) {
    if (!existing.nodes[filePath]) newFiles.add(filePath);
  }

  if (staleFiles.size === 0 && newFiles.size === 0) return existing;

  const changedFiles = new Set([...staleFiles, ...newFiles]);
  const nodes = { ...existing.nodes };
  for (const fp of Object.keys(freshNodes)) {
    nodes[fp] = freshNodes[fp]!;
  }
  for (const fp of Object.keys(existing.nodes)) {
    if (!freshNodes[fp]) delete nodes[fp];
  }

  const retainedEdges = existing.edges.filter(
    (e) => !changedFiles.has(e.from) && nodes[e.to],
  );
  for (const fp of Object.values(nodes)) {
    fp.importCount = 0;
  }
  for (const e of retainedEdges) {
    if (nodes[e.to]) nodes[e.to]!.importCount++;
  }

  const newEdges: GraphEdge[] = [...retainedEdges];
  const edgeSet = new Set(retainedEdges.map((e) => `${e.from}→${e.to}:${e.kind}`));

  for (const filePath of changedFiles) {
    if (!nodes[filePath]) continue;
    const absPath = path.resolve(root, filePath);
    const content = await readTextFile(absPath);
    if (!content) continue;

    const imports = extractImports(content);
    for (const imp of imports) {
      const resolved = resolveImport(imp.specifier, filePath, root, nodes);
      if (!resolved) continue;
      const edgeKey = `${filePath}→${resolved}:${imp.kind}`;
      if (edgeSet.has(edgeKey)) continue;
      edgeSet.add(edgeKey);
      newEdges.push({ from: filePath, to: resolved, kind: imp.kind });
      if (nodes[resolved]) nodes[resolved]!.importCount++;
    }
  }

  return {
    version: GRAPH_VERSION,
    builtAt: new Date().toISOString(),
    rootDir: root,
    nodeCount: Object.keys(nodes).length,
    edgeCount: newEdges.length,
    nodes,
    edges: newEdges,
  };
}

export function graphForward(
  graph: LHImportGraph,
  startPath: string,
  maxDepth = 3,
): GraphNeighborhoodResult {
  return bfsTraverse(graph, startPath, maxDepth, "forward");
}

export function graphReverse(
  graph: LHImportGraph,
  startPath: string,
  maxDepth = 3,
): GraphNeighborhoodResult {
  return bfsTraverse(graph, startPath, maxDepth, "reverse");
}

export function graphNeighborhood(
  graph: LHImportGraph,
  startPaths: string[],
  maxDepth = 2,
): GraphNeighborhoodResult {
  const hops: Record<string, number> = {};

  for (const sp of startPaths) {
    hops[sp] = 0;
    const fwd = bfsTraverse(graph, sp, maxDepth, "forward").hops;
    const rev = bfsTraverse(graph, sp, maxDepth, "reverse").hops;
    for (const [p, d] of Object.entries(fwd)) {
      hops[p] = Math.min(hops[p] ?? Infinity, d);
    }
    for (const [p, d] of Object.entries(rev)) {
      hops[p] = Math.min(hops[p] ?? Infinity, d);
    }
  }

  return { paths: Object.keys(hops), hops };
}

export function graphBoundaryClose(
  graph: LHImportGraph,
  touchFiles: string[],
): Array<{ path: string; requiredBy: string[]; reason: string }> {
  const touchSet = new Set(touchFiles);
  const gaps: Map<string, string[]> = new Map();

  for (const touchPath of touchFiles) {
    const direct = graph.edges
      .filter((e) => e.from === touchPath && !touchSet.has(e.to))
      .map((e) => e.to);

    for (const dep of direct) {
      if (!graph.nodes[dep]) continue;
      const node = graph.nodes[dep]!;
      if (node.kind === "source" || node.kind === "test") {
        const existing = gaps.get(dep) ?? [];
        existing.push(touchPath);
        gaps.set(dep, existing);
      }
    }
  }

  return Array.from(gaps.entries()).map(([depPath, requiredBy]) => ({
    path: depPath,
    requiredBy,
    reason: `imported by ${requiredBy.join(", ")} but not in touch boundary`,
  }));
}

async function walkDir(
  root: string,
  dir: string,
  nodes: Record<string, GraphNode>,
): Promise<void> {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(root, fullPath).split(path.sep).join("/");

    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        await walkDir(root, fullPath, nodes);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      const kind = classifyFile(relPath, ext);
      if (kind === "unknown") continue;

      let stat;
      try {
        stat = await fsp.stat(fullPath);
      } catch {
        continue;
      }

      nodes[relPath] = {
        path: relPath,
        kind,
        symbols: [],
        size: stat.size,
        lastModified: stat.mtime.toISOString(),
        importCount: 0,
      };
    }
  }
}

function classifyFile(relPath: string, ext: string): GraphNode["kind"] {
  if (SOURCE_EXTS.has(ext)) {
    if (TEST_PATTERNS.test(relPath)) return "test";
    return "source";
  }
  if (CONFIG_PATTERNS.test(relPath)) return "config";
  if (ext === ".md") return "docs";
  return "unknown";
}

interface ParsedImport {
  specifier: string;
  kind: GraphEdge["kind"];
}

function extractImports(content: string): ParsedImport[] {
  const results: ParsedImport[] = [];
  const seen = new Set<string>();

  const staticPattern = /(?:^|\n)\s*(?:import|export)\s+(?:[^'"]*from\s+)?['"]([^'"]+)['"]/g;
  const requirePattern = /\brequire\(['"]([^'"]+)['"]\)/g;
  const dynamicPattern = /\bimport\(['"]([^'"]+)['"]\)/g;

  let m: RegExpExecArray | null;

  while ((m = staticPattern.exec(content)) !== null) {
    const s = m[1];
    if (s && !seen.has(s)) { seen.add(s); results.push({ specifier: s, kind: "import" }); }
  }
  while ((m = requirePattern.exec(content)) !== null) {
    const s = m[1];
    if (s && !seen.has(s)) { seen.add(s); results.push({ specifier: s, kind: "require" }); }
  }
  while ((m = dynamicPattern.exec(content)) !== null) {
    const s = m[1];
    if (s && !seen.has(s)) { seen.add(s); results.push({ specifier: s, kind: "dynamic" }); }
  }

  return results;
}

function resolveImport(
  specifier: string,
  fromFile: string,
  root: string,
  nodes: Record<string, GraphNode>,
): string | null {
  if (!specifier.startsWith(".")) return null;

  const fromDir = path.dirname(fromFile);
  const candidates = buildCandidates(path.join(fromDir, specifier));

  for (const cand of candidates) {
    const normalized = cand.split(path.sep).join("/");
    if (nodes[normalized]) return normalized;
  }
  return null;
}

function buildCandidates(base: string): string[] {
  const exts = [".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"];
  const candidates: string[] = [];

  if (path.extname(base)) {
    candidates.push(base);
    const noExt = base.replace(/\.[^.]+$/, "");
    for (const ext of exts) candidates.push(noExt + ext);
  } else {
    for (const ext of exts) candidates.push(base + ext);
    for (const ext of exts) candidates.push(path.join(base, "index" + ext));
  }

  return candidates;
}

function bfsTraverse(
  graph: LHImportGraph,
  startPath: string,
  maxDepth: number,
  direction: "forward" | "reverse",
): GraphNeighborhoodResult {
  const hops: Record<string, number> = {};
  const queue: Array<{ p: string; d: number }> = [{ p: startPath, d: 0 }];
  hops[startPath] = 0;

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (item.d >= maxDepth) continue;

    const neighbors = graph.edges
      .filter((e) => direction === "forward" ? e.from === item.p : e.to === item.p)
      .map((e) => direction === "forward" ? e.to : e.from);

    for (const neighbor of neighbors) {
      if (hops[neighbor] === undefined) {
        hops[neighbor] = item.d + 1;
        queue.push({ p: neighbor, d: item.d + 1 });
      }
    }
  }

  return { paths: Object.keys(hops), hops };
}
