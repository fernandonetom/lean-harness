import { ensureDir, writeTextFile, writeJsonFile, readJsonFile } from "../core/fs.js";
import { claudePath, claudeSettingsPath, claudeSettingsLocalPath, harnessPath, policiesDir } from "../core/paths.js";
import { createLogger } from "../core/logger.js";

export interface ClaudePackResult {
  directories: Record<string, "created" | "existed">;
  files: Record<string, "created" | "updated" | "skipped">;
  warnings: string[];
}

function printClaudeCodeInstallInstructions(log: ReturnType<typeof createLogger>, json: boolean): void {
  if (json) return;
  log.info("");
  log.info("Claude Code plugin — one-time setup in your Claude Code session:");
  log.info("  /plugin marketplace add fernandonetom/lean-harness");
  log.info("  /plugin install lh@lean-harness");
  log.info("Collaborators on this repo are auto-prompted via .claude/settings.json.");
}

export async function installClaudeCodePack(
  cwd: string,
  force: boolean,
  log: ReturnType<typeof createLogger>,
  json: boolean,
  noPin: boolean = false,
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

  // --- settings.json (merge logic) ---
  const settingsResult = await installClaudeCodeSettings(cwd, force, log, json);
  result.files[".claude/settings.json"] = settingsResult.status;
  result.warnings.push(...settingsResult.warnings);

  // --- settings.local.json (user-specific: statusLine with home dir path) ---
  const settingsLocalResult = await installClaudeCodeSettingsLocal(cwd, force, log, json);
  result.files[".claude/settings.local.json"] = settingsLocalResult.status;
  result.warnings.push(...settingsLocalResult.warnings);

  // --- claude-code policy ---
  const policyPath = harnessPath(cwd, "policies", "claude-code.yml");
  await ensureDir(policiesDir(cwd));
  const policyStatus = await writeTextFile(policyPath, createClaudeCodePolicyYaml(), { overwrite: force });
  result.files[".lh/policies/claude-code.yml"] = policyStatus;
  if (!json) {
    log.info(policyStatus === "created" ? "  .lh/policies/claude-code.yml (created)" : policyStatus === "updated" ? "  .lh/policies/claude-code.yml (updated)" : "  .lh/policies/claude-code.yml (exists, skipped)");
  }

  // --- plugin installation instructions ---
  if (!noPin) {
    printClaudeCodeInstallInstructions(log, json);
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

  // Force push is now configurable via command_enforcement.force_push (v1.4.0+).
  // Remove legacy hardcoded deny entries so the hook can enforce the configured mode.
  const legacyDenyEntries = new Set([
    "Bash(git push --force*)",
    "Bash(git push -f *)",
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
    } else if (key === "deny") {
      mergedPerms[key] = merged.filter((e) => !legacyDenyEntries.has(e));
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

  // --- extraKnownMarketplaces ---
  const existingMarketplaces = (result["extraKnownMarketplaces"] ?? {}) as Record<string, unknown>;
  const lhMarketplaces = (lhSettings["extraKnownMarketplaces"] ?? {}) as Record<string, unknown>;
  const mergedMarketplaces = { ...existingMarketplaces };
  for (const [name, source] of Object.entries(lhMarketplaces)) {
    if (!(name in mergedMarketplaces) || force) {
      mergedMarketplaces[name] = source;
    }
  }
  if (Object.keys(mergedMarketplaces).length > 0) {
    result["extraKnownMarketplaces"] = mergedMarketplaces;
  }

  // --- enabledPlugins ---
  const existingPlugins = (result["enabledPlugins"] ?? {}) as Record<string, unknown>;
  const lhPlugins = (lhSettings["enabledPlugins"] ?? {}) as Record<string, unknown>;
  const mergedPlugins = { ...existingPlugins };
  for (const [name, enabled] of Object.entries(lhPlugins)) {
    if (!(name in mergedPlugins) || force) {
      mergedPlugins[name] = enabled;
    }
  }
  if (Object.keys(mergedPlugins).length > 0) {
    result["enabledPlugins"] = mergedPlugins;
  }

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
    extraKnownMarketplaces: {
      "lean-harness": {
        source: { source: "github", repo: "fernandonetom/lean-harness" },
      },
    },
    enabledPlugins: {
      "lh@lean-harness": true,
    },
  };
}

// ---------------------------------------------------------------------------
// Policy YAML
// ---------------------------------------------------------------------------

function createClaudeCodePolicyYaml(): string {
  return `version: 0.2
name: claude-code-guardrails
purpose: enforce LeanHarness guardrails for Claude Code sessions

hooks:
  source: lh@lean-harness Claude Code plugin
  config: \${CLAUDE_PLUGIN_ROOT}/hooks/hooks.json
  scripts: \${CLAUDE_PLUGIN_ROOT}/hooks/*.js
  settings: .claude/settings.json (enabledPlugins."lh@lean-harness")
  mode: plugin-distributed
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
    script: \${CLAUDE_PLUGIN_ROOT}/hooks/pre-tool-use.js
    timeout: 10
  PostToolUse:
    matcher: "Bash|Edit|Write|MultiEdit"
    script: \${CLAUDE_PLUGIN_ROOT}/hooks/post-tool-use.js
    timeout: 10
  PostToolUseFailure:
    matcher: "Bash|Edit|Write|MultiEdit"
    script: \${CLAUDE_PLUGIN_ROOT}/hooks/post-tool-use.js
    timeout: 10
  Stop:
    script: \${CLAUDE_PLUGIN_ROOT}/hooks/session-end.js
    timeout: 10
  SubagentStop:
    script: \${CLAUDE_PLUGIN_ROOT}/hooks/session-end.js
    timeout: 10
  SessionEnd:
    script: \${CLAUDE_PLUGIN_ROOT}/hooks/session-end.js
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
  source: lh@lean-harness Claude Code plugin
  names:
    - lh-scout
    - lh-builder
    - lh-builder-fix
    - lh-reviewer
    - lh-verifier
    - lh-compressor

skills:
  source: lh@lean-harness Claude Code plugin
  names:
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