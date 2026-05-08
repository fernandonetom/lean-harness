import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fsp from "node:fs/promises";
import { runPlanning } from "../../src/planning/index.js";
import { createTempWorkspace, initHarnessWorkspace, type TestWorkspace } from "../helpers/workspace.js";
import { createFeature } from "../../src/core/features.js";
import { runDiscovery } from "../../src/discovery/index.js";
import { fileExists, readTextFile } from "../../src/core/fs.js";
import { SAMPLE_BOUNDARY_JSON } from "../helpers/fixture.js";

let ws: TestWorkspace;

beforeEach(async () => {
  ws = await createTempWorkspace();
  await initHarnessWorkspace(ws.root);
});

afterEach(async () => {
  await ws.cleanup();
});

describe("runPlanning", () => {
  it("produces plan.md and tasks.md after discovery", async () => {
    // Create feature with spec
    const feature = await createFeature({
      root: ws.root,
      request: "Add password reset",
    });

    // Create source files for discovery to find
    await fsp.mkdir(path.join(ws.root, "src", "auth"), { recursive: true });
    await fsp.writeFile(
      path.join(ws.root, "src", "auth", "password.ts"),
      "export function resetPassword() {}\n",
    );

    // Run discovery first
    await runDiscovery({
      root: ws.root,
      featureRef: feature.id,
      depth: "D2",
    });

    // Run planning
    const result = await runPlanning({
      root: ws.root,
      featureRef: feature.id,
    });

    expect(result.featureId).toBe(feature.id);
    expect(result.taskCount).toBeGreaterThan(0);
    expect(result.tasks.length).toBeGreaterThan(0);

    // Check files exist
    const featureDir = path.join(
      ws.root,
      ".lh",
      "features",
      feature.folderName,
    );
    expect(
      await fileExists(path.join(featureDir, "plan.md")),
    ).toBe(true);
    expect(
      await fileExists(path.join(featureDir, "tasks.md")),
    ).toBe(true);

    // Verify plan.md content
    const planContent = await readTextFile(
      path.join(featureDir, "plan.md"),
    );
    expect(planContent).toContain(`# ${feature.id} Plan`);
    expect(planContent).toContain("## Status");

    // Verify tasks.md content
    const tasksContent = await readTextFile(
      path.join(featureDir, "tasks.md"),
    );
    expect(tasksContent).toContain(`# ${feature.id} Tasks`);
    expect(tasksContent).toContain("## Tasks");
  });

  it("produces draft plan with --from-spec when no discovery exists", async () => {
    const feature = await createFeature({
      root: ws.root,
      request: "Add user notifications",
    });

    const result = await runPlanning({
      root: ws.root,
      featureRef: feature.id,
      fromSpec: true,
    });

    expect(result.status).toBe("draft");
    expect(result.taskCount).toBe(3);
    expect(result.warnings.some((w) => w.includes("spec only"))).toBe(true);
  });

  it("throws error when feature does not exist", async () => {
    await expect(
      runPlanning({ root: ws.root, featureRef: "F999" }),
    ).rejects.toThrow(/Could not find feature/);
  });

  it("throws error when spec is missing", async () => {
    // Create feature dir without spec
    const featureDir = path.join(
      ws.root,
      ".lh",
      "features",
      "F001-no-spec",
    );
    await fsp.mkdir(featureDir, { recursive: true });

    const { loadState, saveState, upsertFeatureEntry } = await import(
      "../../src/core/state.js"
    );
    const state = await loadState(ws.root);
    upsertFeatureEntry(state, {
      id: "F001",
      slug: "no-spec",
      title: "No Spec",
      path: "F001-no-spec",
      status: "draft",
    });
    await saveState(ws.root, state);

    await expect(
      runPlanning({ root: ws.root, featureRef: "F001" }),
    ).rejects.toThrow(/spec\.md is missing/);
  });

  it("throws error when discovery is missing and --from-spec not set", async () => {
    const feature = await createFeature({
      root: ws.root,
      request: "Need discovery first",
    });

    await expect(
      runPlanning({ root: ws.root, featureRef: feature.id }),
    ).rejects.toThrow(/discovery\.md is missing/);
  });

  it("throws error when plan already exists without --force", async () => {
    const feature = await createFeature({
      root: ws.root,
      request: "Already planned",
    });

    // Create plan from spec first
    await runPlanning({
      root: ws.root,
      featureRef: feature.id,
      fromSpec: true,
    });

    // Try to plan again without force
    await expect(
      runPlanning({
        root: ws.root,
        featureRef: feature.id,
        fromSpec: true,
      }),
    ).rejects.toThrow(/already exists/);
  });

  it("overwrites plan when --force is set", async () => {
    const feature = await createFeature({
      root: ws.root,
      request: "Force overwrite",
    });

    // Create initial plan
    await runPlanning({
      root: ws.root,
      featureRef: feature.id,
      fromSpec: true,
    });

    // Force overwrite
    const result = await runPlanning({
      root: ws.root,
      featureRef: feature.id,
      fromSpec: true,
      force: true,
    });

    expect(result.status).toBe("draft");
    expect(result.taskCount).toBe(3);
  });

  it("updates events.jsonl with planning event", async () => {
    const feature = await createFeature({
      root: ws.root,
      request: "Track events",
    });

    await runPlanning({
      root: ws.root,
      featureRef: feature.id,
      fromSpec: true,
    });

    const featureDir = path.join(
      ws.root,
      ".lh",
      "features",
      feature.folderName,
    );
    const eventsContent = await readTextFile(
      path.join(featureDir, "events.jsonl"),
    );

    expect(eventsContent).toContain("feature.planned");
  });

  it("respects taskSize option", async () => {
    const feature = await createFeature({
      root: ws.root,
      request: "Small tasks",
    });

    // Create source files
    await fsp.mkdir(path.join(ws.root, "src"), { recursive: true });
    for (let i = 0; i < 6; i++) {
      await fsp.writeFile(
        path.join(ws.root, "src", `small${i}.ts`),
        `export const small${i} = true;\n`,
      );
    }

    // Run discovery
    await runDiscovery({
      root: ws.root,
      featureRef: feature.id,
      depth: "D1",
    });

    // Plan with small task size
    const result = await runPlanning({
      root: ws.root,
      featureRef: feature.id,
      taskSize: "small",
    });

    expect(result.taskCount).toBeGreaterThan(0);
  });
});
