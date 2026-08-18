import fsp from "node:fs/promises";
import path from "node:path";
import { listWorktrees } from "./git.js";
import { realpathOrSelf } from "./fs.js";

export interface FeatureLike {
  id: string;
  slug: string;
}

/** Default branch name for a feature's worktree: feature/<id>-<slug> */
export function defaultBranchName(entry: FeatureLike): string {
  return `feature/${entry.id}-${entry.slug}`;
}

/**
 * Convert a branch name into a filesystem-safe directory name:
 * replace every "/" with "-", then collapse runs of "-" into one,
 * then strip any leading/trailing "-".
 * e.g. "feature/F001-x" -> "feature-F001-x"; "fix/a/b" -> "fix-a-b"
 */
export function branchToDirName(branch: string): string {
  return branch
    .split("/")
    .join("-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type WorktreeResolution =
  | { status: "ok"; record: { path: string; branch: string; createdAt: string }; absolutePath: string }
  | { status: "none" }
  | { status: "missing-dir"; record: { path: string; branch: string; createdAt: string }; absolutePath: string }
  | { status: "not-registered"; record: { path: string; branch: string; createdAt: string }; absolutePath: string };

/**
 * Given a feature's worktree record (as stored in state.json — path relative to `root`), resolve
 * its current real-world status:
 * - "none": no worktreePath recorded for this feature at all
 * - "missing-dir": recorded, but the directory no longer exists on disk
 * - "not-registered": the directory exists, but `git worktree list` no longer lists it as a
 *   registered worktree (it was pruned or the .git metadata is gone)
 * - "ok": exists on disk AND git still lists it as a registered worktree
 */
export async function resolveFeatureWorktree(
  root: string,
  feature: { worktreePath?: string | undefined; worktreeBranch?: string | undefined; worktreeCreatedAt?: string | undefined },
): Promise<WorktreeResolution> {
  if (!feature.worktreePath || !feature.worktreeBranch) {
    return { status: "none" };
  }

  const record = {
    path: feature.worktreePath,
    branch: feature.worktreeBranch,
    createdAt: feature.worktreeCreatedAt ?? "",
  };
  const absolutePath = path.resolve(root, feature.worktreePath);

  let dirExists = false;
  try {
    const stat = await fsp.stat(absolutePath);
    dirExists = stat.isDirectory();
  } catch {
    dirExists = false;
  }

  if (!dirExists) {
    return { status: "missing-dir", record, absolutePath };
  }

  const worktrees = await listWorktrees(root);
  const realAbsolutePath = await realpathOrSelf(absolutePath);
  const isRegistered = worktrees.some((w) => path.resolve(w.path) === realAbsolutePath);

  if (!isRegistered) {
    return { status: "not-registered", record, absolutePath };
  }

  return { status: "ok", record, absolutePath };
}
