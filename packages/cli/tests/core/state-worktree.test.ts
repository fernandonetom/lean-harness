import { describe, it, expect } from "vitest";
import {
  normalizeState,
  normalizeFeatureEntry,
  upsertFeatureEntry,
  setFeatureWorktree,
  clearFeatureWorktree,
} from "../../src/core/state.js";
import type { HarnessState, FeatureIndexEntry } from "../../src/core/types.js";

// ---------------------------------------------------------------------------
// v1.5.2 back-compat: legacy state without worktree fields
// ---------------------------------------------------------------------------

describe("v1.5.2 back-compat: legacy state without worktree fields", () => {
  it("normalizeState accepts legacy state.json without worktree fields", () => {
    const legacy = {
      version: "1.5.2",
      schema: "leanharness-state",
      activeFeature: "F001-example",
      nextFeatureNumber: 2,
      features: [
        {
          id: "F001-example",
          slug: "example",
          title: "Example",
          path: ".lh/features/F001-example",
          status: "done",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
      ],
      lastUpdated: "2026-01-02T00:00:00.000Z",
    };

    const state = normalizeState(legacy);
    expect(state).toBeDefined();
    expect(state.version).toBe("1.5.2");
    expect(state.activeFeature).toBe("F001-example");
    expect(state.nextFeatureNumber).toBe(2);
  });

  it("legacy feature entry has no worktree fields after normalization", () => {
    const legacy = {
      version: "1.5.2",
      schema: "leanharness-state",
      features: [
        {
          id: "F001-example",
          slug: "example",
          title: "Example",
          path: ".lh/features/F001-example",
          status: "done",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
      ],
    };

    const state = normalizeState(legacy);
    const entry = state.features[0];
    expect(entry).toBeDefined();
    expect(entry!.id).toBe("F001-example");
    expect(entry!.slug).toBe("example");
    expect(entry!.title).toBe("Example");
    expect(entry!.path).toBe(".lh/features/F001-example");
    expect(entry!.status).toBe("done");
    expect(entry!.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(entry!.updatedAt).toBe("2026-01-02T00:00:00.000Z");
    expect(entry!.worktreePath).toBeUndefined();
    expect(entry!.worktreeBranch).toBeUndefined();
    expect(entry!.worktreeCreatedAt).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// normalizeFeatureEntry sanitizes bad input
// ---------------------------------------------------------------------------

describe("normalizeFeatureEntry sanitizes bad input", () => {
  it("converts non-string worktreePath to undefined", () => {
    const raw = {
      id: "F001",
      slug: "test",
      title: "Test",
      path: "F001-test",
      status: "draft",
      worktreePath: 42, // bad: number
    };

    const entry = normalizeFeatureEntry(raw);
    expect(entry.worktreePath).toBeUndefined();
  });

  it("converts empty string worktreePath to undefined", () => {
    const raw = {
      id: "F001",
      slug: "test",
      title: "Test",
      path: "F001-test",
      status: "draft",
      worktreePath: "", // bad: empty string
    };

    const entry = normalizeFeatureEntry(raw);
    expect(entry.worktreePath).toBeUndefined();
  });

  it("converts null worktreeBranch to undefined", () => {
    const raw = {
      id: "F001",
      slug: "test",
      title: "Test",
      path: "F001-test",
      status: "draft",
      worktreeBranch: null, // bad: null
    };

    const entry = normalizeFeatureEntry(raw);
    expect(entry.worktreeBranch).toBeUndefined();
  });

  it("converts empty string worktreeBranch to undefined", () => {
    const raw = {
      id: "F001",
      slug: "test",
      title: "Test",
      path: "F001-test",
      status: "draft",
      worktreeBranch: "", // bad: empty string
    };

    const entry = normalizeFeatureEntry(raw);
    expect(entry.worktreeBranch).toBeUndefined();
  });

  it("preserves valid worktreeCreatedAt string", () => {
    const raw = {
      id: "F001",
      slug: "test",
      title: "Test",
      path: "F001-test",
      status: "draft",
      worktreeCreatedAt: "2026-01-01T00:00:00.000Z",
    };

    const entry = normalizeFeatureEntry(raw);
    expect(entry.worktreeCreatedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("converts invalid worktreeCreatedAt to undefined", () => {
    const raw = {
      id: "F001",
      slug: "test",
      title: "Test",
      path: "F001-test",
      status: "draft",
      worktreeCreatedAt: 12345, // bad: number
    };

    const entry = normalizeFeatureEntry(raw);
    expect(entry.worktreeCreatedAt).toBeUndefined();
  });

  it("sanitizes all three worktree fields together: mixed valid and invalid", () => {
    const raw = {
      id: "F001",
      slug: "test",
      title: "Test",
      path: "F001-test",
      status: "draft",
      worktreePath: ".worktrees/feature-F001", // valid
      worktreeBranch: null, // invalid
      worktreeCreatedAt: "2026-01-01T00:00:00.000Z", // valid
    };

    const entry = normalizeFeatureEntry(raw);
    expect(entry.worktreePath).toBe(".worktrees/feature-F001");
    expect(entry.worktreeBranch).toBeUndefined();
    expect(entry.worktreeCreatedAt).toBe("2026-01-01T00:00:00.000Z");
  });
});

// ---------------------------------------------------------------------------
// setFeatureWorktree / clearFeatureWorktree round trip
// ---------------------------------------------------------------------------

describe("setFeatureWorktree / clearFeatureWorktree round trip", () => {
  function makeState(features: FeatureIndexEntry[] = []): HarnessState {
    return normalizeState({ features });
  }

  it("setFeatureWorktree sets all three fields correctly", () => {
    const state = makeState([
      {
        id: "F001-example",
        slug: "example",
        title: "Example",
        path: ".lh/features/F001-example",
        status: "active",
      },
    ]);

    const result = setFeatureWorktree(state, "F001-example", {
      path: ".worktrees/feature-F001-x",
      branch: "feature/F001-x",
      createdAt: "2026-01-03T00:00:00.000Z",
    });

    expect(result).toBe(true);
    const entry = state.features[0];
    expect(entry).toBeDefined();
    expect(entry!.worktreePath).toBe(".worktrees/feature-F001-x");
    expect(entry!.worktreeBranch).toBe("feature/F001-x");
    expect(entry!.worktreeCreatedAt).toBe("2026-01-03T00:00:00.000Z");
  });

  it("clearFeatureWorktree removes all three fields", () => {
    const state = makeState([
      {
        id: "F001-example",
        slug: "example",
        title: "Example",
        path: ".lh/features/F001-example",
        status: "active",
        worktreePath: ".worktrees/feature-F001-x",
        worktreeBranch: "feature/F001-x",
        worktreeCreatedAt: "2026-01-03T00:00:00.000Z",
      },
    ]);

    const result = clearFeatureWorktree(state, "F001-example");

    expect(result).toBe(true);
    const entry = state.features[0];
    expect(entry).toBeDefined();
    expect(entry!.worktreePath).toBeUndefined();
    expect(entry!.worktreeBranch).toBeUndefined();
    expect(entry!.worktreeCreatedAt).toBeUndefined();
  });

  it("setFeatureWorktree returns false for unknown feature id", () => {
    const state = makeState([
      {
        id: "F001-example",
        slug: "example",
        title: "Example",
        path: ".lh/features/F001-example",
        status: "active",
      },
    ]);

    const result = setFeatureWorktree(state, "F999-nope", {
      path: ".worktrees/feature-F999",
      branch: "feature/F999",
      createdAt: "2026-01-03T00:00:00.000Z",
    });

    expect(result).toBe(false);
    expect(state.features[0]!.worktreePath).toBeUndefined();
  });

  it("clearFeatureWorktree returns false for unknown feature id", () => {
    const state = makeState([
      {
        id: "F001-example",
        slug: "example",
        title: "Example",
        path: ".lh/features/F001-example",
        status: "active",
        worktreePath: ".worktrees/feature-F001",
        worktreeBranch: "feature/F001",
        worktreeCreatedAt: "2026-01-03T00:00:00.000Z",
      },
    ]);

    const result = clearFeatureWorktree(state, "F999-nope");

    expect(result).toBe(false);
    // Original entry should be unchanged
    const entry = state.features[0];
    expect(entry!.worktreePath).toBe(".worktrees/feature-F001");
    expect(entry!.worktreeBranch).toBe("feature/F001");
    expect(entry!.worktreeCreatedAt).toBe("2026-01-03T00:00:00.000Z");
  });

  it("setFeatureWorktree and clearFeatureWorktree do not throw on operations", () => {
    const state = makeState([
      {
        id: "F001-example",
        slug: "example",
        title: "Example",
        path: ".lh/features/F001-example",
        status: "active",
      },
    ]);

    expect(() => {
      setFeatureWorktree(state, "F001-example", {
        path: ".worktrees/feature-F001",
        branch: "feature/F001",
        createdAt: "2026-01-03T00:00:00.000Z",
      });
    }).not.toThrow();

    expect(() => {
      clearFeatureWorktree(state, "F001-example");
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Survival through existing mutation paths
// ---------------------------------------------------------------------------

describe("Survival through existing mutation paths", () => {
  function makeState(features: FeatureIndexEntry[] = []): HarnessState {
    return normalizeState({ features });
  }

  it("worktree fields survive upsertFeatureEntry with spread operator", () => {
    const state = makeState([
      {
        id: "F001-example",
        slug: "example",
        title: "Example",
        path: ".lh/features/F001-example",
        status: "active",
      },
    ]);

    // Set worktree fields
    setFeatureWorktree(state, "F001-example", {
      path: ".worktrees/feature-F001",
      branch: "feature/F001",
      createdAt: "2026-01-03T00:00:00.000Z",
    });

    const entryBeforeUpsert = state.features[0];
    expect(entryBeforeUpsert!.worktreePath).toBe(".worktrees/feature-F001");
    expect(entryBeforeUpsert!.worktreeBranch).toBe("feature/F001");
    expect(entryBeforeUpsert!.worktreeCreatedAt).toBe("2026-01-03T00:00:00.000Z");

    // Simulate external code spreading and re-upserting the entry
    // (e.g., updating the status while preserving other fields)
    const modifiedEntry = { ...entryBeforeUpsert, status: "done" } as FeatureIndexEntry;
    upsertFeatureEntry(state, modifiedEntry);

    const entryAfterUpsert = state.features[0];
    expect(entryAfterUpsert!.status).toBe("done");
    expect(entryAfterUpsert!.worktreePath).toBe(".worktrees/feature-F001");
    expect(entryAfterUpsert!.worktreeBranch).toBe("feature/F001");
    expect(entryAfterUpsert!.worktreeCreatedAt).toBe("2026-01-03T00:00:00.000Z");
  });

  it("worktree fields survive multiple upsertFeatureEntry calls", () => {
    const state = makeState([
      {
        id: "F001-example",
        slug: "example",
        title: "Example",
        path: ".lh/features/F001-example",
        status: "draft",
      },
    ]);

    // First mutation: add worktree
    setFeatureWorktree(state, "F001-example", {
      path: ".worktrees/feature-F001",
      branch: "feature/F001",
      createdAt: "2026-01-03T00:00:00.000Z",
    });

    // Second mutation: update via upsert without touching worktree
    const entry = state.features[0]!;
    upsertFeatureEntry(state, { ...entry, title: "Updated Title" });

    // Third mutation: another upsert
    const entry2 = state.features[0]!;
    upsertFeatureEntry(state, { ...entry2, status: "active" });

    const finalEntry = state.features[0]!;
    expect(finalEntry.title).toBe("Updated Title");
    expect(finalEntry.status).toBe("active");
    expect(finalEntry.worktreePath).toBe(".worktrees/feature-F001");
    expect(finalEntry.worktreeBranch).toBe("feature/F001");
    expect(finalEntry.worktreeCreatedAt).toBe("2026-01-03T00:00:00.000Z");
  });

  it("worktree fields survive upsertFeatureEntry when other entries exist", () => {
    const state = makeState([
      {
        id: "F001-a",
        slug: "a",
        title: "A",
        path: "F001-a",
        status: "draft",
      },
      {
        id: "F002-b",
        slug: "b",
        title: "B",
        path: "F002-b",
        status: "draft",
      },
    ]);

    // Set worktree on F001
    setFeatureWorktree(state, "F001-a", {
      path: ".worktrees/feature-F001",
      branch: "feature/F001",
      createdAt: "2026-01-03T00:00:00.000Z",
    });

    // Upsert F002 with new data
    const f002 = state.features.find((f) => f.id === "F002-b")!;
    upsertFeatureEntry(state, { ...f002, status: "active" });

    // F001's worktree should be preserved
    const f001 = state.features.find((f) => f.id === "F001-a")!;
    expect(f001.worktreePath).toBe(".worktrees/feature-F001");
    expect(f001.worktreeBranch).toBe("feature/F001");
    expect(f001.worktreeCreatedAt).toBe("2026-01-03T00:00:00.000Z");

    // F002 should have updated status but no worktree
    const f002After = state.features.find((f) => f.id === "F002-b")!;
    expect(f002After.status).toBe("active");
    expect(f002After.worktreePath).toBeUndefined();
  });
});
