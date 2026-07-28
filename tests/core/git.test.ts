import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  runGit,
  requireGit,
  isGitRepo,
  hasCommits,
  gitTopLevel,
  gitCommonDir,
  mainRepoRoot,
  currentBranch,
  branchExists,
  isWorkingTreeClean,
  isPathIgnored,
  listWorktrees,
  addWorktree,
  removeWorktree,
  pruneWorktrees,
  deleteBranch,
  stageAndCommitPaths,
} from "../../src/core/git.js";
import { initGitRepo, gitOut } from "../helpers/git.js";

describe("git core functions", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "lh-git-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("runGit", () => {
    it("returns GitResult with non-zero exitCode for non-existent subcommand, does not throw", async () => {
      const result = await runGit(tempDir, ["nonexistent-subcommand"]);
      expect(result.exitCode).not.toBe(0);
      expect(typeof result.stdout).toBe("string");
      expect(typeof result.stderr).toBe("string");
    });

    it("returns GitResult with non-zero exitCode in non-git directory, does not throw", async () => {
      const result = await runGit(tempDir, ["status"]);
      expect(result.exitCode).not.toBe(0);
    });
  });

  describe("requireGit", () => {
    it("throws CLIError on failing command", async () => {
      await expect(requireGit(tempDir, ["status"])).rejects.toThrow();
    });

    it("returns trimmed stdout on success", async () => {
      await initGitRepo(tempDir);
      const output = await requireGit(tempDir, ["branch", "--show-current"]);
      expect(output).toBe("main");
    });
  });

  describe("isGitRepo", () => {
    it("returns false in plain temp directory", async () => {
      const result = await isGitRepo(tempDir);
      expect(result).toBe(false);
    });

    it("returns true after initGitRepo", async () => {
      await initGitRepo(tempDir);
      const result = await isGitRepo(tempDir);
      expect(result).toBe(true);
    });
  });

  describe("hasCommits", () => {
    it("returns false right after git init before any commit", async () => {
      // Init without commit
      await requireGit(tempDir, ["init", "-b", "main"]);
      await requireGit(tempDir, ["config", "user.email", "lh-test@example.com"]);
      await requireGit(tempDir, ["config", "user.name", "LH Test"]);

      const result = await hasCommits(tempDir);
      expect(result).toBe(false);
    });

    it("returns true after initGitRepo (which commits)", async () => {
      await initGitRepo(tempDir);
      const result = await hasCommits(tempDir);
      expect(result).toBe(true);
    });
  });

  describe("gitTopLevel", () => {
    it("returns the realpath'd repo directory after initGitRepo", async () => {
      await initGitRepo(tempDir);
      const result = await gitTopLevel(tempDir);
      const realTempDir = await realpath(tempDir);
      expect(result).toBe(realTempDir);
    });
  });

  describe("gitCommonDir", () => {
    it("returns the same path for main repo and linked worktree", async () => {
      // Initialize main repo
      await initGitRepo(tempDir);
      const mainCommonDir = await gitCommonDir(tempDir);
      expect(mainCommonDir).not.toBeNull();

      // Create a linked worktree
      const wtPath = path.join(tempDir, "worktree-test");
      await addWorktree(tempDir, {
        path: wtPath,
        branch: "wt-test",
        createBranch: true,
      });

      // Check that both report the same common dir
      const wtCommonDir = await gitCommonDir(wtPath);
      expect(wtCommonDir).not.toBeNull();

      const realMainCommon = await realpath(mainCommonDir!);
      const realWtCommon = await realpath(wtCommonDir!);
      expect(realWtCommon).toBe(realMainCommon);
    });
  });

  describe("mainRepoRoot", () => {
    it("returns main repo root from a worktree", async () => {
      // Initialize main repo
      await initGitRepo(tempDir);
      const realTempDir = await realpath(tempDir);

      // Create a linked worktree
      const wtPath = path.join(tempDir, "worktree-test");
      await addWorktree(tempDir, {
        path: wtPath,
        branch: "wt-test",
        createBranch: true,
      });

      // Get main repo root from worktree
      const root = await mainRepoRoot(wtPath);
      const realRoot = root ? await realpath(root) : null;
      expect(realRoot).toBe(realTempDir);
    });
  });

  describe("currentBranch", () => {
    it("returns 'main' right after initGitRepo", async () => {
      await initGitRepo(tempDir);
      const result = await currentBranch(tempDir);
      expect(result).toBe("main");
    });
  });

  describe("branchExists", () => {
    it("returns false for a made-up branch name", async () => {
      await initGitRepo(tempDir);
      const result = await branchExists(tempDir, "nonexistent-branch");
      expect(result).toBe(false);
    });

    it("returns true for 'main' branch", async () => {
      await initGitRepo(tempDir);
      const result = await branchExists(tempDir, "main");
      expect(result).toBe(true);
    });
  });

  describe("isWorkingTreeClean", () => {
    it("returns true right after initGitRepo", async () => {
      await initGitRepo(tempDir);
      const result = await isWorkingTreeClean(tempDir);
      expect(result).toBe(true);
    });

    it("returns false after writing uncommitted file", async () => {
      await initGitRepo(tempDir);
      await writeFile(path.join(tempDir, "uncommitted.txt"), "test content");
      const result = await isWorkingTreeClean(tempDir);
      expect(result).toBe(false);
    });
  });

  describe("isPathIgnored", () => {
    it("returns false for path before adding to .gitignore", async () => {
      await initGitRepo(tempDir);
      const result = await isPathIgnored(tempDir, "sometest/ignored.txt");
      expect(result).toBe(false);
    });

    it("returns true after adding pattern to .gitignore", async () => {
      await initGitRepo(tempDir);
      const gitignorePath = path.join(tempDir, ".gitignore");
      await writeFile(gitignorePath, "sometest/\n");
      const result = await isPathIgnored(tempDir, "sometest/ignored.txt");
      expect(result).toBe(true);
    });
  });

  describe("listWorktrees", () => {
    it("returns one entry for fresh repo (main worktree only)", async () => {
      await initGitRepo(tempDir);
      const worktrees = await listWorktrees(tempDir);
      expect(worktrees).toHaveLength(1);
      const realTempDir = await realpath(tempDir);
      const realWorktreePath = await realpath(worktrees[0].path);
      expect(realWorktreePath).toBe(realTempDir);
    });

    it("returns two entries after adding one worktree with correct fields", async () => {
      await initGitRepo(tempDir);
      const wtPath = path.join(tempDir, "worktree-test");
      await addWorktree(tempDir, {
        path: wtPath,
        branch: "wt-test",
        createBranch: true,
      });

      const worktrees = await listWorktrees(tempDir);
      expect(worktrees).toHaveLength(2);

      const realWtPath = await realpath(wtPath);
      let wtEntry: typeof worktrees[0] | undefined;
      for (const w of worktrees) {
        const realPath = await realpath(w.path);
        if (realPath === realWtPath) {
          wtEntry = w;
          break;
        }
      }

      expect(wtEntry).toBeDefined();
      expect(wtEntry!.branch).toBe("wt-test");
      expect(wtEntry!.detached).toBe(false);
    });
  });

  describe("addWorktree / removeWorktree / pruneWorktrees", () => {
    it("adds worktree, confirms in list, prunes after deletion", async () => {
      await initGitRepo(tempDir);
      const wtPath = path.join(tempDir, "worktree-test");

      // Add worktree
      const addResult = await addWorktree(tempDir, {
        path: wtPath,
        branch: "wt-test",
        createBranch: true,
      });
      expect(addResult.exitCode).toBe(0);

      // Confirm in list
      let worktrees = await listWorktrees(tempDir);
      const realWtPath = await realpath(wtPath);
      let found = false;
      for (const w of worktrees) {
        const realPath = await realpath(w.path);
        if (realPath === realWtPath) {
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
      expect(worktrees.length).toBe(2);

      // Manually delete directory (simulating external deletion)
      await rm(wtPath, { recursive: true, force: true });

      // Confirm the worktree entry still appears in list (git hasn't cleaned it up yet)
      worktrees = await listWorktrees(tempDir);
      expect(worktrees.length).toBe(2);

      // Prune
      const pruneResult = await pruneWorktrees(tempDir);
      expect(pruneResult.exitCode).toBe(0);

      // Confirm it's gone after pruning
      worktrees = await listWorktrees(tempDir);
      expect(worktrees).toHaveLength(1);
    });

    it("removes worktree via removeWorktree on clean worktree", async () => {
      await initGitRepo(tempDir);
      const wtPath = path.join(tempDir, "worktree-test");
      await addWorktree(tempDir, {
        path: wtPath,
        branch: "wt-test",
        createBranch: true,
      });

      // Verify it's in the list
      let worktrees = await listWorktrees(tempDir);
      expect(worktrees).toHaveLength(2);

      // Remove it
      const removeResult = await removeWorktree(tempDir, wtPath, false);
      expect(removeResult.exitCode).toBe(0);

      // Verify it's gone
      worktrees = await listWorktrees(tempDir);
      let stillExists = false;
      for (const w of worktrees) {
        try {
          const realPath = await realpath(w.path);
          if (realPath === wtPath) {
            stillExists = true;
            break;
          }
        } catch {
          // Path doesn't exist, skip
        }
      }
      expect(stillExists).toBe(false);
    });
  });

  describe("deleteBranch", () => {
    it("deletes branch after removing worktree", async () => {
      await initGitRepo(tempDir);
      const wtPath = path.join(tempDir, "worktree-test");
      const branchName = "wt-test";

      // Add worktree (creates branch)
      await addWorktree(tempDir, {
        path: wtPath,
        branch: branchName,
        createBranch: true,
      });

      // Verify branch exists
      let exists = await branchExists(tempDir, branchName);
      expect(exists).toBe(true);

      // Remove worktree first (can't delete branch while checked out)
      await removeWorktree(tempDir, wtPath, false);

      // Delete branch
      const deleteResult = await deleteBranch(tempDir, branchName, false);
      expect(deleteResult.exitCode).toBe(0);

      // Verify branch is gone
      exists = await branchExists(tempDir, branchName);
      expect(exists).toBe(false);
    });
  });

  describe("stageAndCommitPaths", () => {
    it("commits only passed files, not other untracked files", async () => {
      await initGitRepo(tempDir);

      // Write two files
      const file1 = path.join(tempDir, "file1.txt");
      const file2 = path.join(tempDir, "file2.txt");
      await writeFile(file1, "content 1");
      await writeFile(file2, "content 2");

      // Commit only file1
      const commitResult = await stageAndCommitPaths(
        tempDir,
        ["file1.txt"],
        "commit file1 only"
      );
      expect(commitResult.exitCode).toBe(0);

      // Check what was committed
      const logOutput = await gitOut(tempDir, [
        "log",
        "-1",
        "--name-only",
        "--pretty=format:%H",
      ]);
      expect(logOutput).toContain("file1.txt");
      expect(logOutput).not.toContain("file2.txt");

      // file2 should still be untracked
      const statusResult = await gitOut(tempDir, ["status", "--porcelain"]);
      expect(statusResult).toContain("file2.txt");
    });

    it("uses configured user.email when already set", async () => {
      // initGitRepo already sets user.email
      await initGitRepo(tempDir);

      const file1 = path.join(tempDir, "testfile.txt");
      await writeFile(file1, "test");

      // This should succeed without CI-identity-override since user.email is set
      const commitResult = await stageAndCommitPaths(
        tempDir,
        ["testfile.txt"],
        "test commit"
      );
      expect(commitResult.exitCode).toBe(0);
    });
  });
});
