import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { defaultBranchName, branchToDirName, resolveFeatureWorktree } from "../../src/core/worktree.js";
import { addWorktree } from "../../src/core/git.js";
import { initGitRepo } from "../helpers/git.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lh-worktree-test-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("defaultBranchName", () => {
  it("creates a default branch name from feature id and slug", () => {
    const result = defaultBranchName({ id: "F001", slug: "add-reset" });
    expect(result).toBe("feature/F001-add-reset");
  });
});

describe("branchToDirName", () => {
  it("converts feature branch to directory-safe name", () => {
    const result = branchToDirName("feature/F001-x");
    expect(result).toBe("feature-F001-x");
  });

  it("converts nested path separators to dashes", () => {
    const result = branchToDirName("fix/a/b");
    expect(result).toBe("fix-a-b");
  });

  it("strips leading and trailing dashes", () => {
    const result = branchToDirName("-foo/bar-");
    expect(result).toBe("foo-bar");
  });

  it("collapses multiple consecutive dashes to one", () => {
    const result = branchToDirName("foo--bar");
    expect(result).toBe("foo-bar");
  });
});

describe("resolveFeatureWorktree", () => {
  it("returns 'none' when no worktree fields are recorded", async () => {
    const result = await resolveFeatureWorktree(tmpDir, {});
    expect(result.status).toBe("none");
  });

  it("returns 'ok' when the directory exists and git registers it as a worktree", async () => {
    await initGitRepo(tmpDir);
    const wtPath = path.join(tmpDir, ".worktrees", "feature-F001-x");
    await addWorktree(tmpDir, { path: wtPath, branch: "feature/F001-x", createBranch: true });

    const result = await resolveFeatureWorktree(tmpDir, {
      worktreePath: path.relative(tmpDir, wtPath),
      worktreeBranch: "feature/F001-x",
      worktreeCreatedAt: "2024-01-01T00:00:00.000Z",
    });
    expect(result.status).toBe("ok");
  });

  it("returns 'missing-dir' when the recorded path no longer exists on disk", async () => {
    await initGitRepo(tmpDir);
    const result = await resolveFeatureWorktree(tmpDir, {
      worktreePath: ".worktrees/gone",
      worktreeBranch: "feature/F001-x",
    });
    expect(result.status).toBe("missing-dir");
  });

  it("returns 'not-registered' when the directory exists but git no longer tracks it", async () => {
    await initGitRepo(tmpDir);
    const wtPath = path.join(tmpDir, ".worktrees", "feature-F001-x");
    await addWorktree(tmpDir, { path: wtPath, branch: "feature/F001-x", createBranch: true });
    await fs.rm(path.join(tmpDir, ".git", "worktrees", "feature-F001-x"), { recursive: true, force: true });

    const result = await resolveFeatureWorktree(tmpDir, {
      worktreePath: path.relative(tmpDir, wtPath),
      worktreeBranch: "feature/F001-x",
    });
    expect(result.status).toBe("not-registered");
  });
});
