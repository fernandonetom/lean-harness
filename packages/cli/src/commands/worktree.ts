import path from "node:path";
import { createLogger, printJson } from "../core/logger.js";
import { CLIError } from "../core/errors.js";
import { resolveHarnessRoot } from "../core/harness-root.js";
import { listWorktrees } from "../core/git.js";
import { requireFeature } from "../core/features.js";
import { loadState, saveState, setFeatureWorktree, clearFeatureWorktree, nowIso } from "../core/state.js";
import { defaultBranchName } from "../core/worktree.js";
import { toPosixPath } from "../core/paths.js";
import { dirExists, realpathOrSelf } from "../core/fs.js";

export interface WorktreeLinkOptions {
  cwd: string;
  ref: string;
  path: string;
  branch?: string | undefined;
  force?: boolean | undefined;
  json?: boolean | undefined;
}

export interface WorktreeListOptions {
  cwd: string;
  json?: boolean | undefined;
}

export interface WorktreeUnlinkOptions {
  cwd: string;
  ref: string;
  json?: boolean | undefined;
}

/**
 * Record an already-existing git worktree (created outside the CLI, e.g. by the lh-worktree
 * skill) against a feature in .lh/state.json. Does no git operations of its own — it only
 * validates the target directory and, by default, that git already recognizes it as a
 * registered worktree (bypassable with --force for edge cases).
 */
export async function runWorktreeLinkCommand(
  options: WorktreeLinkOptions,
): Promise<void> {
  const { cwd, ref, json = false } = options;
  const log = createLogger({ json });

  if (!ref.trim()) {
    throw new CLIError("Missing feature reference.\nUsage: lh worktree link F001 --path <dir>");
  }
  if (!options.path.trim()) {
    throw new CLIError("Missing --path.\nUsage: lh worktree link F001 --path <dir>");
  }

  const root = await resolveHarnessRoot(cwd);
  const entry = await requireFeature(root, ref);

  const absolutePath = path.resolve(cwd, options.path);
  const exists = await dirExists(absolutePath);
  if (!exists && !options.force) {
    throw new CLIError(
      `Directory ${absolutePath} does not exist. Create the worktree first (e.g. via the lh-worktree skill or \`git worktree add\`), or pass --force to record it anyway.`,
    );
  }

  const registered = await listWorktrees(root);
  const realAbsolutePath = await realpathOrSelf(absolutePath);
  const match = registered.find((w) => path.resolve(w.path) === realAbsolutePath);
  if (!match && !options.force) {
    throw new CLIError(
      `${absolutePath} is not a registered git worktree (per \`git worktree list\`). Pass --force to record it anyway.`,
    );
  }

  const branch = options.branch ?? match?.branch ?? defaultBranchName(entry);

  const state = await loadState(root);
  setFeatureWorktree(state, entry.id, {
    path: toPosixPath(path.relative(root, absolutePath)),
    branch,
    createdAt: nowIso(),
  });
  await saveState(root, state);

  if (json) {
    printJson({ ok: true, featureId: entry.id, branch, worktreePath: absolutePath, harnessRoot: root });
    return;
  }

  log.info(`Linked worktree for ${entry.id}`);
  log.info(`Branch:       ${branch}`);
  log.info(`Worktree:     ${absolutePath}`);
  log.info(`Harness root: ${root}`);
}

export async function runWorktreeListCommand(
  options: WorktreeListOptions,
): Promise<void> {
  const { cwd, json = false } = options;
  const log = createLogger({ json });

  const root = await resolveHarnessRoot(cwd);
  const worktrees = await listWorktrees(root);
  const state = await loadState(root);

  interface WorktreeInfo {
    path: string;
    branch: string | null;
    status: "linked" | "stale" | "untracked-by-lh";
    featureId?: string;
  }

  const infos: WorktreeInfo[] = [];

  // Check existing worktrees
  for (const wt of worktrees) {
    const resolvedPath = path.resolve(wt.path);
    let found = false;

    for (const feature of state.features) {
      if (feature.worktreePath) {
        const featurePath = await realpathOrSelf(path.resolve(root, feature.worktreePath));
        if (featurePath === resolvedPath) {
          infos.push({
            path: wt.path,
            branch: wt.branch,
            status: "linked",
            featureId: feature.id,
          });
          found = true;
          break;
        }
      }
    }

    if (!found) {
      infos.push({
        path: wt.path,
        branch: wt.branch,
        status: "untracked-by-lh",
      });
    }
  }

  // Check for stale worktrees (recorded in state but not in git)
  for (const feature of state.features) {
    if (feature.worktreePath) {
      const featurePath = await realpathOrSelf(path.resolve(root, feature.worktreePath));
      const stillListed = worktrees.some((w) => path.resolve(w.path) === featurePath);
      if (!stillListed) {
        infos.push({
          path: feature.worktreePath,
          branch: feature.worktreeBranch ?? null,
          status: "stale",
          featureId: feature.id,
        });
      }
    }
  }

  if (json) {
    printJson({ ok: true, worktrees: infos });
    return;
  }

  if (infos.length === 0) {
    log.info("No worktrees found.");
    return;
  }

  log.info("Worktrees:");
  log.info("");
  for (const info of infos) {
    const featurePart = info.featureId ? ` [${info.featureId}]` : "";
    const statusBadge =
      info.status === "linked"
        ? "[linked]"
        : info.status === "stale"
          ? "[stale]"
          : "[untracked]";
    log.info(`${info.path}`);
    log.info(`  Status: ${statusBadge}${featurePart}`);
    if (info.branch) log.info(`  Branch: ${info.branch}`);
    log.info("");
  }
}

/**
 * Clear a feature's worktree record from .lh/state.json. Does no git operations — the actual
 * worktree removal (git worktree remove/prune, optional branch delete) is done by whoever is
 * tearing the worktree down (e.g. the lh-worktree skill) before calling this.
 */
export async function runWorktreeUnlinkCommand(
  options: WorktreeUnlinkOptions,
): Promise<void> {
  const { cwd, ref, json = false } = options;
  const log = createLogger({ json });

  if (!ref.trim()) {
    throw new CLIError("Missing feature reference.\nUsage: lh worktree unlink F001");
  }

  const root = await resolveHarnessRoot(cwd);
  const entry = await requireFeature(root, ref);

  const state = await loadState(root);
  const hadRecord = Boolean(entry.worktreePath);
  clearFeatureWorktree(state, entry.id);
  await saveState(root, state);

  if (json) {
    printJson({ ok: true, featureId: entry.id, unlinked: hadRecord });
    return;
  }

  if (hadRecord) {
    log.info(`Unlinked worktree record for ${entry.id}`);
  } else {
    log.info(`Feature ${entry.id}: no worktree recorded`);
  }
}
