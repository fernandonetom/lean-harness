import { describe, it, expect, beforeEach } from "vitest";
import {
  appendKnowledge,
  linkKnowledge,
  queryKnowledge,
  queryKnowledgeByFeature,
  renderKnowledgeSection,
  loadKnowledgeGraph,
  saveKnowledgeGraph,
} from "../../src/graph/knowledge-graph.js";
import { createTempWorkspace, type TestWorkspace } from "../helpers/workspace.js";

let ws: TestWorkspace;

beforeEach(async () => {
  ws = await createTempWorkspace();
});

describe("appendKnowledge", () => {
  it("adds nodes to the graph", async () => {
    const node = await appendKnowledge(ws.root, {
      kind: "pattern",
      title: "Test Pattern",
      body: "A test pattern description",
      featureId: "F001",
      files: ["src/test.ts"],
    });

    expect(node.id).toBeDefined();
    expect(node.kind).toBe("pattern");
    expect(node.title).toBe("Test Pattern");
    expect(node.featureId).toBe("F001");

    const graph = await loadKnowledgeGraph(ws.root);
    expect(graph.nodes.length).toBe(1);
  });

  it("generates unique IDs for nodes", async () => {
    await appendKnowledge(ws.root, {
      kind: "pattern",
      title: "Pattern 1",
      body: "Body 1",
      featureId: "F001",
      files: ["src/a.ts"],
    });

    await appendKnowledge(ws.root, {
      kind: "pattern",
      title: "Pattern 2",
      body: "Body 2",
      featureId: "F001",
      files: ["src/b.ts"],
    });

    const graph = await loadKnowledgeGraph(ws.root);
    expect(graph.nodes.length).toBe(2);
    expect(graph.nodes[0].id).not.toBe(graph.nodes[1].id);
  });
});

describe("linkKnowledge", () => {
  it("creates edges between nodes", async () => {
    const node1 = await appendKnowledge(ws.root, {
      kind: "pattern",
      title: "Pattern 1",
      body: "Body 1",
      featureId: "F001",
      files: ["src/a.ts"],
    });

    const node2 = await appendKnowledge(ws.root, {
      kind: "decision",
      title: "Decision 1",
      body: "Body 2",
      featureId: "F001",
      files: ["src/b.ts"],
    });

    await linkKnowledge(ws.root, node1.id, node2.id, "uses-pattern");

    const graph = await loadKnowledgeGraph(ws.root);
    expect(graph.edges.length).toBe(1);
    expect(graph.edges[0].from).toBe(node1.id);
    expect(graph.edges[0].to).toBe(node2.id);
    expect(graph.edges[0].kind).toBe("uses-pattern");
  });

  it("does not create duplicate edges", async () => {
    const node1 = await appendKnowledge(ws.root, {
      kind: "pattern",
      title: "Pattern 1",
      body: "Body 1",
      featureId: "F001",
      files: ["src/a.ts"],
    });

    const node2 = await appendKnowledge(ws.root, {
      kind: "decision",
      title: "Decision 1",
      body: "Body 2",
      featureId: "F001",
      files: ["src/b.ts"],
    });

    await linkKnowledge(ws.root, node1.id, node2.id, "uses-pattern");
    await linkKnowledge(ws.root, node1.id, node2.id, "uses-pattern");

    const graph = await loadKnowledgeGraph(ws.root);
    expect(graph.edges.length).toBe(1);
  });
});

