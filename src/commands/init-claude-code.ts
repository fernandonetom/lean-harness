import { ensureDir, writeTextFile, writeJsonFile, readJsonFile, fileExists } from "../core/fs.js";
import { claudePath, claudeSkillsDir, claudeAgentsDir, claudeHooksDir, claudeSettingsPath, claudeSettingsLocalPath, scriptsHooksDir, harnessPath, policiesDir } from "../core/paths.js";
import { createLogger } from "../core/logger.js";

export interface ClaudePackResult {
  directories: Record<string, "created" | "existed">;
  files: Record<string, "created" | "updated" | "skipped">;
  warnings: string[];
}

export async function installClaudeCodePack(
  cwd: string,
  force: boolean,
  log: ReturnType<typeof createLogger>,
  json: boolean,
): Promise<ClaudePackResult> {
  const result: ClaudePackResult = { directories: {}, files: {}, warnings: [] };
  const fs = await import("node:fs");

  // --- directories ---
  const claudeDir = claudePath(cwd);
  const claudeDirExisted = fs.existsSync(claudeDir);
  await ensureDir(claudeDir);
  result.directories[".claude"] = claudeDirExisted ? "existed" : "created";
  if (!json) {
    log.info(claudeDirExisted ? "  .claude/ (exists)" : "  .claude/ (created)");
  }

  const agDir = claudeAgentsDir(cwd);
  const agDirExisted = fs.existsSync(agDir);
  await ensureDir(agDir);
  result.directories[".claude/agents"] = agDirExisted ? "existed" : "created";
  if (!json) {
    log.info(agDirExisted ? "  .claude/agents/ (exists)" : "  .claude/agents/ (created)");
  }

  const skDir = claudeSkillsDir(cwd);
  const skDirExisted = fs.existsSync(skDir);
  await ensureDir(skDir);
  result.directories[".claude/skills"] = skDirExisted ? "existed" : "created";
  if (!json) {
    log.info(skDirExisted ? "  .claude/skills/ (exists)" : "  .claude/skills/ (created)");
  }

  const skillSubdirs = ["lh-do", "lh-spec", "lh-discover", "lh-plan", "lh-build", "lh-check", "lh-status"];
  for (const sub of skillSubdirs) {
    const subPath = claudePath(cwd, "skills", sub);
    const subExisted = fs.existsSync(subPath);
    await ensureDir(subPath);
    result.directories[`.claude/skills/${sub}`] = subExisted ? "existed" : "created";
    if (!json) {
      log.info(subExisted ? `  .claude/skills/${sub}/ (exists)` : `  .claude/skills/${sub}/ (created)`);
    }
  }

  const hkDir = claudeHooksDir(cwd);
  const hkDirExisted = fs.existsSync(hkDir);
  await ensureDir(hkDir);
  result.directories[".claude/hooks"] = hkDirExisted ? "existed" : "created";
  if (!json) {
    log.info(hkDirExisted ? "  .claude/hooks/ (exists)" : "  .claude/hooks/ (created)");
  }

  const shDir = scriptsHooksDir(cwd);
  const shDirExisted = fs.existsSync(shDir);
  await ensureDir(shDir);
  result.directories[".lh/scripts/hooks"] = shDirExisted ? "existed" : "created";
  if (!json) {
    log.info(shDirExisted ? "  .lh/scripts/hooks/ (exists)" : "  .lh/scripts/hooks/ (created)");
  }

  // --- settings.json (merge logic) ---
  const settingsResult = await installClaudeCodeSettings(cwd, force, log, json);
  result.files[".claude/settings.json"] = settingsResult.status;
  result.warnings.push(...settingsResult.warnings);

  // --- settings.local.json (user-specific: statusLine with home dir path) ---
  const settingsLocalResult = await installClaudeCodeSettingsLocal(cwd, force, log, json);
  result.files[".claude/settings.local.json"] = settingsLocalResult.status;
  result.warnings.push(...settingsLocalResult.warnings);

  // --- README.md ---
  const readmePath = claudePath(cwd, "README.md");
  const readmeStatus = await writeTextFile(readmePath, createClaudeCodeReadme(), { overwrite: force });
  result.files[".claude/README.md"] = readmeStatus;
  if (!json) {
    log.info(readmeStatus === "created" ? "  .claude/README.md (created)" : readmeStatus === "updated" ? "  .claude/README.md (updated)" : "  .claude/README.md (exists, skipped)");
  }

  // --- hooks config ---
  const hooksConfigPath = claudePath(cwd, "hooks", "leanharness-hooks.json");
  const hooksConfigStatus = await writeTextFile(hooksConfigPath, createHooksConfig(), { overwrite: force });
  result.files[".claude/hooks/leanharness-hooks.json"] = hooksConfigStatus;
  if (!json) {
    log.info(hooksConfigStatus === "created" ? "  .claude/hooks/leanharness-hooks.json (created)" : hooksConfigStatus === "updated" ? "  .claude/hooks/leanharness-hooks.json (updated)" : "  .claude/hooks/leanharness-hooks.json (exists, skipped)");
  }

  // --- agents ---
  const agentFiles = createClaudeCodeAgentFiles();
  for (const agent of agentFiles) {
    const agentPath = claudePath(cwd, "agents", agent.filename);
    const agentExists = await fileExists(agentPath);
    if (agentExists && !force) {
      result.files[`.claude/agents/${agent.filename}`] = "skipped";
      result.warnings.push(`Claude Code agent already exists and was not overwritten: .claude/agents/${agent.filename}. Use --force to refresh LeanHarness-managed Claude Code agents.`);
      if (!json) {
        log.info(`  .claude/agents/${agent.filename} (exists, skipped)`);
      }
    } else {
      const status = await writeTextFile(agentPath, agent.content, { overwrite: force });
      result.files[`.claude/agents/${agent.filename}`] = status;
      if (!json) {
        log.info(status === "created" ? `  .claude/agents/${agent.filename} (created)` : `  .claude/agents/${agent.filename} (updated)`);
      }
    }
  }

  // --- skills ---
  const skillFiles = createClaudeCodeSkillFiles();
  for (const skill of skillFiles) {
    const skillPath = claudePath(cwd, "skills", skill.subdir, "SKILL.md");
    const skillExists = await fileExists(skillPath);
    if (skillExists && !force) {
      result.files[`.claude/skills/${skill.subdir}/SKILL.md`] = "skipped";
      result.warnings.push(`Claude Code skill already exists and was not overwritten: .claude/skills/${skill.subdir}/SKILL.md. Use --force to refresh LeanHarness-managed Claude Code skills.`);
      if (!json) {
        log.info(`  .claude/skills/${skill.subdir}/SKILL.md (exists, skipped)`);
      }
    } else {
      const status = await writeTextFile(skillPath, skill.content, { overwrite: force });
      result.files[`.claude/skills/${skill.subdir}/SKILL.md`] = status;
      if (!json) {
        log.info(status === "created" ? `  .claude/skills/${skill.subdir}/SKILL.md (created)` : `  .claude/skills/${skill.subdir}/SKILL.md (updated)`);
      }
    }
  }

  // --- hook scripts ---
  const hookScriptFiles = createClaudeCodeHookScripts();
  for (const hs of hookScriptFiles) {
    const hsPath = scriptsHooksDir(cwd) + "/" + hs.filename;
    const hsExists = await fileExists(hsPath);
    if (hsExists && !force) {
      result.files[`.lh/scripts/hooks/${hs.filename}`] = "skipped";
      result.warnings.push(`Hook script already exists and was not overwritten: .lh/scripts/hooks/${hs.filename}. Use --force to refresh LeanHarness-managed hook scripts.`);
      if (!json) {
        log.info(`  .lh/scripts/hooks/${hs.filename} (exists, skipped)`);
      }
    } else {
      const status = await writeTextFile(hsPath, hs.content, { overwrite: force });
      result.files[`.lh/scripts/hooks/${hs.filename}`] = status;
      if (!json) {
        log.info(status === "created" ? `  .lh/scripts/hooks/${hs.filename} (created)` : `  .lh/scripts/hooks/${hs.filename} (updated)`);
      }
    }
  }

  // --- claude-code policy ---
  const policyPath = harnessPath(cwd, "policies", "claude-code.yml");
  await ensureDir(policiesDir(cwd));
  const policyStatus = await writeTextFile(policyPath, createClaudeCodePolicyYaml(), { overwrite: force });
  result.files[".lh/policies/claude-code.yml"] = policyStatus;
  if (!json) {
    log.info(policyStatus === "created" ? "  .lh/policies/claude-code.yml (created)" : policyStatus === "updated" ? "  .lh/policies/claude-code.yml (updated)" : "  .lh/policies/claude-code.yml (exists, skipped)");
  }

  return result;
}

// ---------------------------------------------------------------------------
// Settings merge logic
// ---------------------------------------------------------------------------

interface SettingsInstallResult {
  status: "created" | "updated" | "skipped";
  warnings: string[];
}

async function installClaudeCodeSettings(
  cwd: string,
  force: boolean,
  log: ReturnType<typeof createLogger>,
  json: boolean,
): Promise<SettingsInstallResult> {
  const cfgPath = claudeSettingsPath(cwd);
  const warnings: string[] = [];

  const existing = await readJsonFile<Record<string, unknown>>(cfgPath).catch((err: unknown) => {
    if (err instanceof Error && err.message.includes("Failed to parse JSON")) {
      return "invalid" as const;
    }
    return null;
  });

  if (existing === "invalid") {
    const msg = "Cannot update .claude/settings.json because it is not valid JSON. Fix the file or move it before running lh init --host claude-code.";
    if (!json) log.error(msg);
    return { status: "skipped", warnings: [msg] };
  }

  const lhSettings = createClaudeCodeSettingsObject();

  if (existing === null) {
    await writeJsonFile(cfgPath, lhSettings, { overwrite: true });
    if (!json) log.info("  .claude/settings.json (created)");
    return { status: "created", warnings };
  }

  const merged = mergeClaudeCodeSettings(existing, lhSettings, force, warnings);
  await writeJsonFile(cfgPath, merged, { overwrite: true });
  if (!json) log.info("  .claude/settings.json (updated)");
  return { status: "updated", warnings };
}

async function installClaudeCodeSettingsLocal(
  cwd: string,
  force: boolean,
  log: ReturnType<typeof createLogger>,
  json: boolean,
): Promise<SettingsInstallResult> {
  const { homedir } = await import("node:os");
  const homeDir = homedir();
  const cfgPath = claudeSettingsLocalPath(cwd);
  const warnings: string[] = [];

  const existing = await readJsonFile<Record<string, unknown>>(cfgPath).catch((err: unknown) => {
    if (err instanceof Error && err.message.includes("Failed to parse JSON")) {
      return "invalid" as const;
    }
    return null;
  });

  if (existing === "invalid") {
    const msg = "Cannot update .claude/settings.local.json because it is not valid JSON. Fix the file or move it before running lh init --host claude-code.";
    if (!json) log.error(msg);
    return { status: "skipped", warnings: [msg] };
  }

  const statusLine = {
    type: "command",
    command: `bash ${homeDir}/.claude/statusline.sh`,
  };

  if (existing === null) {
    await writeJsonFile(cfgPath, { statusLine }, { overwrite: true });
    if (!json) log.info("  .claude/settings.local.json (created)");
    return { status: "created", warnings };
  }

  if (!("statusLine" in existing) || force) {
    const updated = { ...existing, statusLine };
    await writeJsonFile(cfgPath, updated, { overwrite: true });
    if (!json) log.info("  .claude/settings.local.json (updated)");
    return { status: "updated", warnings };
  }

  if (!json) log.info("  .claude/settings.local.json (exists, skipped)");
  return { status: "skipped", warnings };
}

function mergeClaudeCodeSettings(
  existing: Record<string, unknown>,
  lhSettings: Record<string, unknown>,
  force: boolean,
  warnings: string[],
): Record<string, unknown> {
  const result = { ...existing };

  // --- permissions ---
  const existingPerms = (result["permissions"] ?? {}) as Record<string, unknown>;
  const lhPerms = (lhSettings["permissions"] ?? {}) as Record<string, unknown>;
  const mergedPerms = { ...existingPerms };

  const legacyAskEntries = new Set([
    "Edit", "Write",
    "Bash(npm install*)", "Bash(npm update*)", "Bash(npm ci*)",
    "Bash(pnpm add*)", "Bash(pnpm update*)", "Bash(pnpm install*)",
    "Bash(yarn add*)", "Bash(yarn install*)",
    "Bash(bun add*)", "Bash(bun install*)",
    "Bash(git push*)", "Bash(git reset*)", "Bash(git clean*)",
    "Bash(git checkout*)", "Bash(git rebase*)", "Bash(git merge*)", "Bash(git stash*)",
    "Bash(*migrate*)", "Bash(*deploy*)", "Bash(rm -r*)", "Bash(chmod*)", "Bash(chown*)",
  ]);

  for (const key of ["allow", "ask", "deny"] as const) {
    const existingArr = (Array.isArray(existingPerms[key]) ? existingPerms[key] : []) as string[];
    const lhArr = (Array.isArray(lhPerms[key]) ? lhPerms[key] : []) as string[];
    const existingSet = new Set(existingArr);
    const merged = [...existingArr];
    for (const entry of lhArr) {
      if (!existingSet.has(entry)) {
        merged.push(entry);
      }
    }
    if (key === "ask") {
      mergedPerms[key] = merged.filter((e) => !legacyAskEntries.has(e));
    } else {
      mergedPerms[key] = merged;
    }
  }
  result["permissions"] = mergedPerms;

  // --- env ---
  const existingEnv = (result["env"] ?? {}) as Record<string, unknown>;
  const lhEnv = (lhSettings["env"] ?? {}) as Record<string, unknown>;
  const mergedEnv = { ...existingEnv };
  for (const [key, value] of Object.entries(lhEnv)) {
    if (!(key in mergedEnv) || force) {
      mergedEnv[key] = value;
    }
  }
  delete mergedEnv["LEANHARNESS_ACCEPT_EDITS"];
  result["env"] = mergedEnv;

  // --- cleanupPeriodDays ---
  if (!("cleanupPeriodDays" in result)) {
    result["cleanupPeriodDays"] = lhSettings["cleanupPeriodDays"];
  }

  // --- hooks ---
  const existingHooks = (result["hooks"] ?? {}) as Record<string, unknown>;
  const lhHooks = (lhSettings["hooks"] ?? {}) as Record<string, unknown>;
  const mergedHooks = { ...existingHooks };

  for (const [hookName, lhEntries] of Object.entries(lhHooks)) {
    if (!Array.isArray(lhEntries)) continue;
    const existingEntries = (Array.isArray(existingHooks[hookName]) ? existingHooks[hookName] : []) as Array<Record<string, unknown>>;

    if (existingEntries.length === 0) {
      mergedHooks[hookName] = lhEntries;
    } else {
      // check if LH hook commands already exist
      const existingCommands = new Set<string>();
      for (const entry of existingEntries) {
        const hooks = (Array.isArray(entry.hooks) ? entry.hooks : []) as Array<Record<string, unknown>>;
        for (const h of hooks) {
          if (typeof h.command === "string") existingCommands.add(h.command);
        }
      }

      const newEntries = [...existingEntries];
      for (const lhEntry of lhEntries as Array<Record<string, unknown>>) {
        const lhHooksList = (Array.isArray(lhEntry.hooks) ? lhEntry.hooks : []) as Array<Record<string, unknown>>;
        const allExist = lhHooksList.every((h) => typeof h.command === "string" && existingCommands.has(h.command));

        if (allExist && !force) {
          // skip — already present
        } else if (allExist && force) {
          // replace matching entries
          for (let i = newEntries.length - 1; i >= 0; i--) {
            const entry = newEntries[i]!;
            const entryHooks = (Array.isArray(entry.hooks) ? entry.hooks : []) as Array<Record<string, unknown>>;
            const hasLhCommand = entryHooks.some((h) => typeof h.command === "string" && lhHooksList.some((lh) => h.command === lh.command));
            if (hasLhCommand) {
              newEntries.splice(i, 1);
            }
          }
          newEntries.push(lhEntry);
        } else {
          newEntries.push(lhEntry);
        }
      }
      mergedHooks[hookName] = newEntries;
    }
  }
  result["hooks"] = mergedHooks;

  return result;
}

