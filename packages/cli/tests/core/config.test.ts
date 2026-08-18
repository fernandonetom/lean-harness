import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fsp from "node:fs/promises";
import { getVersion } from "../../src/core/version.js";
import {
  loadHarnessConfig,
  loadHarnessState,
  saveHarnessState,
  createDefaultState,
  createDefaultConfigYaml,
  createDefaultMemoryFile,
} from "../../src/core/config.js";
import { createTempWorkspace, initHarnessWorkspace, type TestWorkspace } from "../helpers/workspace.js";

let ws: TestWorkspace;

beforeEach(async () => {
  ws = await createTempWorkspace();
});

afterEach(async () => {
  await ws.cleanup();
});

describe("createDefaultState", () => {
  it("returns the expected default state shape with current version", () => {
    const state = createDefaultState();
    expect(state.version).toBe(getVersion());
    expect(state.schema).toBe("leanharness-state");
    expect(state.activeFeature).toBeNull();
    expect(state.nextFeatureNumber).toBe(1);
    expect(state.features).toEqual([]);
    expect(state.lastUpdated).toBeNull();
    expect(state.notes).toContain("State is a cache/index");
  });
});

describe("createDefaultConfigYaml", () => {
  it("returns a string containing expected top-level keys", () => {
    const yaml = createDefaultConfigYaml();
    expect(typeof yaml).toBe("string");
    expect(yaml).toContain("version:");
    expect(yaml).toContain("project:");
    expect(yaml).toContain("host:");
    expect(yaml).toContain("workflow:");
    expect(yaml).toContain("artifacts:");
    expect(yaml).toContain("discovery:");
    expect(yaml).toContain("context:");
    expect(yaml).toContain("compression:");
    expect(yaml).toContain("verification:");
    expect(yaml).toContain("risk_gates:");
    expect(yaml).toContain("memory:");
    expect(yaml).toContain("logging:");
    expect(yaml).toContain("adapters:");
  });
});

describe("createDefaultMemoryFile", () => {
  it("returns markdown with the given title as heading", () => {
    const result = createDefaultMemoryFile("Project Memory");
    expect(result).toContain("# Project Memory");
    expect(result).toContain("LeanHarness memory file");
  });

  it("works with different titles", () => {
    const result = createDefaultMemoryFile("Decisions");
    expect(result).toContain("# Decisions");
  });
});

describe("loadHarnessConfig", () => {
  it("returns exists=false when no config.yml exists", async () => {
    const result = await loadHarnessConfig(ws.root);
    expect(result.exists).toBe(false);
    expect(result.raw).toBeNull();
    expect(result.parsed).toBeNull();
    expect(result.path).toContain("config.yml");
  });

  it("returns exists=true with raw and parsed when config.yml exists", async () => {
    await initHarnessWorkspace(ws.root);
    const result = await loadHarnessConfig(ws.root);
    expect(result.exists).toBe(true);
    expect(typeof result.raw).toBe("string");
    expect(result.parsed).not.toBeNull();
  });

  it("parses top-level scalar values from config.yml", async () => {
    await initHarnessWorkspace(ws.root);
    const result = await loadHarnessConfig(ws.root);
    expect(result.parsed).not.toBeNull();
    // The default config has version matching current package.json
    expect(result.parsed!.version).toBe(getVersion());
  });

  it("parses nested sections from config.yml", async () => {
    await initHarnessWorkspace(ws.root);
    const result = await loadHarnessConfig(ws.root);
    const parsed = result.parsed!;

    // project section
    expect(parsed.project).toBeDefined();
    expect((parsed.project as Record<string, unknown>)["name"]).toBe("auto");
    expect((parsed.project as Record<string, unknown>)["mode"]).toBe(
      "brownfield-first",
    );

    // host section
    expect(parsed.host).toBeDefined();
    expect((parsed.host as Record<string, unknown>)["primary"]).toBe(
      "claude-code",
    );

    // discovery section
    expect(parsed.discovery).toBeDefined();
    expect((parsed.discovery as Record<string, unknown>)["strategy"]).toBe(
      "on-demand",
    );
  });

  it("parses boolean values from config.yml", async () => {
    await initHarnessWorkspace(ws.root);
    const result = await loadHarnessConfig(ws.root);
    const parsed = result.parsed!;

    const workflow = parsed.workflow as Record<string, unknown>;
    expect(workflow["require_worktree"]).toBe(false);
    expect(workflow["require_review"]).toBe(true);
    expect(workflow["require_verification"]).toBe(true);
  });

  it("parses integer values from config.yml", async () => {
    await initHarnessWorkspace(ws.root);
    const result = await loadHarnessConfig(ws.root);
    const parsed = result.parsed!;

    const discovery = parsed.discovery as Record<string, unknown>;
    expect(discovery["max_initial_files"]).toBe(25);
  });

  it("handles a minimal custom config.yml", async () => {
    const harnessDir = path.join(ws.root, ".lh");
    await fsp.mkdir(harnessDir, { recursive: true });
    await fsp.writeFile(
      path.join(harnessDir, "config.yml"),
      'version: "0.2"\n\nproject:\n  name: my-app\n',
    );

    const result = await loadHarnessConfig(ws.root);
    expect(result.exists).toBe(true);
    expect(result.parsed).not.toBeNull();
    expect(result.parsed!.version).toBe("0.2");
    expect((result.parsed!.project as Record<string, unknown>)["name"]).toBe(
      "my-app",
    );
  });

  it("parses YAML arrays (risk_gates.require_approval)", async () => {
    await initHarnessWorkspace(ws.root);
    const result = await loadHarnessConfig(ws.root);
    const riskGates = result.parsed!.risk_gates as Record<string, unknown>;
    const approvals = riskGates["require_approval"];
    expect(Array.isArray(approvals)).toBe(true);
    expect(approvals).toHaveLength(7);
    expect(approvals).toContain("destructive_migration");
    expect(approvals).toContain("security_sensitive_change");
  });

  it("parses YAML arrays (workflow.visible_steps)", async () => {
    await initHarnessWorkspace(ws.root);
    const result = await loadHarnessConfig(ws.root);
    const workflow = result.parsed!.workflow as Record<string, unknown>;
    const steps = workflow["visible_steps"];
    expect(Array.isArray(steps)).toBe(true);
    expect(steps).toEqual(["specify", "discover", "build", "check"]);
  });

  it("parses flow sequences [a, b, c]", async () => {
    const harnessDir = path.join(ws.root, ".lh");
    await fsp.mkdir(harnessDir, { recursive: true });
    await fsp.writeFile(
      path.join(harnessDir, "config.yml"),
      'version: getVersion()\n\ntest:\n  items: [foo, bar, baz]\n',
    );
    const result = await loadHarnessConfig(ws.root);
    const test = result.parsed!["test"] as Record<string, unknown>;
    expect(test["items"]).toEqual(["foo", "bar", "baz"]);
  });

  it("round-trips the full default config without data loss", async () => {
    await initHarnessWorkspace(ws.root);
    const result = await loadHarnessConfig(ws.root);
    const parsed = result.parsed!;

    // All top-level keys present
    expect(parsed.version).toBeDefined();
    expect(parsed.project).toBeDefined();
    expect(parsed.host).toBeDefined();
    expect(parsed.workflow).toBeDefined();
    expect(parsed.artifacts).toBeDefined();
    expect(parsed.discovery).toBeDefined();
    expect(parsed.context).toBeDefined();
    expect(parsed.compression).toBeDefined();
    expect(parsed.verification).toBeDefined();
    expect(parsed.risk_gates).toBeDefined();
    expect(parsed.memory).toBeDefined();
    expect(parsed.logging).toBeDefined();
    expect(parsed.adapters).toBeDefined();
  });
});

