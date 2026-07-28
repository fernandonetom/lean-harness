import { spawnSync, execSync } from "node:child_process";
import { CLIError } from "../core/errors.js";
import { ensureDir } from "../core/fs.js";
import { writeTextFile, writeJsonFile, readJsonFile, fileExists } from "../core/fs.js";
import {
  createDefaultState,
  createDefaultConfigYaml,
  createDefaultMemoryFile,
} from "../core/config.js";
import { harnessPath, featuresDir, memoryDir, templatesDir, policiesDir, protocolsDir, configPath, statePath, harnessGitignorePath, opencodePath, opencodeConfigPath, opencodeAgentsDir, opencodePluginsDir, opencodeCommandsDir, opencodePluginPath } from "../core/paths.js";
import { createLogger, printJson } from "../core/logger.js";
import { installClaudeCodePack, installGlobalClaudeCodeStatusLine } from "./init-claude-code.js";
import { createOpenCodeCommandFiles } from "./load-opencode-commands.js";
import { loadOpenCodeAgentFiles } from "./load-opencode-agents.js";
import { loadOpenCodePluginFiles } from "./load-opencode-plugins.js";
import { promptMultiSelect } from "../core/prompt.js";
import { printInitBanner } from "../cli/banner.js";
import {
  type InitHost,
  type InitHostSelection,
  normalizeInitHosts,
  hasAnyInitHost,
} from "../cli/init-hosts.js";
import { installBundledScaffold } from "../core/bundled-scaffold.js";

export type { InitHost };

export interface InitOptions {
  cwd: string;
  force?: boolean;
  json?: boolean;
  host?: string | string[] | undefined;
  yes?: boolean;
  global?: boolean;
  team?: boolean;
  noPin?: boolean;
}

interface InitResult {
  directories: Record<string, "created" | "existed">;
  files: Record<string, "created" | "updated" | "skipped">;
  warnings: string[];
}

export function checkPythonVersion(): { ok: boolean; version: string } {
  try {
    const result = spawnSync("python3", ["--version"], { encoding: "utf-8" });
    if (result.status !== 0 || result.error) return { ok: false, version: "" };
    const output = (result.stdout || result.stderr || "").trim();
    const match = /Python (\d+)\.(\d+)/.exec(output);
    if (!match) return { ok: false, version: output };
    const major = parseInt(match[1]!, 10);
    const minor = parseInt(match[2]!, 10);
    const ok = major > 3 || (major === 3 && minor >= 10);
    return { ok, version: `${major}.${minor}` };
  } catch {
    return { ok: false, version: "" };
  }
}

export function checkGraphifyInstalled(): boolean {
  try {
    const result = spawnSync("graphify", ["--version"], { encoding: "utf-8" });
    return result.status === 0 && !result.error;
  } catch {
    return false;
  }
}

export async function runGraphifyInstall(
  hosts: InitHostSelection,
  log: ReturnType<typeof createLogger>,
  json: boolean,
): Promise<{ warnings: string[] }> {
  const warnings: string[] = [];

  const python = checkPythonVersion();
  if (!python.ok) {
    const found = python.version ? `Found Python ${python.version}.` : "Python 3 not found.";
    throw new CLIError(
      `Graphify requires Python 3.10 or later. ${found}\n` +
        `Install Python 3.10+ from https://python.org and re-run lh init.`,
    );
  }
  if (!json) log.info(`  Python ${python.version} (ok)`);

  const alreadyInstalled = checkGraphifyInstalled();
  if (alreadyInstalled) {
    if (!json) log.info("  graphify already installed (skipped)");
  } else {
    if (!json) log.info("  installing graphify...");
    try {
      execSync("pip install graphifyy && graphify install", {
        stdio: json ? "pipe" : "inherit",
      });
    } catch (err) {
      throw new CLIError(
        `Failed to install graphify. Run manually: pip install graphifyy && graphify install\n` +
          `Error: ${String(err)}`,
      );
    }
    if (!json) log.info("  graphify installed");
  }

  if (hosts.openCode) {
    if (!json) log.info("  configuring graphify for OpenCode...");
    try {
      execSync("graphify opencode install", { stdio: json ? "pipe" : "inherit" });
    } catch (err) {
      const msg = `graphify opencode install failed: ${String(err)}`;
      warnings.push(msg);
      if (!json) log.warn(`  ${msg}`);
    }
    if (!json) log.info("  graphify OpenCode integration configured");
  }

  return { warnings };
}

function resolveHostArg(host: string | string[] | undefined): string[] {
  if (host === undefined) return [];
  return Array.isArray(host) ? host : [host];
}

