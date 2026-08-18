import os from "node:os";
import path from "node:path";
import { readJsonFile, fileExists, dirExists, listFiles } from "../core/fs.js";
import {
  claudeSettingsPath,
  opencodeConfigPath,
  opencodePath,
} from "../core/paths.js";

const PLUGIN_ID = "lh@lean-harness";

async function claudeSettingsHasPlugin(settingsPath: string): Promise<boolean> {
  const raw = await readJsonFile<Record<string, unknown>>(settingsPath);
  if (!raw) return false;
  const enabled = raw["enabledPlugins"];
  if (!enabled || typeof enabled !== "object") return false;
  return (enabled as Record<string, unknown>)[PLUGIN_ID] === true;
}

/**
 * True if the `lh` Claude Code plugin is enabled either at the project level
 * (`<cwd>/.claude/settings.json`) or the user level (`~/.claude/settings.json`).
 */
export async function isClaudePluginEnabled(cwd: string): Promise<boolean> {
  const projectSettings = claudeSettingsPath(cwd);
  if (await claudeSettingsHasPlugin(projectSettings)) return true;

  const userSettings = path.join(os.homedir(), ".claude", "settings.json");
  return claudeSettingsHasPlugin(userSettings);
}

/**
 * True if OpenCode is configured to use the `lh` plugin — either via a `"plugin"` array
 * entry referencing `@feneto/lh` in project or global `opencode.json`, or a local
 * `.opencode/plugins/leanharness-*.js` file (the CLI-delivered fallback path).
 */
export async function isOpenCodePluginConfigured(cwd: string): Promise<boolean> {
  const projectConfigPath_ = opencodeConfigPath(cwd);
  const projectConfig = await readJsonFile<Record<string, unknown>>(
    projectConfigPath_,
  );
  if (opencodeConfigHasPlugin(projectConfig)) return true;

  const globalConfigPath = path.join(
    os.homedir(),
    ".config",
    "opencode",
    "opencode.json",
  );
  const globalConfig = await readJsonFile<Record<string, unknown>>(
    globalConfigPath,
  );
  if (opencodeConfigHasPlugin(globalConfig)) return true;

  // CLI-delivered fallback: any file matching .opencode/plugins/leanharness-*.js
  const pluginsDir = opencodePath(cwd, "plugins");
  if (await dirExists(pluginsDir)) {
    const entries = await listFiles(pluginsDir);
    if (
      entries.some((name) => name.startsWith("leanharness-") && name.endsWith(".js"))
    ) {
      return true;
    }
  }

  return false;
}

function opencodeConfigHasPlugin(
  config: Record<string, unknown> | null,
): boolean {
  if (!config) return false;
  const plugin = config["plugin"];
  if (!Array.isArray(plugin)) return false;
  return plugin.some((entry) => typeof entry === "string" && entry.includes("@feneto/lh"));
}

export interface PluginInstallStatus {
  claudeCode: boolean;
  openCode: boolean;
}

export async function detectPluginInstalled(
  cwd: string,
): Promise<PluginInstallStatus> {
  const [claudeCode, openCode] = await Promise.all([
    isClaudePluginEnabled(cwd),
    isOpenCodePluginConfigured(cwd),
  ]);
  return { claudeCode, openCode };
}
