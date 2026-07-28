import path from "node:path";
import { fileExists } from "./fs.js";
import { gitTopLevel, mainRepoRoot } from "./git.js";

export interface RootPair {
  harnessRoot: string;
  worktreeRoot: string;
  isLinkedWorktree: boolean;
}

/**
 * Resolve the directory that owns `.lh/state.json`, handling linked git worktrees.
 * No upward directory walk — a command that today correctly errors "not initialized"
 * outside a repo must keep doing so.
 */
export async function resolveHarnessRoot(cwd: string): Promise<string> {
  const direct = path.join(cwd, ".lh", "state.json");
  if (await fileExists(direct)) return cwd;

  const mainRoot = await mainRepoRoot(cwd);
  if (mainRoot && mainRoot !== cwd) {
    const mainStatePath = path.join(mainRoot, ".lh", "state.json");
    if (await fileExists(mainStatePath)) return mainRoot;
  }

  return cwd;
}

export async function resolveRoots(cwd: string): Promise<RootPair> {
  const top = await gitTopLevel(cwd);
  const worktreeRoot = top ?? cwd;
  const harnessRoot = await resolveHarnessRoot(cwd);
  return {
    harnessRoot,
    worktreeRoot,
    isLinkedWorktree: path.resolve(harnessRoot) !== path.resolve(worktreeRoot),
  };
}