export async function runInitCommand(options: InitOptions): Promise<void> {
  const { cwd, force = false, json = false, host, yes = false, global: isGlobal = false, team = false } = options;
  const log = createLogger({ json });
  const overwrite = force;

  let hostSelection = normalizeInitHosts(resolveHostArg(host));

  if (!json && !yes && !hasAnyInitHost(hostSelection) && process.stdin.isTTY) {
    printInitBanner();
    const selected = await promptMultiSelect<"claude-code" | "opencode">(
      "Which agent hosts do you want to set up?",
      [
        { label: "Claude Code", value: "claude-code" },
        { label: "OpenCode", value: "opencode" },
      ],
      { required: true },
    );
    hostSelection = {
      claudeCode: selected.includes("claude-code"),
      openCode: selected.includes("opencode"),
    };
  }

  if (!json) {
    log.info(log.colors.bold("LeanHarness init"));
    log.info("");
  }

  const result: InitResult = { directories: {}, files: {}, warnings: [] };

  const dirs = [
    { label: ".lh", path: harnessPath(cwd) },
    { label: ".lh/features", path: featuresDir(cwd) },
    { label: ".lh/memory", path: memoryDir(cwd) },
    { label: ".lh/templates", path: templatesDir(cwd) },
    { label: ".lh/policies", path: policiesDir(cwd) },
    { label: ".lh/protocols", path: protocolsDir(cwd) },
  ];

  for (const dir of dirs) {
    const fs = await import("node:fs");
    const existed = fs.existsSync(dir.path);
    await ensureDir(dir.path);
    result.directories[dir.label] = existed ? "existed" : "created";
    if (!json) {
      log.info(existed ? `  ${dir.label}/ (exists)` : `  ${dir.label}/ (created)`);
    }
  }

  if (!json) log.info("");

  const files: Array<{ label: string; path: string; content: string }> = [
    { label: ".lh/config.yml", path: configPath(cwd), content: createDefaultConfigYaml() },
    {
      label: ".lh/state.json",
      path: statePath(cwd),
      content: JSON.stringify(createDefaultState(), null, 2) + "\n",
    },
    {
      label: ".lh/memory/project.md",
      path: harnessPath(cwd, "memory", "project.md"),
      content: createDefaultMemoryFile("Project Memory"),
    },
    {
      label: ".lh/memory/decisions.md",
      path: harnessPath(cwd, "memory", "decisions.md"),
      content: createDefaultMemoryFile("Decisions"),
    },
    {
      label: ".lh/memory/patterns.md",
      path: harnessPath(cwd, "memory", "patterns.md"),
      content: createDefaultMemoryFile("Patterns"),
    },
    {
      label: ".lh/memory/cave.md",
      path: harnessPath(cwd, "memory", "cave.md"),
      content: createDefaultMemoryFile("CaveBus Memory"),
    },
    {
      label: ".lh/.gitignore",
      path: harnessGitignorePath(cwd),
      content: createLhGitignore(team),
    },
  ];

  for (const file of files) {
    const status = await writeTextFile(file.path, file.content, { overwrite });
    result.files[file.label] = status;
    if (!json) {
      const msg =
        status === "created"
          ? `  ${file.label} (created)`
          : status === "updated"
            ? `  ${file.label} (updated)`
            : `  ${file.label} (exists, skipped)`;
      log.info(msg);
    }
  }

  if (!json) {
    log.info("");
    log.info("Harness scaffold:");
  }

  const scaffoldResult = await installBundledScaffold(cwd, { overwrite });
  for (const [label, status] of Object.entries(scaffoldResult)) {
    result.files[label] = status;
    if (!json) {
      const msg =
        status === "created"
          ? `  ${label} (created)`
          : status === "updated"
            ? `  ${label} (updated)`
            : `  ${label} (exists, skipped)`;
      log.info(msg);
    }
  }

  if (hostSelection.openCode) {
    if (!json) {
      log.info("");
      log.info("OpenCode integration:");
    }
    const ocResult = await installOpenCodePack(cwd, overwrite, log, json);
    for (const [key, value] of Object.entries(ocResult.directories)) {
      result.directories[key] = value;
    }
    for (const [key, value] of Object.entries(ocResult.files)) {
      result.files[key] = value;
    }
    result.warnings.push(...ocResult.warnings);
  }

  if (hostSelection.claudeCode) {
    if (!json) {
      log.info("");
      log.info("Claude Code integration:");
    }
    const ccResult = await installClaudeCodePack(cwd, overwrite, log, json);
    for (const [key, value] of Object.entries(ccResult.directories)) {
      result.directories[key] = value;
    }
    for (const [key, value] of Object.entries(ccResult.files)) {
      result.files[key] = value;
    }
    result.warnings.push(...ccResult.warnings);
  }

  // --- graphify installation ---
  if (!json) {
    log.info("");
    log.info("Graphify installation:");
  }
  const graphifyResult = await runGraphifyInstall(hostSelection, log, json);
  result.warnings.push(...graphifyResult.warnings);

  if (isGlobal) {
    if (!json) {
      log.info("");
      log.info("Global (user-level) installation:");
    }
    const globalResult = await installGlobalPack(hostSelection, overwrite, log, json);
    for (const [key, value] of Object.entries(globalResult.directories)) {
      result.directories[key] = value;
    }
    for (const [key, value] of Object.entries(globalResult.files)) {
      result.files[key] = value;
    }
    result.warnings.push(...globalResult.warnings);
  }

  if (json) {
    printJson(result);
    return;
  }

  log.info("");

  const created = Object.values(result.files).filter((s) => s === "created").length;
  const skipped = Object.values(result.files).filter((s) => s === "skipped").length;
  const updated = Object.values(result.files).filter((s) => s === "updated").length;

  if (created > 0) log.success(`${created} file(s) created.`);
  if (updated > 0) log.success(`${updated} file(s) updated.`);
  if (skipped > 0) log.info(`${skipped} file(s) already existed (use --force to overwrite).`);

  for (const w of result.warnings) {
    log.warn(w);
  }

  log.info("");
  log.success("LeanHarness initialized.");
}

