export {
  buildImportGraph,
  updateImportGraph,
  loadImportGraph,
  saveImportGraph,
  graphForward,
  graphReverse,
  graphNeighborhood,
  graphBoundaryClose,
  graphPath,
  type LHImportGraph,
  type GraphNode,
  type GraphEdge,
  type GraphNeighborhoodResult,
} from "./import-graph.js";

export {
  buildSymbolGraph,
  loadSymbolGraph,
  saveSymbolGraph,
  findSymbol,
  findImplementors,
  findSubclasses,
  symbolsInFiles,
  symbolGraphPath,
  type LHSymbolGraph,
  type SymbolNode,
  type SymbolEdge,
  type SymbolKind,
} from "./symbol-graph.js";

export {
  appendKnowledge,
  linkKnowledge,
  queryKnowledge,
  queryKnowledgeByFeature,
  loadKnowledgeGraph,
  saveKnowledgeGraph,
  renderKnowledgeSection,
  knowledgeGraphPath,
  type LHKnowledgeGraph,
  type KnowledgeNode,
  type KnowledgeEdge,
  type KnowledgeKind,
  type KnowledgeEdgeKind,
} from "./knowledge-graph.js";

import path from "node:path";
import { fileExists, ensureDir } from "../core/fs.js";
import { harnessPath } from "../core/paths.js";
import { buildImportGraph, loadImportGraph, saveImportGraph, updateImportGraph } from "./import-graph.js";
import { buildSymbolGraph, loadSymbolGraph, saveSymbolGraph } from "./symbol-graph.js";
import type { LHImportGraph } from "./import-graph.js";
import type { LHSymbolGraph } from "./symbol-graph.js";

export interface GraphBuildResult {
  importGraph: LHImportGraph;
  symbolGraph: LHSymbolGraph;
  importGraphPath: string;
  symbolGraphPath: string;
  built: boolean;
  updated: boolean;
  nodeCount: number;
  edgeCount: number;
}

export async function ensureGraphBuilt(root: string): Promise<GraphBuildResult> {
  const importGraphFile = harnessPath(root, "graph/import-graph.json");
  const symbolGraphFile = harnessPath(root, "graph/symbol-graph.json");

  await ensureDir(path.dirname(importGraphFile));

  const existingImport = await loadImportGraph(root);
  let importGraph: LHImportGraph;
  let built = false;
  let updated = false;

  if (!existingImport) {
    importGraph = await buildImportGraph(root);
    await saveImportGraph(root, importGraph);
    built = true;
  } else {
    importGraph = await updateImportGraph(root, existingImport);
    const changed = importGraph.builtAt !== existingImport.builtAt;
    if (changed) {
      await saveImportGraph(root, importGraph);
      updated = true;
    }
  }

  const existingSymbol = await loadSymbolGraph(root);
  const filePaths = Object.keys(importGraph.nodes);
  let symbolGraph: LHSymbolGraph;

  if (!existingSymbol || built || updated) {
    symbolGraph = await buildSymbolGraph(root, filePaths);
    await saveSymbolGraph(root, symbolGraph);
  } else {
    symbolGraph = existingSymbol;
  }

  return {
    importGraph,
    symbolGraph,
    importGraphPath: path.relative(root, importGraphFile),
    symbolGraphPath: path.relative(root, symbolGraphFile),
    built,
    updated,
    nodeCount: importGraph.nodeCount,
    edgeCount: importGraph.edgeCount,
  };
}