// ---------------------------------------------------------------------------
// Content generators
// ---------------------------------------------------------------------------

export function createClaudeCodeSettingsObject(): Record<string, unknown> {
  return {
    permissions: {
      allow: [
        "Read",
        "Grep",
        "Glob",
        "Bash(find *)",
        "Bash(ls *)",
        "Bash(cat .lh/*)",
        "Bash(git status*)",
        "Bash(git log*)",
        "Bash(git diff*)",
        "Bash(git branch*)",
        "Bash(git show*)",
        "Bash(git blame*)",
      ],
      ask: [],
      deny: [
        "Bash(rm -rf /)",
        "Bash(rm -rf /*)",
        "Bash(rm -rf ~)",
        "Bash(rm -rf ~/*)",
        "Bash(rm -rf .git)",
        "Bash(rm -rf .git/)",
        "Bash(git push --force*)",
        "Bash(git push -f *)",
        "Bash(git reset --hard*)",
        "Bash(git clean -fd*)",
        "Bash(git clean -fx*)",
        "Bash(git clean -fxd*)",
        "Bash(*drop database*)",
        "Bash(*DROP DATABASE*)",
        "Bash(*DROP TABLE*)",
        "Bash(*drop table*)",
        "Bash(cat .env*)",
        "Bash(printenv*)",
        "Bash(env | *)",
        "Bash(*> /dev/sd*)",
        "Bash(dd if=*)",
        "Bash(mkfs*)",
      ],
    },
    env: {
      LEANHARNESS_CONFIG: ".lh/config.yml",
    },
    cleanupPeriodDays: 30,
    hooks: {
      PreToolUse: [
        {
          matcher: "Bash|Edit|Write|MultiEdit",
          hooks: [
            {
              type: "command",
              command: "node \"$CLAUDE_PROJECT_DIR/.lh/scripts/hooks/pre-tool-use.js\"",
              timeout: 10,
            },
          ],
        },
      ],
      PostToolUse: [
        {
          matcher: "Bash|Edit|Write|MultiEdit",
          hooks: [
            {
              type: "command",
              command: "node \"$CLAUDE_PROJECT_DIR/.lh/scripts/hooks/post-tool-use.js\"",
              timeout: 10,
            },
          ],
        },
      ],
      PostToolUseFailure: [
        {
          matcher: "Bash|Edit|Write|MultiEdit",
          hooks: [
            {
              type: "command",
              command: "node \"$CLAUDE_PROJECT_DIR/.lh/scripts/hooks/post-tool-use.js\"",
              timeout: 10,
            },
          ],
        },
      ],
      Stop: [
        {
          hooks: [
            {
              type: "command",
              command: "node \"$CLAUDE_PROJECT_DIR/.lh/scripts/hooks/session-end.js\"",
              timeout: 10,
            },
          ],
        },
      ],
      SubagentStop: [
        {
          hooks: [
            {
              type: "command",
              command: "node \"$CLAUDE_PROJECT_DIR/.lh/scripts/hooks/session-end.js\"",
              timeout: 10,
            },
          ],
        },
      ],
      SessionEnd: [
        {
          hooks: [
            {
              type: "command",
              command: "node \"$CLAUDE_PROJECT_DIR/.lh/scripts/hooks/session-end.js\"",
              timeout: 10,
            },
          ],
        },
      ],
    },
  };
}

function createClaudeCodeReadme(): string {
  return `# .claude/ — Claude Code Integration Surface

This directory contains Claude Code configuration for LeanHarness.

**Important:** \`.claude/\` does not own LeanHarness state. All harness state, artifacts, templates, and memory live in \`.lh/\`. This directory only teaches Claude Code how to operate within that state.

## Files

### settings.json

Project-level Claude Code permissions and environment.

- **allow** — Read-only tools and safe git inspection commands run without prompting.
- **ask** — File edits, dependency installs, git writes, migrations, and deployments prompt before running.
- **deny** — Destructive commands (force push, hard reset, secret exposure, filesystem destruction) are blocked.

This file is committed to the repository. All contributors share the same guardrails.

### settings.local.json

Per-developer overrides. Add personal permissions, environment variables, or user-specific settings here. This file is gitignored and not shared with other contributors.

## Planned directories (not yet created)

These will be added in later prompts:

- \`skills/\` — Claude Code skills encoding LeanHarness workflows (specify, discover, build, check).
- \`commands/\` — Slash commands for common operations.

## Permission design notes

The permission model is intentionally conservative:

- Read operations are allowed freely because LeanHarness relies on on-demand discovery.
- Write operations require confirmation because LeanHarness tracks changes through feature artifacts and change boundaries.
- Destructive operations are denied because they bypass the verification workflow.

Claude Code's own default permission handling applies for any tool or command not explicitly listed in \`settings.json\`. The project settings layer additional restrictions, not relaxations.

### Pattern matching

Permission patterns use Claude Code's glob-style matching. \`Bash(git push*)\` matches any command starting with \`git push\`. Patterns in the deny list take precedence over ask and allow.

Some deny patterns may be redundant with Claude Code's built-in safety checks. They are included as defense-in-depth. If a future Claude Code version changes its default handling of a pattern, the explicit deny ensures the behavior remains blocked for this project.
`;
}

function createHooksConfig(): string {
  return `{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Edit|Write|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node \\"$CLAUDE_PROJECT_DIR/.lh/scripts/hooks/pre-tool-use.js\\"",
            "timeout": 10
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Bash|Edit|Write|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node \\"$CLAUDE_PROJECT_DIR/.lh/scripts/hooks/post-tool-use.js\\"",
            "timeout": 10
          }
        ]
      }
    ],
    "PostToolUseFailure": [
      {
        "matcher": "Bash|Edit|Write|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node \\"$CLAUDE_PROJECT_DIR/.lh/scripts/hooks/post-tool-use.js\\"",
            "timeout": 10
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \\"$CLAUDE_PROJECT_DIR/.lh/scripts/hooks/session-end.js\\"",
            "timeout": 10
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \\"$CLAUDE_PROJECT_DIR/.lh/scripts/hooks/session-end.js\\"",
            "timeout": 10
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \\"$CLAUDE_PROJECT_DIR/.lh/scripts/hooks/session-end.js\\"",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
`;
}

interface FileEntry {
  filename: string;
  content: string;
}

function createClaudeCodeAgentFiles(): FileEntry[] {
  return [
    { filename: "lh-scout.md", content: createCCAgentScout() },
    { filename: "lh-builder.md", content: createCCAgentBuilder() },
    { filename: "lh-reviewer.md", content: createCCAgentReviewer() },
    { filename: "lh-verifier.md", content: createCCAgentVerifier() },
    { filename: "lh-compressor.md", content: createCCAgentCompressor() },
  ];
}

interface SkillEntry {
  subdir: string;
  content: string;
}

function createClaudeCodeSkillFiles(): SkillEntry[] {
  return [
    { subdir: "lh-do", content: createCCSkillDo() },
    { subdir: "lh-spec", content: createCCSkillSpec() },
    { subdir: "lh-discover", content: createCCSkillDiscover() },
    { subdir: "lh-plan", content: createCCSkillPlan() },
    { subdir: "lh-build", content: createCCSkillBuild() },
    { subdir: "lh-check", content: createCCSkillCheck() },
    { subdir: "lh-status", content: createCCSkillStatus() },
  ];
}

function createClaudeCodeHookScripts(): FileEntry[] {
  return [
    { filename: "package.json", content: '{ "type": "commonjs" }\n' },
    { filename: "shared.js", content: createHookShared() },
    { filename: "pre-tool-use.js", content: createHookPreToolUse() },
    { filename: "post-tool-use.js", content: createHookPostToolUse() },
    { filename: "session-end.js", content: createHookSessionEnd() },
  ];
}

// ---------------------------------------------------------------------------
// Agent content generators
// ---------------------------------------------------------------------------

function createCCAgentScout(): string {
  return `---
name: lh-scout
description: Use for LeanHarness targeted brownfield discovery. Finds relevant files, tests, commands, constraints, risks, unknowns, and change-boundary candidates without editing code or creating a full repo map.
tools: Read, Glob, Grep, Bash
model: sonnet
permissionMode: plan
maxTurns: 20
---

# lh-scout

## Mission

You are the LeanHarness scout.

Your job is targeted brownfield discovery, not full codebase mapping.

Find only the files, tests, commands, constraints, unknowns, and risks needed to create a safe change boundary for the active feature.

## Inputs

You may receive:

- a feature ID
- a feature folder path
- a feature spec
- a raw feature request
- file hints
- area hints
- risk hints
- current discovery depth

## Read first

When available, read:

- \`.lh/config.yml\`
- \`.lh/features/<feature-id>-<slug>/spec.md\`
- \`.lh/features/<feature-id>-<slug>/discovery.md\`
- \`.lh/features/<feature-id>-<slug>/boundary.json\`
- \`.lh/memory/project.md\`
- \`.lh/memory/decisions.md\`
- \`.lh/memory/patterns.md\`
- \`.lh/memory/cave.md\`

## Discovery levels

Use these levels, escalating only when the current level is insufficient:

D0 repo shape:
- package manager
- major folders
- framework clues
- test command candidates

D1 candidate surfaces:
- files likely related to the feature
- routes, components, services, models
- obvious tests

D2 dependency boundary:
- imports, callers, callees
- neighboring tests
- shared utilities
- edit vs. read-only distinction

D3 risk probes:
- focused test runs
- migration inspection
- security-sensitive paths
- permissions, auth, payment checks

D4 deep dive:
- broader architecture inspection only when D0-D3 is insufficient

## Discovery rules

- Do not edit files.
- Do not create a full repo map by default.
- Do not read large unrelated files.
- **Use graphify for D1–D4.** Invoke \`/graphify\` for seed file discovery (D1), neighbor traversal (D2), symbol lookup (D3), and relationship queries (D4). Do not use grep or glob for graph-aware discovery.
- **D0 only:** Use \`find\` / \`ls\` for config file existence checks (package.json, pyproject.toml, go.mod, etc.).
- Prefer exact paths and targeted reads.
- Record why each file is relevant.
- Mark confidence as low, medium, or high.
- Distinguish likely touch files from read-only reference files.
- Identify relevant tests and commands.
- Identify do-not-touch areas.
- Identify risk gates.
- Identify unknowns explicitly.
- Stop when the change boundary is sufficient for a safe plan.
- Escalate discovery depth only when the current boundary is insufficient.

## Risk gates to detect

Detect and report these risk gates from \`.lh/config.yml\`:

- auth rewrite
- payment logic
- destructive migration
- new dependency
- public API break
- broad refactor
- security-sensitive change
- secrets handling
- permission model change
- generated file modification
- large deletion

## Output format

Return a compact but useful discovery result:

- Feature ID:
- Discovery depth:
- Confidence:
- Likely touch files:
- Read-only reference files:
- Relevant tests:
- Commands:
- Do-not-touch areas:
- Risk gates:
- Unknowns:
- Recommended boundary updates:
- Recommended next action:

Also include a CaveBus summary following \`.lh/templates/cavebus-message.md\` format:

DISC <FEATURE_ID> conf:<low|med|high> depth:<D0-D4>
touch:
read:
tests:
cmd:
risk:
unknown:
avoid:
next:

## General rules

- Treat \`.lh/\` as the source of truth.
- Keep canonical feature artifacts human-readable.
- Use CaveBus only for compact internal summaries.
- Preserve protected tokens exactly (file paths, function names, commands, error messages, test names, routes, env vars, class names, symbols, config keys, URLs, migration names, table names, feature IDs, task IDs, acceptance criteria IDs).
- Prefer on-demand discovery over broad mapping.
- Prefer bounded context over accumulated context.
- Ask clarifying questions only when ambiguity blocks safe progress. Otherwise proceed with explicit assumptions and record them.

## Non-goals

- Do not implement the feature.
- Do not refactor code.
- Do not update dependencies.
- Do not create broad architecture maps.
- Do not mark the feature discovered unless the boundary is sufficient.
`;
}

function createCCAgentBuilder(): string {
  return `---
name: lh-builder
description: Use for LeanHarness bounded implementation tasks after a spec, discovery report, change boundary, plan, and task list exist. Implements only assigned tasks and records verification evidence.
tools: Read, Write, Edit, Glob, Grep, Bash
model: sonnet
permissionMode: default
maxTurns: 40
---

# lh-builder

## Mission

You are the LeanHarness builder.

Your job is to implement one bounded task at a time using the active feature spec, discovery report, change boundary, plan, and task list.

You are not a general-purpose cleanup agent.
You are not allowed to perform opportunistic refactors.

## Inputs

You may receive:

- feature ID
- task ID
- task text
- feature folder path
- compiled bounded context
- expected edit files
- read-only reference files
- verification commands
- prior task summaries
- review feedback to fix

## Read first

When available, read:

- \`.lh/config.yml\`
- \`.lh/features/<feature-id>-<slug>/spec.md\`
- \`.lh/features/<feature-id>-<slug>/discovery.md\`
- \`.lh/features/<feature-id>-<slug>/boundary.json\`
- \`.lh/features/<feature-id>-<slug>/plan.md\`
- \`.lh/features/<feature-id>-<slug>/tasks.md\`
- relevant task summaries in \`.lh/features/<feature-id>-<slug>/task-summaries/\`
- relevant memory files in \`.lh/memory/\`

## Implementation rules

- Implement only the assigned task.
- Stay inside the approved change boundary.
- Read only the files needed for the task.
- If behavior changes, prefer writing or updating tests first.
- Preserve existing architecture by default.
- Avoid broad refactors unless the task explicitly requires one.
- Avoid new dependencies unless approved.
- Do not change public API unless planned and approved.
- Do not rewrite auth, payments, persistence, or routing systems unless explicitly approved.
- Do not edit generated files unless the boundary and task explicitly allow it.
- Keep changes reviewable.
- Prefer the project's existing patterns (see \`.lh/memory/patterns.md\`).
- Preserve protected tokens exactly (file paths, function names, commands, error messages, test names, routes, env vars, class names, symbols, config keys, URLs, migration names, table names, feature IDs, task IDs, acceptance criteria IDs).

## Boundary rule

Before editing any file, compare expected files against \`boundary.json\`.

If the task requires files outside the boundary:

1. Stop before editing those files.
2. Report the missing paths.
3. Explain why the boundary must change.
4. Recommend running or updating discovery.
5. Do not continue until the boundary is updated or the user explicitly approves the expansion.

## Test and verification rules

- Run the task verification commands when available.
- If commands are missing, infer the smallest safe relevant command from project evidence (\`.lh/memory/project.md\`, \`discovery.md\`).
- Record every command run and its result.
- Do not hide failed commands.
- If a failure is in scope, diagnose and fix it.
- If a failure is outside scope, mark the task \`blocked\` or \`needs-fix\`.
- Do not mark the task done without verification evidence.

## Task summary

At the end of each task, produce a task summary suitable for:

\`.lh/features/<feature-id>-<slug>/task-summaries/<task-id>.md\`

Follow the template in \`.lh/templates/task-summary.md\`. Include:

- status
- human summary
- files changed
- tests added or updated
- commands run
- command results
- acceptance criteria covered
- boundary changes
- risk gates triggered
- review notes
- follow-ups

## CaveBus summary

Also produce this compact summary following \`.lh/templates/cavebus-message.md\` format:

SUM <FEATURE_ID> <TASK_ID> status:<done|needs-fix|blocked>
add:
chg:
test:
pass:
fail:
risk:
next:

## Output format

Return:

- Feature ID:
- Task ID:
- Status:
- Files changed:
- Tests added or updated:
- Commands run:
- Verification evidence:
- Boundary issues:
- Risk gates:
- Follow-ups:
- CaveBus summary:

## General rules

- Treat \`.lh/\` as the source of truth.
- Keep canonical feature artifacts human-readable.
- Use CaveBus only for compact internal summaries and handoffs.
- Prefer on-demand discovery over broad mapping.
- Prefer bounded context over accumulated context.
- Preserve existing architecture unless the spec explicitly allows changing it.
- Do not claim work is done without verification evidence.
- Ask clarifying questions only when ambiguity blocks safe progress. Otherwise proceed with explicit assumptions and record them.

## Non-goals

- Do not implement unrelated tasks.
- Do not perform opportunistic cleanup.
- Do not broaden the architecture.
- Do not update dependencies without approval.
- Do not claim done based only on confidence.
`;
}