function createLhGitignore(team: boolean): string {
  if (team) {
    return `# LeanHarness — team mode
# Feature artifacts are committed and shared with the team.

# Runtime state (user-specific)
/state.json

# Runtime log (session-local, never commit)
/memory/cave.md

# Local config overrides (personal, never commit)
config.local.yml
`;
  }
  return `# LeanHarness — solo mode (default)
# Feature work is personal and not committed to the repo.
# To share feature artifacts with your team, set features.commit: true
# in .lh/config.yml and re-run: lh init --force --team

/features/
/state.json

# Runtime log (session-local, never commit)
/memory/cave.md

# Local config overrides (personal, never commit)
config.local.yml
`;
}

interface PackResult {
  directories: Record<string, "created" | "existed">;
  files: Record<string, "created" | "updated" | "skipped">;
  warnings: string[];
}

async function installOpenCodePack(
  cwd: string,
  force: boolean,
  log: ReturnType<typeof createLogger>,
  json: boolean,
): Promise<PackResult> {
  const result: PackResult = { directories: {}, files: {}, warnings: [] };
  const fs = await import("node:fs");

  const ocDir = opencodePath(cwd);
  const ocDirExisted = fs.existsSync(ocDir);
  await ensureDir(ocDir);
  result.directories[".opencode"] = ocDirExisted ? "existed" : "created";
  if (!json) {
    log.info(ocDirExisted ? "  .opencode/ (exists)" : "  .opencode/ (created)");
  }

  const agDir = opencodeAgentsDir(cwd);
  const agDirExisted = fs.existsSync(agDir);
  await ensureDir(agDir);
  result.directories[".opencode/agents"] = agDirExisted ? "existed" : "created";
  if (!json) {
    log.info(agDirExisted ? "  .opencode/agents/ (exists)" : "  .opencode/agents/ (created)");
  }

  const configStatus = await installOpenCodeConfig(cwd, force, log, json);
  result.files["opencode.json"] = configStatus.status;
  result.warnings.push(...configStatus.warnings);

  const readmeStatus = await writeTextFile(
    opencodePath(cwd, "README.md"),
    createOpenCodeReadme(),
    { overwrite: force },
  );
  result.files[".opencode/README.md"] = readmeStatus;
  if (!json) {
    log.info(readmeStatus === "created" ? "  .opencode/README.md (created)" : readmeStatus === "updated" ? "  .opencode/README.md (updated)" : "  .opencode/README.md (exists, skipped)");
  }

  const agentFiles = loadOpenCodeAgentFiles();
  for (const agent of agentFiles) {
    const agentPath = opencodePath(cwd, "agents", agent.filename);
    const agentExists = await fileExists(agentPath);
    if (agentExists && !force) {
      result.files[`.opencode/agents/${agent.filename}`] = "skipped";
      result.warnings.push(`OpenCode agent already exists and was not overwritten: .opencode/agents/${agent.filename}. Use --force to refresh LeanHarness-managed OpenCode agents.`);
      if (!json) {
        log.info(`  .opencode/agents/${agent.filename} (exists, skipped)`);
      }
    } else {
      const status = await writeTextFile(agentPath, agent.content, { overwrite: force });
      result.files[`.opencode/agents/${agent.filename}`] = status;
      if (!json) {
        log.info(status === "created" ? `  .opencode/agents/${agent.filename} (created)` : `  .opencode/agents/${agent.filename} (updated)`);
      }
    }
  }

  const cmdDir = opencodeCommandsDir(cwd);
  const cmdDirExisted = fs.existsSync(cmdDir);
  await ensureDir(cmdDir);
  result.directories[".opencode/commands"] = cmdDirExisted ? "existed" : "created";
  if (!json) {
    log.info(cmdDirExisted ? "  .opencode/commands/ (exists)" : "  .opencode/commands/ (created)");
  }

  const commandFiles = createOpenCodeCommandFiles();
  for (const cf of commandFiles) {
    const cmdPath = opencodePath(cwd, "commands", cf.filename);
    const cmdExists = await fileExists(cmdPath);
    if (cmdExists && !force) {
      result.files[`.opencode/commands/${cf.filename}`] = "skipped";
      result.warnings.push(`OpenCode command template already exists and was not overwritten: .opencode/commands/${cf.filename}. Use --force to refresh LeanHarness-managed OpenCode commands.`);
      if (!json) {
        log.info(`  .opencode/commands/${cf.filename} (exists, skipped)`);
      }
    } else {
      const status = await writeTextFile(cmdPath, cf.content, { overwrite: force });
      result.files[`.opencode/commands/${cf.filename}`] = status;
      if (!json) {
        log.info(status === "created" ? `  .opencode/commands/${cf.filename} (created)` : `  .opencode/commands/${cf.filename} (updated)`);
      }
    }
  }

  // --- plugins ---
  const plugDir = opencodePluginsDir(cwd);
  const plugDirExisted = fs.existsSync(plugDir);
  await ensureDir(plugDir);
  result.directories[".opencode/plugins"] = plugDirExisted ? "existed" : "created";
  if (!json) {
    log.info(plugDirExisted ? "  .opencode/plugins/ (exists)" : "  .opencode/plugins/ (created)");
  }

  const pluginFiles = loadOpenCodePluginFiles();
  for (const pf of pluginFiles) {
    const pfPath = opencodePluginPath(cwd, pf.filename);
    const pfExists = await fileExists(pfPath);
    if (pfExists && !force) {
      result.files[`.opencode/plugins/${pf.filename}`] = "skipped";
      result.warnings.push(`OpenCode guardrail plugin already exists and was not overwritten: .opencode/plugins/${pf.filename}. Use --force to refresh LeanHarness-managed plugin files.`);
      if (!json) {
        log.info(`  .opencode/plugins/${pf.filename} (exists, skipped)`);
      }
    } else {
      const status = await writeTextFile(pfPath, pf.content, { overwrite: force });
      result.files[`.opencode/plugins/${pf.filename}`] = status;
      if (!json) {
        log.info(status === "created" ? `  .opencode/plugins/${pf.filename} (created)` : `  .opencode/plugins/${pf.filename} (updated)`);
      }
    }
  }

  // --- opencode policy ---
  const policyPath = harnessPath(cwd, "policies", "opencode.yml");
  await ensureDir(policiesDir(cwd));
  const policyStatus = await writeTextFile(policyPath, createOpenCodePolicyYaml(), { overwrite: force });
  result.files[".lh/policies/opencode.yml"] = policyStatus;
  if (!json) {
    log.info(policyStatus === "created" ? "  .lh/policies/opencode.yml (created)" : policyStatus === "updated" ? "  .lh/policies/opencode.yml (updated)" : "  .lh/policies/opencode.yml (exists, skipped)");
  }

  return result;
}

