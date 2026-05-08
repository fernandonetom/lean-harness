import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fsp from "node:fs/promises";
import { runDiscovery } from "../../src/discovery/index.js";
import { createTempWorkspace, initHarnessWorkspace, type TestWorkspace } from "../helpers/workspace.js";
import { createFeature } from "../../src/core/features.js";
import { fileExists, readTextFile } from "../../src/core/fs.js";

let ws: TestWorkspace;

beforeEach(async () => {
  ws = await createTempWorkspace();
  await initHarnessWorkspace(ws.root);
});

afterEach(async () => {
  await ws.cleanup();
});

describe("runDiscovery", () => {
  it("creates discovery.md, boundary.json, events.jsonl, and cavebus.log", async () => {
    // Create a feature with a spec
    const feature = await createFeature({
      root: ws.root,
      request: "Add password reset",
    });

    // Create some source files so discovery has something to find
    await fsp.mkdir(path.join(ws.root, "src", "auth"), { recursive: true });
    await fsp.writeFile(
      path.join(ws.root, "src", "auth", "password.ts"),
      "export function resetPassword() {}\n",
    );

    const result = await runDiscovery({
      root: ws.root,
      featureRef: feature.id,
      depth: "D2",
    });

    expect(result.featureId).toBe(feature.id);
    expect(result.depth).toBe("D2");

    // Check that artifacts were created
    expect(result.createdOrUpdated).toContain("discovery.md");
    expect(result.createdOrUpdated).toContain("boundary.json");
    expect(result.createdOrUpdated).toContain("events.jsonl");
    expect(result.createdOrUpdated).toContain("cavebus.log");

    // Verify files exist on disk
    const featureDir = path.join(
      ws.root,
      ".lh",
      "features",
      feature.folderName,
    );
    expect(await fileExists(path.join(featureDir, "discovery.md"))).toBe(true);
    expect(await fileExists(path.join(featureDir, "boundary.json"))).toBe(true);
    expect(await fileExists(path.join(featureDir, "events.jsonl"))).toBe(true);
    expect(await fileExists(path.join(featureDir, "cavebus.log"))).toBe(true);

    // Verify discovery.md content has expected heading
    const discoveryContent = await readTextFile(
      path.join(featureDir, "discovery.md"),
    );
    expect(discoveryContent).toContain(`# ${feature.id} Discovery`);

    // Verify events.jsonl contains a discovery event
    const eventsContent = await readTextFile(
      path.join(featureDir, "events.jsonl"),
    );
    expect(eventsContent).toContain("feature.discovered");

    // Verify boundary.json is valid JSON
    const boundaryContent = await readTextFile(
      path.join(featureDir, "boundary.json"),
    );
    const boundary = JSON.parse(boundaryContent!);
    expect(boundary.featureId).toBe(feature.id);
    expect(boundary.status).toBe("discovered");
  });

  it("throws error when spec is missing", async () => {
    // Create the feature directory manually without spec.md
    const featureDir = path.join(
      ws.root,
      ".lh",
      "features",
      "F001-no-spec",
    );
    await fsp.mkdir(featureDir, { recursive: true });

    // Add the feature to state manually
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
      runDiscovery({ root: ws.root, featureRef: "F001" }),
    ).rejects.toThrow(/spec\.md is missing/);
  });

  it("throws error when feature does not exist", async () => {
    await expect(
      runDiscovery({ root: ws.root, featureRef: "F999" }),
    ).rejects.toThrow(/Could not find feature/);
  });

  it("works with D0 depth (no file search)", async () => {
    const feature = await createFeature({
      root: ws.root,
      request: "Simple feature",
    });

    const result = await runDiscovery({
      root: ws.root,
      featureRef: feature.id,
      depth: "D0",
    });

    expect(result.depth).toBe("D0");
    expect(result.search.candidates).toHaveLength(0);
    expect(result.createdOrUpdated).toContain("discovery.md");
    expect(result.createdOrUpdated).toContain("boundary.json");
  });

  it("D2 includes files discovered via import chain", async () => {
    const feature = await createFeature({
      root: ws.root,
      request: "iOS OTP autofocus",
    });

    await fsp.mkdir(
      path.join(ws.root, "src", "components", "otp"),
      { recursive: true },
    );
    await fsp.mkdir(
      path.join(ws.root, "src", "components", "modal-sheet"),
      { recursive: true },
    );

    await fsp.writeFile(
      path.join(ws.root, "src", "components", "otp", "otp-input.tsx"),
      `import { ModalSheet } from '../modal-sheet/modal-sheet';\nexport function OtpInput() { return <ModalSheet />; }\n`,
    );
    await fsp.writeFile(
      path.join(ws.root, "src", "components", "modal-sheet", "modal-sheet.tsx"),
      `export function ModalSheet() { return null; }\n`,
    );

    const result = await runDiscovery({
      root: ws.root,
      featureRef: feature.id,
      depth: "D2",
    });

    const touchPaths = result.boundary.touchFiles.map((f) => f.path);
    expect(touchPaths).toContain("src/components/otp/otp-input.tsx");
    expect(touchPaths).toContain(
      "src/components/modal-sheet/modal-sheet.tsx",
    );

    expect(result.boundary.allowedEditGlobs).toContain(
      "src/components/modal-sheet/modal-sheet.tsx",
    );
  });

  it("D1 does not traverse imports", async () => {
    const feature = await createFeature({
      root: ws.root,
      request: "iOS OTP autofocus",
    });

    await fsp.mkdir(
      path.join(ws.root, "src", "components", "otp"),
      { recursive: true },
    );
    await fsp.mkdir(
      path.join(ws.root, "src", "components", "modal-sheet"),
      { recursive: true },
    );

    await fsp.writeFile(
      path.join(ws.root, "src", "components", "otp", "otp-input.tsx"),
      `import { ModalSheet } from '../modal-sheet/modal-sheet';\nexport function OtpInput() { return <ModalSheet />; }\n`,
    );
    await fsp.writeFile(
      path.join(ws.root, "src", "components", "modal-sheet", "modal-sheet.tsx"),
      `export function ModalSheet() { return null; }\n`,
    );

    const result = await runDiscovery({
      root: ws.root,
      featureRef: feature.id,
      depth: "D1",
    });

    const touchPaths = result.boundary.touchFiles.map((f) => f.path);
    expect(touchPaths).not.toContain(
      "src/components/modal-sheet/modal-sheet.tsx",
    );
  });

  it("returns project detection info", async () => {
    const feature = await createFeature({
      root: ws.root,
      request: "Test project detection",
    });

    // Add some project indicators
    await fsp.writeFile(path.join(ws.root, "package.json"), "{}");
    await fsp.writeFile(path.join(ws.root, "tsconfig.json"), "{}");

    const result = await runDiscovery({
      root: ws.root,
      featureRef: feature.id,
    });

    expect(result.project.languages).toContain("typescript");
    expect(result.project.packageManagers).toContain("npm");
  });
});