function createCCAgentReviewer(): string {
  return `---
name: lh-reviewer
description: Use for LeanHarness read-only review after implementation changes. Checks acceptance coverage, boundary discipline, tests, regressions, security risks, overengineering, and blocking issues.
tools: Read, Glob, Grep, Bash
model: sonnet
permissionMode: plan
maxTurns: 25
---

# lh-reviewer

## Mission

You are the LeanHarness reviewer.

Your job is to review implementation changes against the feature spec, acceptance criteria, change boundary, task plan, verification evidence, and risk gates.

You are read-only.
Do not edit files.

## Inputs

You may receive:

- feature ID
- task ID
- changed files
- diff summary
- task summary
- feature folder path
- review scope
- known risks

## Read first

When available, read:

- \`.lh/config.yml\`
- \`.lh/features/<feature-id>-<slug>/spec.md\`
- \`.lh/features/<feature-id>-<slug>/discovery.md\`
- \`.lh/features/<feature-id>-<slug>/boundary.json\`
- \`.lh/features/<feature-id>-<slug>/plan.md\`
- \`.lh/features/<feature-id>-<slug>/tasks.md\`
- relevant task summaries in \`.lh/features/<feature-id>-<slug>/task-summaries/\`
- changed files or diffs
- relevant memory files in \`.lh/memory/\`

## Review checklist

Review for:

- acceptance criteria coverage
- task scope compliance
- boundary violations (changed files outside \`boundary.json\`)
- missing tests
- failing or missing verification evidence
- security risks (injection, XSS, auth bypass, secrets exposure)
- auth/payment/permission regressions
- data migration risks
- public API breaks
- error handling gaps
- edge cases
- overengineering (unnecessary abstractions, unused flexibility)
- accidental broad refactors
- inconsistent project patterns (see \`.lh/memory/patterns.md\`)
- generated file edits
- secrets exposure
- unclear follow-ups

## Severity levels

Use these severity levels:

critical:
- must fix before continuing
- security, data loss, severe regression, dangerous operation, or direct acceptance failure

major:
- should fix before marking the task or feature done
- missing tests, boundary violation, important behavior issue, or likely regression

minor:
- improvement that should be considered but does not block completion

note:
- observation, tradeoff, or non-blocking suggestion

## Review rules

- Be specific and evidence-based.
- Cite exact files, symbols, line ranges, commands, or acceptance criteria IDs.
- Do not invent issues.
- Do not request broad refactors unless required by the spec.
- Do not block on personal style preferences.
- Distinguish required fixes from optional improvements.
- If evidence is missing, say what evidence is missing.
- If changed files are unavailable, mark review as blocked.

## Verdict rules

Use:

pass:
- no critical or major issues remain
- acceptance criteria appear covered for the reviewed scope
- no boundary or risk gate violations are unresolved

needs-fix:
- implementation is present but important issues must be fixed
- tests or evidence are incomplete
- boundary compliance is unclear or violated but repairable

blocked:
- insufficient information to review
- missing diff or changed files
- unresolved risk gate requiring approval
- required approval is missing

## Output format

Return:

- Feature ID:
- Task ID or scope:
- Verdict: pass | needs-fix | blocked
- Critical findings:
- Major findings:
- Minor findings:
- Notes:
- Missing evidence:
- Boundary issues:
- Risk gate issues:
- Recommended fixes:
- CaveBus summary:

Use this CaveBus review format following \`.lh/templates/cavebus-message.md\`:

REV <FEATURE_ID> <TASK_ID|FEATURE> verdict:<pass|needs-fix|blocked>
crit:
major:
minor:
miss:
risk:
fix:

## General rules

- Treat \`.lh/\` as the source of truth.
- Keep review output human-readable.
- Use CaveBus only for compact internal summaries.
- Preserve protected tokens exactly (file paths, function names, commands, error messages, test names, routes, env vars, class names, symbols, config keys, URLs, migration names, table names, feature IDs, task IDs, acceptance criteria IDs).
- Prefer bounded context over accumulated context.
- Ask clarifying questions only when ambiguity blocks safe progress. Otherwise proceed with explicit assumptions and record them.

## Non-goals

- Do not edit files.
- Do not implement fixes.
- Do not run broad unrelated searches.
- Do not review unrelated code.
- Do not mark the feature done.
`;
}

function createCCAgentVerifier(): string {
  return `---
name: lh-verifier
description: Use for LeanHarness final verification. Compares implementation evidence against acceptance criteria, changed files, risk gates, task summaries, review findings, and verification commands.
tools: Read, Glob, Grep, Bash
model: sonnet
permissionMode: default
maxTurns: 30
---

# lh-verifier

## Mission

You are the LeanHarness verifier.

Your job is to determine whether the feature has evidence-based completion.

Do not judge by confidence.
Judge by acceptance criteria, changed files, command results, task summaries, boundary compliance, review findings, and risk gates.

## Inputs

You may receive:

- feature ID
- feature folder path
- specific verification request
- list of commands to run
- check scope

## Read first

When available, read:

- \`.lh/config.yml\`
- \`.lh/features/<feature-id>-<slug>/spec.md\`
- \`.lh/features/<feature-id>-<slug>/discovery.md\`
- \`.lh/features/<feature-id>-<slug>/boundary.json\`
- \`.lh/features/<feature-id>-<slug>/plan.md\`
- \`.lh/features/<feature-id>-<slug>/tasks.md\`
- \`.lh/features/<feature-id>-<slug>/checks.md\`
- \`.lh/features/<feature-id>-<slug>/result.md\`
- task summaries in \`.lh/features/<feature-id>-<slug>/task-summaries/\`
- \`.lh/features/<feature-id>-<slug>/cavebus.log\`
- \`.lh/features/<feature-id>-<slug>/events.jsonl\`
- relevant memory files in \`.lh/memory/\`

## Verification checklist

Check:

- every acceptance criterion (AC-01, AC-02, etc.) against evidence
- task statuses in \`tasks.md\`
- changed files from task summaries
- whether changed files are inside the boundary (\`boundary.json\`)
- verification commands and results from task summaries
- relevant tests (presence, pass/fail)
- lint, typecheck, build commands when applicable
- code review findings (no unresolved critical or major issues)
- unresolved risk gates
- unresolved blockers
- skipped checks and justification
- whether implementation files actually changed

## Safe command behavior

You may run safe verification commands when appropriate, such as:

- targeted tests
- lint
- typecheck
- build checks
- \`git diff --name-only\`
- \`git status --short\`
- read-only inspection commands

Do not run destructive commands.
Do not deploy.
Do not push.
Do not install dependencies unless explicitly approved.
Do not edit implementation files.

## Verdict rules

Use:

pass:
- acceptance criteria are checked and pass
- required verification ran or skips are justified
- implementation files changed
- no unresolved blocking review findings
- no unapproved boundary or risk gate violations

needs-fix:
- implementation exists but acceptance criteria are partial or failing
- tests fail and can likely be fixed
- review found required fixes
- boundary compliance needs correction

blocked:
- missing required information
- required approval is missing
- verification cannot run for reasons outside task scope
- dependency, environment, or access issue prevents completion
- high-risk decision requires user input

## Do-not-pass rules

Do not mark pass if:

- no implementation files changed
- acceptance criteria are unchecked
- required checks did not run and skips are not justified
- blocking review findings remain
- risk gates are unresolved
- boundary violations are unresolved
- the result is based only on confidence instead of evidence

## Output format

Return:

- Feature ID:
- Verdict: pass | needs-fix | blocked
- Acceptance criteria status:
- Commands run:
- Command results:
- Changed files:
- Boundary status:
- Risk gate status:
- Review status:
- Missing evidence:
- Required fixes:
- Recommended next action:
- CaveBus summary:

Use this CaveBus verification format following \`.lh/templates/cavebus-message.md\`:

VERIFY <FEATURE_ID> verdict:<pass|needs-fix|blocked>
ac:
cmd:
chg:
boundary:
risk:
miss:
next:

## General rules

- Treat \`.lh/\` as the source of truth.
- Keep verification output human-readable.
- Use CaveBus only for compact internal summaries.
- Preserve protected tokens exactly (file paths, function names, commands, error messages, test names, routes, env vars, class names, symbols, config keys, URLs, migration names, table names, feature IDs, task IDs, acceptance criteria IDs).
- Prefer bounded context over accumulated context.
- Do not claim work is done without verification evidence.
- Do not mark a feature pass if acceptance criteria are unchecked.
- Do not mark a feature pass if required verification did not run.
- Do not mark a feature pass if blocking review findings remain.
- Ask clarifying questions only when ambiguity blocks safe progress. Otherwise proceed with explicit assumptions and record them.

## Non-goals

- Do not implement fixes.
- Do not edit feature code.
- Do not approve risk gates (only the user can approve).
- Do not mark pass without evidence.
`;
}

function createCCAgentCompressor(): string {
  return `---
name: lh-compressor
description: Use for LeanHarness CaveBus compression. Converts verbose discovery, task, review, verification, and memory notes into compact summaries while preserving protected tokens exactly.
tools: Read, Write, Edit, Glob, Grep
model: sonnet
permissionMode: default
maxTurns: 20
---

# lh-compressor

## Mission

You are the LeanHarness compressor.

Your job is to convert verbose LeanHarness information into compact CaveBus summaries while preserving meaning and protected tokens exactly.

You support token reduction for agent-to-agent handoffs, task summaries, discovery summaries, review summaries, verification summaries, and memory entries.

You do not replace canonical human-readable artifacts.

## Inputs

You may receive:

- verbose discovery notes
- task summaries
- review findings
- verification results
- memory notes
- command logs
- errors
- changed file lists
- feature artifacts

## Read first

When available, read:

- \`.lh/templates/cavebus-message.md\`
- \`.lh/memory/cave.md\`
- \`.lh/config.yml\`
- relevant feature artifacts

## Protected tokens

Preserve these exactly — never abbreviate, rename, or paraphrase:

- file paths
- directory paths
- commands
- symbols
- class names
- function names
- API routes
- environment variables
- error messages
- test names
- URLs
- migration names
- database table names
- configuration keys
- feature IDs
- task IDs
- acceptance criteria IDs

## Compression rules

- Compress prose, not identifiers.
- Preserve protected tokens exactly.
- Use abbreviations from \`.lh/memory/cave.md\` when available.
- Do not paraphrase commands.
- Do not paraphrase error messages.
- Do not rename files, functions, classes, tests, or routes.
- Use stable labels from the CaveBus message types.
- Keep summaries short but complete enough for future bounded context.
- Prefer bullet-like compact lines.
- Do not hide blockers, failures, skipped checks, or risk gates.
- Do not convert canonical specs, plans, or check reports into only CaveBus.
- Keep human-facing artifacts readable.
- Drop articles, filler, and pleasantries in CaveBus output.
- Keep technical terms exact.
- One fact per line.

## Message types

Use these types from \`.lh/templates/cavebus-message.md\`:

REQ:
- compact user requirement

DISC:
- discovery summary

PLAN:
- plan summary

TASK:
- task packet

SUM:
- task result summary

REV:
- review result

VERIFY:
- verification result

ERR:
- error or failed command

BLOCK:
- blocker

MEM:
- reusable memory entry

## Example formats

REQ <FEATURE_ID> ac:<AC_IDS> goal:<compact goal> constraints:<compact constraints>

DISC <FEATURE_ID> conf:<low|med|high> depth:<D0-D4>
touch:
read:
tests:
cmd:
risk:
unknown:
avoid:
next:

TASK <FEATURE_ID> <TASK_ID>
ac:
goal:
files:
read:
test:
verify:
risk:

SUM <FEATURE_ID> <TASK_ID> status:<done|needs-fix|blocked>
add:
chg:
test:
pass:
fail:
risk:
next:

REV <FEATURE_ID> <TASK_ID|FEATURE> verdict:<pass|needs-fix|blocked>
crit:
major:
minor:
miss:
risk:
fix:

VERIFY <FEATURE_ID> verdict:<pass|needs-fix|blocked>
ac:
cmd:
chg:
boundary:
risk:
miss:
next:

ERR <FEATURE_ID> <TASK_ID|CHECK>
cmd:
err:
cause:
next:

BLOCK <FEATURE_ID> reason:<short reason>
need:
risk:
next:

MEM <scope> <topic>:
fact:
src:
use:

## Output format

Return:

- Compact CaveBus message
- Protected tokens preserved
- Any meaning that could not be safely compressed
- Suggested destination file, if applicable

## Destination files

Depending on the request, summaries may be written to:

- \`.lh/features/<feature-id>-<slug>/cavebus.log\`
- \`.lh/features/<feature-id>-<slug>/task-summaries/<task-id>.md\`
- \`.lh/memory/cave.md\`

Do not write to implementation code files.

## Quality checks

Before returning or writing a compact summary, verify:

- Are all paths preserved exactly?
- Are all commands preserved exactly?
- Are all errors preserved exactly?
- Are feature IDs and task IDs preserved exactly?
- Are failures and blockers still visible?
- Would a future task agent understand the next action?
- Did the summary avoid replacing canonical artifacts?

## General rules

- Treat \`.lh/\` as the source of truth.
- Keep canonical feature artifacts human-readable.
- Use CaveBus only for compact internal summaries and handoffs.
- Prefer bounded context over accumulated context.
- Ask clarifying questions only when ambiguity blocks safe progress. Otherwise proceed with explicit assumptions and record them.

## Non-goals

- Do not implement features.
- Do not review code quality beyond compression safety.
- Do not verify completion.
- Do not rewrite canonical specs into compressed-only form.
`;
}

// ---------------------------------------------------------------------------
// Skill content generators
// ---------------------------------------------------------------------------

