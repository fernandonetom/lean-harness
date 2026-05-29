import { spawnSync, execSync } from "node:child_process";
import { CLIError } from "../core/errors.js";
import { ensureDir } from "../core/fs.js";
import { writeTextFile, writeJsonFile, readJsonFile, fileExists } from "../core/fs.js";
import {
  createDefaultState,
  createDefaultConfigYaml,
  createDefaultMemoryFile,
} from "../core/config.js";
import { harnessPath, featuresDir, memoryDir, templatesDir, policiesDir, protocolsDir, configPath, statePath, harnessGitignorePath, opencodePath, opencodeConfigPath, opencodeAgentsDir, opencodePluginsDir, opencodeCommandsDir, opencodePluginPath, opencodeGuardrailPluginPath } from "../core/paths.js";
import { createLogger, printJson } from "../core/logger.js";
import { installClaudeCodePack } from "./init-claude-code.js";
import { createOpenCodeCommandFiles } from "./load-opencode-commands.js";
import { promptSelect, promptConfirm } from "../core/prompt.js";

export type InitHost = "claude-code" | "opencode" | "all";

export interface InitOptions {
  cwd: string;
  force?: boolean;
  json?: boolean;
  host?: string | undefined;
  yes?: boolean;
  global?: boolean;
  team?: boolean;
}

interface InitResult {
  directories: Record<string, "created" | "existed">;
  files: Record<string, "created" | "updated" | "skipped">;
  warnings: string[];
}

