import { describe, it, expect, afterEach } from "vitest";
import {
  slugify,
  formatFeatureId,
  isValidFeatureId,
  parseFeatureNumber,
  deriveFeatureTitle,
  createFeature,
  findFeature,
  archiveFeature,
  listFeatures,
} from "../../src/core/features.js";
import { createTempWorkspace, initHarnessWorkspace } from "../helpers/workspace.js";
import { loadState } from "../../src/core/state.js";
import { fileExists } from "../../src/core/fs.js";
import path from "node:path";
import type { TestWorkspace } from "../helpers/workspace.js";

let ws: TestWorkspace | undefined;

afterEach(async () => {
  if (ws) {
    await ws.cleanup();
    ws = undefined;
  }
});

// ---------------------------------------------------------------------------
// slugify
// ---------------------------------------------------------------------------

describe("slugify", () => {
  it("converts to lowercase and replaces spaces with dashes", () => {
    expect(slugify("Add Password Reset")).toBe("add-password-reset");
  });

  it("collapses consecutive separators", () => {
    expect(slugify("hello___world--foo")).toBe("hello-world-foo");
  });

  it("returns 'feature' for empty string", () => {
    expect(slugify("")).toBe("feature");
  });

  it("returns 'feature' for whitespace-only string", () => {
    expect(slugify("   ")).toBe("feature");
  });

  it("strips non-alphanumeric characters", () => {
    expect(slugify("hello! @world#")).toBe("hello-world");
  });

  it("truncates at 48 characters", () => {
    const long = "a".repeat(60);
    const result = slugify(long);
    expect(result.length).toBeLessThanOrEqual(48);
  });

  it("trims trailing dashes after truncation", () => {
    // Create a string that would have a dash at position 48
    const input = "a".repeat(47) + "-b".repeat(10);
    const result = slugify(input);
    expect(result.length).toBeLessThanOrEqual(48);
    expect(result).not.toMatch(/-$/);
  });
});

// ---------------------------------------------------------------------------
// formatFeatureId
// ---------------------------------------------------------------------------

describe("formatFeatureId", () => {
  it("pads single digit to F001", () => {
    expect(formatFeatureId(1)).toBe("F001");
  });

  it("pads double digit to F042", () => {
    expect(formatFeatureId(42)).toBe("F042");
  });

  it("does not pad numbers with 3+ digits", () => {
    expect(formatFeatureId(100)).toBe("F100");
  });

  it("handles large numbers", () => {
    expect(formatFeatureId(1234)).toBe("F1234");
  });
});

// ---------------------------------------------------------------------------
// isValidFeatureId
// ---------------------------------------------------------------------------