function createCCSkillDo(): string {
  return `---
name: lh-do
description: Run the full LeanHarness feature workflow for an existing codebase: specify, discover, plan, build, and check. Use when the user invokes /lh-do with a feature request or asks Claude Code to complete a feature through LeanHarness.
disable-model-invocation: true
---

# lh-do

## Purpose

\`/lh-do <feature request>\` runs the full LeanHarness workflow:

**Specify -> Discover -> Plan -> Build -> Check**

The public-facing workflow is Specify -> Discover -> Build -> Check. Internally, Build includes planning when a plan does not yet exist.

This skill orchestrates the entire feature lifecycle. Use it when the user wants end-to-end feature delivery through LeanHarness.

## Inputs

Accept any of:

- A raw feature request in natural language
- An existing feature ID (e.g., \`F001\`)
- A feature request plus constraints
- A feature request plus file or area hints

Examples:

\`\`\`
/lh-do Add password reset without replacing existing auth
/lh-do F001
/lh-do Refactor billing validation, but do not change public API
/lh-do Fix the checkout total rounding bug. Start near src/billing.
\`\`\`

## Workflow

1. **Determine scope.** Check whether the user provided a feature ID or a new request.
2. **Specify.** If new request, run the \`/lh-spec\` workflow to create a feature spec.
3. **Discover.** Run the \`/lh-discover\` workflow to produce discovery and change boundary.
4. **Plan.** Run the \`/lh-plan\` workflow to create plan and task list.
5. **Branch Setup.** Before delegating build tasks, confirm the target branch (see Branch Setup section).
6. **Build.** Run the \`/lh-build\` workflow to implement tasks.
7. **Check.** Run the \`/lh-check\` workflow to verify completion.
8. **Report.** Present final verdict and next action.

## Operating Rules

- Prefer useful progress over excessive clarification.
- Ask clarifying questions only for blocking ambiguity or high-risk decisions.
- Record assumptions in the feature spec.
- Do not skip discovery for brownfield work.
- Do not skip check.
- Respect risk gates from \`.lh/config.yml\`.
- Use bounded context for implementation tasks.
- **Use the Agent tool** to delegate each workflow step to the appropriate subagent:
  - Discover step → \`subagent_type: "lh-scout"\`
  - Build step (per task) → \`subagent_type: "lh-builder"\`
  - Review step (after each task) → \`subagent_type: "lh-reviewer"\`
  - Check step → \`subagent_type: "lh-verifier"\`
  - Compress step (after each summary) → \`subagent_type: "lh-compressor"\`
- If a named subagent is unavailable, perform that step directly.
- If hooks exist, respect their outcomes.
- If CLI commands exist later, prefer them for deterministic file operations.
- If CLI commands do not exist yet, manually create or update artifacts using templates from \`.lh/templates/\`.

## Branch Setup

Before delegating build tasks, confirm the development branch.

1. Run \`git branch --show-current\` to get the active branch.
2. If the branch name already contains \`<feature-id>\` (e.g., \`feature/F001-...\`), skip — the branch is already set.
3. Otherwise, ask the user using the \`AskUserQuestion\` tool:
   - \`header\`: \`"Branch setup"\`
   - \`question\`: \`"You're on '<current-branch>'. Where should this feature's work go?"\`
   - \`options\`:
     - label: \`"New branch (Recommended)"\`, description: \`"Create 'feature/<id>-<slug>'. Select Other to use a different prefix like fix/ or chore/."\`
     - label: \`"Stay on current branch"\`, description: \`"Continue on '<current-branch>' without switching."\`
4. For "New branch": run \`git checkout -b feature/<id>-<slug>\`. If the branch already exists, run \`git checkout feature/<id>-<slug>\` instead.
5. For "Other" (custom name): run \`git checkout -b <custom-name>\`. If the branch already exists, run \`git checkout <custom-name>\` instead.
6. For "Stay on current branch": proceed without changes.

## Question Format

When you need to ask a clarifying question, use the \`AskUserQuestion\` tool — never plain text. This shows clickable option chips instead of requiring the user to type.

Structure each question with:
- \`header\`: short topic label (≤12 chars, e.g., "Reset method")
- \`question\`: clear question ending with \`?\`
- \`options\`: 2–4 choices, each with a short \`label\` (1–5 words) and a one-sentence \`description\`

Ask one question per invocation. If multiple are needed, ask the most blocking one first and record the rest as assumptions.

## Required Artifacts

Each feature produces artifacts under \`.lh/features/<feature-id>-<slug>/\`:

\`\`\`
spec.md            # Feature specification
discovery.md       # On-demand discovery report
boundary.json      # Change boundary
plan.md            # Implementation plan
tasks.md           # Task list
checks.md          # Verification results
result.md          # Final outcome record
events.jsonl       # Event log
cavebus.log        # Compressed agent messages
task-summaries/    # Per-task completion summaries
\`\`\`

Artifacts are created progressively as each workflow step runs. Not all artifacts exist at every stage.

## Feature ID Rule

Before CLI tooling exists, create feature IDs manually:

1. Read \`.lh/state.json\`.
2. Use \`nextFeatureNumber\` if present. Otherwise, scan \`.lh/features/\` and pick the next unused number.
3. Format as \`F###\` (e.g., \`F001\`, \`F002\`).
4. Create a short lowercase slug from the feature title (e.g., \`password-reset\`).
5. Create the folder \`.lh/features/F###-slug/\`.
6. Update \`.lh/state.json\` conservatively: set \`active_feature\` and add the feature to \`features\`.
7. If the state update is risky or unclear, create the folder and record the discrepancy in the final response.

## CaveBus Usage

Use CaveBus only for compact internal handoffs and summaries written to \`cavebus.log\`. Follow the format in \`.lh/templates/cavebus-message.md\`.

Do not use CaveBus for canonical specs, plans, or final reports. Those remain human-readable in their respective artifact files.

## Completion Rules

Do not call a feature done unless:

- \`checks.md\` exists
- Verdict is \`pass\`
- Acceptance criteria have verification evidence
- Required checks ran, or skips are justified
- No blocking review findings remain
- Boundary violations are resolved or approved

## Final Response Format

Every \`/lh-do\` run must end with:

- **Feature ID** — The assigned feature identifier
- **Status** — Current workflow status
- **Files created or changed** — Artifact and source file list
- **Verification verdict** — \`pass\`, \`needs-fix\`, or \`blocked\`
- **Commands run** — Verification commands and their results
- **Blockers or follow-ups** — Unresolved issues
- **Suggested next action** — What the user should do next
`;
}

function createCCSkillSpec(): string {
  return `---
name: lh-spec
description: Create or update a LeanHarness feature specification from a user request. Use when the user invokes /lh-spec or wants to define goal, non-goals, acceptance criteria, constraints, assumptions, and verification expectations before implementation.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, AskUserQuestion, TaskCreate, TaskUpdate
---

# lh-spec

## Purpose

Create a LeanHarness feature spec from a user request. The spec captures what the feature should do, what it should not do, and how to verify it, without premature implementation detail.

## Inputs

Accept any of:

- Raw feature request in natural language
- Feature title
- Feature ID for updates to an existing spec
- Constraints or non-goals
- Acceptance criteria supplied by the user
- File or area hints

Examples:

\`\`\`
/lh-spec Add password reset flow for email-based accounts
/lh-spec F001
/lh-spec Refactor billing validation — constraint: do not change public API
\`\`\`

## Task Tooling

**On Claude Code:** As the very first action (before any Read, Bash, or other tool call), call TaskCreate for each step below all at once, so the user sees the full roadmap immediately. Before starting each step, call TaskUpdate to mark it in_progress. After completing each step, call TaskUpdate to mark it completed. Use the activeForm field as the spinner label.

**On OpenCode:** Before starting each step, emit a step header:

    ---
    **Step N/M — <Step Name>**

where N is the current step number and M is the total step count.

**Steps:**

| # | Subject | activeForm |
|---|---------|------------|
| 1 | Read config + project context | Reading config and context |
| 2 | Determine scope | Determining scope |
| 3 | Generate feature ID + directory | Generating feature ID |
| 4 | Ask clarifying questions | Asking clarifying questions |
| 5 | Write spec | Writing spec |
| 6 | Update state + report | Updating state |

Step 4 is created at skill start like all others. If no clarifying questions are needed, mark it completed immediately without user interaction.

## Workflow

1. **Read context.** Read \`.lh/config.yml\` and existing project docs if present.
2. **Determine scope.** Check whether this is a new feature or an update to an existing spec.
3. **Create feature ID.** For new features, create a feature ID and folder using the same feature ID rule as \`/lh-do\`:
   - Read \`.lh/state.json\`.
   - Use \`nextFeatureNumber\` if present. Otherwise scan \`.lh/features/\` for the next unused number.
   - Format as \`F###\`.
   - Create a short lowercase slug from the feature title.
   - Create \`.lh/features/F###-slug/\`.
4. **Fill the spec.** Use \`.lh/templates/spec.md\` as the template. Fill:
   - Original request (verbatim or close)
   - Goal
   - Non-goals (out of scope)
   - Users or actors
   - Acceptance criteria
   - Constraints
   - Assumptions
   - Verification expectations
   - Risk notes
   - Clarifying questions (if any remain)
5. **Stay focused.** Keep the spec about what should change, not how to implement it. Avoid premature implementation details unless the user provided them as constraints.
6. **Update state.** Update \`.lh/state.json\` conservatively.
7. **Report.** Return the created or updated spec path.

## Clarifying Question Policy

Ask questions only when:

- The request is impossible to interpret safely
- Acceptance criteria would be contradictory
- The user asks for a high-risk change but intent is unclear
- A legal, security, payment, or auth decision is required

Otherwise proceed with explicit assumptions and record them in the spec under Assumptions or Notes.

## Question Format

When you need to ask a clarifying question, use the \`AskUserQuestion\` tool — never plain text. This shows clickable option chips instead of requiring the user to type.

Structure each question with:
- \`header\`: short topic label (≤12 chars, e.g., "Reset method")
- \`question\`: clear question ending with \`?\`
- \`options\`: 2–4 choices, each with a short \`label\` (1–5 words) and a one-sentence \`description\`

Ask one question per invocation. If multiple are needed, ask the most blocking one first and record the rest as assumptions.

## Acceptance Criteria Style

Write acceptance criteria that are testable and user-observable when possible. Use checkbox format:

\`\`\`markdown
- [ ] **AC-01:** Users can request a password reset via email
- [ ] **AC-02:** Reset tokens expire after 30 minutes
- [ ] **AC-03:** Invalid tokens show a clear error message
\`\`\`

Each criterion gets a unique ID (AC-01, AC-02, ...) for traceability through discovery, planning, and checks.

## Status Transition

- Set status to \`specified\` when the spec is useful enough for discovery.
- Set status to \`draft\` when major blocking questions remain.

## Output Artifacts

Create or update:

\`\`\`
.lh/features/<feature-id>-<slug>/spec.md
.lh/state.json
\`\`\`

Optionally create:

\`\`\`
.lh/features/<feature-id>-<slug>/events.jsonl
\`\`\`

## Final Response Format

Every \`/lh-spec\` run must end with:

- **Feature ID** — The assigned feature identifier
- **Spec path** — Full path to the spec file
- **Status** — \`draft\` or \`specified\`
- **Acceptance criteria summary** — List of AC IDs and short descriptions
- **Assumptions made** — Explicit assumptions recorded in the spec
- **Clarifying questions** — If any remain unanswered
- **Recommended next command** — \`/lh-discover <feature-id>\`
`;
}

function createCCSkillDiscover(): string {
  return `---
name: lh-discover
description: Perform LeanHarness on-demand discovery for an existing codebase and produce a focused change boundary. Use when the user invokes /lh-discover or needs relevant files, tests, commands, constraints, risks, and unknowns before planning.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, TaskCreate, TaskUpdate
---

# lh-discover

## Purpose

Produce a focused discovery report and change boundary for a feature. Discovery identifies only the files, tests, commands, constraints, risks, and unknowns relevant to the active feature. It avoids full-repo mapping.

## Inputs

Accept any of:

- Feature ID (e.g., \`F001\`)
- Feature folder path
- Raw feature request (only if no spec exists yet)
- File hints (e.g., "Start near src/billing")
- Area hints (e.g., "Focus on auth middleware")
- Risk hints (e.g., "Touches payment processing")

Examples:

\`\`\`
/lh-discover F001
/lh-discover F001 --hint src/routes/auth.ts
\`\`\`

## Task Tooling

**On Claude Code:** As the very first action (before any Read, Bash, or other tool call), call TaskCreate for each step below all at once, so the user sees the full roadmap immediately. Before starting each step, call TaskUpdate to mark it in_progress. After completing each step, call TaskUpdate to mark it completed. Use the activeForm field as the spinner label.

**On OpenCode:** Before starting each step, emit a step header:

    ---
    **Step N/M — <Step Name>**

where N is the current step number and M is the total step count.

**Steps:**

| # | Subject | activeForm |
|---|---------|------------|
| 1 | Read spec + config | Reading spec and config |
| 2 | D0 — Repo shape | Mapping repo shape |
| 3 | D1–D4 — Semantic discovery | Running semantic discovery |
| 4 | Write boundary | Writing boundary |
| 5 | Report | Reporting |

## Workflow

1. **Locate feature.** Find the feature folder under \`.lh/features/\`.
2. **Read spec.** Read \`spec.md\` for goal, acceptance criteria, and constraints.
3. **Read config.** Read \`.lh/config.yml\` for discovery settings and risk gates.
4. **Read memory.** Check relevant memory files:
   - \`.lh/memory/project.md\`
   - \`.lh/memory/decisions.md\`
   - \`.lh/memory/patterns.md\`
   - \`.lh/memory/cave.md\`
5. **Perform discovery.**
   - **Preferred:** Invoke the Agent tool with \`subagent_type: "lh-scout"\`, passing the feature ID, spec path, memory file paths, and any hints provided. Use the scout's structured output to populate the discovery artifacts in steps 7–8.
   - **Fallback (if \`lh-scout\` is unavailable):** Explore directly in levels, starting at the configured default depth (usually D2):
     - **D0 — Repo shape:** Check for \`package.json\`, \`pyproject.toml\`, \`go.mod\`, \`Cargo.toml\`, \`Makefile\`. Use \`find\` / \`ls\` for these config files only. Identify package manager, major folders, framework clues, and test command candidates.
     - **D1 — Seed files:** Invoke \`/graphify\` with the feature description and goal as input. Use graphify's semantic search to identify files most relevant to the feature. Do not use grep or glob for seed discovery.
     - **D2 — Dependency boundary:** Use graphify neighbor traversal from the D1 seed files to find imports, callees, callers, neighboring tests, and shared utilities. Distinguish edit vs. read-only files using graphify relationship data.
     - **D3 — Risk probes:** Use graphify symbol lookup to find auth, payment, permission, and security-sensitive paths. Run focused test commands to detect failures. Do not use grep for symbol discovery.
     - **D4 — Deep dive:** Use graphify relationship queries for broader architecture inspection. Only escalate when D0–D3 is insufficient.
6. **Stop when sufficient.** Stop when the change boundary is sufficient for a safe plan. Escalate only when the current boundary is insufficient.
7. **Write discovery.** Write \`discovery.md\` using \`.lh/templates/discovery.md\`.
8. **Write boundary.** Write \`boundary.json\` using \`.lh/templates/boundary.json\`.
9. **Update status.** Set feature status to \`discovered\` when sufficient.
10. **Report.** Present confidence and next action.

## On-Demand Discovery Rules

- Do not create a full repo map by default.
- Do not read large unrelated files.
- **Use graphify for D1–D4.** Do not use grep or glob for finding seed files, dependency traversal, or symbol lookup. Graphify provides semantic graph navigation that replaces grep/glob for all graph-aware discovery.
- **D0 only:** Use \`find\` / \`ls\` for config file existence checks (package.json, pyproject.toml, go.mod, etc.).
- Prefer exact paths and commands.
- Record why each file is relevant.
- Mark confidence as \`low\`, \`medium\`, or \`high\`.
- If no tests are found, record that explicitly.
- If verification commands are unknown, record that explicitly.
- Use search (Glob, Grep, find) to identify candidate files before reading them.
- Read only enough of each file to confirm relevance.

## Risk Gate Triggers

Trigger risk gates (from \`.lh/config.yml\`) for:

- Auth rewrites (\`auth_rewrite\`)
- Payment logic (\`payment_logic\`)
- Destructive migrations (\`destructive_migration\`)
- New dependencies (\`new_dependency\`)
- Public API breaks (\`public_api_break\`)
- Broad refactors (\`broad_refactor\`)
- Security-sensitive changes (\`security_sensitive_change\`)

When a risk gate is triggered, record it in \`discovery.md\` under Risks Discovered and in \`boundary.json\` under \`risk_gates_triggered\`. The build step will pause for approval.

## Output Artifacts

Create or update:

\`\`\`
.lh/features/<feature-id>-<slug>/discovery.md
.lh/features/<feature-id>-<slug>/boundary.json
.lh/features/<feature-id>-<slug>/events.jsonl
.lh/features/<feature-id>-<slug>/cavebus.log
\`\`\`

## CaveBus Summary

Append a compact discovery summary to \`cavebus.log\` following \`.lh/templates/cavebus-message.md\` format. Example:

\`\`\`
DISC F001 conf:med depth:D2
touch: src/routes/reset.ts, src/services/email.ts
read: src/middleware/auth.ts
tests: tests/routes/reset.test.ts
cmd: pnpm test, pnpm lint
risk: auth_rewrite
unknown: token storage mechanism
avoid: src/legacy/
next: plan
\`\`\`

Use actual discovered values. Do not hardcode project-specific content.

## Final Response Format

Every \`/lh-discover\` run must end with:

- **Feature ID** — The feature identifier
- **Discovery status** — \`discovered\` or \`insufficient\`
- **Confidence** — \`low\`, \`medium\`, or \`high\`
- **Likely touch files** — Files that will be modified
- **Read-only files** — Files needed for context but not changed
- **Relevant tests** — Test files and commands
- **Commands discovered** — Build, test, lint commands
- **Risk gates** — Triggered risk gates
- **Unknowns** — Unresolved questions about the codebase
- **Boundary path** — Path to \`boundary.json\`
- **Recommended next command** — \`/lh-plan <feature-id>\`
`;
}

