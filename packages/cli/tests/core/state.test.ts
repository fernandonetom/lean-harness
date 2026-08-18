import { getVersion } from "../../src/core/version.js";
import { describe, it, expect, afterEach } from "vitest";
import {
  normalizeState,
  upsertFeatureEntry,
  setActiveFeature,
  getNextFeatureNumber,
  setNextFeatureNumberFromFeatures,
  nowIso,
  loadState,
  saveState,
} from "../../src/core/state.js";
import { createTempWorkspace, initHarnessWorkspace } from "../helpers/workspace.js";
import type { TestWorkspace } from "../helpers/workspace.js";
import type { HarnessState, FeatureIndexEntry } from "../../src/core/types.js";

let ws: TestWorkspace | undefined;

afterEach(async () => {
  if (ws) {
    await ws.cleanup();
    ws = undefined;
  }
});

// ---------------------------------------------------------------------------
// normalizeState
// ---------------------------------------------------------------------------

describe("normalizeState", () => {
  it("throws on null", () => {
    expect(() => normalizeState(null)).toThrow("expected a JSON object");
  });

  it("throws on string", () => {
    expect(() => normalizeState("hello")).toThrow("expected a JSON object");
  });

  it("throws on number", () => {
    expect(() => normalizeState(42)).toThrow("expected a JSON object");
  });

  it("returns defaults for array (typeof array is object)", () => {
    const state = normalizeState([1, 2]);
    expect(state.version).toBe(getVersion());
    expect(state.features).toEqual([]);
    expect(state.activeFeature).toBeNull();
  });

  it("returns defaults for empty object", () => {
    const state = normalizeState({});
    expect(state.version).toBe(getVersion());
    expect(state.schema).toBe("leanharness-state");
    expect(state.activeFeature).toBeNull();
    expect(state.nextFeatureNumber).toBe(1);
    expect(state.features).toEqual([]);
    expect(state.lastUpdated).toBeNull();
  });

  it("recognizes camelCase activeFeature", () => {
    const state = normalizeState({ activeFeature: "F001-foo" });
    expect(state.activeFeature).toBe("F001-foo");
  });

  it("recognizes snake_case active_feature", () => {
    const state = normalizeState({ active_feature: "F002-bar" });
    expect(state.activeFeature).toBe("F002-bar");
  });

  it("prefers camelCase activeFeature over snake_case", () => {
    const state = normalizeState({
      activeFeature: "F001-foo",
      active_feature: "F002-bar",
    });
    expect(state.activeFeature).toBe("F001-foo");
  });

  it("recognizes camelCase lastUpdated", () => {
    const state = normalizeState({ lastUpdated: "2024-01-01T00:00:00Z" });
    expect(state.lastUpdated).toBe("2024-01-01T00:00:00Z");
  });

  it("recognizes snake_case last_updated", () => {
    const state = normalizeState({ last_updated: "2024-01-01T00:00:00Z" });
    expect(state.lastUpdated).toBe("2024-01-01T00:00:00Z");
  });

  it("filters features array: keeps only objects with string id", () => {
    const state = normalizeState({
      features: [
        { id: "F001", slug: "a" },
        { notAnId: true },
        "bad",
        null,
        { id: 42 },
        { id: "F002", slug: "b" },
      ],
    });
    expect(state.features).toHaveLength(2);
    expect(state.features[0]!.id).toBe("F001");
    expect(state.features[1]!.id).toBe("F002");
  });

  it("converts object-map features to array", () => {
    const state = normalizeState({
      features: {
        f1: { id: "F001", slug: "a" },
        f2: { id: "F002", slug: "b" },
        bad: { noId: true },
      },
    });
    expect(state.features).toHaveLength(2);
    const ids = state.features.map((f) => f.id).sort();
    expect(ids).toEqual(["F001", "F002"]);
  });

  it("clamps nextFeatureNumber to minimum 1", () => {
    const state = normalizeState({ nextFeatureNumber: -5 });
    expect(state.nextFeatureNumber).toBe(1);
  });

  it("clamps nextFeatureNumber 0 to 1", () => {
    const state = normalizeState({ nextFeatureNumber: 0 });
    expect(state.nextFeatureNumber).toBe(1);
  });

  it("preserves valid nextFeatureNumber", () => {
    const state = normalizeState({ nextFeatureNumber: 10 });
    expect(state.nextFeatureNumber).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// upsertFeatureEntry
// ---------------------------------------------------------------------------

describe("upsertFeatureEntry", () => {
  function makeState(features: FeatureIndexEntry[] = []): HarnessState {
    return normalizeState({ features });
  }

  it("inserts a new entry", () => {
    const state = makeState();
    const entry: FeatureIndexEntry = {
      id: "F001",
      slug: "foo",
      title: "Foo",
      path: "F001-foo",
      status: "draft",
    };
    upsertFeatureEntry(state, entry);
    expect(state.features).toHaveLength(1);
    expect(state.features[0]!.id).toBe("F001");
  });

  it("updates existing entry by id", () => {
    const entry: FeatureIndexEntry = {
      id: "F001",
      slug: "foo",
      title: "Foo",
      path: "F001-foo",
      status: "draft",
    };
    const state = makeState([entry]);
    const updated: FeatureIndexEntry = { ...entry, status: "active" };
    upsertFeatureEntry(state, updated);
    expect(state.features).toHaveLength(1);
    expect(state.features[0]!.status).toBe("active");
  });

  it("sorts features by id after upsert", () => {
    const state = makeState([
      { id: "F003", slug: "c", title: "C", path: "F003-c", status: "draft" },
    ]);
    upsertFeatureEntry(state, {
      id: "F001",
      slug: "a",
      title: "A",
      path: "F001-a",
      status: "draft",
    });
    expect(state.features[0]!.id).toBe("F001");
    expect(state.features[1]!.id).toBe("F003");
  });
});

// ---------------------------------------------------------------------------
// setActiveFeature
// ---------------------------------------------------------------------------

describe("setActiveFeature", () => {
  it("sets activeFeature", () => {
    const state = normalizeState({});
    setActiveFeature(state, "F001-foo");
    expect(state.activeFeature).toBe("F001-foo");
  });

  it("clears activeFeature with null", () => {
    const state = normalizeState({ activeFeature: "F001-foo" });
    setActiveFeature(state, null);
    expect(state.activeFeature).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getNextFeatureNumber
// ---------------------------------------------------------------------------

describe("getNextFeatureNumber", () => {
  it("returns nextFeatureNumber from state", () => {
    const state = normalizeState({ nextFeatureNumber: 5 });
    expect(getNextFeatureNumber(state)).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// setNextFeatureNumberFromFeatures
// ---------------------------------------------------------------------------

describe("setNextFeatureNumberFromFeatures", () => {
  it("computes max feature number + 1", () => {
    const state = normalizeState({
      features: [
        { id: "F003", slug: "c", title: "C", path: "F003-c", status: "draft" },
        { id: "F007", slug: "g", title: "G", path: "F007-g", status: "draft" },
        { id: "F001", slug: "a", title: "A", path: "F001-a", status: "draft" },
      ],
    });
    setNextFeatureNumberFromFeatures(state);
    expect(state.nextFeatureNumber).toBe(8);
  });

  it("sets to 1 when no features", () => {
    const state = normalizeState({ features: [] });
    setNextFeatureNumberFromFeatures(state);
    expect(state.nextFeatureNumber).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// nowIso
// ---------------------------------------------------------------------------

describe("nowIso", () => {
  it("returns an ISO date string", () => {
    const result = nowIso();
    expect(typeof result).toBe("string");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

// ---------------------------------------------------------------------------
// loadState / saveState
// ---------------------------------------------------------------------------

describe("loadState / saveState", () => {
  it("returns default state when no state.json exists", async () => {
    ws = await createTempWorkspace();
    await initHarnessWorkspace(ws.root);
    // Remove existing state.json to simulate missing file
    const { rm } = await import("node:fs/promises");
    const { statePath } = await import("../../src/core/paths.js");
    await rm(statePath(ws.root), { force: true });

    const state = await loadState(ws.root);
    expect(state.version).toBe(getVersion());
    expect(state.schema).toBe("leanharness-state");
    expect(state.features).toEqual([]);
  });

  it("round-trips state through save and load", async () => {
    ws = await createTempWorkspace();
    await initHarnessWorkspace(ws.root);

    const state = await loadState(ws.root);
    state.activeFeature = "F001-test";
    state.nextFeatureNumber = 5;
    upsertFeatureEntry(state, {
      id: "F001",
      slug: "test",
      title: "Test",
      path: "F001-test",
      status: "active",
    });

    await saveState(ws.root, state);

    const loaded = await loadState(ws.root);
    expect(loaded.activeFeature).toBe("F001-test");
    expect(loaded.nextFeatureNumber).toBe(5);
    expect(loaded.features).toHaveLength(1);
    expect(loaded.features[0]!.id).toBe("F001");
    expect(loaded.lastUpdated).toBeTruthy();
  });
});
