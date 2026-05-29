import { dirExists, fileExists, listDirs, ensureDir } from "../core/fs.js";
import { loadHarnessConfig, createDefaultState, createDefaultConfigYaml } from "../core/config.js";
import { loadState } from "../core/state.js";
import { isValidFeatureId, parseFeatureNumber } from "../core/features.js";
import { harnessPath, claudePath, resolveProjectPath, statePath, templatesDir, policiesDir, featuresDir, opencodeConfigPath, opencodePath, opencodeAgentsDir, opencodePluginsDir, opencodeGuardrailPluginPath, opencodePluginPath } from "../core/paths.js";
import { createLogger, printJson } from "../core/logger.js";
import { detectAllAgentHosts } from "../adapters/registry.js";
import type { DoctorCheck } from "../core/types.js";
import type { AgentDetection } from "../adapters/types.js";

export interface DoctorOptions {
  cwd: string;
  json?: boolean | undefined;
  fix?: boolean | undefined;
}

interface DoctorFix {
  name: string;
  action: string;
  success: boolean;
}

interface DoctorResult {
  checks: DoctorCheck[];
  agentHosts: AgentDetection[];
  passed: number;
  warned: number;
  failed: number;
  overall: "pass" | "warn" | "fail";
  fixes?: DoctorFix[];
}