interface ConfigInstallResult {
  status: "created" | "updated" | "skipped";
  warnings: string[];
}

async function installOpenCodeConfig(
  cwd: string,
  force: boolean,
  log: ReturnType<typeof createLogger>,
  json: boolean,
): Promise<ConfigInstallResult> {
  const cfgPath = opencodeConfigPath(cwd);
  const warnings: string[] = [];

  const existing = await readJsonFile<Record<string, unknown>>(cfgPath).catch((err: unknown) => {
    if (err instanceof Error && err.message.includes("Failed to parse JSON")) {
      return "invalid" as const;
    }
    return null;
  });

  if (existing === "invalid") {
    const msg = "Cannot update opencode.json because it is not valid JSON. Fix the file or move it before running lh init --host opencode.";
    if (!json) log.error(msg);
    return { status: "skipped", warnings: [msg] };
  }

  const lhConfig = createOpenCodeConfigObject();

  if (existing === null) {
    await writeJsonFile(cfgPath, lhConfig, { overwrite: true });
    if (!json) log.info("  opencode.json (created)");
    return { status: "created", warnings };
  }

  const merged = mergeOpenCodeConfig(existing, lhConfig, force, warnings);
  await writeJsonFile(cfgPath, merged, { overwrite: true });
  if (!json) log.info("  opencode.json (updated)");
  return { status: "updated", warnings };
}

function mergePermissionConfig(
  existing: Record<string, unknown>,
  lhConfig: Record<string, unknown>,
  _warnings: string[],
): Record<string, unknown> {
  const merged = { ...existing };

  const allowFields = ["read", "list", "glob", "grep", "edit"] as const;
  for (const field of allowFields) {
    if (existing[field] === undefined) {
      merged[field] = lhConfig[field] ?? "ask";
    }
  }

  const existingBash = (existing["bash"] ?? {}) as Record<string, unknown>;
  const lhBash = (lhConfig["bash"] ?? {}) as Record<string, unknown>;
  const mergedBash: Record<string, unknown> = { ...existingBash };

  for (const [key, value] of Object.entries(lhBash)) {
    if (existingBash[key] === undefined) {
      mergedBash[key] = value;
    }
  }
  merged["bash"] = mergedBash;

  if (existing["webfetch"] === undefined) {
    merged["webfetch"] = lhConfig["webfetch"] ?? "ask";
  }

  return merged;
}

