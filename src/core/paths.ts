import path from "node:path";

export const HARNESS_DIR = ".lh";
export const CLAUDE_DIR = ".claude";
export const OPENCODE_DIR = ".opencode";
export const OPENCODE_CONFIG_FILE = "opencode.json";

export function resolveProjectPath(root: string, ...segments: string[]): string {
  return path.resolve(root, ...segments);
}

export function harnessPath(root: string, ...segments: string[]): string {
  return path.resolve(root, HARNESS_DIR, ...segments);
}

export function claudePath(root: string, ...segments: string[]): string {
  return path.resolve(root, CLAUDE_DIR, ...segments);
}

export function featuresDir(root: string): string {
  return harnessPath(root, "features");
}

export function templatesDir(root: string): string {
  return harnessPath(root, "templates");
}

export function memoryDir(root: string): string {
  return harnessPath(root, "memory");
}

export function policiesDir(root: string): string {
  return harnessPath(root, "policies");
}

export function protocolsDir(root: string): string {
  return harnessPath(root, "protocols");
}

export function statePath(root: string): string {
  return harnessPath(root, "state.json");
}

export function configPath(root: string): string {
  return harnessPath(root, "config.yml");
}

export function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}

export function relativeToRoot(root: string, value: string): string {
  return toPosixPath(path.relative(root, value));
}

export function opencodePath(root: string, ...segments: string[]): string {
  return path.resolve(root, OPENCODE_DIR, ...segments);
}

export function opencodeConfigPath(root: string): string {
  return path.resolve(root, OPENCODE_CONFIG_FILE);
}

export function opencodeAgentsDir(root: string): string {
  return opencodePath(root, "agents");
}

export function opencodePluginsDir(root: string): string {
  return opencodePath(root, "plugins");
}

export function opencodePluginPath(root: string, ...segments: string[]): string {
  return path.resolve(root, OPENCODE_DIR, "plugins", ...segments);
}

export function opencodeGuardrailPluginPath(root: string): string {
  return opencodePluginPath(root, "leanharness-guardrails.js");
}

export function claudeSkillsDir(root: string): string {
  return claudePath(root, "skills");
}

export function claudeAgentsDir(root: string): string {
  return claudePath(root, "agents");
}

export function claudeHooksDir(root: string): string {
  return claudePath(root, "hooks");
}

export function claudeSettingsPath(root: string): string {
  return claudePath(root, "settings.json");
}

export function scriptsHooksDir(root: string): string {
  return harnessPath(root, "scripts", "hooks");
}
