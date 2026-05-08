import path from "node:path";
import { fileExists, readTextFile, readJsonFile } from "../core/fs.js";
import { statePath, configPath, harnessPath } from "../core/paths.js";
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
    const { writeTextFile } = await import("../core/fs.js");
    await writeTextFile(cfgPath, userConfigBackup, { overwrite: true });
    if (!json) {
      log.info("");
      log.success("User config.yml preserved.");
    }
  }

  if (json) {
    printJson({
      installedVersion,
      currentVersion,
      updated: true,
      host,
      configPreserved: hasUserConfig,
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
