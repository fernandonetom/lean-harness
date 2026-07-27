import path from "node:path";
import { fileExists, readTextFile, writeTextFile, readJsonFile } from "../core/fs.js";
import { statePath, configPath, policiesDir } from "../core/paths.js";
import { createLogger, printJson } from "../core/logger.js";
import { CLIError } from "../core/errors.js";
import { getVersion } from "../core/version.js";
import { runInitCommand } from "./init.js";

export interface UpdateOptions {
  cwd: string;
  host?: string | undefined;
  json?: boolean;
}

interface UpdateResult {
  installedVersion: string | null;
  currentVersion: string;
  updated: boolean;
  initResult: unknown;
  warnings: string[];
}


function updateConfigVersion(yamlContent: string, version: string): string {
  // Replace version: "X.Y.Z" with the current version
  // Handles both quoted and unquoted version values
  const lines = yamlContent.split("\n");
  const result = lines.map(line => {
    const match = line.match(/^(\s*)version:\s*["']?([^"'\n]+)["']?\s*$/);
    if (match) {
      return match[1] + 'version: "' + version + '"';
    }
    return line;
  });
  return result.join("\n");
}

interface FileBackup {
  label: string;
  path: string;
  content: string | null; // null = file did not exist before update
}

async function backupFile(label: string, filePath: string): Promise<FileBackup> {
  return { label, path: filePath, content: await readTextFile(filePath) };
}

/** Restore a backed-up file verbatim if it existed pre-update. Returns true if restored. */
async function restoreIfBackedUp(backup: FileBackup): Promise<boolean> {
  if (backup.content === null) return false;
  await writeTextFile(backup.path, backup.content, { overwrite: true });
  return true;
}

function preservedFilePaths(cwd: string): Array<{ label: string; path: string }> {
  const policies = policiesDir(cwd);
  return [
    { label: "policies/risk-gates.yml", path: path.join(policies, "risk-gates.yml") },
    { label: "policies/boundary.yml", path: path.join(policies, "boundary.yml") },
    { label: "policies/commands.yml", path: path.join(policies, "commands.yml") },
    { label: "policies/claude-code.yml", path: path.join(policies, "claude-code.yml") },
    { label: "policies/opencode.yml", path: path.join(policies, "opencode.yml") },
    { label: "state.json", path: statePath(cwd) },
  ];
}

export async function runUpdateCommand(options: UpdateOptions): Promise<void> {
  const { cwd, json = false } = options;
  const log = createLogger({ json });
  const warnings: string[] = [];

  const stateFile = statePath(cwd);
  if (!(await fileExists(stateFile))) {
    throw new CLIError("LeanHarness not initialized. Run `lh init` first.");
  }

  const state = await readJsonFile<Record<string, unknown>>(stateFile);
  const installedVersion = state && typeof state["version"] === "string" ? state["version"] : null;
  const currentVersion = getVersion();

  if (!json) {
    log.info("LeanHarness update");
    log.info("");
    log.info(`Installed version: ${installedVersion ?? "unknown"}`);
    log.info(`CLI version:       ${currentVersion}`);
    log.info("");
  }

  const cfgPath = configPath(cwd);
  const hasUserConfig = await fileExists(cfgPath);
  let userConfigBackup: string | null = null;
  if (hasUserConfig) {
    userConfigBackup = await readTextFile(cfgPath);
  }

  const preservedTargets = preservedFilePaths(cwd);
  const preservedBackups = await Promise.all(
    preservedTargets.map(t => backupFile(t.label, t.path)),
  );

  const host = options.host ?? await detectInstalledHost(cwd);

  if (!json) {
    log.info(`Refreshing LH-managed files (host: ${host ?? "none"})...`);
    log.info("");
  }

  await runInitCommand({
    cwd,
    force: true,
    json,
    host: host ?? undefined,
  });

  if (userConfigBackup !== null) {
    // Always restore user config with version updated (even if version didn't change)
    // This preserves user customizations while ensuring version is current
    const updatedConfig = updateConfigVersion(userConfigBackup, currentVersion);
    await writeTextFile(cfgPath, updatedConfig, { overwrite: true });
    if (!json) {
      log.info("");
      log.success("User config.yml restored with current version.");
    }
  }

  const restoredLabels: string[] = [];
  for (const backup of preservedBackups) {
    if (await restoreIfBackedUp(backup)) restoredLabels.push(backup.label);
  }
  if (!json && restoredLabels.length > 0) {
    log.info("");
    log.success(`Preserved ${restoredLabels.length} customized file(s): ${restoredLabels.join(", ")}`);
  }

  if (json) {
    printJson({
      installedVersion,
      currentVersion,
      updated: true,
      host,
      configPreserved: hasUserConfig,
      preservedFiles: restoredLabels,
      warnings,
    });
    return;
  }

  log.info("");
  log.success(`Update complete. Templates/skills/hooks refreshed.`);
  if (installedVersion && installedVersion !== currentVersion) {
    log.info(`Version bumped: ${installedVersion} → ${currentVersion}`);
  }
  for (const w of warnings) {
    log.warn(w);
  }
}

async function detectInstalledHost(cwd: string): Promise<string | null> {
  const hasClaudeDir = await fileExists(path.join(cwd, ".claude", "settings.json"));
  const hasOpenCodeDir = await fileExists(path.join(cwd, "opencode.json"));

  if (hasClaudeDir && hasOpenCodeDir) return "all";
  if (hasClaudeDir) return "claude-code";
  if (hasOpenCodeDir) return "opencode";
  return null;
}