describe("loadHarnessState", () => {
  it("returns default state when no state.json exists", async () => {
    const state = await loadHarnessState(ws.root);
    expect(state.version).toBe(getVersion());
    expect(state.schema).toBe("leanharness-state");
    expect(state.activeFeature).toBeNull();
    expect(state.nextFeatureNumber).toBe(1);
    expect(state.features).toEqual([]);
    expect(state.lastUpdated).toBeNull();
  });

  it("loads state from an existing state.json", async () => {
    await initHarnessWorkspace(ws.root);
    const state = await loadHarnessState(ws.root);
    expect(state.version).toBe(getVersion());
    expect(state.schema).toBe("leanharness-state");
  });

  it("normalizes snake_case keys to camelCase", async () => {
    const harnessDir = path.join(ws.root, ".lh");
    await fsp.mkdir(harnessDir, { recursive: true });
    await fsp.writeFile(
      path.join(harnessDir, "state.json"),
      JSON.stringify({
        version: getVersion(),
        schema: "leanharness-state",
        active_feature: "feat-1",
        nextFeatureNumber: 3,
        features: [],
        last_updated: "2026-01-01T00:00:00Z",
      }),
    );

    const state = await loadHarnessState(ws.root);
    expect(state.activeFeature).toBe("feat-1");
    expect(state.lastUpdated).toBe("2026-01-01T00:00:00Z");
  });
});

describe("saveHarnessState", () => {
  it("writes state.json to .lh/", async () => {
    const harnessDir = path.join(ws.root, ".lh");
    await fsp.mkdir(harnessDir, { recursive: true });

    const state = createDefaultState();
    state.activeFeature = "test-feature";
    await saveHarnessState(ws.root, state);

    const raw = await fsp.readFile(
      path.join(harnessDir, "state.json"),
      "utf-8",
    );
    const parsed = JSON.parse(raw);
    expect(parsed.activeFeature).toBe("test-feature");
  });

  it("overwrites by default", async () => {
    await initHarnessWorkspace(ws.root);

    const state = createDefaultState();
    state.nextFeatureNumber = 42;
    await saveHarnessState(ws.root, state);

    const loaded = await loadHarnessState(ws.root);
    expect(loaded.nextFeatureNumber).toBe(42);
  });

  it("respects overwrite=false", async () => {
    await initHarnessWorkspace(ws.root);

    const state = createDefaultState();
    state.nextFeatureNumber = 99;
    await saveHarnessState(ws.root, state, { overwrite: false });

    // Should have been skipped since state.json already exists from init
    const loaded = await loadHarnessState(ws.root);
    expect(loaded.nextFeatureNumber).toBe(1);
  });
});
