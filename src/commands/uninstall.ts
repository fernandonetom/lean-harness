import fsp from "node:fs/promises";
import path from "node:path";
import { createLogger, printJson } from "../core/logger.js";
import { createColors } from "../core/colors.js";
import { promptConfirm } from "../core/prompt.js";
import { fileExists, dirExists, readJsonFile, writeJsonFile } from "../core/fs.js";
import {
  harnessPath,
  claudePath,
  opencodePath,
  featuresDir,
  memoryDir,
  templatesDir,
  policiesDir,
  protocolsDir,
  statePath,
  configPath,
  harnessGitignorePath,
  claudeAgentsDir,
  claudeSkillsDir,
  claudeHooksDir,
  claudeSettingsPath,
  opencodeAgentsDir,
  opencodePluginsDir,
  opencodeCommandsDir,
  opencodeConfigPath,
} from "../core/paths.js";
import { createClaudeCodeSettingsObject } from "./init-claude-code.js";

export interface UninstallOptions {
  cwd: string;
  yes?: boolean;
  dryRun?: boolean;
  json?: boolean;
}

export interface UninstallResult {
  removed: string[];
  kept: string[];
  stripped: string[];
  skipped: string[];
}

interface RemovalPlan {
  dirs: string[];
  files: string[];
  stripFiles: string[];
  promptDirs: Array<{ path: string; relPath: string; label: string }>;
}

async function buildRemovalPlan(cwd: string): Promise<RemovalPlan> {
  const plan: RemovalPlan = { dirs: [], files: [], stripFiles: [], promptDirs: [] };

  const checkDir = async (p: string) => { if (await dirExists(p)) plan.dirs.push(p); };
  const checkFile = async (p: string) => { if (await fileExists(p)) plan.files.push(p); };
  const checkStrip = async (p: string) => { if (await fileExists(p)) plan.stripFiles.push(p); };

  // .lh/ framework dirs
  await checkDir(templatesDir(cwd));
  await checkDir(protocolsDir(cwd));
  await checkDir(policiesDir(cwd));
  await checkDir(harnessPath(cwd, "scripts"));
  await checkDir(harnessPath(cwd, "graph"));

  // .lh/ framework files
  await checkFile(configPath(cwd));
  await checkFile(statePath(cwd));
  await checkFile(harnessGitignorePath(cwd));

  // .claude/ dirs
  await checkDir(claudeAgentsDir(cwd));
  await checkDir(claudeSkillsDir(cwd));
  await checkDir(claudeHooksDir(cwd));

  // .claude/ files
  await checkFile(claudePath(cwd, "settings.local.example.json"));
  await checkFile(claudePath(cwd, "README.md"));

  // .opencode/ dirs
  await checkDir(opencodeAgentsDir(cwd));
  await checkDir(opencodeCommandsDir(cwd));
  await checkDir(opencodePluginsDir(cwd));

  // .opencode/ files
  await checkFile(opencodePath(cwd, "README.md"));

  // Files to strip LH entries from (not fully delete)
  await checkStrip(claudeSettingsPath(cwd));
  await checkStrip(opencodeConfigPath(cwd));

  // User-content dirs — prompt before removing
  const memDir = memoryDir(cwd);
  if (await dirExists(memDir)) {
    plan.promptDirs.push({
      path: memDir,
      relPath: ".lh/memory",
      label: "Found memory files (decisions, patterns, project context). Keep them?",
    });
  }
  const featDir = featuresDir(cwd);
  if (await dirExists(featDir)) {
    plan.promptDirs.push({
      path: featDir,
      relPath: ".lh/features",
      label: "Found feature artifacts. Keep them?",
    });
  }

  return plan;
}

function isEmptyOrSettingsLocalOnly(entries: string[]): boolean {
  return entries.every((e) => e === "settings.local.json");
}

async function removeDir(p: string): Promise<void> {
  await fsp.rm(p, { recursive: true, force: true });
}

