import type { CandidateFile } from "./search.js";
import type { LHImportGraph } from "../graph/import-graph.js";
import { graphNeighborhood } from "../graph/import-graph.js";

export interface GraphScoreBoost {
  path: string;
  importProximity: number;
  importedByCount: number;
  totalBoost: number;
}

export interface GraphScoredResult {
  candidates: CandidateFile[];
  boosts: GraphScoreBoost[];
  notes: string[];
}

export function applyGraphScoring(
  candidates: CandidateFile[],
  graph: LHImportGraph,
  maxDepth = 2,
): GraphScoredResult {
  if (Object.keys(graph.nodes).length === 0) {
    return { candidates, boosts: [], notes: ["Graph is empty; no scoring applied."] };
  }

  const seedPaths = candidates
    .filter((c) => c.score >= 3 && c.kind === "source")
    .map((c) => c.path);

  if (seedPaths.length === 0) {
    return { candidates, boosts: [], notes: ["No seed files for graph expansion."] };
  }

  const neighborhood = graphNeighborhood(graph, seedPaths, maxDepth);
  const boosts: GraphScoreBoost[] = [];
  const existingPaths = new Set(candidates.map((c) => c.path));

  for (const [neighborPath, hops] of Object.entries(neighborhood.hops)) {
    const node = graph.nodes[neighborPath];
    if (!node) continue;

    const importProximity = hops === 0 ? 0 : hops === 1 ? 4 : hops === 2 ? 2 : 1;
    const importedByCount = Math.min(node.importCount, 5);
    const totalBoost = importProximity + importedByCount;

    if (totalBoost === 0) continue;
    boosts.push({ path: neighborPath, importProximity, importedByCount, totalBoost });

    const existing = candidates.find((c) => c.path === neighborPath);
    if (existing) {
      existing.score += totalBoost;
      if (!existing.matchedTerms.includes("graph:proximity")) {
        existing.matchedTerms.push(`graph:proximity(${hops}hops)`);
      }
    } else if (!existingPaths.has(neighborPath) && node.kind === "source") {
      candidates.push({
        path: neighborPath,
        reason: `graph neighbor (${hops} hop${hops !== 1 ? "s" : ""} from seed)`,
        confidence: hops === 1 ? "med" : "low",
        score: totalBoost,
        kind: node.kind,
        matchedTerms: [`graph:proximity(${hops}hops)`],
      });
      existingPaths.add(neighborPath);
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const notes = [
    `Graph scoring applied: ${seedPaths.length} seeds, ${neighborhood.paths.length} neighbors found, ${boosts.length} boosts applied.`,
  ];

  return { candidates, boosts, notes };
}