function mergeOpenCodeConfig(
  existing: Record<string, unknown>,
  lhConfig: Record<string, unknown>,
  force: boolean,
  warnings: string[],
): Record<string, unknown> {
  const result = { ...existing };

  if (!result["$schema"]) {
    result["$schema"] = lhConfig["$schema"];
  }

  if (!result["permission"]) {
    result["permission"] = lhConfig["permission"];
  } else {
    result["permission"] = mergePermissionConfig(
      (result["permission"] ?? {}) as Record<string, unknown>,
      (lhConfig["permission"] ?? {}) as Record<string, unknown>,
      warnings,
    );
  }

  const existingAgents = (result["agent"] ?? {}) as Record<string, unknown>;
  const lhAgents = (lhConfig["agent"] ?? {}) as Record<string, unknown>;
  const mergedAgents = { ...existingAgents };

  for (const [name, value] of Object.entries(lhAgents)) {
    if (name in mergedAgents && !force) {
      if (name.startsWith("lh-")) {
        warnings.push(`OpenCode agent config already exists in opencode.json: ${name}. Use --force to update LeanHarness agent entries.`);
      }
    } else if (name.startsWith("lh-")) {
      mergedAgents[name] = value;
    } else if (!(name in mergedAgents)) {
      mergedAgents[name] = value;
    }
  }
  result["agent"] = mergedAgents;

  if (!result["compaction"]) {
    result["compaction"] = lhConfig["compaction"];
  }

  if (!result["instructions"]) {
    result["instructions"] = lhConfig["instructions"];
  }

  const existingCommands = (result["command"] ?? {}) as Record<string, unknown>;
  const lhCommands = (lhConfig["command"] ?? {}) as Record<string, unknown>;
  const mergedCommands = { ...existingCommands };

  for (const [name, lhValue] of Object.entries(lhCommands)) {
    if (!name.startsWith("lh-")) continue;
    const existingCmd = mergedCommands[name];
    const needsTemplateRepair =
      existingCmd !== undefined &&
      typeof existingCmd === "object" &&
      existingCmd !== null &&
      typeof (existingCmd as Record<string, unknown>)["template"] !== "string";

    if (force || !(name in mergedCommands) || needsTemplateRepair) {
      mergedCommands[name] = lhValue;
    } else if (name in mergedCommands) {
      warnings.push(`OpenCode command config already exists in opencode.json: ${name}. Use --force to update LeanHarness command entries.`);
    }
  }

  if (Object.keys(mergedCommands).length > 0) {
    result["command"] = mergedCommands;
  }

  return result;
}

