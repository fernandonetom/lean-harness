import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fsp from "node:fs/promises";
import { runBuild } from "../../src/build/index.js";
import { createTempWorkspace, initHarnessWorkspace } from "../helpers/workspace.js";
import { initGitRepo, gitOut } from "../helpers/git.js";
import {
  createTestFeatureEntry,
  SAMPLE_SPEC_MD,
  SAMPLE_BOUNDARY_JSON,
  SAMPLE_TASKS_MD,
} from "../helpers/fixture.js";
import { writeTextFile, writeJsonFile, ensureDir } from "../../src/core/fs.js";
import { featuresDir, statePath } from "../../src/core/paths.js";
import { loadState, saveState, upsertFeatureEntry, setFeatureWorktree, nowIso } from "../../src/core/state.js";
import { resolveConfig } from "../../src/core/resolved-config.js";
import { addWorktree } from "../../src/core/git.js";
import { CLIError } from "../../src/core/errors.js";

describe("require_worktree gate", () => {
  let workspace: Awaited<ReturnType<typeof createTempWorkspace>>;
  let root: string;

  beforeEach(async () => {
    workspace = await createTempWorkspace();
    root = workspace.root;

    // Initialize git repo
    await initGitRepo(root);

    // Initialize harness workspace
    await initHarnessWorkspace(root);

    // Create a test feature with spec, boundary, and tasks
    const featureEntry = createTestFeatureEntry({
      id: "F001",
      slug: "test-feature",
      path: "F001-test-feature",
      status: "draft",
    });

    const state = await loadState(root);
    upsertFeatureEntry(state, featureEntry);
    await saveState(root, state);

    const featureDir = path.join(featuresDir(root), featureEntry.path);
    await ensureDir(featureDir);
    await writeTextFile(path.join(featureDir, "spec.md"), SAMPLE_SPEC_MD);
    await writeJsonFile(path.join(featureDir, "boundary.json"), SAMPLE_BOUNDARY_JSON);
    await writeTextFile(path.join(featureDir, "tasks.md"), SAMPLE_TASKS_MD);
  });

  afterEach(async () => {
    await workspace.cleanup();
  });

  it("case 1: require_worktree=false, no worktree recorded → does not throw", async () => {
    const resolvedConfig = resolveConfig({
      workflow: { require_worktree: false },
    });

    const result = await runBuild({
      root,
      featureRef: "F001",
      dryRun: true, // Use dryRun to avoid spawning a real agent
      resolvedConfig,
    });

    expect(result.featureId).toBe("F001");
    expect(result.dryRun).toBe(true);
  });

  it("case 2: require_worktree=true, no worktree recorded, dryRun=false → throws pointing at the lh-worktree skill", async () => {
    const resolvedConfig = resolveConfig({
      workflow: { require_worktree: true },
    });

    await expect(
      runBuild({
        root,
        featureRef: "F001",
        dryRun: false,
        resolvedConfig,
      }),
    ).rejects.toThrow(/lh-worktree skill/);
  });

  it("case 3: require_worktree=true, worktree created and recorded in state → does not throw", async () => {
    const resolvedConfig = resolveConfig({
      workflow: { require_worktree: true },
    });

    // Create a real worktree for the feature
    const wtDir = path.join(root, ".worktrees");
    await ensureDir(wtDir);
    const wtRelPath = path.relative(root, path.join(wtDir, "feature-F001-test-feature"));
    const wtAbsPath = path.join(wtDir, "feature-F001-test-feature");

    // Add the worktree via git
    const addResult = await addWorktree(root, {
      path: wtAbsPath,
      branch: "feature/F001-test-feature",
      createBranch: true,
    });
    expect(addResult.exitCode).toBe(0);

    // Record it in state
    const state = await loadState(root);
    setFeatureWorktree(state, "F001", {
      path: wtRelPath,
      branch: "feature/F001-test-feature",
      createdAt: nowIso(),
    });
    await saveState(root, state);

    // Now build with dryRun should not throw
    const result = await runBuild({
      root,
      featureRef: "F001",
      dryRun: true,
      resolvedConfig,
    });

    expect(result.featureId).toBe("F001");
    expect(result.dryRun).toBe(true);
  });

  it("case 4: require_worktree=true, worktree directory deleted → throws with 'no longer exists' message", async () => {
    const resolvedConfig = resolveConfig({
      workflow: { require_worktree: true },
    });

    // Create a worktree
    const wtDir = path.join(root, ".worktrees");
    await ensureDir(wtDir);
    const wtRelPath = path.relative(root, path.join(wtDir, "feature-F001-test-feature"));
    const wtAbsPath = path.join(wtDir, "feature-F001-test-feature");

    const addResult = await addWorktree(root, {
      path: wtAbsPath,
      branch: "feature/F001-test-feature",
      createBranch: true,
    });
    expect(addResult.exitCode).toBe(0);

    // Record it in state
    const state = await loadState(root);
    setFeatureWorktree(state, "F001", {
      path: wtRelPath,
      branch: "feature/F001-test-feature",
      createdAt: nowIso(),
    });
    await saveState(root, state);

    // Delete the worktree directory (simulating a stale reference)
    await fsp.rm(wtAbsPath, { recursive: true, force: true });

    // Now build should throw about the missing directory
    await expect(
      runBuild({
        root,
        featureRef: "F001",
        dryRun: false,
        resolvedConfig,
      }),
    ).rejects.toThrow(/no longer exists/);
  });

  it("case 5: require_worktree=true, worktree directory exists but not registered in git → throws with 'no longer tracks' message", async () => {
    const resolvedConfig = resolveConfig({
      workflow: { require_worktree: true },
    });

    // Create a worktree
    const wtDir = path.join(root, ".worktrees");
    await ensureDir(wtDir);
    const wtRelPath = path.relative(root, path.join(wtDir, "feature-F001-test-feature"));
    const wtAbsPath = path.join(wtDir, "feature-F001-test-feature");

    const addResult = await addWorktree(root, {
      path: wtAbsPath,
      branch: "feature/F001-test-feature",
      createBranch: true,
    });
    expect(addResult.exitCode).toBe(0);

    // Record it in state
    const state = await loadState(root);
    setFeatureWorktree(state, "F001", {
      path: wtRelPath,
      branch: "feature/F001-test-feature",
      createdAt: nowIso(),
    });
    await saveState(root, state);

    // Remove git's admin metadata for this worktree directly, without touching the directory
    // itself, reproducing "not-registered": dir exists, `git worktree list` no longer knows it.
    // (`git worktree prune` is a no-op here since it only reaps entries whose working directory
    // is actually gone — the directory in this scenario is still present on disk.)
    await fsp.rm(path.join(root, ".git", "worktrees", "feature-F001-test-feature"), {
      recursive: true,
      force: true,
    });

    // The directory still exists, but git no longer tracks it
    // Now build should throw about the untracked worktree
    await expect(
      runBuild({
        root,
        featureRef: "F001",
        dryRun: false,
        resolvedConfig,
      }),
    ).rejects.toThrow(/no longer tracks/);
  });

  it("case 6: require_worktree=true, no worktree, dryRun=true → does not throw, includes warning in result.warnings", async () => {
    const resolvedConfig = resolveConfig({
      workflow: { require_worktree: true },
    });

    const result = await runBuild({
      root,
      featureRef: "F001",
      dryRun: true,
      resolvedConfig,
    });

    expect(result.featureId).toBe("F001");
    expect(result.dryRun).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes("require_worktree"))).toBe(true);
  });

  it("case 7: noWorktree=true + require_worktree=true, no worktree → does not throw", async () => {
    const resolvedConfig = resolveConfig({
      workflow: { require_worktree: true },
    });

    const result = await runBuild({
      root,
      featureRef: "F001",
      dryRun: true,
      resolvedConfig,
      noWorktree: true, // Bypass flag
    });

    expect(result.featureId).toBe("F001");
    expect(result.dryRun).toBe(true);
  });

  it("case 8: require_worktree=true, tasks.md missing → throws 'lh plan' error (artifact checks first)", async () => {
    const resolvedConfig = resolveConfig({
      workflow: { require_worktree: true },
    });

    // Delete tasks.md to trigger artifact check before worktree gate
    const featureDir = path.join(featuresDir(root), "F001-test-feature");
    await fsp.unlink(path.join(featureDir, "tasks.md"));

    await expect(
      runBuild({
        root,
        featureRef: "F001",
        dryRun: false,
        resolvedConfig,
      }),
    ).rejects.toThrow(/lh plan/);
  });

  it("case 9: no side effects - after rejection, tasks.md and state.json are unchanged", async () => {
    const resolvedConfig = resolveConfig({
      workflow: { require_worktree: true },
    });

    const featureDir = path.join(featuresDir(root), "F001-test-feature");
    const tasksPath = path.join(featureDir, "tasks.md");
    const statePath_ = statePath(root);

    // Read original content
    const originalTasksContent = await fsp.readFile(tasksPath, "utf-8");
    const originalState = await fsp.readFile(statePath_, "utf-8");

    // Try to build - should reject
    await expect(
      runBuild({
        root,
        featureRef: "F001",
        dryRun: false,
        resolvedConfig,
      }),
    ).rejects.toThrow();

    // Verify files are unchanged
    const newTasksContent = await fsp.readFile(tasksPath, "utf-8");
    const newState = await fsp.readFile(statePath_, "utf-8");

    expect(newTasksContent).toBe(originalTasksContent);
    expect(newState).toBe(originalState);
  });
});