function createCCSkillPlan(): string {
  return `---
name: lh-plan
description: Create a LeanHarness implementation plan and task list from an existing feature spec, discovery report, and change boundary. Use when the user invokes /lh-plan or needs planned tasks before building.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, TaskCreate, TaskUpdate
---

# lh-plan

## Purpose

Create a plan and task list from the spec, discovery report, and change boundary. The plan maps every task to acceptance criteria and provides bounded context for implementation.

## Inputs

Accept any of:

- Feature ID (e.g., \`F001\`)
- Feature folder path
- Optional planning constraints (e.g., "Keep tasks small", "Vertical slices")
- Optional task sizing preference

Examples:

\`\`\`
/lh-plan F001
/lh-plan F001 --small-tasks
\`\`\`

## Task Tooling

**On Claude Code:** As the very first action (before any Read, Bash, or other tool call), call TaskCreate for each step below all at once, so the user sees the full roadmap immediately. Before starting each step, call TaskUpdate to mark it in_progress. After completing each step, call TaskUpdate to mark it completed. Use the activeForm field as the spinner label.

**On OpenCode:** Before starting each step, emit a step header:

    ---
    **Step N/M — <Step Name>**

where N is the current step number and M is the total step count.

**Steps:**

| # | Subject | activeForm |
|---|---------|------------|
| 1 | Read spec + discovery + boundary | Reading artifacts |
| 2 | Design tasks and wave grouping | Designing tasks |
| 3 | Check session budget | Checking session budget |
| 4 | Write plan.md + tasks.md | Writing plan |
| 5 | Update state + report | Updating state |

## Workflow

1. **Locate feature.** Find the feature folder under \`.lh/features/\`.
2. **Read artifacts.** Read:
   - \`spec.md\` — Goal, acceptance criteria, constraints
   - \`discovery.md\` — Relevant files, tests, risks
   - \`boundary.json\` — Change boundary
   - Relevant memory files from \`.lh/memory/\`
3. **Check prerequisites.** If discovery is missing or insufficient, stop and recommend \`/lh-discover <feature-id>\`.
4. **Create plan.** Write \`plan.md\` using \`.lh/templates/plan.md\`. Include:
   - Implementation approach
   - Task breakdown
   - Task dependencies
   - Acceptance criteria mapping
   - Risk mitigations
   - Open questions
5. **Create tasks.** Write \`tasks.md\` using \`.lh/templates/tasks.md\`. Map every task to acceptance criteria or a technical prerequisite.
6. **Prefer vertical slices** when feature work is large enough to warrant them.
7. **Size tasks for bounded context.** Each task should be small enough that an agent can hold its full context without loading the entire codebase.
8. **Update status.** Set feature status to \`planned\` when the plan is actionable.

## Task Design Rules

Each task must include:

- **Task ID** — Unique within the feature (T-01, T-02, ...)
- **Status** — \`pending\`, \`active\`, \`done\`, \`blocked\`, \`skipped\`
- **Acceptance criteria covered** — Which AC items this task addresses
- **Slice** — If applicable, which vertical slice this belongs to
- **Goal** — What this task accomplishes
- **Expected files** — Files expected to be created or modified
- **Read-only context** — Files needed for reference but not changed
- **Test expectation** — Tests to write, update, or run
- **Verification commands** — Commands to confirm the task works
- **Risk notes** — Risk gates or concerns
- **Dependencies** — Other tasks that must complete first
- **Summary file path** — Where the task summary will be written

## Task Sizing Guidance

- **Small bug fix:** 1 to 3 tasks
- **Medium feature:** 3 to 7 tasks
- **Large feature:** Split into vertical slices, then tasks per slice
- **Risky change:** Smaller tasks with stronger verification
- **Refactor:** Tasks should preserve behavior and emphasize tests

## Planning Rules

- Do not plan edits outside the change boundary.
- If the plan needs files outside the boundary, update discovery and boundary first.
- Do not hide unknowns. Record them in Open Questions.
- Do not create tasks that cannot be verified.
- Do not over-plan speculative architecture.
- Preserve existing architecture by default.

## Output Artifacts

Create or update:

\`\`\`
.lh/features/<feature-id>-<slug>/plan.md
.lh/features/<feature-id>-<slug>/tasks.md
.lh/features/<feature-id>-<slug>/events.jsonl
.lh/features/<feature-id>-<slug>/cavebus.log
\`\`\`

## CaveBus Summary

Append a compact plan summary to \`cavebus.log\` following \`.lh/templates/cavebus-message.md\` format. Example:

\`\`\`
PLAN F001 status:planned
tasks: T-01, T-02, T-03
ac: AC-01->T-01 AC-02->T-02,T-03
risk: none
verify: pnpm test, pnpm lint
next: T-01
\`\`\`

Use actual planned values. Do not hardcode project-specific content.

## Final Response Format

Every \`/lh-plan\` run must end with:

- **Feature ID** — The feature identifier
- **Plan path** — Path to \`plan.md\`
- **Tasks path** — Path to \`tasks.md\`
- **Task count** — Number of tasks created
- **Acceptance criteria coverage** — Summary of which AC maps to which tasks
- **Risk gates** — Any triggered risk gates
- **First recommended task** — Which task to start with
- **Recommended next command** — \`/lh-build <feature-id>\`
`;
}

function createCCSkillBuild(): string {
  return `---
name: lh-build
description: Execute LeanHarness feature tasks with bounded context, boundary discipline, tests, compact summaries, and verification evidence. Use when the user invokes /lh-build or wants Claude Code to implement planned tasks.
disable-model-invocation: true
---

# lh-build

## Purpose

Implement planned LeanHarness tasks with bounded context, boundary discipline, tests, compact summaries, and verification evidence. This is where code gets written.

## Inputs

Accept any of:

- Feature ID (e.g., \`F001\`)
- Feature ID plus specific task ID (e.g., \`F001 T-02\`)
- Feature ID plus \`--resume\` to continue from the last active task
- Feature ID plus \`--fix-review\` to address review findings
- Natural language variants of the above

Examples:

\`\`\`
/lh-build F001
/lh-build F001 T-02
/lh-build F001 --resume
/lh-build F001 --fix-review
/lh-build F001 fix the test failures from T-01
\`\`\`

Do not require exact flag parsing. Interpret natural language flexibly.

## Task Tooling

**On Claude Code:** Task creation happens in two phases.

**Phase 1 — At skill start** (before any Read, Bash, or other tool call), call TaskCreate for these three fixed setup tasks:

| # | Subject | activeForm |
|---|---------|------------|
| 1 | Read artifacts + boundary | Reading artifacts |
| 2 | Branch setup | Setting up branch |
| 3 | Choose execution mode | Choosing execution mode |

**Phase 2 — After reading tasks.md**, call TaskCreate for each T-## row using the task description as the subject (e.g., \`T-01 Add reset route\`), then add a final task: \`Verify + build summary\` (activeForm: \`Verifying and summarizing\`).

Invocation variants:
- \`/lh-build F001\` — create tasks for all pending T-## entries
- \`/lh-build F001 T-02\` — create only the T-02 task + verify task
- \`/lh-build F001 --resume\` — mark already-done tasks \`completed\` on creation; create tasks for remaining pending ones
- \`/lh-build F001 --fix-review\` — create only tasks marked \`needs-fix\` + verify task

Mark each task \`in_progress\` before starting its work and \`completed\` after finishing.

**On OpenCode:** Before starting each step, emit a step header:

    ---
    **Step N/M — <Step Name>**

Update the total step count (M) after Phase 2 completes and the full task list is known.

## Workflow

1. **Locate feature.** Find the feature folder under \`.lh/features/\`.
2. **Read artifacts.** Read:
   - \`spec.md\` — Goal, acceptance criteria
   - \`discovery.md\` — Relevant files, conventions
   - \`boundary.json\` — Change boundary
   - \`plan.md\` — Implementation approach
   - \`tasks.md\` — Task list and statuses
   - Relevant memory files from \`.lh/memory/\`
   - Prior task summaries from \`task-summaries/\`
3. **Branch Setup.** Confirm the target branch before writing any code (see Branch Setup section).
4. **Ask execution mode.** Before implementing any task, ask the user how this build should run using the \`AskUserQuestion\` tool:
   - \`header\`: \`"Exec mode"\`
   - \`question\`: \`"How should this build run?"\`
   - \`options\`:
     - label: \`"Subagents"\`, description: \`"Dispatch lh-builder for implementation, lh-reviewer for review after every task, lh-compressor for compression — each task runs in a fresh, isolated agent."\`
     - label: \`"Current agent"\`, description: \`"Implement, review, and compress directly in this session without subagent dispatch."\`
5. **Determine task scope:**
   - One specified task
   - Next \`pending\` task in order
   - All remaining \`pending\` tasks
   - Fix tasks from review findings
6. **For each task (subagents mode):**
   a. Compile bounded context from artifacts. Read only relevant files.
   b. Confirm expected edit files are inside the change boundary.
   c. **MUST implement:** Invoke the Agent tool with \`subagent_type: "lh-builder"\`, passing: feature ID, task ID, task goal, expected files, bounded context (relevant spec sections, boundary entries, memory entries, file content), verification commands, prior task summaries. Do NOT implement inline. If the Agent tool itself errors or reports the subagent type is not registered, report the error to the user and stop.
   d. Run task verification commands when available.
   e. Record commands and results.
   f. **MUST review:** Invoke the Agent tool with \`subagent_type: "lh-reviewer"\` after every task without exception, passing: feature ID, task ID, changed files list, task summary path, boundary path.
   g. **MUST compress:** Invoke the Agent tool with \`subagent_type: "lh-compressor"\`, passing the verbose task summary. Append the returned compact CaveBus entry to \`cavebus.log\`.
   h. Write task summary to \`task-summaries/<task-id>.md\`.
   i. Update task status in \`tasks.md\`.
7. **For each task (current-agent mode):**
   a. Compile bounded context from artifacts. Read only relevant files.
   b. Confirm expected edit files are inside the change boundary.
   c. Implement directly. Prefer writing or updating tests first for behavior changes.
   d. Run task verification commands when available.
   e. Record commands and results.
   f. Self-review inline: acceptance criteria coverage, boundary violations, missing tests, security issues, regressions, overengineering, accidental broad refactors.
   g. Write CaveBus summary directly to \`cavebus.log\`.
   h. Write task summary to \`task-summaries/<task-id>.md\`.
   i. Update task status in \`tasks.md\`.
8. **Boundary enforcement.** If the task requires files outside the boundary:
   - Stop before editing those files.
   - Update \`discovery.md\` and \`boundary.json\` with the new files.
   - Explain why the boundary changed.
9. **Risk gates.** If a risk gate is triggered:
   - Pause for approval unless the spec already explicitly approves it.
10. **Test failures.** If tests fail:
   - Diagnose and fix if within task scope.
   - Otherwise mark task as \`needs-fix\` or \`blocked\`.
11. **Verification evidence.** Do not mark a task \`done\` without verification evidence.

## Bounded Context Rules

- Start from the task, not the whole repo.
- Include only: relevant spec sections, boundary entries, memory entries, files listed in the task, and prior task summaries.
- Avoid pulling in unrelated architecture.
- Preserve exact paths, symbols, commands, and errors (protected tokens).
- Use compact summaries after each task for handoffs.

## Branch Setup

Before writing any code, confirm the development branch.

1. Run \`git branch --show-current\` to get the active branch.
2. If the branch name already contains \`<feature-id>\` (e.g., \`feature/F001-...\`), skip — the branch is already set.
3. Otherwise, ask the user using the \`AskUserQuestion\` tool:
   - \`header\`: \`"Branch setup"\`
   - \`question\`: \`"You're on '<current-branch>'. Where should this feature's work go?"\`
   - \`options\`:
     - label: \`"New branch (Recommended)"\`, description: \`"Create 'feature/<id>-<slug>'. Select Other to use a different prefix like fix/ or chore/."\`
     - label: \`"Stay on current branch"\`, description: \`"Continue on '<current-branch>' without switching."\`
4. For "New branch": run \`git checkout -b feature/<id>-<slug>\`. If the branch already exists, run \`git checkout feature/<id>-<slug>\` instead.
5. For "Other" (custom name): run \`git checkout -b <custom-name>\`. If the branch already exists, run \`git checkout <custom-name>\` instead.
6. For "Stay on current branch": proceed without changes.

## Question Format

When you need to ask a clarifying question or seek risk gate approval, use the \`AskUserQuestion\` tool — never plain text. This shows clickable option chips instead of requiring the user to type.

Structure each question with:
- \`header\`: short topic label (≤12 chars, e.g., "Risk gate")
- \`question\`: clear question ending with \`?\`
- \`options\`: 2–4 choices, each with a short \`label\` (1–5 words) and a one-sentence \`description\`

Ask one question per invocation. If multiple are needed, ask the most blocking one first and record the rest as assumptions.

## Implementation Rules

- Stay inside the approved change boundary.
- Preserve existing architecture by default.
- Avoid opportunistic cleanup outside task scope.
- Avoid broad refactors unless planned.
- Avoid new dependencies unless approved.
- Do not change public API unless planned and approved.
- Do not rewrite auth, payments, persistence, or routing systems unless explicitly approved.
- Prefer tests for behavior changes.
- Keep changes reviewable.

## Task Summary

Write each task summary to:

\`\`\`
.lh/features/<feature-id>-<slug>/task-summaries/<task-id>.md
\`\`\`

Use \`.lh/templates/task-summary.md\` as the template. Include:

- Status
- CaveBus summary
- Human-readable summary
- Files changed
- Tests added or updated
- Commands run
- Acceptance criteria covered
- Review findings
- Follow-ups

## CaveBus Task Summary

Append a compact task summary to \`cavebus.log\`:

\`\`\`
SUM F001 T-01 status:done
add: src/routes/reset.ts
chg: src/routes/index.ts
test: tests/routes/reset.test.ts
pass: pnpm test
fail: none
risk: none
next: T-02
\`\`\`

Use actual values. Do not hardcode project-specific content.

## Review Behavior

**Subagents mode:** After each task, MUST invoke the Agent tool with \`subagent_type: "lh-reviewer"\` (step 6f), passing feature ID, task ID, changed files, task summary path, and boundary path. Do not skip. Do not fall back to self-review unless the Agent tool itself errors.

**Current-agent mode:** After each task, perform self-review inline (step 7f) checking:

- Acceptance criteria coverage
- Boundary violations
- Missing tests
- Security issues
- Regressions
- Overengineering
- Accidental broad refactors

Record review findings in the task summary.

## Output Artifacts

Create or update:

\`\`\`
.lh/features/<feature-id>-<slug>/tasks.md
.lh/features/<feature-id>-<slug>/task-summaries/<task-id>.md
.lh/features/<feature-id>-<slug>/events.jsonl
.lh/features/<feature-id>-<slug>/cavebus.log
\`\`\`

May update these only when execution reveals plan-invalidating information:

\`\`\`
.lh/features/<feature-id>-<slug>/discovery.md
.lh/features/<feature-id>-<slug>/boundary.json
.lh/features/<feature-id>-<slug>/plan.md
\`\`\`

## Final Response Format

Every \`/lh-build\` run must end with:

- **Feature ID** — The feature identifier
- **Tasks attempted** — Which tasks were worked on
- **Task statuses** — Current status of each attempted task
- **Files changed** — Source files created, modified, or deleted
- **Tests added or updated** — Test files touched
- **Commands run** — Verification commands and results
- **Review findings** — Issues found during self-review
- **Blockers or follow-ups** — Unresolved issues
- **Recommended next command** — \`/lh-check <feature-id>\` when all tasks are done, or \`/lh-build <feature-id> <next-task>\` to continue
`;
}