function createOpenCodeConfigObject(): Record<string, unknown> {
  return {
    "$schema": "https://opencode.ai/config.json",
    "permission": {
      "read": "allow",
      "list": "allow",
      "glob": "allow",
      "grep": "allow",
      "edit": "allow",
      "bash": {
        "git status*": "allow",
        "git diff*": "allow",
        "git log*": "allow",
        "git branch*": "allow",
        "git show*": "allow",
        "git blame*": "allow",
        "ls*": "allow",
        "find*": "allow",
        "grep*": "allow",
        "rg*": "allow",
        "npm test*": "allow",
        "npm run test*": "allow",
        "npm run lint*": "allow",
        "npm run typecheck*": "allow",
        "pnpm test*": "allow",
        "pnpm lint*": "allow",
        "pnpm typecheck*": "allow",
        "pnpm run test*": "allow",
        "pnpm run lint*": "allow",
        "yarn test*": "allow",
        "yarn lint*": "allow",
        "bun test*": "allow",
        "pytest*": "allow",
        "go test*": "allow",
        "cargo test*": "allow",
        "node --check*": "allow",
        "python -m json.tool*": "allow",
        "sed -n*": "allow",
        "wc *": "allow",
        "head *": "allow",
        "tail *": "allow",
        "rm -rf*": "deny",
        "git push*": "ask",
        "git reset*": "ask",
        "git clean*": "ask",
        "npm install*": "ask",
        "npm update*": "ask",
        "pnpm add*": "ask",
        "pnpm update*": "ask",
        "yarn add*": "ask",
        "bun add*": "ask",
        "*deploy*": "ask",
        "*migrate reset*": "ask",
        "*db reset*": "ask",
        "cat .env*": "deny",
        "printenv*": "deny",
        "env": "deny",
      },
      "webfetch": "ask",
    },
    "agent": {
      "lh-scout": {
        "description": "LeanHarness targeted brownfield discovery agent. Reads and searches the project to find relevant files, tests, commands, constraints, risks, and change-boundary candidates without editing code.",
        "mode": "subagent",
        "permission": {
          "edit": "deny",
          "bash": {
            "git status*": "allow",
            "git diff*": "allow",
            "git log*": "allow",
            "ls*": "allow",
            "find*": "allow",
            "grep*": "allow",
            "rg*": "allow",
          },
          "webfetch": "deny",
        },
      },
      "lh-builder": {
        "description": "LeanHarness bounded implementation agent. Implements assigned tasks from compiled LeanHarness context while staying inside the approved change boundary.",
        "mode": "primary",
        "permission": {
          "edit": "allow",
          "bash": {
            "npm test*": "allow",
            "npm run test*": "allow",
            "npm run lint*": "allow",
            "npm run typecheck*": "allow",
            "pnpm test*": "allow",
            "pnpm lint*": "allow",
            "pnpm typecheck*": "allow",
            "pnpm run test*": "allow",
            "pnpm run lint*": "allow",
            "yarn test*": "allow",
            "yarn lint*": "allow",
            "bun test*": "allow",
            "pytest*": "allow",
            "go test*": "allow",
            "cargo test*": "allow",
            "git status*": "allow",
            "git diff*": "allow",
            "git log*": "allow",
            "rm -rf*": "deny",
            "npm install*": "ask",
            "npm update*": "ask",
            "pnpm add*": "ask",
            "pnpm update*": "ask",
            "yarn add*": "ask",
            "bun add*": "ask",
            "git push*": "ask",
            "git reset*": "ask",
            "git clean*": "ask",
            "cat .env*": "deny",
            "printenv*": "deny",
          },
        },
      },
      "lh-builder-fix": {
        "description": "LeanHarness bounded fix agent. Addresses specific review findings from lh-reviewer without re-implementing the entire task.",
        "mode": "subagent",
        "permission": {
          "edit": "allow",
          "bash": {
            "npm test*": "allow",
            "npm run test*": "allow",
            "npm run lint*": "allow",
            "npm run typecheck*": "allow",
            "pnpm test*": "allow",
            "pnpm lint*": "allow",
            "pnpm typecheck*": "allow",
            "yarn test*": "allow",
            "yarn lint*": "allow",
            "bun test*": "allow",
            "pytest*": "allow",
            "go test*": "allow",
            "cargo test*": "allow",
            "git status*": "allow",
            "git diff*": "allow",
            "git log*": "allow",
            "rm -rf*": "deny",
            "npm install*": "ask",
            "npm update*": "ask",
            "pnpm add*": "ask",
            "pnpm update*": "ask",
            "yarn add*": "ask",
            "bun add*": "ask",
            "git push*": "ask",
            "git reset*": "ask",
            "git clean*": "ask",
            "cat .env*": "deny",
            "printenv*": "deny",
          },
          "webfetch": "ask",
        },
      },
      "lh-reviewer": {
        "description": "LeanHarness read-only review agent. Reviews implementation changes against spec, tasks, boundary, risk gates, tests, and verification evidence.",
        "mode": "subagent",
        "permission": {
          "edit": "deny",
          "bash": {
            "git status*": "allow",
            "git diff*": "allow",
            "git log*": "allow",
            "npm test*": "allow",
            "pnpm test*": "allow",
            "yarn test*": "allow",
            "bun test*": "allow",
            "pytest*": "allow",
            "go test*": "allow",
            "cargo test*": "allow",
          },
          "webfetch": "deny",
        },
      },
      "lh-verifier": {
        "description": "LeanHarness final verification agent. Checks acceptance criteria, changed files, command evidence, boundary compliance, review findings, and risk gates before a feature can be marked done.",
        "mode": "subagent",
        "permission": {
          "edit": "deny",
          "bash": {
            "git status*": "allow",
            "git diff*": "allow",
            "git log*": "allow",
            "npm test*": "allow",
            "npm run test*": "allow",
            "npm run lint*": "allow",
            "npm run typecheck*": "allow",
            "pnpm test*": "allow",
            "pnpm lint*": "allow",
            "pnpm typecheck*": "allow",
            "yarn test*": "allow",
            "yarn lint*": "allow",
            "bun test*": "allow",
            "pytest*": "allow",
            "go test*": "allow",
            "cargo test*": "allow",
            "rm -rf*": "deny",
            "git push*": "ask",
            "git reset*": "ask",
            "git clean*": "ask",
          },
          "webfetch": "deny",
        },
      },
      "lh-compressor": {
        "description": "LeanHarness CaveBus compression agent. Converts verbose feature notes into compact CaveBus summaries while preserving protected tokens exactly.",
        "mode": "subagent",
        "permission": {
          "edit": "allow",
          "bash": {
            "git status*": "allow",
            "git diff*": "allow",
            "git log*": "allow",
          },
          "webfetch": "deny",
        },
      },
    },
    "compaction": {
      "auto": true,
      "prune": true,
    },
    "instructions": [
      "CLAUDE.md",
      "README.md",
      "docs/*.md",
      ".lh/memory/*.md",
    ],
    "command": {
      "lh-spec": {
        "description": "Create or update a LeanHarness feature specification",
        "agent": "lh-builder",
        "template": ".opencode/commands/lh-spec.md",
      },
      "lh-discover": {
        "description": "Perform LeanHarness on-demand discovery for a feature",
        "agent": "lh-scout",
        "template": ".opencode/commands/lh-discover.md",
      },
      "lh-plan": {
        "description": "Create a LeanHarness implementation plan and task list",
        "agent": "lh-builder",
        "template": ".opencode/commands/lh-plan.md",
      },
      "lh-build": {
        "description": "Execute LeanHarness feature tasks with bounded context",
        "agent": "lh-builder",
        "template": ".opencode/commands/lh-build.md",
      },
      "lh-check": {
        "description": "Verify a LeanHarness feature against acceptance criteria",
        "agent": "lh-verifier",
        "template": ".opencode/commands/lh-check.md",
      },
      "lh-status": {
        "description": "Inspect LeanHarness feature state and summarize current work",
        "agent": "lh-builder",
        "template": ".opencode/commands/lh-status.md",
      },
      "lh-do": {
        "description": "Run the full LeanHarness workflow end-to-end",
        "agent": "lh-builder",
        "template": ".opencode/commands/lh-do.md",
      },
    },
  };
}

