import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { runWorktreeListCommand, runWorktreeLinkCommand, runWorktreeUnlinkCommand } from "../../src/commands/worktree.js";
import { runInitCommand } from "../../src/commands/init.js";
import { initGitRepo, gitOut } from "../helpers/git.js";
import { createTestState, createTestFeatureEntry } from "../helpers/fixture.js";
import { addWorktree } from "../../src/core/git.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "lh-worktree-list-remove-"));
});

afterEach(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

/**
 * Helper to set up a minimal LeanHarness repo with a feature
 */
async function setupRepo(): Promise<string> {
  await initGitRepo(tempDir);
  await runInitCommand({ cwd: tempDir });

  const lhDir = path.join(tempDir, ".lh");
  const featuresDir = path.join(lhDir, "features");
  const featureDir = path.join(featuresDir, "F001-test-feature");
  await fs.mkdir(featureDir, { recursive: true });

  await fs.writeFile(
    path.join(featureDir, "spec.md"),
    "# Spec: F001 — Test Feature\n\nStatus: draft\n"
  );

  const stateFile = path.join(lhDir, "state.json");
  const state = createTestState({
    features: [
      createTestFeatureEntry({
        id: "F001",
        slug: "test-feature",
        title: "Test Feature",
        path: "F001-test-feature",
      }),
    ],
  });
  await fs.writeFile(stateFile, JSON.stringify(state, null, 2));

  return tempDir;
}

/** Create a real git worktree out-of-band (standing in for what the lh-worktree skill would do). */
async function createWorktree(root: string, targetPath: string, branch: string): Promise<void> {
  const result = await addWorktree(root, { path: targetPath, branch, createBranch: true });
  if (result.exitCode !== 0) {
    throw new Error(`addWorktree failed: ${result.stderr}`);
  }
}

async function captureJson(fn: () => Promise<void>): Promise<any> {
  const chunks: string[] = [];
  const spy = vi.spyOn(process.stdout, "write").mockImplementation((chunk: any) => {
    chunks.push(String(chunk));
    return true;
  });
  try {
    await fn();
  } finally {
    spy.mockRestore();
  }
  return JSON.parse(chunks.join(""));
}

describe("runWorktreeListCommand", () => {
  it("returns empty list on repo with no worktrees created yet", async () => {
    const root = await setupRepo();

    const result = await captureJson(() =>
      runWorktreeListCommand({ cwd: root, json: true })
    );

    expect(result.ok).toBe(true);
    expect(Array.isArray(result.worktrees)).toBe(true);
  });

  it("shows recorded feature worktree after runWorktreeLinkCommand", async () => {
    const root = await setupRepo();
    const worktreePath = path.join(root, ".worktrees", "feature-F001-test-feature");
    await createWorktree(root, worktreePath, "feature/F001-test-feature");

    await runWorktreeLinkCommand({
      cwd: root,
      ref: "F001",
      path: worktreePath,
      json: true,
    });

    const result = await captureJson(() =>
      runWorktreeListCommand({ cwd: root, json: true })
    );

    const f001Entry = result.worktrees.find((w: any) => w.featureId === "F001");
    expect(f001Entry).toBeDefined();
    expect(f001Entry.branch).toBe("feature/F001-test-feature");
    expect(f001Entry.status).toBe("linked");
  });

  it("shows untracked-by-lh status for a worktree that was never linked", async () => {
    const root = await setupRepo();
    const manualWtPath = path.join(root, "manual-worktree");
    await createWorktree(root, manualWtPath, "manual-branch");

    const result = await captureJson(() =>
      runWorktreeListCommand({ cwd: root, json: true })
    );

    const manualEntry = result.worktrees.find((w: any) => w.branch === "manual-branch");
    expect(manualEntry).toBeDefined();
    expect(manualEntry.status).toBe("untracked-by-lh");
  });

  it("shows stale status for a linked worktree that was manually deleted", async () => {
    const root = await setupRepo();
    const worktreePath = path.join(root, ".worktrees", "feature-F001-test-feature");
    await createWorktree(root, worktreePath, "feature/F001-test-feature");
    await runWorktreeLinkCommand({ cwd: root, ref: "F001", path: worktreePath, json: true });

    await fs.rm(worktreePath, { recursive: true, force: true });

    const result = await captureJson(() =>
      runWorktreeListCommand({ cwd: root, json: true })
    );

    const staleEntry = result.worktrees.find((w: any) => w.featureId === "F001");
    expect(staleEntry).toBeDefined();
    expect(staleEntry.status).toBe("stale");
  });
});

describe("runWorktreeLinkCommand", () => {
  it("records an existing, registered worktree against a feature", async () => {
    const root = await setupRepo();
    const worktreePath = path.join(root, ".worktrees", "feature-F001-test-feature");
    await createWorktree(root, worktreePath, "feature/F001-test-feature");

    await runWorktreeLinkCommand({ cwd: root, ref: "F001", path: worktreePath, json: true });

    const state = JSON.parse(await fs.readFile(path.join(root, ".lh", "state.json"), "utf-8"));
    const feature = state.features.find((f: any) => f.id === "F001");
    expect(feature.worktreeBranch).toBe("feature/F001-test-feature");
    expect(path.resolve(root, feature.worktreePath)).toBe(worktreePath);
  });

  it("defaults branch to the worktree's actual branch when --branch is omitted", async () => {
    const root = await setupRepo();
    const worktreePath = path.join(root, "custom-dir");
    await createWorktree(root, worktreePath, "some-other-branch");

    await runWorktreeLinkCommand({ cwd: root, ref: "F001", path: worktreePath, json: true });

    const state = JSON.parse(await fs.readFile(path.join(root, ".lh", "state.json"), "utf-8"));
    const feature = state.features.find((f: any) => f.id === "F001");
    expect(feature.worktreeBranch).toBe("some-other-branch");
  });

  it("rejects a path that isn't a registered git worktree without --force", async () => {
    const root = await setupRepo();
    const bogusPath = path.join(root, "not-a-worktree");
    await fs.mkdir(bogusPath, { recursive: true });

    await expect(
      runWorktreeLinkCommand({ cwd: root, ref: "F001", path: bogusPath, json: true })
    ).rejects.toThrow(/not a registered git worktree/i);
  });

  it("accepts an unregistered path with --force", async () => {
    const root = await setupRepo();
    const bogusPath = path.join(root, "not-a-worktree");
    await fs.mkdir(bogusPath, { recursive: true });

    await runWorktreeLinkCommand({
      cwd: root,
      ref: "F001",
      path: bogusPath,
      branch: "custom-branch",
      force: true,
      json: true,
    });

    const state = JSON.parse(await fs.readFile(path.join(root, ".lh", "state.json"), "utf-8"));
    const feature = state.features.find((f: any) => f.id === "F001");
    expect(feature.worktreeBranch).toBe("custom-branch");
  });
});

describe("runWorktreeUnlinkCommand", () => {
  it("clears the feature's worktree record", async () => {
    const root = await setupRepo();
    const worktreePath = path.join(root, ".worktrees", "feature-F001-test-feature");
    await createWorktree(root, worktreePath, "feature/F001-test-feature");
    await runWorktreeLinkCommand({ cwd: root, ref: "F001", path: worktreePath, json: true });

    const result = await captureJson(() =>
      runWorktreeUnlinkCommand({ cwd: root, ref: "F001", json: true })
    );
    expect(result.unlinked).toBe(true);

    const state = JSON.parse(await fs.readFile(path.join(root, ".lh", "state.json"), "utf-8"));
    const feature = state.features.find((f: any) => f.id === "F001");
    expect(feature.worktreePath).toBeUndefined();
    expect(feature.worktreeBranch).toBeUndefined();
  });

  it("is idempotent when nothing is recorded", async () => {
    const root = await setupRepo();

    const result = await captureJson(() =>
      runWorktreeUnlinkCommand({ cwd: root, ref: "F001", json: true })
    );
    expect(result.ok).toBe(true);
    expect(result.unlinked).toBe(false);
  });

  it("does not touch the actual git worktree or branch", async () => {
    const root = await setupRepo();
    const worktreePath = path.join(root, ".worktrees", "feature-F001-test-feature");
    await createWorktree(root, worktreePath, "feature/F001-test-feature");
    await runWorktreeLinkCommand({ cwd: root, ref: "F001", path: worktreePath, json: true });

    await runWorktreeUnlinkCommand({ cwd: root, ref: "F001", json: true });

    const branchList = await gitOut(root, ["branch", "--list"]);
    expect(branchList).toContain("feature/F001-test-feature");
    await expect(fs.stat(worktreePath)).resolves.toBeDefined();
  });
});