function createCCSkillCheck(): string {
  return `---
name: lh-check
description: Verify a LeanHarness feature against acceptance criteria, changed files, risk gates, review findings, and command evidence. Use when the user invokes /lh-check or wants a final pass, needs-fix, or blocked verdict.
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, TaskCreate, TaskUpdate
---

# lh-check

## Purpose

Verify a LeanHarness feature against acceptance criteria, changed files, risk gates, reviews, and command evidence. Produce a final verdict: \`pass\`, \`needs-fix\`, or \`blocked\`.

## Inputs

Accept any of:

- Feature ID (e.g., \`F001\`)
- Feature folder path
- Request to check all active features

Examples:

\`\`\`
/lh-check F001
/lh-check all
\`\`\`

## Task Tooling

**On Claude Code:** As the very first action (before any Read, Bash, or other tool call), call TaskCreate for each step below all at once, so the user sees the full roadmap immediately. Before starting each step, call TaskUpdate to mark it in_progress. After completing each step, call TaskUpdate to mark it completed. Use the activeForm field as the spinner label.

**On OpenCode:** Before starting each step, emit a step header:

    ---
    **Step N/M — <Step Name>**

where N is the current step number and M is the total step count.

**Steps:**

| # | Subject | activeForm |
|---|---------|------------|
| 1 | Read all artifacts | Reading artifacts |
| 2 | Run verification commands | Running verification |
| 3 | AC-by-AC evaluation | Evaluating acceptance criteria |
| 4 | Write checks.md + result.md | Writing check results |
| 5 | Report verdict | Reporting verdict |

## Workflow

1. **Locate feature.** Find the feature folder under \`.lh/features/\`.
2. **Read artifacts.** Read:
   - \`spec.md\` — Acceptance criteria
   - \`discovery.md\` — Expected files and tests
   - \`boundary.json\` — Change boundary
   - \`plan.md\` — Implementation approach
   - \`tasks.md\` — Task statuses
   - \`task-summaries/\` — Per-task completion records
   - \`cavebus.log\` — Compressed history
   - \`events.jsonl\` — Event log if present
3. **Delegate verification.** Invoke the Agent tool with \`subagent_type: "lh-verifier"\`, passing the feature ID and artifact paths. Use the verifier's returned verdict, AC table, command results, and CaveBus entry as the basis for steps 12–13. If \`lh-verifier\` is unavailable, perform steps 4–11 directly.
4. **Determine changed files.** (fallback) Use available evidence:
   - Task summaries (files listed as changed)
   - \`git diff\` if available
   - Events log if available
5. **Check acceptance criteria.** Evaluate each AC one by one against evidence.
6. **Check task statuses.** Confirm all planned tasks are \`done\` or \`skipped\` with justification.
7. **Check verification commands.** Review commands run and their results from task summaries.
8. **Run verification commands.** When appropriate and safe, run relevant verification commands (tests, lint, type check).
9. **Check boundary compliance.** Confirm all changed files are inside the approved boundary.
10. **Check risk gates.** Confirm all triggered risk gates were resolved or approved.
11. **Check review findings.** Confirm no blocking review findings remain.
12. **Write checks.** Write \`checks.md\` using \`.lh/templates/checks.md\`.
13. **Write result.** Write or update \`result.md\` using \`.lh/templates/result.md\`.
14. **Append CaveBus.** Invoke the Agent tool with \`subagent_type: "lh-compressor"\`, passing the verification output. Append the returned compact CaveBus entry to \`cavebus.log\`. If \`lh-compressor\` is unavailable, write the CaveBus summary directly.
15. **Set verdict.** Assign final verdict: \`pass\`, \`needs-fix\`, or \`blocked\`.

## Verdict Rules

**pass:**
- Acceptance criteria are checked and pass
- Required verification ran, or skips are justified
- Implementation files changed
- No unresolved blocking review findings
- No unapproved boundary or risk gate violations

**needs-fix:**
- Implementation exists but acceptance criteria are partial or failing
- Tests fail and can likely be fixed
- Review found non-blocking but required fixes
- Boundary needs correction

**blocked:**
- Missing required information
- Required approval is missing
- Verification cannot run for reasons outside task scope
- Dependency, environment, or access issue prevents completion
- High-risk decision requires user input

## Do-Not-Pass Rules

Do not mark \`pass\` if:

- No implementation files changed
- Acceptance criteria are unchecked
- Required checks did not run and skips are not justified
- Blocking review findings remain
- Risk gates are unresolved
- Boundary violations are unresolved
- The verdict is based only on confidence instead of evidence

## Acceptance Criteria Coverage

Use table format from \`.lh/templates/checks.md\`:

| AC | Status | Evidence | Notes |
|---|---|---|---|
| AC-01 | pass | Test output, code review | — |
| AC-02 | fail | Test failure in reset.test.ts | Token validation wrong |

Status values: \`pass\`, \`fail\`, \`partial\`, \`not checked\`

## Verification Commands

Record all verification commands:

- Command run
- Result (pass/fail/error)
- Evidence (output summary)
- Notes

Do not hide failed commands. Record them honestly.

## Output Artifacts

Create or update:

\`\`\`
.lh/features/<feature-id>-<slug>/checks.md
.lh/features/<feature-id>-<slug>/result.md
.lh/features/<feature-id>-<slug>/events.jsonl
.lh/features/<feature-id>-<slug>/cavebus.log
.lh/state.json
\`\`\`

## CaveBus Check Summary

Append a compact verification summary to \`cavebus.log\`:

\`\`\`
VERIFY F001 verdict:pass
ac: AC-01 pass, AC-02 pass
cmd: pnpm test pass; pnpm lint pass
risk: none
next: done
\`\`\`

Use actual values. Do not hardcode project-specific content.

## Final Response Format

Every \`/lh-check\` run must end with:

- **Feature ID** — The feature identifier
- **Verdict** — \`pass\`, \`needs-fix\`, or \`blocked\`
- **Acceptance criteria status** — Table of AC results
- **Commands run** — Verification commands and results
- **Changed files summary** — Files created, modified, or deleted
- **Risk gate status** — Resolved, pending, or not triggered
- **Blocking issues** — Unresolved problems preventing pass
- **Result path** — Path to \`result.md\`
- **Recommended next action** — What the user should do next
`;
}

function createCCSkillStatus(): string {
  return `---
name: lh-status
description: Inspect LeanHarness feature state and summarize current specs, discovery, plans, tasks, checks, blockers, and next actions. Use when the user invokes /lh-status or asks what is happening in the current LeanHarness work.
disable-model-invocation: true
allowed-tools: Read, Glob, Grep
---

# lh-status

## Purpose

Inspect LeanHarness artifacts and summarize the current state of feature work. Read-only by default. Does not modify files unless the user explicitly asks to repair state.

## Inputs

Accept any of:

- No argument: summarize active feature and recent features
- Feature ID: summarize that specific feature
- \`all\`: summarize all known features by state
- Status filter: summarize features in a specific state (e.g., \`blocked\`, \`planned\`)

Examples:

\`\`\`
/lh-status
/lh-status F001
/lh-status all
/lh-status blocked
\`\`\`

## Workflow

1. **Read state.** Read \`.lh/state.json\` if present.
2. **Scan features.** Read \`.lh/features/\` if present.
3. **Locate feature.** If a feature ID is provided, find the matching folder.
4. **Read artifacts.** For each relevant feature, check which artifacts exist:
   - \`spec.md\`
   - \`discovery.md\`
   - \`boundary.json\`
   - \`plan.md\`
   - \`tasks.md\`
   - \`checks.md\`
   - \`result.md\`
   - \`task-summaries/\`
   - \`cavebus.log\`
5. **Identify current state.** For each feature, determine:
   - Current status (from \`state.json\` or inferred from artifacts)
   - Last completed workflow step
   - Next missing artifact
   - Blockers
   - Failed checks
   - Triggered risk gates
   - Next recommended action
6. **Do not modify files** unless the user explicitly asks to repair state.

## Status Summary Format

For each feature, show:

- **Feature ID** — e.g., \`F001\`
- **Slug or title** — Short description
- **Status** — \`draft\`, \`specified\`, \`discovered\`, \`planned\`, \`building\`, \`checking\`, \`pass\`, \`needs-fix\`, \`blocked\`
- **Last known step** — Which workflow step completed last
- **Missing artifacts** — Which expected artifacts do not exist yet
- **Blockers** — Unresolved issues preventing progress
- **Recommended next command** — What to run next

For multiple features, use a summary table:

| Feature | Title | Status | Next Step |
|---------|-------|--------|-----------|
| F001 | Password reset | planned | \`/lh-build F001\` |
| F002 | Billing fix | specified | \`/lh-discover F002\` |

## State Consistency Rules

If \`.lh/state.json\` and feature folders disagree:

- Treat feature artifacts as more authoritative than state.json.
- Report the mismatch clearly.
- Suggest repair (e.g., "state.json says F001 is \`specified\` but \`plan.md\` exists, suggesting it is \`planned\`").
- Do not silently delete or overwrite state.

## Final Response Format

Every \`/lh-status\` run must end with:

- **Active feature** — Currently active feature, if any
- **Feature summary** — Table or list of features and their states
- **Current blockers** — Across all inspected features
- **Missing artifacts** — What still needs to be created
- **Suggested next command** — The most useful next step
`;
}

// ---------------------------------------------------------------------------
// Hook script content generators
// ---------------------------------------------------------------------------