const VALID_HOSTS = new Set<string>(["claude-code", "opencode", "all"]);

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
  host: InitHost | undefined,
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

  const needsOpenCode = host === "opencode" || host === "all";
  if (needsOpenCode) {
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

export async function runInitCommand(options: InitOptions): Promise<void> {
  const { cwd, force = false, json = false, host, yes = false, global: isGlobal = false, team = false } = options;
  const log = createLogger({ json });
  const overwrite = force;

  if (host !== undefined && !VALID_HOSTS.has(host)) {
    throw new CLIError(`Invalid --host value for init: ${host}. Expected claude-code, opencode, all, or omit the flag.`);
  }

  let parsedHost = host as InitHost | undefined;

  if (!json && !yes && parsedHost === undefined && process.stdin.isTTY) {
    parsedHost = await promptSelect<InitHost>(
      "Which agent host do you want to set up?",
      [
        { label: "Claude Code", value: "claude-code" },
        { label: "OpenCode", value: "opencode" },
        { label: "Both (Claude Code + OpenCode)", value: "all" },
      ],
    );
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

  const installOpenCode = parsedHost === "opencode" || parsedHost === "all";
  if (installOpenCode) {
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

  const installClaudeCode = parsedHost === "claude-code" || parsedHost === "all";
  if (installClaudeCode) {
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
  const graphifyResult = await runGraphifyInstall(parsedHost, log, json);
  result.warnings.push(...graphifyResult.warnings);

  if (isGlobal) {
    if (!json) {
      log.info("");
      log.info("Global (user-level) installation:");
    }
    const globalResult = await installGlobalPack(parsedHost, overwrite, log, json);
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

  const agentFiles = createOpenCodeAgentFiles();
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

  const pluginFiles = createOpenCodePluginFiles();
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
      "*": "ask",
      "read": "allow",
      "list": "allow",
      "glob": "allow",
      "grep": "allow",
      "edit": "ask",
      "bash": {
        "*": "ask",
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
            "*": "ask",
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
          "edit": "ask",
          "bash": {
            "*": "ask",
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
            "npm install*": "ask",
            "npm update*": "ask",
            "pnpm add*": "ask",
            "pnpm update*": "ask",
            "yarn add*": "ask",
            "bun add*": "ask",
            "git push*": "ask",
            "git reset*": "ask",
            "git clean*": "ask",
            "rm -rf*": "deny",
          },
        },
      },
      "lh-reviewer": {
        "description": "LeanHarness read-only review agent. Reviews implementation changes against spec, tasks, boundary, risk gates, tests, and verification evidence.",
        "mode": "subagent",
        "permission": {
          "edit": "deny",
          "bash": {
            "*": "ask",
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
            "*": "ask",
            "git status*": "allow",
            "git diff*": "allow",
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
          "edit": "ask",
          "bash": {
            "*": "ask",
            "git status*": "allow",
            "git diff*": "allow",
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

interface AgentFileEntry {
  filename: string;
  content: string;
}

function createOpenCodeAgentFiles(): AgentFileEntry[] {
  return [
    { filename: "lh-scout.md", content: createAgentScout() },
    { filename: "lh-builder.md", content: createAgentBuilder() },
    { filename: "lh-reviewer.md", content: createAgentReviewer() },
    { filename: "lh-verifier.md", content: createAgentVerifier() },
    { filename: "lh-compressor.md", content: createAgentCompressor() },
  ];
}

function createAgentScout(): string {
  return `---
description: LeanHarness targeted brownfield discovery agent. Finds relevant files, tests, commands, constraints, risks, unknowns, and change-boundary candidates without editing code.
mode: subagent
permission:
  edit: deny
  bash:
    "*": ask
    "git status*": allow
    "git diff*": allow
    "git log*": allow
    "ls*": allow
    "find*": allow
    "grep*": allow
    "rg*": allow
  webfetch: deny
---

# lh-scout

## Mission

You are the LeanHarness OpenCode scout. Your job is targeted brownfield discovery, not full codebase mapping. Find only the files, tests, commands, constraints, unknowns, and risks needed to create or refine a safe change boundary for the active feature.

## Source of Truth

\`.lh/\` is the source of truth. Do not rely on hidden chat memory. Read feature artifacts before making decisions.

## Read First

- \`.lh/config.yml\`
- \`.lh/features/<feature-id>-<slug>/spec.md\`
- \`.lh/features/<feature-id>-<slug>/discovery.md\`
- \`.lh/features/<feature-id>-<slug>/boundary.json\`
- \`.lh/memory/project.md\`, \`.lh/memory/decisions.md\`, \`.lh/memory/patterns.md\`, \`.lh/memory/cave.md\`

## Discovery Levels

D0 repo shape, D1 candidate surfaces, D2 dependency boundary, D3 risk probes, D4 deep dive. Escalate only when current level is insufficient.

## Rules

- Do not edit files or implement the feature.
- **Use graphify for D1–D4.** Use graphify semantic search for seed discovery (D1), neighbor traversal for dependency boundary (D2), symbol lookup for risk probes (D3), and relationship queries for deep dive (D4). Do not use grep or glob for graph-aware discovery.
- **D0 only:** Use `find` / `ls` for config file existence checks (package.json, pyproject.toml, go.mod, etc.).
- Prefer exact paths and targeted reads.
- Record why each file is relevant. Mark confidence as low/medium/high.
- Distinguish touch files from read-only reference files.
- Identify tests, commands, do-not-touch areas, risk gates, and unknowns.
- Preserve protected tokens exactly.

## Output

CaveBus summary: \`DISC <FEATURE_ID> conf:<low|med|high> depth:<D0-D4>\` with touch/read/tests/cmd/risk/unknown/avoid/next fields.
`;
}

function createAgentBuilder(): string {
  return `---
description: LeanHarness bounded implementation agent. Implements assigned tasks from compiled LeanHarness context while staying inside the approved change boundary.
mode: primary
permission:
  edit: ask
  bash:
    "*": ask
    "git status*": allow
    "git diff*": allow
    "npm test*": allow
    "npm run test*": allow
    "npm run lint*": allow
    "npm run typecheck*": allow
    "pnpm test*": allow
    "pnpm lint*": allow
    "pnpm typecheck*": allow
    "yarn test*": allow
    "yarn lint*": allow
    "bun test*": allow
    "pytest*": allow
    "go test*": allow
    "cargo test*": allow
    "npm install*": ask
    "npm update*": ask
    "pnpm add*": ask
    "pnpm update*": ask
    "yarn add*": ask
    "bun add*": ask
    "git push*": ask
    "git reset*": ask
    "git clean*": ask
    "rm -rf*": deny
  webfetch: ask
---

# lh-builder

## Mission

You are the LeanHarness OpenCode builder. Implement one bounded task at a time using the compiled task context. You are not a general-purpose cleanup agent.

## Source of Truth

\`.lh/\` is the source of truth. Do not rely on hidden chat memory. Read feature artifacts before making decisions.

## Required Inputs

Feature ID, task ID, compiled context from \`task-context/<task-id>.md\`, expected files, verification commands, prior task summaries.

## Read First

- \`.lh/config.yml\`, spec.md, discovery.md, boundary.json, plan.md, tasks.md
- Relevant task summaries, \`.lh/memory/project.md\`, \`.lh/memory/patterns.md\`

## Implementation Rules

- Implement only the assigned task. Stay inside \`boundary.json\`.
- If behavior changes, prefer tests first. Preserve existing architecture.
- No broad refactors, new dependencies, public API changes, or auth/payment rewrites unless approved.
- Preserve protected tokens exactly.

## Boundary Discipline

Before editing any file, compare against \`boundary.json\`. If outside boundary: stop, report, recommend discovery update.

## Verification Evidence

Run verification commands. Record every command and result. Do not mark done without evidence. Do not claim the feature is done.

## Output

Task summary for \`task-summaries/<task-id>.md\`. CaveBus summary: \`SUM <FEATURE_ID> <TASK_ID> status:<done|needs-fix|blocked>\` with add/chg/test/pass/fail/risk/next fields.
`;
}

function createAgentReviewer(): string {
  return `---
description: LeanHarness read-only review agent. Reviews implementation changes against spec, task scope, boundary, tests, risk gates, and verification evidence.
mode: subagent
permission:
  edit: deny
  bash:
    "*": ask
    "git status*": allow
    "git diff*": allow
    "git log*": allow
    "npm test*": allow
    "pnpm test*": allow
    "yarn test*": allow
    "bun test*": allow
    "pytest*": allow
    "go test*": allow
    "cargo test*": allow
  webfetch: deny
---

# lh-reviewer

## Mission

You are the LeanHarness OpenCode reviewer. Review only. Do not edit files.

## Source of Truth

\`.lh/\` is the source of truth. Read feature artifacts before reviewing.

## Read First

- spec.md, discovery.md, boundary.json, plan.md, tasks.md, task summaries, changed files, \`.lh/memory/patterns.md\`

## Review Checklist

Acceptance criteria coverage, task scope compliance, boundary violations, missing tests, security risks, auth/payment regressions, migration risks, API breaks, edge cases, overengineering, generated file edits, secrets exposure.

## Severity Levels

critical (must fix), major (should fix), minor (consider), note (observation).

## Verdict Rules

pass (no critical/major), needs-fix (issues to fix), blocked (insufficient info).

## Rules

Be specific, cite exact files/symbols. Do not invent issues. Do not block on style preferences. Preserve protected tokens exactly.

## Output

CaveBus summary: \`REV <FEATURE_ID> <TASK_ID|FEATURE> verdict:<pass|needs-fix|blocked>\` with crit/major/minor/miss/risk/fix fields.
`;
}

function createAgentVerifier(): string {
  return `---
description: LeanHarness final verification agent. Checks acceptance criteria, changed files, command evidence, boundary compliance, review findings, and risk gates before a feature can be marked done.
mode: subagent
permission:
  edit: deny
  bash:
    "*": ask
    "git status*": allow
    "git diff*": allow
    "npm test*": allow
    "npm run test*": allow
    "npm run lint*": allow
    "npm run typecheck*": allow
    "pnpm test*": allow
    "pnpm lint*": allow
    "pnpm typecheck*": allow
    "yarn test*": allow
    "yarn lint*": allow
    "bun test*": allow
    "pytest*": allow
    "go test*": allow
    "cargo test*": allow
    "rm -rf*": deny
    "git push*": ask
    "git reset*": ask
    "git clean*": ask
  webfetch: deny
---

# lh-verifier

## Mission

You are the LeanHarness OpenCode verifier. Judge by evidence, not confidence.

## Source of Truth

\`.lh/\` is the source of truth. Read feature artifacts before verifying.

## Read First

- spec.md, discovery.md, boundary.json, plan.md, tasks.md, checks.md, result.md, task summaries, cavebus.log

## Verification Checklist

Every AC against evidence, task statuses, changed files, boundary compliance, verification commands, tests, review findings, risk gates, blockers.

## Safe Commands

Tests, lint, typecheck, build, git diff/status. No destructive commands, no deploy, no push, no dependency install.

## Verdict Rules

pass (evidence-based), needs-fix (partial/failing), blocked (missing info). Do not pass without evidence, with unchecked AC, unresolved review findings, or risk gate violations.

## Output

CaveBus summary: \`VERIFY <FEATURE_ID> verdict:<pass|needs-fix|blocked>\` with ac/cmd/chg/boundary/risk/miss/next fields.
`;
}

interface PluginFileEntry {
  filename: string;
  content: string;
}

function createOpenCodePluginFiles(): PluginFileEntry[] {
  return [
    { filename: "shared.js", content: createPluginShared() },
    { filename: "leanharness-guardrails.js", content: createPluginGuardrails() },
  ];
}

function createPluginShared(): string {
  return `import fs from "node:fs";
import path from "node:path";

export function projectRoot(context) {
  if (context && context.project && typeof context.project.cwd === "string") return context.project.cwd;
  if (context && typeof context.directory === "string") return context.directory;
  if (process.env.OPENCODE_PROJECT_DIR) return process.env.OPENCODE_PROJECT_DIR;
  if (process.env.LEANHARNESS_PROJECT_DIR) return process.env.LEANHARNESS_PROJECT_DIR;
  return process.cwd();
}

export function nowIso() { return new Date().toISOString(); }

export function safeString(value, maxLength = 2000) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return s.length > maxLength ? s.slice(0, maxLength) + "...[truncated]" : s;
}

export function readJsonFile(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return null; }
}

export function writeJsonFile(filePath, value) {
  try { ensureDir(path.dirname(filePath)); fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\\n", "utf8"); return true; } catch { return false; }
}

export function appendJsonl(filePath, event) {
  try { ensureDir(path.dirname(filePath)); fs.appendFileSync(filePath, JSON.stringify(event) + "\\n", "utf8"); return true; } catch { return false; }
}

export function appendText(filePath, content) {
  try { ensureDir(path.dirname(filePath)); fs.appendFileSync(filePath, content, "utf8"); return true; } catch { return false; }
}

export function ensureDir(dirPath) { try { fs.mkdirSync(dirPath, { recursive: true }); } catch {} }

export function toPosixPath(value) {
  if (!value || typeof value !== "string") return "";
  return value.replace(/\\\\/g, "/").replace(/\\/{2,}/g, "/");
}

export function normalizeRelativePath(root, candidate) {
  if (!candidate || typeof candidate !== "string") return "";
  candidate = toPosixPath(candidate);
  let posixRoot = toPosixPath(root);
  if (!posixRoot.endsWith("/")) posixRoot += "/";
  if (candidate.startsWith(posixRoot)) candidate = candidate.slice(posixRoot.length);
  else if (candidate.startsWith("/")) return candidate;
  if (candidate.startsWith("./")) candidate = candidate.slice(2);
  if (candidate.includes("../")) return "__PARENT_ESCAPE__/" + candidate;
  return candidate;
}

export function listFeatureDirs(root) {
  try { return fs.readdirSync(path.join(root, ".lh", "features"), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name); } catch { return []; }
}

export function loadState(root) {
  const state = readJsonFile(path.join(root, ".lh", "state.json"));
  if (!state || typeof state !== "object") return { version: "0.1", activeFeature: null, features: [] };
  return state;
}

export function findActiveFeature(root) {
  if (process.env.LEANHARNESS_ACTIVE_FEATURE) return process.env.LEANHARNESS_ACTIVE_FEATURE;
  const state = loadState(root);
  if (state.active_feature) return state.active_feature;
  if (state.activeFeature) return state.activeFeature;
  const dirs = listFeatureDirs(root);
  return dirs.length === 1 ? dirs[0] : null;
}

export function resolveFeatureDir(root, featureRef) {
  if (!featureRef) return null;
  const featuresDir = path.join(root, ".lh", "features");
  try { if (fs.statSync(path.join(featuresDir, featureRef)).isDirectory()) return path.join(featuresDir, featureRef); } catch {}
  const dirs = listFeatureDirs(root);
  for (const d of dirs) { if (d === featureRef || d.startsWith(featureRef + "-")) return path.join(featuresDir, d); }
  return null;
}

export function loadBoundary(root, featureDir) {
  if (!featureDir) return null;
  const b = readJsonFile(path.join(featureDir, "boundary.json"));
  return (b && typeof b === "object") ? b : null;
}

export function extractToolName(input) {
  if (!input) return null;
  const candidates = [input.tool, input.toolName, input.name, input.type];
  if (input.tool && typeof input.tool === "object" && input.tool.name) candidates.push(input.tool.name);
  for (const c of candidates) { if (typeof c === "string" && c) return c.toLowerCase(); }
  return null;
}

export function extractToolArgs(input, output) {
  const candidates = [output && output.args, input && input.args, input && input.toolInput, input && input.tool_input, input && input.input];
  for (const c of candidates) { if (c && typeof c === "object") return c; }
  return {};
}

export function extractCommand(input, output) {
  const args = extractToolArgs(input, output);
  const candidates = [args.command, args.cmd, args.commandLine, args.shell, input && input.command, output && output.command];
  for (const c of candidates) { if (typeof c === "string" && c) return c; }
  return null;
}

export function extractPaths(input, output, root) {
  const paths = []; const seen = new Set(); const args = extractToolArgs(input, output);
  function addPath(raw) { if (typeof raw !== "string" || !raw) return; const rel = normalizeRelativePath(root, raw); if (rel && !seen.has(rel)) { seen.add(rel); paths.push(rel); } }
  addPath(args.filePath); addPath(args.file_path); addPath(args.path); addPath(args.filename);
  if (Array.isArray(args.files)) for (const f of args.files) { if (typeof f === "string") addPath(f); else if (f && f.path) addPath(f.path); else if (f && f.file_path) addPath(f.file_path); }
  if (Array.isArray(args.edits)) for (const e of args.edits) { if (e && e.filePath) addPath(e.filePath); else if (e && e.file_path) addPath(e.file_path); }
  if (output) { addPath(output.filePath); addPath(output.file_path); addPath(output.path); if (Array.isArray(output.paths)) for (const p of output.paths) addPath(p); }
  return paths;
}

const BOOTSTRAP_PREFIXES = [".lh/", ".claude/", ".opencode/", "docs/"];
const BOOTSTRAP_EXACT = [".lh", ".claude", ".opencode", "docs", "README.md", "CLAUDE.md", "opencode.json"];

export function isHarnessBootstrapPath(relativePath) {
  if (!relativePath) return false;
  let p = toPosixPath(relativePath);
  if (p.startsWith("./")) p = p.slice(2);
  for (const exact of BOOTSTRAP_EXACT) { if (p === exact) return true; }
  for (const prefix of BOOTSTRAP_PREFIXES) { if (p.startsWith(prefix)) return true; }
  return false;
}

const SECRET_PATH_PATTERNS = [".env", ".env.*", "**/.env", "**/.env.*", "**/secrets/**"];
export function isSecretPath(relativePath) { return relativePath ? matchesAnyPattern(SECRET_PATH_PATTERNS, toPosixPath(relativePath)) : false; }

const REDACT_PATTERNS = [/sk-[a-zA-Z0-9_-]{10,}/g, /ghp_[a-zA-Z0-9]{36,}/g, /AKIA[A-Z0-9]{16,}/g, /-----BEGIN\\s+(RSA\\s+)?PRIVATE KEY-----[\\s\\S]*?-----END\\s+(RSA\\s+)?PRIVATE KEY-----/g, /DATABASE_URL=[^\\s"']+/gi, /TOKEN=[^\\s"']+/gi, /SECRET=[^\\s"']+/gi, /PASSWORD=[^\\s"']+/gi];
export function redactSecrets(value) { if (!value || typeof value !== "string") return value; let r = value; for (const p of REDACT_PATTERNS) r = r.replace(p, "[REDACTED_SECRET]"); return r; }

export function matchesPattern(pattern, value, options = {}) {
  if (!pattern || !value || typeof pattern !== "string" || typeof value !== "string") return false;
  if (pattern.includes("|")) { for (const part of pattern.split("|")) { if (matchesPattern(part.trim(), value, options)) return true; } return false; }
  if (pattern === value) return true;
  let regexStr = ""; let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "*") { if (i + 1 < pattern.length && pattern[i + 1] === "*") { regexStr += ".*"; i += 2; if (i < pattern.length && pattern[i] === "/") i++; continue; } regexStr += "[^/]*"; }
    else if (ch === "?") regexStr += "[^/]";
    else if (".+^$\\\\{}()|[]".includes(ch)) regexStr += "\\\\" + ch;
    else regexStr += ch;
    i++;
  }
  try { return new RegExp("^" + regexStr + "$", "i").test(value); } catch { return false; }
}

export function matchesAnyPattern(patterns, value, options = {}) { if (!Array.isArray(patterns)) return false; for (const p of patterns) { if (matchesPattern(p, value, options)) return true; } return false; }

const BUILTIN_DENY = [
  { pattern: "rm -rf /", reason: "Refuses to delete filesystem root." },
  { pattern: "rm -rf ~", reason: "Refuses to delete home directory." },
  { pattern: "rm -rf .git", reason: "Refuses to delete git metadata." },
  { pattern: "git push --force*", reason: "Force push requires explicit manual control." },
  { pattern: "git reset --hard*", reason: "Hard reset can destroy local work." },
  { pattern: "git clean -fd*", reason: "Git clean with force can delete untracked work." },
  { pattern: "*DROP DATABASE*", reason: "Destructive database command." },
  { pattern: "*drop database*", reason: "Destructive database command." },
  { pattern: "cat .env*", reason: "Refuses to expose secrets." },
  { pattern: "printenv*", reason: "Refuses to expose environment secrets." },
  { pattern: "env", reason: "Refuses to expose environment secrets." },
];
const BUILTIN_RISKY = [
  { pattern: "npm install*", reason: "Dependency installation requires approval.", riskGate: "new_dependency" },
  { pattern: "pnpm add*", reason: "Dependency installation requires approval.", riskGate: "new_dependency" },
  { pattern: "yarn add*", reason: "Dependency installation requires approval.", riskGate: "new_dependency" },
  { pattern: "pip install*", reason: "Dependency installation requires approval.", riskGate: "new_dependency" },
  { pattern: "cargo add*", reason: "Dependency installation requires approval.", riskGate: "new_dependency" },
  { pattern: "git push*", reason: "Pushing changes requires approval.", riskGate: null },
  { pattern: "git reset*", reason: "Resetting git state requires approval.", riskGate: null },
  { pattern: "git clean*", reason: "Cleaning git state requires approval.", riskGate: null },
  { pattern: "*deploy*", reason: "Deployment requires approval.", riskGate: null },
];
const BUILTIN_SAFE = ["git status*", "git diff*", "git log*", "ls*", "find*", "grep*", "rg*", "npm test*", "npm run test*", "npm run lint*", "pnpm test*", "yarn test*", "bun test*", "pytest*", "go test*", "cargo test*"];

export function classifyCommand(command) {
  if (!command || typeof command !== "string") return { decision: "allow", reason: "", matchedPattern: null, riskGate: null };
  const trimmed = command.trim();
  for (const e of BUILTIN_DENY) { if (matchesPattern(e.pattern, trimmed)) return { decision: "block", reason: e.reason, matchedPattern: e.pattern, riskGate: null }; }
  for (const s of BUILTIN_SAFE) { if (matchesPattern(s, trimmed)) return { decision: "allow", reason: "Safe command.", matchedPattern: s, riskGate: null }; }
  for (const e of BUILTIN_RISKY) { if (matchesPattern(e.pattern, trimmed)) return { decision: "warn", reason: e.reason, matchedPattern: e.pattern, riskGate: e.riskGate || null }; }
  return { decision: "allow", reason: "", matchedPattern: null, riskGate: null };
}

const RISK_GATE_PATHS = {
  auth_rewrite: ["**/auth/**", "**/*auth*"], payment_logic: ["**/billing/**", "**/payment/**", "**/checkout/**"],
  destructive_migration: ["**/migrations/**", "**/schema.*"], new_dependency: ["package.json", "package-lock.json", "yarn.lock"],
  public_api_break: ["**/api/**", "**/routes/**"], security_sensitive_change: ["**/security/**", "**/secrets/**", "**/*token*"],
};
export function classifyPathRisk(relativePath) {
  if (!relativePath) return { riskGate: null, reason: null };
  for (const [key, patterns] of Object.entries(RISK_GATE_PATHS)) { if (matchesAnyPattern(patterns, toPosixPath(relativePath))) return { riskGate: key, reason: key + " risk gate" }; }
  return { riskGate: null, reason: null };
}

export function isPathInsideBoundary(relativePath, boundary) {
  if (!relativePath || !boundary) return { inside: false, blocked: false, reason: "No boundary loaded." };
  const p = toPosixPath(relativePath);
  if (matchesAnyPattern(boundary.blockedEditGlobs || [], p)) return { inside: false, blocked: true, reason: "Path matches blockedEditGlobs." };
  for (const d of (boundary.doNotTouch || [])) { if (toPosixPath(d) === p || matchesPattern(d, p)) return { inside: false, blocked: true, reason: "Path in doNotTouch." }; }
  if (isHarnessBootstrapPath(p)) return { inside: true, blocked: false, reason: "Bootstrap path." };
  const touchFiles = boundary.touchFiles || [];
  if (Array.isArray(touchFiles)) { for (const t of touchFiles) { const tp = typeof t === "string" ? t : (t && t.path); if (tp && toPosixPath(tp) === p) return { inside: true, blocked: false, reason: "In touchFiles." }; } }
  if (matchesAnyPattern(boundary.allowedEditGlobs || [], p)) return { inside: true, blocked: false, reason: "Matches allowedEditGlobs." };
  return { inside: false, blocked: false, reason: "Path not in boundary." };
}

export function boundarySummary(boundary) { if (!boundary) return "none"; return "loaded"; }
export function riskGateSummary(risks) { return (!risks || risks.length === 0) ? "none" : risks.join(", "); }

export function eventLogPath(root, featureDir) { return featureDir ? path.join(featureDir, "events.jsonl") : path.join(root, ".lh", "events.jsonl"); }
export function cavebusLogPath(root, featureDir) { return featureDir ? path.join(featureDir, "cavebus.log") : path.join(root, ".lh", "cavebus.log"); }

export function logPluginEvent(root, featureDir, event) { appendJsonl(eventLogPath(root, featureDir), { timestamp: nowIso(), source: "leanharness-opencode-plugin", ...event }); }
export function appendCaveBusNote(root, featureDir, message) { appendText(cavebusLogPath(root, featureDir), "\\n" + message + "\\n"); }

export function findActiveTask(root, featureDir) {
  if (process.env.LEANHARNESS_ACTIVE_TASK) return process.env.LEANHARNESS_ACTIVE_TASK;
  if (featureDir) { try { const lines = fs.readFileSync(cavebusLogPath(root, featureDir), "utf8").split("\\n").reverse(); for (const l of lines) { const m = /(?:TASK|SUM)\\s+F\\d{3,}\\s+(T\\d{2,})/i.exec(l); if (m) return m[1]; } } catch {} }
  return null;
}

export function makeBlockError(message) { const e = new Error(message); e.name = "LeanHarnessGuardrailBlock"; return e; }
`;
}

function createPluginGuardrails(): string {
  return `import {
  projectRoot, nowIso, safeString, findActiveFeature, resolveFeatureDir, loadBoundary,
  extractToolName, extractToolArgs, extractCommand, extractPaths,
  isHarnessBootstrapPath, isSecretPath, redactSecrets, classifyCommand, classifyPathRisk,
  isPathInsideBoundary, logPluginEvent, appendCaveBusNote, findActiveTask, makeBlockError,
} from "./shared.js";

export const LeanHarnessGuardrails = async (context) => {
  const root = projectRoot(context);
  return {
    "tool.execute.before": async (input, output) => {
      try { await handleBefore(root, input, output); } catch (err) { if (err && err.name === "LeanHarnessGuardrailBlock") throw err; }
    },
    "tool.execute.after": async (input, output) => {
      try { await handleAfter(root, input, output); } catch {}
    },
    event: async ({ event }) => {
      try { await handleEvent(root, event); } catch {}
    },
  };
};
export default LeanHarnessGuardrails;

function getFeatureContext(root) {
  const featureRef = findActiveFeature(root);
  const featureDir = featureRef ? resolveFeatureDir(root, featureRef) : null;
  const boundary = featureDir ? loadBoundary(root, featureDir) : null;
  const taskId = findActiveTask(root, featureDir);
  return { featureRef, featureDir, boundary, taskId };
}

function featureLabel(ctx) { return ctx.featureRef ? (ctx.featureRef.includes("-") ? ctx.featureRef.split("-")[0] : ctx.featureRef) : "no-feature"; }
function isShellTool(n) { return n && ["bash","shell","terminal","command","exec","run"].some(x => n.includes(x)); }
function isReadTool(n) { return n && ["read","search","list","glob","grep","find","cat","view"].some(x => n.includes(x)); }
function isEditTool(n) { return n && ["edit","write","create","delete","remove","patch","replace","insert","append"].some(x => n.includes(x)); }

async function handleBefore(root, input, output) {
  const toolName = extractToolName(input);
  const command = extractCommand(input, output);
  const paths = extractPaths(input, output, root);
  const ctx = getFeatureContext(root);

  for (const p of paths) {
    if (isSecretPath(p)) {
      if (ctx.featureDir) logPluginEvent(root, ctx.featureDir, { event: "guardrail.block", reason: "secret_path", tool: toolName, target: p });
      throw makeBlockError("LeanHarness blocked this OpenCode tool call because it attempted to access a secret path: " + p + ".");
    }
  }

  if (isShellTool(toolName) && command) {
    const c = classifyCommand(command);
    if (c.decision === "block") {
      if (ctx.featureDir) logPluginEvent(root, ctx.featureDir, { event: "guardrail.block", reason: "dangerous_command", tool: toolName, target: redactSecrets(safeString(command, 200)) });
      throw makeBlockError("LeanHarness blocked this OpenCode command because it is destructive: " + redactSecrets(safeString(command, 200)) + ".");
    }
    if (c.decision === "warn" && ctx.featureDir) {
      logPluginEvent(root, ctx.featureDir, { event: "guardrail.warn", reason: "risky_command", tool: toolName, riskGate: c.riskGate });
    }
    return;
  }

  if (isReadTool(toolName)) return;

  if (isEditTool(toolName) || paths.length > 0) {
    for (const p of paths) {
      if (isHarnessBootstrapPath(p)) continue;
      if (ctx.boundary) {
        const check = isPathInsideBoundary(p, ctx.boundary);
        if (check.blocked) throw makeBlockError("LeanHarness blocked this OpenCode edit because " + p + " is in the blocked list for " + featureLabel(ctx) + ".");
        if (!check.inside) throw makeBlockError("LeanHarness blocked this OpenCode edit because " + p + " is outside the active change boundary for " + featureLabel(ctx) + ".");
      } else {
        const risk = classifyPathRisk(p);
        if (risk.riskGate && ctx.featureDir) logPluginEvent(root, ctx.featureDir, { event: "guardrail.warn", reason: "risk_gate_no_boundary", riskGate: risk.riskGate, target: p });
      }
    }
  }
}

async function handleAfter(root, input, output) {
  const ctx = getFeatureContext(root);
  if (!ctx.featureDir) return;
  const toolName = extractToolName(input);
  const command = extractCommand(input, output);
  const paths = extractPaths(input, output, root);
  logPluginEvent(root, ctx.featureDir, { event: "tool.execute.after", tool: toolName || "unknown", feature: ctx.featureRef, paths: paths.map(p => redactSecrets(p)), command: command ? redactSecrets(safeString(command, 200)) : null });
}

async function handleEvent(root, event) {
  if (!event || typeof event !== "object") return;
  const ctx = getFeatureContext(root);
  if (!ctx.featureDir) return;
  const eventType = event.type || event.event || event.name || "";
  if (eventType === "session.error") {
    const errMsg = event.error || event.message || "unknown error";
    appendCaveBusNote(root, ctx.featureDir, "ERR " + featureLabel(ctx) + " session\\nerr:\\n- " + redactSecrets(safeString(errMsg, 200)) + "\\nnext:\\n- inspect session logs");
  } else if (eventType === "session.compacted") {
    appendCaveBusNote(root, ctx.featureDir, "NOTE " + featureLabel(ctx) + " event:session.compacted");
  }
  logPluginEvent(root, ctx.featureDir, { event: eventType, feature: ctx.featureRef });
}
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
    - git push --force*
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
  host: InitHost | undefined,
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

  const installClaude = host === "claude-code" || host === "all" || host === undefined;
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
  }

  const installOC = host === "opencode" || host === "all";
  if (installOC) {
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

function createAgentCompressor(): string {
  return `---
description: LeanHarness CaveBus compression agent. Converts verbose discovery, task, review, verification, and memory notes into compact summaries while preserving protected tokens exactly.
mode: subagent
permission:
  edit: ask
  bash:
    "*": ask
    "git status*": allow
    "git diff*": allow
  webfetch: deny
---

# lh-compressor

## Mission

You are the LeanHarness OpenCode compressor. Convert verbose LeanHarness information into compact CaveBus summaries while preserving meaning and protected tokens exactly.

## Source of Truth

Read \`.lh/templates/cavebus-message.md\` and \`.lh/memory/cave.md\` for format reference and abbreviations.

## Protected Tokens

Preserve exactly: file paths, commands, error messages, symbols, class/function names, routes, URLs, env vars, test names, migration names, table names, config keys, feature IDs, task IDs, AC IDs.

## Compression Rules

Compress prose, not identifiers. Use abbreviations from cave.md. One fact per line. Do not hide blockers/failures/risk gates. Do not replace canonical artifacts.

## Message Types

REQ, DISC, PLAN, TASK, SUM, REV, VERIFY, ERR, BLOCK, MEM.

## Output

Compact CaveBus message with preserved protected tokens and suggested destination file.
`;
}