describe("isValidFeatureId", () => {
  it("accepts F001", () => {
    expect(isValidFeatureId("F001")).toBe(true);
  });

  it("accepts F0001 (4+ digits)", () => {
    expect(isValidFeatureId("F0001")).toBe(true);
  });

  it("rejects F42 (less than 3 digits)", () => {
    expect(isValidFeatureId("F42")).toBe(false);
  });

  it("rejects X001 (wrong prefix)", () => {
    expect(isValidFeatureId("X001")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidFeatureId("")).toBe(false);
  });

  it("rejects lowercase f001", () => {
    expect(isValidFeatureId("f001")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseFeatureNumber
// ---------------------------------------------------------------------------

describe("parseFeatureNumber", () => {
  it("parses F001 to 1", () => {
    expect(parseFeatureNumber("F001")).toBe(1);
  });

  it("parses F042 to 42", () => {
    expect(parseFeatureNumber("F042")).toBe(42);
  });

  it("parses F100 to 100", () => {
    expect(parseFeatureNumber("F100")).toBe(100);
  });

  it("returns null for invalid input", () => {
    expect(parseFeatureNumber("invalid")).toBeNull();
  });

  it("returns null for F42 (too few digits)", () => {
    expect(parseFeatureNumber("F42")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseFeatureNumber("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// deriveFeatureTitle
// ---------------------------------------------------------------------------

describe("deriveFeatureTitle", () => {
  it("uses explicit title when provided", () => {
    expect(deriveFeatureTitle("some request", "My Title")).toBe("My Title");
  });

  it("trims explicit title", () => {
    expect(deriveFeatureTitle("some request", "  My Title  ")).toBe("My Title");
  });

  it("takes first sentence from request (up to '. ')", () => {
    expect(deriveFeatureTitle("Add login. Also add logout")).toBe("Add login");
  });

  it("capitalizes first character", () => {
    expect(deriveFeatureTitle("add password reset")).toBe(
      "Add password reset",
    );
  });

  it("truncates at 80 characters", () => {
    const long = "a".repeat(100);
    const result = deriveFeatureTitle(long);
    expect(result.length).toBeLessThanOrEqual(80);
  });

  it("capitalizes first char of long text", () => {
    expect(deriveFeatureTitle("x")).toBe("X");
  });
});

// ---------------------------------------------------------------------------
// createFeature
// ---------------------------------------------------------------------------

describe("createFeature", () => {
  it("creates a feature with all expected files", async () => {
    ws = await createTempWorkspace();
    await initHarnessWorkspace(ws.root);

    const result = await createFeature({
      root: ws.root,
      request: "Add password reset",
    });

    expect(result.id).toBe("F001");
    expect(result.slug).toBe("add-password-reset");
    expect(result.title).toBe("Add password reset");
    expect(result.status).toBe("draft");
    expect(result.created).toContain("spec.md");
    expect(result.created).toContain("events.jsonl");
    expect(result.created).toContain("cavebus.log");
    expect(await fileExists(result.specPath)).toBe(true);
  });

  it("uses explicit id when provided", async () => {
    ws = await createTempWorkspace();
    await initHarnessWorkspace(ws.root);

    const result = await createFeature({
      root: ws.root,
      request: "Some feature",
      id: "F010",
    });

    expect(result.id).toBe("F010");
    expect(result.folderName).toMatch(/^F010-/);
  });

  it("throws on empty request", async () => {
    ws = await createTempWorkspace();
    await initHarnessWorkspace(ws.root);

    await expect(
      createFeature({ root: ws.root, request: "" }),
    ).rejects.toThrow("Missing feature request");
  });

  it("throws on whitespace-only request", async () => {
    ws = await createTempWorkspace();
    await initHarnessWorkspace(ws.root);

    await expect(
      createFeature({ root: ws.root, request: "   " }),
    ).rejects.toThrow("Missing feature request");
  });

  it("throws on invalid id format", async () => {
    ws = await createTempWorkspace();
    await initHarnessWorkspace(ws.root);

    await expect(
      createFeature({ root: ws.root, request: "Test", id: "X001" }),
    ).rejects.toThrow("Invalid feature ID");
  });

  it("throws on duplicate id without force", async () => {
    ws = await createTempWorkspace();
    await initHarnessWorkspace(ws.root);

    await createFeature({ root: ws.root, request: "First feature", id: "F001" });
    await expect(
      createFeature({ root: ws.root, request: "Second feature", id: "F001" }),
    ).rejects.toThrow("already exists");
  });

  it("updates state after creation", async () => {
    ws = await createTempWorkspace();
    await initHarnessWorkspace(ws.root);

    const result = await createFeature({
      root: ws.root,
      request: "Test feature",
    });

    const state = await loadState(ws.root);
    expect(state.activeFeature).toBe(result.folderName);
    expect(state.features.some((f) => f.id === "F001")).toBe(true);
    expect(state.nextFeatureNumber).toBeGreaterThanOrEqual(2);
  });

  it("increments feature number for successive creates", async () => {
    ws = await createTempWorkspace();
    await initHarnessWorkspace(ws.root);

    const first = await createFeature({ root: ws.root, request: "First" });
    const second = await createFeature({ root: ws.root, request: "Second" });

    expect(first.id).toBe("F001");
    expect(second.id).toBe("F002");
  });
});

// ---------------------------------------------------------------------------
// findFeature
// ---------------------------------------------------------------------------

describe("findFeature", () => {
  it("finds by feature id", async () => {
    ws = await createTempWorkspace();
    await initHarnessWorkspace(ws.root);
    await createFeature({ root: ws.root, request: "Find me" });

    const found = await findFeature(ws.root, "F001");
    expect(found).not.toBeNull();
    expect(found!.id).toBe("F001");
  });

  it("finds by folder path", async () => {
    ws = await createTempWorkspace();
    await initHarnessWorkspace(ws.root);
    const created = await createFeature({ root: ws.root, request: "Find me" });

    const found = await findFeature(ws.root, created.folderName);
    expect(found).not.toBeNull();
    expect(found!.id).toBe("F001");
  });

  it("finds by prefix", async () => {
    ws = await createTempWorkspace();
    await initHarnessWorkspace(ws.root);
    await createFeature({ root: ws.root, request: "Find me" });

    const found = await findFeature(ws.root, "F001-");
    expect(found).not.toBeNull();
    expect(found!.id).toBe("F001");
  });

  it("returns null for nonexistent feature", async () => {
    ws = await createTempWorkspace();
    await initHarnessWorkspace(ws.root);

    const found = await findFeature(ws.root, "F999");
    expect(found).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// archiveFeature
// ---------------------------------------------------------------------------

describe("archiveFeature", () => {
  it("sets status to archived", async () => {
    ws = await createTempWorkspace();
    await initHarnessWorkspace(ws.root);
    await createFeature({ root: ws.root, request: "Archive me" });

    const summary = await archiveFeature(ws.root, "F001");
    expect(summary.status).toBe("archived");
  });

  it("clears active feature if it was active", async () => {
    ws = await createTempWorkspace();
    await initHarnessWorkspace(ws.root);
    await createFeature({ root: ws.root, request: "Archive me" });

    const stateBefore = await loadState(ws.root);
    expect(stateBefore.activeFeature).not.toBeNull();

    await archiveFeature(ws.root, "F001");

    const stateAfter = await loadState(ws.root);
    expect(stateAfter.activeFeature).toBeNull();
  });

  it("throws for nonexistent feature", async () => {
    ws = await createTempWorkspace();
    await initHarnessWorkspace(ws.root);

    await expect(archiveFeature(ws.root, "F999")).rejects.toThrow(
      "Could not find feature",
    );
  });
});

// ---------------------------------------------------------------------------
// listFeatures
// ---------------------------------------------------------------------------

describe("listFeatures", () => {
  it("lists created features", async () => {
    ws = await createTempWorkspace();
    await initHarnessWorkspace(ws.root);
    await createFeature({ root: ws.root, request: "First" });
    await createFeature({ root: ws.root, request: "Second" });

    const list = await listFeatures(ws.root);
    expect(list).toHaveLength(2);
    expect(list[0]!.id).toBe("F001");
    expect(list[1]!.id).toBe("F002");
  });

  it("filters archived features by default", async () => {
    ws = await createTempWorkspace();
    await initHarnessWorkspace(ws.root);
    await createFeature({ root: ws.root, request: "Keep" });
    await createFeature({ root: ws.root, request: "Archive" });
    await archiveFeature(ws.root, "F002");

    const list = await listFeatures(ws.root);
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe("F001");
  });

  it("includes archived features when requested", async () => {
    ws = await createTempWorkspace();
    await initHarnessWorkspace(ws.root);
    await createFeature({ root: ws.root, request: "Keep" });
    await createFeature({ root: ws.root, request: "Archive" });
    await archiveFeature(ws.root, "F002");

    const list = await listFeatures(ws.root, { includeArchived: true });
    expect(list).toHaveLength(2);
  });

  it("returns empty array when no features exist", async () => {
    ws = await createTempWorkspace();
    await initHarnessWorkspace(ws.root);

    const list = await listFeatures(ws.root);
    expect(list).toHaveLength(0);
  });
});
