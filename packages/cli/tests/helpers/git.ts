import { requireGit } from "../../src/core/git.js";

/**
 * Initialize a git repository for testing.
 * Sets up:
 * - git init -b main
 * - user.email and user.name configuration
 * - GPG signing disabled
 * - Initial README.md and commit
 */
export async function initGitRepo(dir: string): Promise<void> {
  // Initialize with main branch
  await requireGit(dir, ["init", "-b", "main"]);

  // Configure git user
  await requireGit(dir, ["config", "user.email", "lh-test@example.com"]);
  await requireGit(dir, ["config", "user.name", "LH Test"]);
  await requireGit(dir, ["config", "commit.gpgsign", "false"]);

  // Create initial commit
  const fs = await import("node:fs/promises");
  await fs.writeFile(`${dir}/README.md`, "# Test Repository\n");
  await requireGit(dir, ["add", "-A"]);
  await requireGit(dir, ["commit", "-m", "init"]);
}

/**
 * Thin wrapper around requireGit that returns stdout for convenience.
 */
export async function gitOut(dir: string, args: string[]): Promise<string> {
  return requireGit(dir, args);
}