function createOpenCodeReadme(): string {
  return `# OpenCode Integration

LeanHarness OpenCode integration pack. Configures OpenCode to operate within the LeanHarness artifact-driven workflow.

## Purpose

This pack teaches OpenCode how to work with LeanHarness feature artifacts, change boundaries, verification evidence, risk gates, and CaveBus summaries.

## Relationship to \`.lh/\`

\`.lh/\` is the source of truth for all LeanHarness state. \`opencode.json\` and \`.opencode/\` configure how OpenCode agents interact with \`.lh/\` artifacts.

## Agents

| Agent | Mode | Purpose |
|-------|------|---------|
| lh-scout | subagent | On-demand discovery |
| lh-builder | primary | Bounded task implementation |
| lh-reviewer | subagent | Read-only review |
| lh-verifier | subagent | Final verification |
| lh-compressor | subagent | CaveBus compression |

## CLI Integration

\`\`\`bash
lh init --host opencode         # Install or refresh
lh init --host opencode --force # Force refresh
lh status                       # Check integration
lh doctor                       # Health check
\`\`\`

## Maintenance

Keep in sync with \`lh init --host opencode --force\`.
`;
}









function createOpenCodePolicyYaml(): string {
  return `version: 0.1
name: opencode-guardrails
purpose: enforce LeanHarness guardrails for OpenCode sessions

plugin:
  path: .opencode/plugins/leanharness-guardrails.js
  shared: .opencode/plugins/shared.js
  mode: project-local
  runtime_dependencies: none

active_feature:
  source_order:
    - LEANHARNESS_ACTIVE_FEATURE
    - .lh/state.json activeFeature
    - single feature folder fallback

bootstrap_allow:
  - .lh/**
  - .claude/**
  - .opencode/**
  - docs/**
  - README.md
  - CLAUDE.md
  - opencode.json

boundary:
  source: .lh/features/<feature>/boundary.json
  with_active_boundary:
    out_of_boundary_edit: block
    blocked_path_edit: block
  without_active_boundary:
    implementation_edit: warn
    risky_edit: block_or_warn
  allowed_fields:
    - touchFiles[].path
    - allowedEditGlobs[]
  blocked_fields:
    - blockedEditGlobs[]
    - doNotTouch[]

commands:
  deny:
    - rm -rf /
    - rm -rf ~
    - rm -rf .git
    - git reset --hard*
    - git clean -fd*
    - "*DROP DATABASE*"
    - "*drop database*"
    - cat .env*
    - printenv*
    - env
  risky:
    - npm install*
    - npm update*
    - pnpm add*
    - pnpm update*
    - yarn add*
    - bun add*
    - pip install*
    - poetry add*
    - cargo add*
    - git push*
    - git reset*
    - git clean*
    - "*migrate reset*"
    - "*db reset*"
    - "*deploy*"
    - "*curl*|*sh*"
  safe_verification:
    - npm test*
    - npm run test*
    - npm run lint*
    - npm run typecheck*
    - pnpm test*
    - pnpm lint*
    - pnpm typecheck*
    - yarn test*
    - yarn lint*
    - bun test*
    - pytest*
    - go test*
    - cargo test*

risk_gates:
  detect:
    - auth_rewrite
    - payment_logic
    - destructive_migration
    - new_dependency
    - public_api_break
    - broad_refactor
    - security_sensitive_change

secrets:
  block_paths:
    - .env
    - .env.*
    - "**/.env"
    - "**/.env.*"
    - "**/secrets/**"
  redact_patterns:
    - "sk-*"
    - "ghp_*"
    - "AKIA*"
    - "BEGIN PRIVATE KEY"
    - "DATABASE_URL=*"
    - "TOKEN=*"
    - "SECRET=*"
    - "PASSWORD=*"

logging:
  events_jsonl: .lh/features/<feature>/events.jsonl
  cavebus_log: .lh/features/<feature>/cavebus.log
  event_source: leanharness-opencode-plugin

limitations:
  - OpenCode permissions and the plugin are guardrails, not a complete security sandbox.
  - The plugin is best-effort because event payload shapes may vary by OpenCode version.
  - Final feature completion is still determined by lh check.
  - Boundary enforcement works best when .lh/features/<feature>/boundary.json exists.
  - If no active feature or boundary exists, the plugin blocks only clearly risky operations.
`;
}