describe("queryKnowledge", () => {
  it("finds related nodes by file", async () => {
    await appendKnowledge(ws.root, {
      kind: "pattern",
      title: "Pattern A",
      body: "Body A",
      featureId: "F001",
      files: ["src/a.ts"],
    });

    await appendKnowledge(ws.root, {
      kind: "pattern",
      title: "Pattern B",
      body: "Body B",
      featureId: "F001",
      files: ["src/b.ts"],
    });

    const results = await queryKnowledge(ws.root, ["src/a.ts"]);

    expect(results.length).toBe(1);
    expect(results[0].title).toBe("Pattern A");
  });

  it("filters by kind", async () => {
    await appendKnowledge(ws.root, {
      kind: "pattern",
      title: "Pattern",
      body: "Body",
      featureId: "F001",
      files: ["src/a.ts"],
    });

    await appendKnowledge(ws.root, {
      kind: "decision",
      title: "Decision",
      body: "Body",
      featureId: "F001",
      files: ["src/a.ts"],
    });

    const results = await queryKnowledge(ws.root, ["src/a.ts"], ["pattern"]);

    expect(results.length).toBe(1);
    expect(results[0].kind).toBe("pattern");
  });

  it("returns empty array when no matches", async () => {
    await appendKnowledge(ws.root, {
      kind: "pattern",
      title: "Pattern",
      body: "Body",
      featureId: "F001",
      files: ["src/a.ts"],
    });

    const results = await queryKnowledge(ws.root, ["src/nonexistent.ts"]);

    expect(results.length).toBe(0);
  });
});

describe("queryKnowledgeByFeature", () => {
  it("filters nodes by feature ID", async () => {
    await appendKnowledge(ws.root, {
      kind: "pattern",
      title: "Pattern F1",
      body: "Body",
      featureId: "F001",
      files: ["src/a.ts"],
    });

    await appendKnowledge(ws.root, {
      kind: "pattern",
      title: "Pattern F2",
      body: "Body",
      featureId: "F002",
      files: ["src/b.ts"],
    });

    const results = await queryKnowledgeByFeature(ws.root, "F001");

    expect(results.length).toBe(1);
    expect(results[0].featureId).toBe("F001");
  });

  it("returns empty array when no matching feature", async () => {
    await appendKnowledge(ws.root, {
      kind: "pattern",
      title: "Pattern",
      body: "Body",
      featureId: "F001",
      files: ["src/a.ts"],
    });

    const results = await queryKnowledgeByFeature(ws.root, "F999");

    expect(results.length).toBe(0);
  });
});

describe("renderKnowledgeSection", () => {
  it("renders markdown section with nodes", async () => {
    const nodes = [
      {
        id: "p-001-test",
        kind: "pattern" as const,
        title: "Test Pattern",
        body: "This is a test pattern description",
        featureId: "F001",
        files: ["src/test.ts"],
        createdAt: new Date().toISOString(),
      },
    ];

    const rendered = renderKnowledgeSection(nodes);

    expect(rendered).toContain("**[pattern] Test Pattern**");
    expect(rendered).toContain("F001");
    expect(rendered).toContain("This is a test pattern description");
  });

  it("returns message when no nodes", async () => {
    const rendered = renderKnowledgeSection([]);
    expect(rendered).toBe("_No relevant knowledge entries for this task._");
  });

  it("limits to 8 nodes", async () => {
    const nodes = Array.from({ length: 10 }, (_, i) => ({
      id: `p-${String(i + 1).padStart(3, "0")}-test`,
      kind: "pattern" as const,
      title: `Pattern ${i + 1}`,
      body: `Body ${i + 1}`,
      featureId: "F001",
      files: ["src/test.ts"],
      createdAt: new Date().toISOString(),
    }));

    const rendered = renderKnowledgeSection(nodes);
    expect(rendered.split("**[").length - 1).toBeLessThanOrEqual(8);
  });
});

describe("loadKnowledgeGraph / saveKnowledgeGraph", () => {
  it("persists graph to disk", async () => {
    const graph = {
      version: "1",
      updatedAt: new Date().toISOString(),
      nodes: [],
      edges: [],
    };

    await saveKnowledgeGraph(ws.root, graph);
    const loaded = await loadKnowledgeGraph(ws.root);

    expect(loaded).toBeDefined();
    expect(loaded.version).toBe("1");
  });

  it("returns empty graph when file does not exist", async () => {
    const loaded = await loadKnowledgeGraph(ws.root);

    expect(loaded).toBeDefined();
    expect(loaded.nodes.length).toBe(0);
    expect(loaded.edges.length).toBe(0);
  });
});