async function removeFile(p: string): Promise<void> {
  try {
    await fsp.unlink(p);
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
}

async function cleanEmptyDir(p: string): Promise<boolean> {
  try {
    const entries = await fsp.readdir(p);
    if (entries.length === 0 || isEmptyOrSettingsLocalOnly(entries)) {
      await fsp.rm(p, { recursive: true, force: true });
      return true;
    }
  } catch {
    // dir already gone or not accessible
  }
  return false;
}

async function stripLhFromSettings(cwd: string): Promise<boolean> {
  const cfgPath = claudeSettingsPath(cwd);
  const raw = await readJsonFile<Record<string, unknown>>(cfgPath);
  if (!raw) return false;

  const lhSettings = createClaudeCodeSettingsObject();
  const lhPerms = (lhSettings["permissions"] ?? {}) as Record<string, string[]>;
  const lhAllow = new Set((lhPerms["allow"] ?? []) as string[]);
  const lhDeny = new Set((lhPerms["deny"] ?? []) as string[]);
  const lhEnv = Object.keys((lhSettings["env"] ?? {}) as Record<string, unknown>);
  const lhHookCommands = new Set([
    "node \"$CLAUDE_PROJECT_DIR/.lh/scripts/hooks/pre-tool-use.js\"",
    "node \"$CLAUDE_PROJECT_DIR/.lh/scripts/hooks/post-tool-use.js\"",
    "node \"$CLAUDE_PROJECT_DIR/.lh/scripts/hooks/session-end.js\"",
  ]);

  const result = { ...raw };
  let changed = false;

  // Strip permissions
  const perms = (result["permissions"] ?? {}) as Record<string, unknown>;
  const newPerms = { ...perms };
  for (const key of ["allow", "deny", "ask"] as const) {
    const existing = (Array.isArray(perms[key]) ? perms[key] : []) as string[];
    const knownLh = key === "allow" ? lhAllow : key === "deny" ? lhDeny : new Set<string>();
    const filtered = existing.filter((e) => !knownLh.has(e));
    if (filtered.length !== existing.length) {
      newPerms[key] = filtered;
      changed = true;
    }
  }
  result["permissions"] = newPerms;

  // Strip env
  const env = (result["env"] ?? {}) as Record<string, unknown>;
  const newEnv = { ...env };
  for (const key of lhEnv) {
    if (key in newEnv) {
      delete newEnv[key];
      changed = true;
    }
  }
  if (changed) result["env"] = newEnv;

  // Strip hooks
  const hooks = (result["hooks"] ?? {}) as Record<string, unknown>;
  const newHooks: Record<string, unknown> = {};
  let hooksChanged = false;
  for (const [hookName, entries] of Object.entries(hooks)) {
    if (!Array.isArray(entries)) {
      newHooks[hookName] = entries;
      continue;
    }
    const filtered = entries.filter((entry: unknown) => {
      if (!entry || typeof entry !== "object") return true;
      const e = entry as Record<string, unknown>;
      const hookList = (Array.isArray(e["hooks"]) ? e["hooks"] : []) as Array<Record<string, unknown>>;
      return !hookList.some((h) => typeof h["command"] === "string" && lhHookCommands.has(h["command"]));
    });
    if (filtered.length !== entries.length) hooksChanged = true;
    if (filtered.length > 0) newHooks[hookName] = filtered;
    else hooksChanged = true;
  }
  if (hooksChanged) {
    result["hooks"] = newHooks;
    changed = true;
  }

  if (!changed) return false;
  await writeJsonFile(cfgPath, result, { overwrite: true });
  return true;
}

async function stripLhFromOpencodeConfig(cwd: string): Promise<boolean> {
  const cfgPath = opencodeConfigPath(cwd);
  const raw = await readJsonFile<Record<string, unknown>>(cfgPath);
  if (!raw) return false;

  const result = { ...raw };
  let anyChanged = false;

  const agents = (result["agent"] ?? {}) as Record<string, unknown>;
  const newAgents: Record<string, unknown> = {};
  let agentsChanged = false;
  for (const [name, value] of Object.entries(agents)) {
    if (name.startsWith("lh-")) {
      agentsChanged = true;
    } else {
      newAgents[name] = value;
    }
  }
  if (agentsChanged) {
    anyChanged = true;
    if (Object.keys(newAgents).length === 0) {
      delete result["agent"];
    } else {
      result["agent"] = newAgents;
    }
  }

  const commands = (result["command"] ?? {}) as Record<string, unknown>;
  const newCommands: Record<string, unknown> = {};
  let commandsChanged = false;
  for (const [name, value] of Object.entries(commands)) {
    if (name.startsWith("lh-")) {
      commandsChanged = true;
    } else {
      newCommands[name] = value;
    }
  }
  if (commandsChanged) {
    anyChanged = true;
    if (Object.keys(newCommands).length === 0) {
      delete result["command"];
    } else {
      result["command"] = newCommands;
    }
  }

  if (!anyChanged) return false;

  await writeJsonFile(cfgPath, result, { overwrite: true });
  return true;
}

function printPreview(
  plan: RemovalPlan,
  root: string,
  json: boolean,
  out: NodeJS.WritableStream,
): void {
  if (json) return;
  const colors = createColors();
  const rel = (p: string) => path.relative(root, p);

  out.write(`\n${colors.bold("LeanHarness uninstall preview")}\n\n`);

  if (plan.dirs.length > 0) {
    out.write(`${colors.dim("Directories to remove:")}\n`);
    for (const d of plan.dirs) out.write(`  ${colors.red("−")} ${rel(d)}/\n`);
  }
  if (plan.files.length > 0) {
    out.write(`${colors.dim("Files to remove:")}\n`);
    for (const f of plan.files) out.write(`  ${colors.red("−")} ${rel(f)}\n`);
  }
  if (plan.stripFiles.length > 0) {
    out.write(`${colors.dim("Files to strip LH entries from:")}\n`);
    for (const f of plan.stripFiles) out.write(`  ${colors.yellow("~")} ${rel(f)}\n`);
  }
  if (plan.promptDirs.length > 0) {
    out.write(`${colors.dim("Will ask about:")}\n`);
    for (const d of plan.promptDirs) out.write(`  ${colors.cyan("?")} ${d.relPath}/\n`);
  }
  out.write("\n");
}

export async function runUninstallCommand(options: UninstallOptions): Promise<void> {
  const { cwd, yes = false, dryRun = false, json = false } = options;
  const log = createLogger({ json });
  const out = process.stdout;

  const plan = await buildRemovalPlan(cwd);
  const totalItems =
    plan.dirs.length + plan.files.length + plan.stripFiles.length + plan.promptDirs.length;

  if (totalItems === 0) {
    if (json) {
      printJson({ status: "nothing", message: "Nothing to uninstall." });
    } else {
      log.info("Nothing to uninstall.");
    }
    return;
  }

  printPreview(plan, cwd, json, out);

  if (dryRun) {
    if (!json) log.info("Dry run complete. No files removed.");
    else printJson({ status: "dry-run", plan: { dirs: plan.dirs, files: plan.files, stripFiles: plan.stripFiles, promptDirs: plan.promptDirs.map((d) => d.relPath) } });
    return;
  }

  // Interactive prompts for user-content dirs
  const keptPaths: string[] = [];
  if (!yes && plan.promptDirs.length > 0) {
    for (const pd of plan.promptDirs) {
      const keep = await promptConfirm(pd.label, true);
      if (keep) keptPaths.push(pd.path);
    }
  } else {
    // --yes: keep all user-content dirs (safe default)
    for (const pd of plan.promptDirs) keptPaths.push(pd.path);
  }

  // Final confirmation
  if (!yes) {
    const proceed = await promptConfirm("Proceed with uninstall?", false);
    if (!proceed) {
      if (!json) log.info("Aborted.");
      return;
    }
  }

  const result: UninstallResult = { removed: [], kept: [], stripped: [], skipped: [] };

  // Remove directories
  for (const d of plan.dirs) {
    await removeDir(d);
    result.removed.push(path.relative(cwd, d));
  }

  // Remove files
  for (const f of plan.files) {
    await removeFile(f);
    result.removed.push(path.relative(cwd, f));
  }

  // Strip shared config files
  for (const f of plan.stripFiles) {
    const stripped =
      f === claudeSettingsPath(cwd)
        ? await stripLhFromSettings(cwd)
        : f === opencodeConfigPath(cwd)
          ? await stripLhFromOpencodeConfig(cwd)
          : false;
    if (stripped) result.stripped.push(path.relative(cwd, f));
    else result.skipped.push(path.relative(cwd, f));
  }

  // Handle prompt dirs — remove if not kept
  for (const pd of plan.promptDirs) {
    if (keptPaths.includes(pd.path)) {
      result.kept.push(pd.relPath);
    } else {
      await removeDir(pd.path);
      result.removed.push(pd.relPath);
    }
  }

  // Clean up empty parent dirs
  for (const parentDir of [
    harnessPath(cwd),
    claudePath(cwd),
    opencodePath(cwd),
  ]) {
    if (await dirExists(parentDir)) {
      await cleanEmptyDir(parentDir);
    }
  }

  if (json) {
    printJson({ status: "done", ...result });
  } else {
    const colors = createColors();
    out.write(`${colors.green("✓")} Uninstall complete.\n\n`);
    if (result.removed.length > 0) {
      out.write(`${colors.dim("Removed:")}\n`);
      for (const r of result.removed) out.write(`  ${r}\n`);
    }
    if (result.stripped.length > 0) {
      out.write(`${colors.dim("Stripped LH entries from:")}\n`);
      for (const s of result.stripped) out.write(`  ${s}\n`);
    }
    if (result.kept.length > 0) {
      out.write(`${colors.dim("Kept:")}\n`);
      for (const k of result.kept) out.write(`  ${k}\n`);
    }
  }
}