async function installGlobalPack(
  hosts: InitHostSelection,
  force: boolean,
  log: ReturnType<typeof createLogger>,
  json: boolean,
): Promise<PackResult> {
  const os = await import("node:os");
  const path = await import("node:path");
  const result: PackResult = { directories: {}, files: {}, warnings: [] };
  const home = os.homedir();

  const lhGlobalDir = path.join(home, ".lh");
  await ensureDir(lhGlobalDir);
  result.directories["~/.lh"] = "created";

  const globalConfigPath = path.join(lhGlobalDir, "config.yml");
  const globalConfigContent = createGlobalConfigYaml();
  const cfgStatus = await writeTextFile(globalConfigPath, globalConfigContent, { overwrite: force });
  result.files["~/.lh/config.yml"] = cfgStatus;
  if (!json) {
    log.info(cfgStatus === "created" ? "  ~/.lh/config.yml (created)" : cfgStatus === "updated" ? "  ~/.lh/config.yml (updated)" : "  ~/.lh/config.yml (exists, skipped)");
  }

  const installClaude = hosts.claudeCode || !hasAnyInitHost(hosts);
  if (installClaude) {
    const skillsDir = path.join(home, ".claude", "skills");
    await ensureDir(skillsDir);
    result.directories["~/.claude/skills"] = "created";
    if (!json) log.info("  ~/.claude/skills/ (ensured)");

    const skillFile = path.join(skillsDir, "leanharness.md");
    const skillContent = createGlobalClaudeSkill();
    const status = await writeTextFile(skillFile, skillContent, { overwrite: force });
    result.files["~/.claude/skills/leanharness.md"] = status;
    if (!json) {
      log.info(status === "created" ? "  ~/.claude/skills/leanharness.md (created)" : status === "updated" ? "  ~/.claude/skills/leanharness.md (updated)" : "  ~/.claude/skills/leanharness.md (exists, skipped)");
    }

    // statusline.sh + global settings.json statusLine key
    const slResult = await installGlobalClaudeCodeStatusLine(home, force, log, json);
    result.files["~/.claude/statusline.sh"] = slResult.scriptStatus;
    result.files["~/.claude/settings.json statusLine"] = slResult.settingsStatus;
  }

  if (hosts.openCode) {
    const agentsDir = path.join(home, ".opencode", "agents");
    await ensureDir(agentsDir);
    result.directories["~/.opencode/agents"] = "created";
    if (!json) log.info("  ~/.opencode/agents/ (ensured)");

    const agentFile = path.join(agentsDir, "leanharness.md");
    const agentContent = createGlobalOpenCodeAgent();
    const status = await writeTextFile(agentFile, agentContent, { overwrite: force });
    result.files["~/.opencode/agents/leanharness.md"] = status;
    if (!json) {
      log.info(status === "created" ? "  ~/.opencode/agents/leanharness.md (created)" : status === "updated" ? "  ~/.opencode/agents/leanharness.md (updated)" : "  ~/.opencode/agents/leanharness.md (exists, skipped)");
    }
  }

  return result;
}

function createGlobalConfigYaml(): string {
  return `# LeanHarness global (user-level) configuration
# Local project .lh/config.yml overrides these defaults.

version: "0.1"

host:
  primary: claude-code

workflow:
  visible_steps:
    - specify
    - discover
    - plan
    - build
    - check

context:
  max_task_context_bytes: 60000

compression:
  default_mode: full
`;
}

function createGlobalClaudeSkill(): string {
  return `---
description: LeanHarness global skill — available in all projects.
---

# LeanHarness

This skill indicates LeanHarness is installed globally.

When working in a project with a \`.lh/\` directory, follow LeanHarness workflows:
Specify → Discover → Plan → Build → Check.

Run \`lh doctor\` to verify project setup. Run \`lh init\` to initialize a project.
`;
}

function createGlobalOpenCodeAgent(): string {
  return `---
description: LeanHarness global agent — available in all projects.
mode: primary
---

# LeanHarness

This agent indicates LeanHarness is installed globally.

When working in a project with a \`.lh/\` directory, follow LeanHarness workflows:
Specify → Discover → Plan → Build → Check.

Run \`lh doctor\` to verify project setup. Run \`lh init\` to initialize a project.
`;
}