export async function runDoctorCommand(options: DoctorOptions): Promise<void> {
  const { cwd, json = false, fix = false } = options;
  const log = createLogger({ json });
  const checks: DoctorCheck[] = [];
  const fixes: DoctorFix[] = [];

  // --- Runtime ---
  const nodeVersion = process.versions["node"] ?? "0";
  const major = parseInt(nodeVersion.split(".")[0] ?? "0", 10);
  checks.push(
    major >= 20
      ? { name: "Node.js version", status: "pass", message: `v${nodeVersion}` }
      : { name: "Node.js version", status: "fail", message: `v${nodeVersion} (requires >=20)` },
  );

  const cwdExists = await dirExists(cwd);
  checks.push(
    cwdExists
      ? { name: "Working directory", status: "pass", message: cwd }
      : { name: "Working directory", status: "fail", message: `${cwd} not found` },
  );

  // --- Harness ---
  const config = await loadHarnessConfig(cwd);
  checks.push(
    config.exists
      ? { name: ".lh/config.yml", status: "pass", message: "present" }
      : { name: ".lh/config.yml", status: "fail", message: "missing — run `lh init`" },
  );

  let stateOk = false;
  try {
    await loadState(cwd);
    stateOk = true;
    checks.push({ name: ".lh/state.json", status: "pass", message: "valid" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const stateFileExists = await fileExists(statePath(cwd));
    checks.push({
      name: ".lh/state.json",
      status: "fail",
      message: stateFileExists ? `parse error: ${msg}` : "missing — run `lh init`",
    });
  }

  checks.push(
    (await dirExists(templatesDir(cwd)))
      ? { name: ".lh/templates/", status: "pass", message: "present" }
      : { name: ".lh/templates/", status: "warn", message: "missing" },
  );

  checks.push(
    (await dirExists(policiesDir(cwd)))
      ? { name: ".lh/policies/", status: "pass", message: "present" }
      : { name: ".lh/policies/", status: "warn", message: "missing" },
  );

  const cavebusPath = harnessPath(cwd, "protocols", "cavebus.yml");
  checks.push(
    (await fileExists(cavebusPath))
      ? { name: ".lh/protocols/cavebus.yml", status: "pass", message: "present" }
      : { name: ".lh/protocols/cavebus.yml", status: "warn", message: "missing" },
  );

  const discoveryTemplate = harnessPath(cwd, "templates", "discovery.md");
  checks.push(
    (await fileExists(discoveryTemplate))
      ? { name: ".lh/templates/discovery.md", status: "pass", message: "present" }
      : { name: ".lh/templates/discovery.md", status: "warn", message: "missing" },
  );

  const boundaryTemplate = harnessPath(cwd, "templates", "boundary.json");
  checks.push(
    (await fileExists(boundaryTemplate))
      ? { name: ".lh/templates/boundary.json", status: "pass", message: "present" }
      : { name: ".lh/templates/boundary.json", status: "warn", message: "missing" },
  );

  const planTemplate = harnessPath(cwd, "templates", "plan.md");
  checks.push(
    (await fileExists(planTemplate))
      ? { name: ".lh/templates/plan.md", status: "pass", message: "present" }
      : { name: ".lh/templates/plan.md", status: "warn", message: "missing — optional, planning engine uses built-in renderer" },
  );

  const tasksTemplate = harnessPath(cwd, "templates", "tasks.md");
  checks.push(
    (await fileExists(tasksTemplate))
      ? { name: ".lh/templates/tasks.md", status: "pass", message: "present" }
      : { name: ".lh/templates/tasks.md", status: "warn", message: "missing — optional, planning engine uses built-in renderer" },
  );

  const taskSummaryTemplate = harnessPath(cwd, "templates", "task-summary.md");
  checks.push(
    (await fileExists(taskSummaryTemplate))
      ? { name: ".lh/templates/task-summary.md", status: "pass", message: "present" }
      : { name: ".lh/templates/task-summary.md", status: "warn", message: "missing — optional, build engine uses built-in renderer" },
  );

  const checksTemplate = harnessPath(cwd, "templates", "checks.md");
  checks.push(
    (await fileExists(checksTemplate))
      ? { name: ".lh/templates/checks.md", status: "pass", message: "present" }
      : { name: ".lh/templates/checks.md", status: "warn", message: "missing — optional, check engine uses built-in renderer" },
  );

  const resultTemplate = harnessPath(cwd, "templates", "result.md");
  checks.push(
    (await fileExists(resultTemplate))
      ? { name: ".lh/templates/result.md", status: "pass", message: "present" }
      : { name: ".lh/templates/result.md", status: "warn", message: "missing — optional, check engine uses built-in renderer" },
  );

  const cavebusTemplates = [
    "discovery.cave", "task.cave", "review.cave", "verify.cave", "error.cave", "summary.cave",
  ];
  for (const tmpl of cavebusTemplates) {
    const tmplPath = harnessPath(cwd, "templates", "cavebus", tmpl);
    const tmplName = `.lh/templates/cavebus/${tmpl}`;
    checks.push(
      (await fileExists(tmplPath))
        ? { name: tmplName, status: "pass", message: "present" }
        : { name: tmplName, status: "warn", message: "missing" },
    );
  }

  const cavebusMessageTemplate = harnessPath(cwd, "templates", "cavebus-message.md");
  checks.push(
    (await fileExists(cavebusMessageTemplate))
      ? { name: ".lh/templates/cavebus-message.md", status: "pass", message: "present" }
      : { name: ".lh/templates/cavebus-message.md", status: "warn", message: "missing" },
  );

  checks.push({ name: "CaveBus tooling", status: "pass", message: "uses Node built-ins only" });

  const riskGatesPolicy = harnessPath(cwd, "policies", "risk-gates.yml");
  checks.push(
    (await fileExists(riskGatesPolicy))
      ? { name: ".lh/policies/risk-gates.yml", status: "pass", message: "present" }
      : { name: ".lh/policies/risk-gates.yml", status: "warn", message: "missing" },
  );

  const boundaryPolicy = harnessPath(cwd, "policies", "boundary.yml");
  checks.push(
    (await fileExists(boundaryPolicy))
      ? { name: ".lh/policies/boundary.yml", status: "pass", message: "present" }
      : { name: ".lh/policies/boundary.yml", status: "warn", message: "missing" },
  );

  // --- Features ---
  const featuresDirPath = featuresDir(cwd);
  const featuresDirExists = await dirExists(featuresDirPath);
  checks.push(
    featuresDirExists
      ? { name: ".lh/features/", status: "pass", message: "present" }
      : { name: ".lh/features/", status: "warn", message: "missing — created by `lh init` or `lh spec`" },
  );

  if (featuresDirExists) {
    const featureDirs = await listDirs(featuresDirPath);
    let parseableCount = 0;
    let unparseable: string[] = [];
    for (const d of featureDirs) {
      const match = /^(F\d{3,})/.exec(d);
      if (match && isValidFeatureId(match[1]!) && parseFeatureNumber(match[1]!) !== null) {
        parseableCount++;
      } else {
        unparseable.push(d);
      }
    }
    if (unparseable.length > 0) {
      checks.push({
        name: "Feature folder IDs",
        status: "warn",
        message: `${unparseable.length} folder(s) with unparseable IDs: ${unparseable.join(", ")}`,
      });
    } else if (featureDirs.length > 0) {
      checks.push({
        name: "Feature folder IDs",
        status: "pass",
        message: `${parseableCount} folder(s), all parseable`,
      });
    }
  }

  // --- Claude Code integration ---
  const settingsPath = claudePath(cwd, "settings.json");
  const settingsExists = await fileExists(settingsPath);
  if (!settingsExists) {
    checks.push({ name: ".claude/settings.json", status: "warn", message: "missing" });
  } else {
    try {
      const { readJsonFile } = await import("../core/fs.js");
      const data = await readJsonFile<Record<string, unknown>>(settingsPath);
      checks.push(
        data !== null
          ? { name: ".claude/settings.json", status: "pass", message: "valid JSON" }
          : { name: ".claude/settings.json", status: "fail", message: "exists but empty" },
      );
    } catch {
      checks.push({ name: ".claude/settings.json", status: "fail", message: "exists but invalid JSON" });
    }
  }

  checks.push(
    (await dirExists(claudePath(cwd, "skills")))
      ? { name: ".claude/skills/", status: "pass", message: "present" }
      : { name: ".claude/skills/", status: "warn", message: "missing" },
  );

  checks.push(
    (await dirExists(claudePath(cwd, "agents")))
      ? { name: ".claude/agents/", status: "pass", message: "present" }
      : { name: ".claude/agents/", status: "warn", message: "missing" },
  );

  const hooksJson = claudePath(cwd, "hooks", "leanharness-hooks.json");
  checks.push(
    (await fileExists(hooksJson))
      ? { name: ".claude/hooks/leanharness-hooks.json", status: "pass", message: "present" }
      : { name: ".claude/hooks/leanharness-hooks.json", status: "warn", message: "missing" },
  );

  // --- OpenCode integration ---
  const ocConfigPath = opencodeConfigPath(cwd);
  const ocConfigExists = await fileExists(ocConfigPath);
  if (ocConfigExists) {
    try {
      const { readJsonFile } = await import("../core/fs.js");
      const data = await readJsonFile<Record<string, unknown>>(ocConfigPath);
      checks.push(
        data !== null
          ? { name: "opencode.json", status: "pass", message: "valid JSON" }
          : { name: "opencode.json", status: "warn", message: "exists but empty" },
      );
    } catch {
      checks.push({ name: "opencode.json", status: "warn", message: "exists but invalid JSON" });
    }
  } else {
    checks.push({ name: "opencode.json", status: "warn", message: "missing — run `lh init --host opencode`" });
  }

  checks.push(
    (await fileExists(opencodePath(cwd, "README.md")))
      ? { name: ".opencode/README.md", status: "pass", message: "present" }
      : { name: ".opencode/README.md", status: "warn", message: "missing" },
  );

  const ocAgentNames = ["lh-scout.md", "lh-builder.md", "lh-reviewer.md", "lh-verifier.md", "lh-compressor.md"];
  for (const agentFile of ocAgentNames) {
    const agentPath = opencodePath(cwd, "agents", agentFile);
    const label = `.opencode/agents/${agentFile}`;
    checks.push(
      (await fileExists(agentPath))
        ? { name: label, status: "pass", message: "present" }
        : { name: label, status: "warn", message: "missing" },
    );
  }

  // --- OpenCode plugin ---
  checks.push(
    (await fileExists(opencodePluginPath(cwd, "shared.js")))
      ? { name: ".opencode/plugins/shared.js", status: "pass", message: "present" }
      : { name: ".opencode/plugins/shared.js", status: "warn", message: "missing — run `lh init --host opencode`" },
  );

  checks.push(
    (await fileExists(opencodeGuardrailPluginPath(cwd)))
      ? { name: ".opencode/plugins/leanharness-guardrails.js", status: "pass", message: "present" }
      : { name: ".opencode/plugins/leanharness-guardrails.js", status: "warn", message: "missing — run `lh init --host opencode`" },
  );

  const ocPolicyPath = harnessPath(cwd, "policies", "opencode.yml");
  checks.push(
    (await fileExists(ocPolicyPath))
      ? { name: ".lh/policies/opencode.yml", status: "pass", message: "present" }
      : { name: ".lh/policies/opencode.yml", status: "warn", message: "missing — run `lh init --host opencode`" },
  );

  // --- Agent hosts ---
  let agentHosts: AgentDetection[] = [];
  try {
    agentHosts = await detectAllAgentHosts(cwd);
  } catch {
    agentHosts = [];
  }

  for (const detection of agentHosts) {
    const label = detection.host === "claude-code" ? "Claude Code CLI" : "OpenCode CLI";
    checks.push(
      detection.available
        ? { name: label, status: "pass", message: `available (${detection.version})` }
        : { name: label, status: "warn", message: `not found${detection.error ? ": " + detection.error : ""}` },
    );
  }

  // --- Hook scripts ---
  const hookScripts = [
    ".lh/scripts/hooks/package.json",
    ".lh/scripts/hooks/pre-tool-use.js",
    ".lh/scripts/hooks/post-tool-use.js",
    ".lh/scripts/hooks/session-end.js",
    ".lh/scripts/hooks/shared.js",
  ];
  for (const script of hookScripts) {
    const p = resolveProjectPath(cwd, script);
    checks.push(
      (await fileExists(p))
        ? { name: script, status: "pass", message: "present" }
        : { name: script, status: "warn", message: "missing" },
    );
  }

  // --- Auto-fix ---
  if (fix) {
    await applyFixes(cwd, checks, fixes);
  }

  // --- Result ---
  const passed = checks.filter((c) => c.status === "pass").length;
  const warned = checks.filter((c) => c.status === "warn").length;
  const failed = checks.filter((c) => c.status === "fail").length;
  const overall: "pass" | "warn" | "fail" =
    failed > 0 ? "fail" : warned > 0 ? "warn" : "pass";

  const result: DoctorResult = { checks, agentHosts, passed, warned, failed, overall };
  if (fixes.length > 0) {
    result.fixes = fixes;
  }

  if (json) {
    printJson(result);
    return;
  }

  log.info("LeanHarness doctor");
  log.info("");

  const sections: Array<{ label: string; names: string[] }> = [
    { label: "Runtime", names: ["Node.js version", "Working directory"] },
    {
      label: "Harness",
      names: [
        ".lh/config.yml",
        ".lh/state.json",
        ".lh/templates/",
        ".lh/policies/",
        ".lh/protocols/cavebus.yml",
        ".lh/templates/discovery.md",
        ".lh/templates/boundary.json",
        ".lh/templates/checks.md",
        ".lh/templates/result.md",
        ".lh/templates/plan.md",
        ".lh/templates/tasks.md",
        ".lh/templates/task-summary.md",
        ".lh/templates/cavebus/discovery.cave",
        ".lh/templates/cavebus/task.cave",
        ".lh/templates/cavebus/review.cave",
        ".lh/templates/cavebus/verify.cave",
        ".lh/templates/cavebus/error.cave",
        ".lh/templates/cavebus/summary.cave",
        ".lh/templates/cavebus-message.md",
        "CaveBus tooling",
        ".lh/policies/risk-gates.yml",
        ".lh/policies/boundary.yml",
      ],
    },
    {
      label: "Features",
      names: [".lh/features/", "Feature folder IDs"],
    },
    {
      label: "Claude Code integration",
      names: [
        ".claude/settings.json",
        ".claude/skills/",
        ".claude/agents/",
        ".claude/hooks/leanharness-hooks.json",
      ],
    },
    {
      label: "OpenCode integration",
      names: [
        "opencode.json",
        ".opencode/README.md",
        ".opencode/agents/lh-scout.md",
        ".opencode/agents/lh-builder.md",
        ".opencode/agents/lh-reviewer.md",
        ".opencode/agents/lh-verifier.md",
        ".opencode/agents/lh-compressor.md",
        ".opencode/plugins/shared.js",
        ".opencode/plugins/leanharness-guardrails.js",
        ".lh/policies/opencode.yml",
      ],
    },
    {
      label: "Agent hosts",
      names: ["Claude Code CLI", "OpenCode CLI"],
    },
    {
      label: "Hooks",
      names: hookScripts,
    },
  ];

  for (const section of sections) {
    log.info(`${section.label}:`);
    for (const name of section.names) {
      const check = checks.find((c) => c.name === name);
      if (!check) continue;
      const icon = check.status === "pass" ? "[ok]" : check.status === "warn" ? "[warn]" : "[FAIL]";
      log.info(`  ${icon} ${check.name}: ${check.message}`);
    }
    log.info("");
  }

  log.info(`Result: ${passed} passed, ${warned} warnings, ${failed} failed — ${overall}`);

  if (fixes.length > 0) {
    log.info("");
    log.info("Fixes applied:");
    for (const f of fixes) {
      const icon = f.success ? "[ok]" : "[FAIL]";
      log.info(`  ${icon} ${f.name}: ${f.action}`);
    }
  } else if (fix && (warned > 0 || failed > 0)) {
    log.info("");
    log.info("No auto-fixable issues found. Some issues require manual intervention.");
  }
}

const FIXABLE_DIRS: Array<{ name: string; pathFn: (cwd: string) => string }> = [
  { name: ".lh/templates/", pathFn: (cwd) => templatesDir(cwd) },
  { name: ".lh/policies/", pathFn: (cwd) => policiesDir(cwd) },
  { name: ".lh/features/", pathFn: (cwd) => featuresDir(cwd) },
];

async function applyFixes(cwd: string, checks: DoctorCheck[], fixes: DoctorFix[]): Promise<void> {
  const fsp = await import("node:fs/promises");

  for (const dir of FIXABLE_DIRS) {
    const check = checks.find((c) => c.name === dir.name);
    if (check && check.status === "warn") {
      try {
        await ensureDir(dir.pathFn(cwd));
        check.status = "pass";
        check.message = "created by --fix";
        fixes.push({ name: dir.name, action: "created directory", success: true });
      } catch {
        fixes.push({ name: dir.name, action: "failed to create directory", success: false });
      }
    }
  }

  const configCheck = checks.find((c) => c.name === ".lh/config.yml");
  if (configCheck && configCheck.status === "fail" && configCheck.message.includes("missing")) {
    try {
      const { configPath } = await import("../core/paths.js");
      const cfgPath = configPath(cwd);
      await ensureDir(harnessPath(cwd));
      await fsp.writeFile(cfgPath, createDefaultConfigYaml(), "utf8");
      configCheck.status = "pass";
      configCheck.message = "created by --fix";
      fixes.push({ name: ".lh/config.yml", action: "created default config", success: true });
    } catch {
      fixes.push({ name: ".lh/config.yml", action: "failed to create config", success: false });
    }
  }

  const stateCheck = checks.find((c) => c.name === ".lh/state.json");
  if (stateCheck && stateCheck.status === "fail") {
    try {
      const sp = statePath(cwd);
      await ensureDir(harnessPath(cwd));
      await fsp.writeFile(sp, JSON.stringify(createDefaultState(), null, 2) + "\n", "utf8");
      stateCheck.status = "pass";
      stateCheck.message = "created/reset by --fix";
      fixes.push({ name: ".lh/state.json", action: "created default state", success: true });
    } catch {
      fixes.push({ name: ".lh/state.json", action: "failed to create state", success: false });
    }
  }

}
