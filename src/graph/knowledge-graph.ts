import path from "node:path";
import { readJsonFile, writeJsonFile, ensureDir } from "../core/fs.js";
import { harnessPath } from "../core/paths.js";

export type KnowledgeKind = "pattern" | "decision" | "constraint" | "convention" | "failure";

export type KnowledgeEdgeKind =
  | "uses-pattern"
  | "contradicts"
  | "extends"
  | "replaces"
  | "related-to";

export interface KnowledgeNode {
  id: string;
  kind: KnowledgeKind;
  title: string;
  body: string;
  featureId: string;
  files: string[];
  createdAt: string;
}

export interface KnowledgeEdge {
  from: string;
  to: string;
  kind: KnowledgeEdgeKind;
}

export interface LHKnowledgeGraph {
  version: string;
  updatedAt: string;
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
}

const KNOWLEDGE_GRAPH_FILE = "graph/knowledge-graph.json";
const KNOWLEDGE_VERSION = "1";

export function knowledgeGraphPath(root: string): string {
  return harnessPath(root, KNOWLEDGE_GRAPH_FILE);
}

export async function loadKnowledgeGraph(root: string): Promise<LHKnowledgeGraph> {
  const existing = await readJsonFile<LHKnowledgeGraph>(knowledgeGraphPath(root));
  if (existing) return existing;
  return { version: KNOWLEDGE_VERSION, updatedAt: new Date().toISOString(), nodes: [], edges: [] };
}

export async function saveKnowledgeGraph(root: string, graph: LHKnowledgeGraph): Promise<void> {
  const p = knowledgeGraphPath(root);
  await ensureDir(path.dirname(p));
  graph.updatedAt = new Date().toISOString();
  await writeJsonFile(p, graph, { overwrite: true });
}

export async function appendKnowledge(
  root: string,
  node: Omit<KnowledgeNode, "id" | "createdAt">,
): Promise<KnowledgeNode> {
  const graph = await loadKnowledgeGraph(root);

  const id = generateNodeId(node.kind, node.title, graph.nodes.length);
  const created: KnowledgeNode = {
    ...node,
    id,
    createdAt: new Date().toISOString(),
  };

  graph.nodes.push(created);
  await saveKnowledgeGraph(root, graph);
  return created;
}

export async function linkKnowledge(
  root: string,
  fromId: string,
  toId: string,
  kind: KnowledgeEdgeKind,
): Promise<void> {
  const graph = await loadKnowledgeGraph(root);

  const alreadyLinked = graph.edges.some(
    (e) => e.from === fromId && e.to === toId && e.kind === kind,
  );
  if (alreadyLinked) return;

  graph.edges.push({ from: fromId, to: toId, kind });
  await saveKnowledgeGraph(root, graph);
}

export async function queryKnowledge(
  root: string,
  relatedFiles: string[],
  kinds?: KnowledgeKind[],
): Promise<KnowledgeNode[]> {
  const graph = await loadKnowledgeGraph(root);
  if (graph.nodes.length === 0) return [];

  const normalise = (p: string) => p.replace(/^\.\//, "");
  const fileSet = new Set(relatedFiles.map(normalise));
  const kindSet = kinds ? new Set(kinds) : null;

  return graph.nodes.filter((node) => {
    if (kindSet && !kindSet.has(node.kind)) return false;
    return node.files.some((f) => fileSet.has(normalise(f)));
  });
}

export async function queryKnowledgeByFeature(
  root: string,
  featureId: string,
): Promise<KnowledgeNode[]> {
  const graph = await loadKnowledgeGraph(root);
  return graph.nodes.filter((n) => n.featureId === featureId);
}

export function renderKnowledgeSection(nodes: KnowledgeNode[]): string {
  if (nodes.length === 0) return "_No relevant knowledge entries for this task._";

  const lines: string[] = [];
  for (const node of nodes.slice(0, 8)) {
    lines.push(`**[${node.kind}] ${node.title}** (${node.featureId})`);
    lines.push(node.body.slice(0, 300));
    lines.push("");
  }
  return lines.join("\n");
}

function generateNodeId(kind: string, title: string, index: number): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30);
  return `${kind[0]}-${String(index + 1).padStart(3, "0")}-${slug}`;
}