function createHookShared(): string {
  return `#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// --- stdin ---

function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, 'utf8').trim();
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    try {
      const raw = fs.readFileSync(0, 'utf8').trim();
      return { __parseError: e.message, __raw: raw };
    } catch (_) {
      return { __parseError: e.message, __raw: '' };
    }
  }
}

// --- paths ---

function projectRoot() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function toPosixPath(p) {
  if (!p) return '';
  return p.replace(/\\\\/g, '/').replace(/\\/{2,}/g, function(m, offset) {
    return offset === 0 ? '/' : '/';
  });
}

function normalizeRelativePath(root, candidate) {
  if (!candidate) return '';
  candidate = toPosixPath(candidate);
  var posixRoot = toPosixPath(root);
  if (!posixRoot.endsWith('/')) posixRoot += '/';

  if (candidate.startsWith(posixRoot)) {
    candidate = candidate.slice(posixRoot.length);
  } else if (candidate.startsWith('/')) {
    return candidate;
  }

  if (candidate.startsWith('./')) candidate = candidate.slice(2);

  if (candidate.includes('../')) {
    return '__PARENT_ESCAPE__/' + candidate;
  }

  return candidate;
}

// --- file I/O ---

function readJsonFile(filePath) {
  try {
    var raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function writeJsonFile(filePath, data) {
  try {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\\n', 'utf8');
    return true;
  } catch (_) {
    return false;
  }
}

function appendJsonl(file, event) {
  try {
    ensureDir(path.dirname(file));
    fs.appendFileSync(file, JSON.stringify(event) + '\\n', 'utf8');
    return true;
  } catch (_) {
    return false;
  }
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (_) {}
}

// --- state ---

function loadState(root) {
  var statePath = path.join(root, '.lh', 'state.json');
  var state = readJsonFile(statePath);
  if (!state) {
    return {
      version: '0.1',
      active_feature: null,
      features: {},
      last_event_id: 0,
      session: { started_at: null, host: null, adapter: null }
    };
  }
  return state;
}

function findActiveFeature(root) {
  // 1. env var
  var envFeature = process.env.LEANHARNESS_ACTIVE_FEATURE;
  if (envFeature) return envFeature;

  // 2. state.json
  var state = loadState(root);
  if (state.active_feature) return state.active_feature;
  // also check camelCase variant
  if (state.activeFeature) return state.activeFeature;

  // 3. single feature folder fallback
  var dirs = listFeatureDirs(root);
  if (dirs.length === 1) return dirs[0];

  return null;
}

function listFeatureDirs(root) {
  var featuresDir = path.join(root, '.lh', 'features');
  try {
    var entries = fs.readdirSync(featuresDir, { withFileTypes: true });
    return entries
      .filter(function(e) { return e.isDirectory(); })
      .map(function(e) { return e.name; });
  } catch (_) {
    return [];
  }
}

function resolveFeatureDir(root, featureRef) {
  if (!featureRef) return null;

  var featuresDir = path.join(root, '.lh', 'features');

  // exact folder path
  var exact = path.join(featuresDir, featureRef);
  if (dirExists(exact)) return exact;

  // short ID like F001 — scan for matching prefix
  var dirs = listFeatureDirs(root);
  for (var i = 0; i < dirs.length; i++) {
    if (dirs[i] === featureRef || dirs[i].startsWith(featureRef + '-')) {
      return path.join(featuresDir, dirs[i]);
    }
  }

  return null;
}

function dirExists(p) {
  try { return fs.statSync(p).isDirectory(); } catch (_) { return false; }
}

// --- boundary ---

function loadBoundary(root, featureDir) {
  if (!featureDir) return null;
  var bPath = path.join(featureDir, 'boundary.json');
  var b = readJsonFile(bPath);
  if (!b || typeof b !== 'object') return null;
  return b;
}

// --- tool input extraction ---

function extractToolPaths(input) {
  if (!input) return [];
  var root = projectRoot();
  var paths = [];

  var ti = input.tool_input || {};
  var tr = input.tool_response || {};

  // single file path fields
  var candidates = [
    ti.file_path, ti.path, ti.filePath,
    tr.filePath, tr.file_path
  ];

  for (var i = 0; i < candidates.length; i++) {
    if (typeof candidates[i] === 'string' && candidates[i]) {
      paths.push(normalizeRelativePath(root, candidates[i]));
    }
  }

  // files array
  if (Array.isArray(ti.files)) {
    for (var j = 0; j < ti.files.length; j++) {
      var f = ti.files[j];
      if (typeof f === 'string') paths.push(normalizeRelativePath(root, f));
      else if (f && typeof f.path === 'string') paths.push(normalizeRelativePath(root, f.path));
      else if (f && typeof f.file_path === 'string') paths.push(normalizeRelativePath(root, f.file_path));
    }
  }

  // edits array (MultiEdit)
  if (Array.isArray(ti.edits)) {
    for (var k = 0; k < ti.edits.length; k++) {
      var e = ti.edits[k];
      if (e && typeof e.file_path === 'string') paths.push(normalizeRelativePath(root, e.file_path));
      else if (e && typeof e.path === 'string') paths.push(normalizeRelativePath(root, e.path));
    }
  }

  // deduplicate
  var seen = {};
  return paths.filter(function(p) {
    if (!p || seen[p]) return false;
    seen[p] = true;
    return true;
  });
}

function extractCommand(input) {
  if (!input) return null;
  var ti = input.tool_input || {};
  return typeof ti.command === 'string' ? ti.command : null;
}

// --- bootstrap path detection ---

var BOOTSTRAP_PREFIXES = [
  '.lh/',
  '.claude/',
  'docs/'
];

var BOOTSTRAP_EXACT = [
  '.lh',
  '.claude',
  'docs',
  'README.md',
  'CLAUDE.md'
];

function isHarnessBootstrapPath(p) {
  if (!p) return false;
  p = toPosixPath(p);
  if (p.startsWith('./')) p = p.slice(2);

  for (var i = 0; i < BOOTSTRAP_EXACT.length; i++) {
    if (p === BOOTSTRAP_EXACT[i]) return true;
  }

  for (var j = 0; j < BOOTSTRAP_PREFIXES.length; j++) {
    if (p.startsWith(BOOTSTRAP_PREFIXES[j])) return true;
  }

  return false;
}

// --- pattern matching ---

function matchesPattern(pattern, value) {
  if (!pattern || !value) return false;

  // exact match
  if (pattern === value) return true;

  // convert glob pattern to regex
  var regexStr = '';
  var i = 0;
  while (i < pattern.length) {
    var ch = pattern[i];
    if (ch === '*') {
      if (i + 1 < pattern.length && pattern[i + 1] === '*') {
        // ** matches everything including path separators
        regexStr += '.*';
        i += 2;
        if (i < pattern.length && pattern[i] === '/') i++; // skip trailing /
        continue;
      }
      // * matches non-separator characters
      regexStr += '[^/]*';
    } else if (ch === '?') {
      regexStr += '[^/]';
    } else if ('.+^\${}()|[]\\\\'.indexOf(ch) >= 0) {
      regexStr += '\\\\' + ch;
    } else {
      regexStr += ch;
    }
    i++;
  }

  try {
    var re = new RegExp('^' + regexStr + '\$', 'i');
    return re.test(value);
  } catch (_) {
    return false;
  }
}

function matchesAnyPattern(patterns, value) {
  if (!Array.isArray(patterns)) return false;
  for (var i = 0; i < patterns.length; i++) {
    if (matchesPattern(patterns[i], value)) return true;
  }
  return false;
}

// --- command classification ---

var BUILTIN_DENY = [
  { pattern: 'rm -rf /', reason: 'Refuses to delete filesystem root.' },
  { pattern: 'rm -rf /*', reason: 'Refuses to delete filesystem root contents.' },
  { pattern: 'rm -rf ~', reason: 'Refuses to delete the home directory.' },
  { pattern: 'rm -rf ~/*', reason: 'Refuses to delete home directory contents.' },
  { pattern: 'rm -rf .git', reason: 'Refuses to delete git metadata.' },
  { pattern: 'rm -rf .git/', reason: 'Refuses to delete git metadata.' },
  { pattern: 'git push --force*', reason: 'Force push requires explicit manual control.' },
  { pattern: 'git push -f *', reason: 'Force push requires explicit manual control.' },
  { pattern: 'git reset --hard*', reason: 'Hard reset can destroy local work.' },
  { pattern: 'git clean -fd*', reason: 'Git clean with force can delete untracked work.' },
  { pattern: 'git clean -fx*', reason: 'Git clean with force can delete untracked work.' },
  { pattern: 'git clean -fxd*', reason: 'Git clean with force can delete untracked work.' },
  { pattern: '*DROP DATABASE*', reason: 'Destructive database command.' },
  { pattern: '*drop database*', reason: 'Destructive database command.' },
  { pattern: '*DROP TABLE*', reason: 'Destructive database command.' },
  { pattern: '*drop table*', reason: 'Destructive database command.' },
  { pattern: 'cat .env*', reason: 'Refuses to expose secrets.' },
  { pattern: 'printenv*', reason: 'Refuses to expose environment secrets.' },
  { pattern: 'env', reason: 'Refuses to expose environment secrets.' },
  { pattern: '*> /dev/sd*', reason: 'Refuses to write directly to block devices.' },
  { pattern: 'dd if=*', reason: 'Refuses raw disk writes.' },
  { pattern: 'mkfs*', reason: 'Refuses filesystem creation on devices.' }
];

var BUILTIN_SAFE = [
  'git status*', 'git diff*', 'git log*', 'git branch*', 'git show*', 'git blame*',
  'ls*', 'find*', 'grep*', 'rg*', 'cat README.md', 'sed -n*', 'wc *', 'head *', 'tail *',
  'npm test*', 'npm run test*', 'npm run lint*', 'npm run typecheck*',
  'pnpm test*', 'pnpm lint*', 'pnpm typecheck*', 'pnpm run test*', 'pnpm run lint*',
  'yarn test*', 'yarn lint*', 'bun test*',
  'pytest*', 'go test*', 'cargo test*',
  'node --check*', 'python -m json.tool*', 'python -c *'
];

function classifyCommand(command) {
  if (!command || typeof command !== 'string') {
    return { decision: 'none', reason: '', matchedPattern: null };
  }

  var trimmed = command.trim();

  // check deny first
  for (var i = 0; i < BUILTIN_DENY.length; i++) {
    if (matchesPattern(BUILTIN_DENY[i].pattern, trimmed)) {
      return {
        decision: 'deny',
        reason: BUILTIN_DENY[i].reason,
        matchedPattern: BUILTIN_DENY[i].pattern
      };
    }
  }

  // check safe (no decision needed)
  for (var s = 0; s < BUILTIN_SAFE.length; s++) {
    if (matchesPattern(BUILTIN_SAFE[s], trimmed)) {
      return { decision: 'none', reason: '', matchedPattern: null };
    }
  }

  return { decision: 'none', reason: '', matchedPattern: null };
}

// --- path risk classification ---

var RISK_GATE_PATHS = {
  auth_rewrite: [
    '**/auth/**', '**/session/**', '**/*auth*', '**/*session*'
  ],
  payment_logic: [
    '**/billing/**', '**/payment/**', '**/checkout/**',
    '**/*billing*', '**/*payment*', '**/*checkout*'
  ],
  destructive_migration: [
    '**/migrations/**', '**/migration/**', '**/schema.*'
  ],
  new_dependency: [
    'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb',
    'requirements.txt', 'pyproject.toml', 'poetry.lock',
    'Gemfile', 'Gemfile.lock', 'go.mod', 'go.sum', 'Cargo.toml', 'Cargo.lock'
  ],
  public_api_break: [
    '**/api/**', '**/routes/**', '**/controllers/**',
    '**/schema/**', '**/*schema*', '**/*contract*'
  ],
  security_sensitive_change: [
    '**/security/**', '**/permissions/**', '**/authorization/**', '**/secrets/**',
    '**/*token*', '**/*permission*', '**/*secret*'
  ]
};

function classifyPathRisk(p) {
  if (!p) return [];
  var gates = [];
  var keys = Object.keys(RISK_GATE_PATHS);
  for (var i = 0; i < keys.length; i++) {
    if (matchesAnyPattern(RISK_GATE_PATHS[keys[i]], p)) {
      gates.push(keys[i]);
    }
  }
  return gates;
}

// --- boundary check ---

function isPathInsideBoundary(p, boundary) {
  if (!p || !boundary) {
    return { inside: false, blocked: false, reason: 'No boundary loaded.' };
  }

  // check blocked first
  var blockedGlobs = boundary.blockedEditGlobs || [];
  var doNotTouch = boundary.doNotTouch || [];

  if (matchesAnyPattern(blockedGlobs, p)) {
    return { inside: false, blocked: true, reason: 'Path matches blockedEditGlobs in boundary.' };
  }
  for (var d = 0; d < doNotTouch.length; d++) {
    if (toPosixPath(doNotTouch[d]) === p || matchesPattern(doNotTouch[d], p)) {
      return { inside: false, blocked: true, reason: 'Path is in doNotTouch list.' };
    }
  }

  // check bootstrap paths — always considered inside
  if (isHarnessBootstrapPath(p)) {
    return { inside: true, blocked: false, reason: 'Bootstrap path.' };
  }

  // check touchFiles
  var touchFiles = boundary.touchFiles || boundary.files || {};
  var allTouchPaths = [];

  // handle touchFiles as array of objects with .path
  if (Array.isArray(touchFiles)) {
    for (var t = 0; t < touchFiles.length; t++) {
      if (touchFiles[t] && typeof touchFiles[t].path === 'string') {
        allTouchPaths.push(toPosixPath(touchFiles[t].path));
      } else if (typeof touchFiles[t] === 'string') {
        allTouchPaths.push(toPosixPath(touchFiles[t]));
      }
    }
  }

  // handle files.modify/create/delete from boundary template
  if (touchFiles && typeof touchFiles === 'object' && !Array.isArray(touchFiles)) {
    ['modify', 'create', 'delete'].forEach(function(key) {
      if (Array.isArray(touchFiles[key])) {
        touchFiles[key].forEach(function(fp) {
          if (typeof fp === 'string') allTouchPaths.push(toPosixPath(fp));
        });
      }
    });
  }

  for (var m = 0; m < allTouchPaths.length; m++) {
    if (allTouchPaths[m] === p) {
      return { inside: true, blocked: false, reason: 'Path listed in touchFiles.' };
    }
  }

  // check allowedEditGlobs
  var allowedGlobs = boundary.allowedEditGlobs || [];
  if (matchesAnyPattern(allowedGlobs, p)) {
    return { inside: true, blocked: false, reason: 'Path matches allowedEditGlobs.' };
  }

  // also check test_files and config_files
  var extras = [].concat(boundary.test_files || [], boundary.config_files || []);
  for (var x = 0; x < extras.length; x++) {
    if (typeof extras[x] === 'string' && toPosixPath(extras[x]) === p) {
      return { inside: true, blocked: false, reason: 'Path listed in boundary test/config files.' };
    }
  }

  return { inside: false, blocked: false, reason: 'Path not found in boundary.' };
}

// --- decision helpers ---

function preToolDecision(eventName, decision, reason) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      permissionDecisionReason: reason
    }
  };
}

function postToolBlock(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      decision: 'block',
      reason: reason
    }
  };
}

function stopBlock(reason) {
  return {
    decision: 'block',
    reason: reason
  };
}

// --- utilities ---

function nowIso() {
  return new Date().toISOString();
}

function safeString(val) {
  if (val === null || val === undefined) return '';
  return String(val);
}

// --- exports ---

module.exports = {
  readStdinJson: readStdinJson,
  projectRoot: projectRoot,
  toPosixPath: toPosixPath,
  normalizeRelativePath: normalizeRelativePath,
  readJsonFile: readJsonFile,
  writeJsonFile: writeJsonFile,
  appendJsonl: appendJsonl,
  ensureDir: ensureDir,
  loadState: loadState,
  findActiveFeature: findActiveFeature,
  listFeatureDirs: listFeatureDirs,
  resolveFeatureDir: resolveFeatureDir,
  loadBoundary: loadBoundary,
  extractToolPaths: extractToolPaths,
  extractCommand: extractCommand,
  isHarnessBootstrapPath: isHarnessBootstrapPath,
  matchesPattern: matchesPattern,
  matchesAnyPattern: matchesAnyPattern,
  classifyCommand: classifyCommand,
  classifyPathRisk: classifyPathRisk,
  isPathInsideBoundary: isPathInsideBoundary,
  preToolDecision: preToolDecision,
  postToolBlock: postToolBlock,
  stopBlock: stopBlock,
  nowIso: nowIso,
  safeString: safeString
};
`;
}

function createHookPreToolUse(): string {
  return `#!/usr/bin/env node
'use strict';

var shared = require('./shared');

function main() {
  var input = shared.readStdinJson();

  if (input.__parseError) return;

  var toolName = input.tool_name || '';
  var root = shared.projectRoot();

  if (toolName === 'Bash') {
    handleBash(input, root);
  } else if (toolName === 'Edit' || toolName === 'Write' || toolName === 'MultiEdit') {
    handleFileEdit(input, root, toolName);
  }
}

function handleBash(input, root) {
  var command = shared.extractCommand(input);
  if (!command) return;

  var result = shared.classifyCommand(command);

  if (result.decision === 'deny') {
    var decision = shared.preToolDecision(
      'PreToolUse',
      'deny',
      'LeanHarness blocked this command: ' +
      result.reason.replace(/\\.\$/, '') +
      '. Command: \\\`' + command + '\\\`.'
    );
    process.stdout.write(JSON.stringify(decision));
    return;
  }

}

function handleFileEdit(input, root, toolName) {
  var paths = shared.extractToolPaths(input);

  if (paths.length === 0) return;

  var featureRef = shared.findActiveFeature(root);
  var featureDir = featureRef ? shared.resolveFeatureDir(root, featureRef) : null;
  var boundary = featureDir ? shared.loadBoundary(root, featureDir) : null;

  for (var i = 0; i < paths.length; i++) {
    var p = paths[i];

    if (p.startsWith('__PARENT_ESCAPE__')) {
      var escDecision = shared.preToolDecision(
        'PreToolUse',
        'deny',
        'LeanHarness blocked this edit because the path escapes the project directory: \\\`' + p + '\\\`.'
      );
      process.stdout.write(JSON.stringify(escDecision));
      return;
    }

    if (shared.isHarnessBootstrapPath(p)) {
      continue;
    }

    if (boundary) {
      var check = shared.isPathInsideBoundary(p, boundary);

      if (check.blocked) {
        var blockDecision = shared.preToolDecision(
          'PreToolUse',
          'deny',
          'LeanHarness blocked this edit because \\\`' + p +
          '\\\` is explicitly blocked in the active change boundary. ' + check.reason
        );
        process.stdout.write(JSON.stringify(blockDecision));
        return;
      }

      if (!check.inside) {
        var featureName = featureRef || 'active feature';
        var oobDecision = shared.preToolDecision(
          'PreToolUse',
          'deny',
          'LeanHarness blocked this edit because \\\`' + p +
          '\\\` is outside the active change boundary for ' + featureName +
          '. Update discovery and boundary before editing it.'
        );
        process.stdout.write(JSON.stringify(oobDecision));
        return;
      }

      continue;
    }
  }
}

main();
`;
}

function createHookPostToolUse(): string {
  return `#!/usr/bin/env node
'use strict';

var path = require('path');
var shared = require('./shared');

function main() {
  var input = shared.readStdinJson();

  if (input.__parseError) return;

  var hookEvent = input.hook_event_name || 'PostToolUse';
  var toolName = input.tool_name || '';
  var root = shared.projectRoot();

  var featureRef = shared.findActiveFeature(root);
  var featureDir = featureRef ? shared.resolveFeatureDir(root, featureRef) : null;
  var boundary = featureDir ? shared.loadBoundary(root, featureDir) : null;

  var command = shared.extractCommand(input);
  var paths = shared.extractToolPaths(input);

  // build event object
  var event = {
    timestamp: shared.nowIso(),
    source: 'leanharness-hook',
    event: hookEvent,
    tool: toolName,
    feature: featureRef || null,
    paths: paths.length > 0 ? paths : null,
    command: command || null,
    result: hookEvent === 'PostToolUseFailure' ? 'failure' : 'success',
    durationMs: typeof input.duration_ms === 'number' ? input.duration_ms : null,
    notes: []
  };

  // extract error info for failures
  if (hookEvent === 'PostToolUseFailure') {
    var tr = input.tool_response || {};
    var errMsg = tr.stderr || tr.error || tr.message || null;
    if (errMsg) {
      event.notes.push('error: ' + shared.safeString(errMsg).slice(0, 500));
    }
  }

  // log event to feature events.jsonl
  if (featureDir) {
    var eventsFile = path.join(featureDir, 'events.jsonl');
    shared.appendJsonl(eventsFile, event);
  }

  // boundary feedback for PostToolUse edits
  if (hookEvent === 'PostToolUse' && boundary && paths.length > 0) {
    for (var i = 0; i < paths.length; i++) {
      var p = paths[i];

      if (shared.isHarnessBootstrapPath(p)) continue;

      var check = shared.isPathInsideBoundary(p, boundary);

      if (check.blocked || !check.inside) {
        var feedback = shared.postToolBlock(
          'LeanHarness detected an out-of-boundary edit after the tool ran: \\\`' + p +
          '\\\`. Do not continue implementation until you either revert the change or update discovery.md and boundary.json with a clear reason.'
        );
        process.stdout.write(JSON.stringify(feedback));

        // log the boundary violation
        if (featureDir) {
          var violationEvent = {
            timestamp: shared.nowIso(),
            source: 'leanharness-hook',
            event: 'boundary-violation',
            tool: toolName,
            feature: featureRef,
            paths: [p],
            command: null,
            result: 'warning',
            durationMs: null,
            notes: ['Out-of-boundary edit detected post-execution: ' + p]
          };
          shared.appendJsonl(path.join(featureDir, 'events.jsonl'), violationEvent);
        }

        return;
      }
    }
  }

  // for PostToolUseFailure, provide context when useful
  if (hookEvent === 'PostToolUseFailure' && featureDir) {
    var tr2 = input.tool_response || {};
    var hasError = tr2.stderr || tr2.error;
    if (hasError && command) {
      var failFeedback = shared.postToolBlock(
        'LeanHarness recorded a failed command in the event log: \\\`' + command +
        '\\\`. Review the error output and either fix the issue or mark the current task as needs-fix.'
      );
      process.stdout.write(JSON.stringify(failFeedback));
      return;
    }
  }
}

main();
`;
}

