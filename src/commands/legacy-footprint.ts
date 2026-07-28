import fsp from "node:fs/promises";
import path from "node:path";
import { dirExists, fileExists, readTextFile } from "../core/fs.js";
import {
  claudeSkillsDir,
  claudeAgentsDir,
  claudeHooksDir,
  scriptsHooksDir,
  opencodeCommandsDir,
  opencodeAgentsDir,
  configPath,
} from "../core/paths.js";

const LH_SKILL_NAMES = [
  "lh-do",
  "lh-spec",
  "lh-discover",
  "lh-plan",
  "lh-build",
  "lh-check",
  "lh-status",
];
const LH_AGENT_FILENAMES = [
  "lh-scout.md",
  "lh-builder.md",
  "lh-builder-fix.md",
  "lh-reviewer.md",
  "lh-verifier.md",
  "lh-compressor.md",
];

export interface LegacyFootprint {
  paths: string[];
  configVersion: string | null;
}

/**
 * Detect leftover v1.x generated files in a repo that has moved (or should move) to the
 * v2 plugin-based distribution model. Returns absolute paths that exist on disk today,
 * plus the `.lh/config.yml` `version:` value as a legacy marker (a version string
 * starting with "1." indicates the repo predates the plugin migration).
 */
export async function detectLegacyFootprint(cwd: string): Promise<LegacyFootprint> {
  const candidates: string[] = [];

  // Check Claude Code skill directories
  const skillsDir = claudeSkillsDir(cwd);
  for (const name of LH_SKILL_NAMES) {
    candidates.push(path.join(skillsDir, name));
  }

  // Check Claude Code agent files
  const agentsDir = claudeAgentsDir(cwd);
  for (const name of LH_AGENT_FILENAMES) {
    candidates.push(path.join(agentsDir, name));
  }

  // Check Claude Code hooks file
  candidates.push(path.join(claudeHooksDir(cwd), "leanharness-hooks.json"));

  // Check scripts hooks directory
  candidates.push(scriptsHooksDir(cwd));

  // Check OpenCode commands (individual .md files starting with lh-)
  const opencodeCommandsPath = opencodeCommandsDir(cwd);
  try {
    const commandEntries = await fsp.readdir(opencodeCommandsPath);
    for (const entry of commandEntries) {
      if (entry.startsWith("lh-")) {
        candidates.push(path.join(opencodeCommandsPath, entry));
      }
    }
  } catch {
    // directory doesn't exist — fine
  }

  // Check OpenCode agents (individual .md files starting with lh-)
  const opencodeAgentsPath = opencodeAgentsDir(cwd);
  try {
    const agentEntries = await fsp.readdir(opencodeAgentsPath);
    for (const entry of agentEntries) {
      if (entry.startsWith("lh-")) {
        candidates.push(path.join(opencodeAgentsPath, entry));
      }
    }
  } catch {
    // directory doesn't exist — fine
  }

  // Filter to only paths that actually exist
  const existing: string[] = [];
  for (const p of candidates) {
    // Check if it's a directory
    if (await dirExists(p)) {
      existing.push(p);
      continue;
    }
    // Check if it's a file
    if (await fileExists(p)) {
      existing.push(p);
      continue;
    }
  }

  const configVersion = await readConfigVersion(cwd);

  return { paths: existing, configVersion };
}

async function readConfigVersion(cwd: string): Promise<string | null> {
  const raw = await readTextFile(configPath(cwd));
  if (!raw) return null;
  const match = raw.match(/^version:\s*["']?([^"'\n]+)["']?\s*$/m);
  return match?.[1]?.trim() ?? null;
}
