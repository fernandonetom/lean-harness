import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import {
  resolveHarnessRoot,
  resolveRoots,
} from "../../src/core/harness-root.js";
import { createTempWorkspace, type TestWorkspace } from "../helpers/workspace.js";

let ws: TestWorkspace;

beforeEach(async () => {
  ws = await createTempWorkspace();
});

afterEach(async () => {
  await ws.cleanup();
});

describe("resolveHarnessRoot", () => {
  it("returns cwd when .lh/state.json exists in cwd (no git)", async () => {
    // Create .lh/state.json in the plain directory
    const lhDir = path.join(ws.root, ".lh");
    await fsp.mkdir(lhDir, { recursive: true });
    await fsp.writeFile(path.join(lhDir, "state.json"), "{}");

    const result = await resolveHarnessRoot(ws.root);

    // Use realpath to handle macOS /tmp → /private/tmp
    const resultPath = fs.realpathSync(result);
    const expectedPath = fs.realpathSync(ws.root);
    expect(resultPath).toBe(expectedPath);
  });

  it("returns cwd unchanged when no .lh/ exists and not in a git repo", async () => {
    // No .lh/ directory created, no git repo
    const result = await resolveHarnessRoot(ws.root);

    // Should return the cwd unchanged
    const resultPath = fs.realpathSync(result);
    const expectedPath = fs.realpathSync(ws.root);
    expect(resultPath).toBe(expectedPath);
  });
});

describe("resolveRoots", () => {
  it("returns matching roots with isLinkedWorktree=false for non-git, non-.lh dir", async () => {
    // Plain directory with no git and no .lh/
    const result = await resolveRoots(ws.root);

    const harnessPath = fs.realpathSync(result.harnessRoot);
    const worktreePath = fs.realpathSync(result.worktreeRoot);
    const cwdPath = fs.realpathSync(ws.root);

    expect(harnessPath).toBe(cwdPath);
    expect(worktreePath).toBe(cwdPath);
    expect(result.isLinkedWorktree).toBe(false);
  });
});