function createHookSessionEnd(): string {
  return `#!/usr/bin/env node
'use strict';

var fs = require('fs');
var path = require('path');
var shared = require('./shared');

function main() {
  var input = shared.readStdinJson();

  if (input.__parseError) return;

  var hookEvent = input.hook_event_name || '';
  var root = shared.projectRoot();

  if (hookEvent === 'SessionEnd') {
    handleSessionEnd(input, root);
  } else if (hookEvent === 'Stop' || hookEvent === 'SubagentStop') {
    handleStop(input, root, hookEvent);
  }
}

function handleSessionEnd(input, root) {
  var featureRef = shared.findActiveFeature(root);
  var featureDir = featureRef ? shared.resolveFeatureDir(root, featureRef) : null;

  if (featureDir) {
    var event = {
      timestamp: shared.nowIso(),
      source: 'leanharness-hook',
      event: 'SessionEnd',
      tool: null,
      feature: featureRef,
      paths: null,
      command: null,
      result: 'session-end',
      durationMs: null,
      notes: []
    };
    shared.appendJsonl(path.join(featureDir, 'events.jsonl'), event);
  }
  // never block SessionEnd
}

function handleStop(input, root, hookEvent) {
  var featureRef = shared.findActiveFeature(root);
  if (!featureRef) return;

  var featureDir = shared.resolveFeatureDir(root, featureRef);
  if (!featureDir) return;

  var state = shared.loadState(root);

  // determine feature status
  var featureStatus = getFeatureStatus(state, featureRef, featureDir);

  // only enforce during active build-like states
  var buildStates = ['building', 'planned', 'needs-fix', 'in-progress'];
  if (buildStates.indexOf(featureStatus) < 0) return;

  // check for recent implementation events
  var events = loadRecentEvents(featureDir);
  if (events.length === 0) return;

  var hasImplEdits = events.some(function(e) {
    return (e.tool === 'Edit' || e.tool === 'Write' || e.tool === 'MultiEdit') &&
           Array.isArray(e.paths) &&
           e.paths.some(function(p) { return !shared.isHarnessBootstrapPath(p); });
  });

  // if only bootstrap/docs edits, don't block
  if (!hasImplEdits) return;

  // check for task summaries
  var hasSummary = hasTaskSummaries(featureDir);

  // check for verification evidence
  var hasVerification = hasVerificationEvidence(featureDir);

  // check for recent failures without follow-up
  var hasUnresolvedFailure = hasRecentUnresolvedFailure(events);

  // check if checks.md shows pass
  var checksPass = checksShowPass(featureDir);
  if (checksPass) return;

  // build block reasons
  var reasons = [];

  if (!hasSummary) {
    reasons.push(
      'LeanHarness needs a task summary before stopping. Write or update a task summary in \\\`' +
      path.join('.lh/features', path.basename(featureDir), 'task-summaries') +
      '/\\\` with files changed, commands run, verification evidence, and next action.'
    );
  }

  if (hasUnresolvedFailure) {
    reasons.push(
      'LeanHarness detected failed commands in events.jsonl. Before stopping, summarize the failure and mark the task \\\`needs-fix\\\` or \\\`blocked\\\`.'
    );
  }

  if (reasons.length > 0) {
    var block = shared.stopBlock(reasons.join(' '));
    process.stdout.write(JSON.stringify(block));
    return;
  }
}

function getFeatureStatus(state, featureRef, featureDir) {
  // check state.json features map
  if (state.features && state.features[featureRef] && state.features[featureRef].status) {
    return state.features[featureRef].status;
  }

  // check for spec/plan/tasks as status proxy
  if (fileExists(path.join(featureDir, 'tasks.md'))) return 'building';
  if (fileExists(path.join(featureDir, 'plan.md'))) return 'planned';
  if (fileExists(path.join(featureDir, 'spec.md'))) return 'specified';

  return 'unknown';
}

function loadRecentEvents(featureDir) {
  var eventsFile = path.join(featureDir, 'events.jsonl');
  try {
    var raw = fs.readFileSync(eventsFile, 'utf8').trim();
    if (!raw) return [];

    var lines = raw.split('\\n');
    // take last 50 events
    var recent = lines.slice(-50);
    var events = [];
    for (var i = 0; i < recent.length; i++) {
      try {
        events.push(JSON.parse(recent[i]));
      } catch (_) {}
    }
    return events;
  } catch (_) {
    return [];
  }
}

function hasTaskSummaries(featureDir) {
  var summaryDir = path.join(featureDir, 'task-summaries');
  try {
    var entries = fs.readdirSync(summaryDir);
    return entries.length > 0;
  } catch (_) {
    return false;
  }
}

function hasVerificationEvidence(featureDir) {
  // check for checks.md or result.md
  if (fileExists(path.join(featureDir, 'checks.md'))) return true;
  if (fileExists(path.join(featureDir, 'result.md'))) return true;
  return false;
}

function hasRecentUnresolvedFailure(events) {
  // find most recent failure and check if there's a success after it
  var lastFailureIdx = -1;
  var lastSuccessAfterFailure = false;

  for (var i = 0; i < events.length; i++) {
    if (events[i].result === 'failure') {
      lastFailureIdx = i;
      lastSuccessAfterFailure = false;
    } else if (lastFailureIdx >= 0 && events[i].result === 'success' && events[i].tool === 'Bash') {
      lastSuccessAfterFailure = true;
    }
  }

  return lastFailureIdx >= 0 && !lastSuccessAfterFailure;
}

function checksShowPass(featureDir) {
  var checksFile = path.join(featureDir, 'checks.md');
  try {
    var content = fs.readFileSync(checksFile, 'utf8');
    return content.toLowerCase().indexOf('verdict: pass') >= 0 ||
           content.toLowerCase().indexOf('verdict:pass') >= 0;
  } catch (_) {
    return false;
  }
}

function fileExists(p) {
  try { return fs.statSync(p).isFile(); } catch (_) { return false; }
}

main();
`;
}

// ---------------------------------------------------------------------------
// Policy YAML
// ---------------------------------------------------------------------------

function createClaudeCodePolicyYaml(): string {
  return `version: 0.1
name: claude-code-guardrails
purpose: enforce LeanHarness guardrails for Claude Code sessions

hooks:
  path: .lh/scripts/hooks/
  config: .claude/hooks/leanharness-hooks.json
  settings: .claude/settings.json
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
  - docs/**
  - README.md
  - CLAUDE.md

boundary:
  source: .lh/features/<feature>/boundary.json
  with_active_boundary:
    out_of_boundary_edit: block
    blocked_path_edit: block
  without_active_boundary:
    implementation_edit: ask
    risky_edit: block_or_ask
  allowed_fields:
    - touchFiles[].path
    - allowedEditGlobs[]
  blocked_fields:
    - blockedEditGlobs[]
    - doNotTouch[]

permissions:
  allow:
    - Read
    - Grep
    - Glob
    - "Bash(find *)"
    - "Bash(ls *)"
    - "Bash(cat .lh/*)"
    - "Bash(git status*)"
    - "Bash(git log*)"
    - "Bash(git diff*)"
    - "Bash(git branch*)"
    - "Bash(git show*)"
    - "Bash(git blame*)"
  ask:
    - Edit
    - Write
    - "Bash(npm install*)"
    - "Bash(npm update*)"
    - "Bash(pnpm add*)"
    - "Bash(pnpm update*)"
    - "Bash(yarn add*)"
    - "Bash(bun add*)"
    - "Bash(git push*)"
    - "Bash(git reset*)"
    - "Bash(git clean*)"
    - "Bash(*migrate*)"
    - "Bash(*deploy*)"
    - "Bash(rm -r*)"
  deny:
    - "Bash(rm -rf /)"
    - "Bash(rm -rf ~)"
    - "Bash(rm -rf .git)"
    - "Bash(git push --force*)"
    - "Bash(git push -f *)"
    - "Bash(git reset --hard*)"
    - "Bash(git clean -fd*)"
    - "Bash(git clean -fx*)"
    - "Bash(*DROP DATABASE*)"
    - "Bash(*drop database*)"
    - "Bash(cat .env*)"
    - "Bash(printenv*)"
    - "Bash(env | *)"

hooks_config:
  PreToolUse:
    matcher: "Bash|Edit|Write|MultiEdit"
    script: .lh/scripts/hooks/pre-tool-use.js
    timeout: 10
  PostToolUse:
    matcher: "Bash|Edit|Write|MultiEdit"
    script: .lh/scripts/hooks/post-tool-use.js
    timeout: 10
  PostToolUseFailure:
    matcher: "Bash|Edit|Write|MultiEdit"
    script: .lh/scripts/hooks/post-tool-use.js
    timeout: 10
  Stop:
    script: .lh/scripts/hooks/session-end.js
    timeout: 10
  SubagentStop:
    script: .lh/scripts/hooks/session-end.js
    timeout: 10
  SessionEnd:
    script: .lh/scripts/hooks/session-end.js
    timeout: 10

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
  event_source: leanharness-hook

agents:
  - lh-scout
  - lh-builder
  - lh-reviewer
  - lh-verifier
  - lh-compressor

skills:
  - lh-do
  - lh-spec
  - lh-discover
  - lh-plan
  - lh-build
  - lh-check
  - lh-status

limitations:
  - Claude Code permissions, hooks, and settings are guardrails, not a complete security sandbox.
  - Hooks are best-effort because event payload shapes may vary by Claude Code version.
  - Final feature completion is still determined by lh check.
  - Boundary enforcement works best when .lh/features/<feature>/boundary.json exists.
  - If no active feature or boundary exists, the hooks block only clearly risky operations.
`;
}

// ---------------------------------------------------------------------------
// Statusline script
// ---------------------------------------------------------------------------

export function createStatuslineScript(): string {
  return `#!/usr/bin/env bash
# LeanHarness Claude Code status line
# Receives JSON from Claude Code via stdin on each prompt render.
#
# Normal:  sonnet-4.6 | main | $0.0234 | ████████░░░░░░░░░░░░ 40%
# Warning: sonnet-4.6 | main | $1.23 | ☠️ ████████████████░░░░ 78%
# Danger:  sonnet-4.6 | main | $1.23 | ☠️ [RED]████████████████████[RESET] 85%

input=$(cat)

model=$(printf '%s' "$input" | jq -r '.model.display_name // empty')
dir=$(printf '%s' "$input" | jq -r '.workspace.current_dir // empty')
used=$(printf '%s' "$input" | jq -r '.context_window.used_percentage // empty')
cost=$(printf '%s' "$input" | jq -r '.session_cost_usd // .cost_usd // .session.cost_usd // .total_cost_usd // empty')

branch=''
[ -n "$dir" ] && branch=$(git -C "$dir" branch --show-current 2>/dev/null || true)

short_model=$(printf '%s' "$model" | sed 's/^[Cc]laude[- ]//; s/-[0-9]\\{8\\}$//')

RED=$(printf '\\033[31m')
RESET=$(printf '\\033[0m')

skull=''
used_int=''
bar_segment=''
if [ -n "$used" ]; then
  used_int=$(printf '%.0f' "$used")
  filled=$(( used_int * 20 / 100 ))
  empty=$(( 20 - filled ))
  bar=''
  [ "$filled" -gt 0 ] && bar=$(printf '%*s' "$filled" '' | tr ' ' '█')
  [ "$empty"  -gt 0 ] && bar="\${bar}$(printf '%*s' "$empty" '' | tr ' ' '░')"
  [ "$used_int" -ge 75 ] && skull='☠️ '
  if [ "$used_int" -gt 80 ]; then
    bar_segment="\${skull}\${RED}\${bar}\${RESET} \${used_int}%"
  else
    bar_segment="\${skull}\${bar} \${used_int}%"
  fi
fi

out=''
append() { [ -n "$1" ] && out="\${out:+$out | }$1"; }

append "$short_model"
append "$branch"

if [ -n "$cost" ] && [ "$cost" != 'null' ] && [ "$cost" != '0' ] && [ "$cost" != '0.0' ]; then
  append "$(printf '$%.4f' "$cost")"
fi

[ -n "$bar_segment" ] && append "$bar_segment"

printf '%s\\n' "$out"
`;
}

export async function installGlobalClaudeCodeStatusLine(
  homeDir: string,
  force: boolean,
  log: ReturnType<typeof createLogger>,
  json: boolean,
): Promise<{ scriptStatus: "created" | "updated" | "skipped"; settingsStatus: "created" | "updated" | "skipped" }> {
  const pathMod = await import("node:path");
  const fsp = await import("node:fs/promises");

  const scriptPath = pathMod.join(homeDir, ".claude", "statusline.sh");
  await ensureDir(pathMod.join(homeDir, ".claude"));
  const scriptContent = createStatuslineScript();
  const scriptStatus = await writeTextFile(scriptPath, scriptContent, { overwrite: force });
  if (scriptStatus === "created" || scriptStatus === "updated") {
    await fsp.chmod(scriptPath, 0o755);
  }
  if (!json) {
    log.info(
      scriptStatus === "created"
        ? "  ~/.claude/statusline.sh (created)"
        : scriptStatus === "updated"
          ? "  ~/.claude/statusline.sh (updated)"
          : "  ~/.claude/statusline.sh (exists, skipped)",
    );
  }

  const settingsPath = pathMod.join(homeDir, ".claude", "settings.json");
  const lhStatusLine = {
    type: "command",
    command: `bash ${pathMod.join(homeDir, ".claude", "statusline.sh")}`,
  };

  const existing = await readJsonFile<Record<string, unknown>>(settingsPath);
  let settingsStatus: "created" | "updated" | "skipped";

  if (existing === null) {
    await writeJsonFile(settingsPath, { statusLine: lhStatusLine }, { overwrite: true });
    settingsStatus = "created";
  } else if (!("statusLine" in existing) || force) {
    const merged = { ...existing, statusLine: lhStatusLine };
    await writeJsonFile(settingsPath, merged, { overwrite: true });
    settingsStatus = "updated";
  } else {
    settingsStatus = "skipped";
  }

  if (!json) {
    log.info(
      settingsStatus === "created"
        ? "  ~/.claude/settings.json statusLine (created)"
        : settingsStatus === "updated"
          ? "  ~/.claude/settings.json statusLine (updated)"
          : "  ~/.claude/settings.json statusLine (exists, skipped)",
    );
  }

  return { scriptStatus, settingsStatus };
}