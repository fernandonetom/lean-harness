import { spawn } from "node:child_process";
import path from "node:path";
import { CLIError } from "./errors.js";

export interface GitResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export async function runGit(
  cwd: string,
  args: string[],
  opts?: { timeoutMs?: number },
): Promise<GitResult> {
  const timeoutMs = opts?.timeoutMs ?? 10000;

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const proc = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, timeoutMs);

    proc.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        resolve({
          stdout: stdout.trim(),
          stderr: `git command timed out after ${timeoutMs}ms`,
          exitCode: 1,
        });
      } else {
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code ?? 1,
        });
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        stdout: stdout.trim(),
        stderr: err.message,
        exitCode: 1,
      });
    });
  });
}

export async function requireGit(cwd: string, args: string[]): Promise<string> {
  const result = await runGit(cwd, args);
  if (result.exitCode !== 0) {
    const message = result.stderr || `git ${args.join(" ")} exited with code ${result.exitCode}`;
    throw new CLIError(message, result.exitCode);
  }
  return result.stdout;
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  const result = await runGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
  return result.exitCode === 0 && result.stdout === "true";
}

export async function hasCommits(cwd: string): Promise<boolean> {
  const result = await runGit(cwd, ["rev-parse", "--verify", "HEAD"]);
  return result.exitCode === 0;
}

export async function gitTopLevel(cwd: string): Promise<string | null> {
  const result = await runGit(cwd, ["rev-parse", "--show-toplevel"]);
  if (result.exitCode === 0) {
    return result.stdout;
  }
  return null;
}

export async function gitCommonDir(cwd: string): Promise<string | null> {
  // Try the newer flag combo first (git >=2.31)
  const result1 = await runGit(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (result1.exitCode === 0) {
    return result1.stdout;
  }

  // Fall back to older flag and resolve relative to cwd
  const result2 = await runGit(cwd, ["rev-parse", "--git-common-dir"]);
  if (result2.exitCode === 0) {
    const commonDir = result2.stdout;
    if (path.isAbsolute(commonDir)) {
      return commonDir;
    }
    return path.resolve(cwd, commonDir);
  }

  return null;
}

export async function mainRepoRoot(cwd: string): Promise<string | null> {
  const commonDir = await gitCommonDir(cwd);
  if (commonDir === null) {
    return null;
  }

  const baseName = path.basename(commonDir);
  if (baseName === ".git") {
    return path.dirname(commonDir);
  }

  return null;
}

export async function currentBranch(cwd: string): Promise<string | null> {
  const result = await runGit(cwd, ["branch", "--show-current"]);
  if (result.exitCode === 0 && result.stdout) {
    return result.stdout;
  }
  return null;
}

export async function branchExists(cwd: string, name: string): Promise<boolean> {
  const result = await runGit(cwd, ["show-ref", "--verify", "--quiet", `refs/heads/${name}`]);
  return result.exitCode === 0;
}

export async function isWorkingTreeClean(cwd: string): Promise<boolean> {
  const result = await runGit(cwd, ["status", "--porcelain"]);
  return result.exitCode === 0 && result.stdout === "";
}

export async function isPathIgnored(cwd: string, relPath: string): Promise<boolean> {
  const result = await runGit(cwd, ["check-ignore", "-q", relPath]);
  return result.exitCode === 0;
}

export interface GitWorktreeInfo {
  path: string;
  head: string | null;
  branch: string | null;
  detached: boolean;
  bare: boolean;
  locked: boolean;
  prunable: boolean;
}

export async function listWorktrees(cwd: string): Promise<GitWorktreeInfo[]> {
  const result = await runGit(cwd, ["worktree", "list", "--porcelain"]);
  if (result.exitCode !== 0) {
    return [];
  }

  const worktrees: GitWorktreeInfo[] = [];
  const blocks = result.stdout.split("\n\n");

  for (const block of blocks) {
    if (!block.trim()) {
      continue;
    }

    const lines = block.split("\n").filter((line) => line.length > 0);
    const worktree: GitWorktreeInfo = {
      path: "",
      head: null,
      branch: null,
      detached: false,
      bare: false,
      locked: false,
      prunable: false,
    };

    for (const line of lines) {
      const space = line.indexOf(" ");
      if (space === -1) {
        // Line with no value, just key (e.g., "detached", "bare", "locked", "prunable")
        const key = line;
        if (key === "detached") {
          worktree.detached = true;
        } else if (key === "bare") {
          worktree.bare = true;
        } else if (key === "locked") {
          worktree.locked = true;
        } else if (key === "prunable") {
          worktree.prunable = true;
        }
      } else {
        const key = line.substring(0, space);
        const value = line.substring(space + 1);

        if (key === "worktree") {
          worktree.path = value;
        } else if (key === "HEAD") {
          worktree.head = value;
        } else if (key === "branch") {
          // Strip "refs/heads/" prefix if present
          if (value.startsWith("refs/heads/")) {
            worktree.branch = value.substring("refs/heads/".length);
          } else {
            worktree.branch = value;
          }
        }
      }
    }

    if (worktree.path) {
      worktrees.push(worktree);
    }
  }

  return worktrees;
}

export async function addWorktree(
  cwd: string,
  o: { path: string; branch: string; createBranch: boolean },
): Promise<GitResult> {
  const args = ["worktree", "add"];
  if (o.createBranch) {
    args.push("-b", o.branch);
  }
  args.push(o.path);
  if (!o.createBranch) {
    args.push(o.branch);
  }
  return runGit(cwd, args);
}

export async function removeWorktree(
  cwd: string,
  wtPath: string,
  force: boolean,
): Promise<GitResult> {
  const args = ["worktree", "remove"];
  if (force) {
    args.push("--force");
  }
  args.push(wtPath);
  return runGit(cwd, args);
}

export async function pruneWorktrees(cwd: string): Promise<GitResult> {
  return runGit(cwd, ["worktree", "prune"]);
}

export async function deleteBranch(
  cwd: string,
  name: string,
  force: boolean,
): Promise<GitResult> {
  const flag = force ? "-D" : "-d";
  return runGit(cwd, ["branch", flag, name]);
}

export async function stageAndCommitPaths(
  cwd: string,
  paths: string[],
  message: string,
): Promise<GitResult> {
  // Stage the paths
  const addResult = await runGit(cwd, ["add", "--", ...paths]);
  if (addResult.exitCode !== 0) {
    return addResult;
  }

  // Check if git user.email is configured
  const emailResult = await runGit(cwd, ["config", "user.email"]);
  const hasUserEmail = emailResult.exitCode === 0 && emailResult.stdout.length > 0;

  // Build commit args
  const commitArgs = ["commit"];
  if (!hasUserEmail) {
    commitArgs.push("-c", "user.email=lh-release@example.com", "-c", "user.name=LeanHarness");
  }
  commitArgs.push("-m", message, "--", ...paths);

  // Commit the paths
  return runGit(cwd, commitArgs);
}
