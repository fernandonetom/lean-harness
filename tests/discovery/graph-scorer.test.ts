import { describe, it, expect, beforeEach } from "vitest";
import { applyGraphScoring } from "../../src/discovery/graph-scorer.js";
import { buildImportGraph } from "../../src/graph/import-graph.js";
import { createTempWorkspace, type TestWorkspace } from "../helpers/workspace.js";
import { writeTextFile } from "../../src/core/fs.js";
import type { CandidateFile } from "../../src/discovery/search.js";

let ws: TestWorkspace;

beforeEach(async () => {
  ws = await createTempWorkspace();
});

function createCandidate(path: string, score = 3, kind = "source" as const): CandidateFile {
  return {
    path,
    reason: "test",
    confidence: "med",
    score,
    kind,
    matchedTerms: ["test"],
  };
}

describe("applyGraphScoring", () => {
  it("boosts candidate scores based on import proximity", async () => {
    await writeTextFile(ws.root + "/src/a.ts", 'import { b } from "./b";');
    await writeTextFile(ws.root + "/src/b.ts", 'import { c } from "./c"; export const b = 1;');
    await writeTextFile(ws.root + "/src/c.ts", 'export const c = 2;');

    const graph = await buildImportGraph(ws.root);
    const candidates: CandidateFile[] = [
      createCandidate("src/a.ts", 3),
      createCandidate("src/b.ts", 3),
    ];

    const result = applyGraphScoring(candidates, graph, 2);

    expect(result.candidates.length).toBeGreaterThanOrEqual(2);
    expect(result.boosts.length).toBeGreaterThan(0);
  });

  it("adds new candidates from neighborhood", async () => {
    await writeTextFile(ws.root + "/src/a.ts", 'import { b } from "./b";');
    await writeTextFile(ws.root + "/src/b.ts", 'export const b = 1;');

    const graph = await buildImportGraph(ws.root);
    const candidates: CandidateFile[] = [
      createCandidate("src/a.ts", 5),
    ];

    const result = applyGraphScoring(candidates, graph, 2);

    expect(result.candidates.some((c) => c.path === "src/b.ts")).toBe(true);
  });

  it("handles empty graph gracefully", async () => {
    const graph = {
      version: "1",
      builtAt: new Date().toISOString(),
      rootDir: ws.root,
      nodeCount: 0,
      edgeCount: 0,
      nodes: {},
      edges: [],
    };

    const candidates: CandidateFile[] = [
      createCandidate("src/a.ts", 3),
    ];

    const result = applyGraphScoring(candidates, graph, 2);

    expect(result.candidates.length).toBe(1);
    expect(result.boosts.length).toBe(0);
    expect(result.notes.some((n) => n.includes("empty"))).toBe(true);
  });

  it("handles no seeds gracefully", async () => {
    await writeTextFile(ws.root + "/src/a.ts", 'export const a = 1;');

    const graph = await buildImportGraph(ws.root);
    const candidates: CandidateFile[] = [
      createCandidate("src/a.ts", 1, "config"),
    ];

    const result = applyGraphScoring(candidates, graph, 2);

    expect(result.candidates.length).toBe(1);
    expect(result.boosts.length).toBe(0);
    expect(result.notes.some((n) => n.includes("No seed"))).toBe(true);
  });

  it("sorts candidates by score descending", async () => {
    await writeTextFile(ws.root + "/src/a.ts", 'import { b } from "./b";');
    await writeTextFile(ws.root + "/src/b.ts", 'export const b = 1;');

    const graph = await buildImportGraph(ws.root);
    const candidates: CandidateFile[] = [
      createCandidate("src/a.ts", 1),
      createCandidate("src/b.ts", 1),
    ];

    const result = applyGraphScoring(candidates, graph, 2);

    for (let i = 1; i < result.candidates.length; i++) {
      expect(result.candidates[i - 1]!.score).toBeGreaterThanOrEqual(result.candidates[i]!.score);
    }
  });

  it("scores 1-hop neighbors higher than 2-hop", async () => {
    await writeTextFile(ws.root + "/src/a.ts", 'import { b } from "./b";');
    await writeTextFile(ws.root + "/src/b.ts", 'import { c } from "./c"; export const b = 1;');
    await writeTextFile(ws.root + "/src/c.ts", 'export const c = 2;');

    const graph = await buildImportGraph(ws.root);
    const candidates: CandidateFile[] = [
      createCandidate("src/a.ts", 5),
    ];

    const result = applyGraphScoring(candidates, graph, 2);

    const bBoost = result.boosts.find((b) => b.path === "src/b.ts");
    const cBoost = result.boosts.find((b) => b.path === "src/c.ts");

    expect(bBoost).toBeDefined();
    expect(cBoost).toBeDefined();
    if (bBoost && cBoost) {
      expect(bBoost.importProximity).toBeGreaterThan(cBoost.importProximity);
    }
  });

  it("includes imported-by count in scoring", async () => {
    await writeTextFile(ws.root + "/src/a.ts", 'import { c } from "./c";');
    await writeTextFile(ws.root + "/src/b.ts", 'import { c } from "./c";');
    await writeTextFile(ws.root + "/src/c.ts", 'export const c = 1;');

    const graph = await buildImportGraph(ws.root);
    const candidates: CandidateFile[] = [
      createCandidate("src/a.ts", 3),
      createCandidate("src/b.ts", 3),
    ];

    const result = applyGraphScoring(candidates, graph, 2);

    const cBoost = result.boosts.find((b) => b.path === "src/c.ts");
    expect(cBoost).toBeDefined();
    if (cBoost) {
      expect(cBoost.importedByCount).toBeGreaterThan(0);
    }
  });
});
