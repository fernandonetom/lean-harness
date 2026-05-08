import { dirExists, fileExists, listDirs, listFiles } from "../core/fs.js";
import { loadHarnessConfig } from "../core/config.js";
import { listFeatures } from "../core/features.js";
import { loadState } from "../core/state.js";
import {
  harnessPath,
  featuresDir,
  claudePath,
  opencodePath,
  opencodeConfigPath,
  opencodeAgentsDir,
  opencodePluginsDir,
  opencodeGuardrailPluginPath,
  opencodePluginPath,
  policiesDir as policiesDirPath_,
  HARNESS_DIR,
} from "../core/paths.js";
import { createLogger, printJson } from "../core/logger.js";
import type { DiscoveryArtifactSummary, TaskContextArtifactSummary, PlanningArtifactSummary, HostSupportSummary, BuildArtifactSummary, CheckArtifactSummary, CaveBusArtifactSummary, OpenCodeIntegrationSummary, OpenCodePluginSummary } from "../core/types.js";
import { readTextFile } from "../core/fs.js";
import { parseTasksMarkdown } from "../context/task-context.js";
import { isRunnableTaskStatus, findNextRunnableTask, normalizeTaskStatus } from "../build/task-status.js";
import { listAgentHosts, DEFAULT_AGENT_HOST } from "../adapters/registry.js";
import type { AgentHost } from "../adapters/types.js";
import path from "node:path";

export interface StatusOptions {
  cwd: string;
  json?: boolean | undefined;
}

export async function runStatusCommand(options: StatusOptions): Promise<void> {
  const { cwd, json = false } = options;
  const log = createLogger({ json });

  const harnessExists = await dirExists(harnessPath(cwd));
  const config = await loadHarnessConfig(cwd);
  const state = await loadState(cwd);

  const allFeatures = await listFeatures(cwd, { includeArchived: true });
  const activeFeatures = allFeatures.filter((f) => f.status !== "archived");
  const archivedFeatures = allFeatures.filter((f) => f.status === "archived");

  const claudeExists = await dirExists(claudePath(cwd));
  const skillsDir = claudePath(cwd, "skills");
  const agentsDir = claudePath(cwd, "agents");
  const skillsExist = await dirExists(skillsDir);
  const agentsExist = await dirExists(agentsDir);
  const skills = skillsExist ? await listDirs(skillsDir) : [];
  const agents = agentsExist ? await listFiles(agentsDir) : [];
  const hooksConfigured = await fileExists(claudePath(cwd, "hooks", "leanharness-hooks.json"));

  const policiesDirPath = harnessPath(cwd, "policies");
  const policiesExist = await dirExists(policiesDirPath);
  const policyFiles = policiesExist ? await listFiles(policiesDirPath) : [];

  const ocConfigExists = await fileExists(opencodeConfigPath(cwd));
  const ocDirExists = await dirExists(opencodePath(cwd));
  const ocAgentsDirExists = await dirExists(opencodeAgentsDir(cwd));
  const ocAgents = {
    scout: await fileExists(opencodePath(cwd, "agents", "lh-scout.md")),
    builder: await fileExists(opencodePath(cwd, "agents", "lh-builder.md")),
    reviewer: await fileExists(opencodePath(cwd, "agents", "lh-reviewer.md")),
    verifier: await fileExists(opencodePath(cwd, "agents", "lh-verifier.md")),
    compressor: await fileExists(opencodePath(cwd, "agents", "lh-compressor.md")),
  };
  const ocPluginsDirExists = await dirExists(opencodePluginsDir(cwd));
  const ocGuardrailExists = await fileExists(opencodeGuardrailPluginPath(cwd));
  const ocSharedExists = await fileExists(opencodePluginPath(cwd, "shared.js"));
  const ocPolicyExists = await fileExists(harnessPath(cwd, "policies", "opencode.yml"));
  const ocPluginInstalled = ocGuardrailExists;
  const ocAgentCount = Object.values(ocAgents).filter(Boolean).length;
  const ocPluginSummary: OpenCodePluginSummary = {
    pluginsDirExists: ocPluginsDirExists,
    guardrailPluginExists: ocGuardrailExists,
    sharedHelperExists: ocSharedExists,
    policyExists: ocPolicyExists,
  };
  const opencode: OpenCodeIntegrationSummary = {
    configExists: ocConfigExists,
    directoryExists: ocDirExists,
    agentsDirExists: ocAgentsDirExists,
    agents: ocAgents,
    pluginInstalled: ocPluginInstalled,
    plugin: ocPluginSummary,
  };

  const activeEntry = state.activeFeature
    ? allFeatures.find((f) => f.path === state.activeFeature)
    : undefined;

  let discoveryInfo: DiscoveryArtifactSummary | undefined;
  let planningInfo: PlanningArtifactSummary | undefined;
  let taskContextInfo: TaskContextArtifactSummary | undefined;
  let buildInfo: BuildArtifactSummary | undefined;
  let checkInfo: CheckArtifactSummary | undefined;
  let cavebusInfo: CaveBusArtifactSummary | undefined;
  if (activeEntry) {
    const featureDir = path.join(featuresDir(cwd), activeEntry.path);
    const discExists = await fileExists(path.join(featureDir, "discovery.md"));
    const boundExists = await fileExists(path.join(featureDir, "boundary.json"));
    discoveryInfo = {
      discoveryExists: discExists,
      boundaryExists: boundExists,
    };

    const planEx = await fileExists(path.join(featureDir, "plan.md"));
    const tasksEx = await fileExists(path.join(featureDir, "tasks.md"));
    planningInfo = { planExists: planEx, tasksExists: tasksEx };

    const taskCtxDir = path.join(featureDir, "task-context");
    const taskCtxDirExists = await dirExists(taskCtxDir);
    if (taskCtxDirExists) {
      const taskCtxFiles = await listFiles(taskCtxDir);
      const compiledContexts = taskCtxFiles.filter((f) => f.endsWith(".md")).length;
      const runResults = taskCtxFiles.filter((f) => f.includes("-result.")).length;
      taskContextInfo = { taskContextDirExists: true, compiledContexts, runResults };
    }

    const checksEx = await fileExists(path.join(featureDir, "checks.md"));
    const resultEx = await fileExists(path.join(featureDir, "result.md"));
    checkInfo = { checksExists: checksEx, resultExists: resultEx };
    if (checksEx) {
      const checksContent = await readTextFile(path.join(featureDir, "checks.md"));
      if (checksContent) {
        const vm = /^##\s+Verdict\s*\n\s*\n\s*(\S+)/m.exec(checksContent);
        if (vm) checkInfo.verdict = vm[1] as CheckArtifactSummary["verdict"];
      }
    }

    const summariesDir = path.join(featureDir, "task-summaries");
    const summariesDirExists = await dirExists(summariesDir);
    const taskSummaryFiles = summariesDirExists ? await listFiles(summariesDir) : [];
    const taskSummaries = taskSummaryFiles.filter((f) => f.endsWith(".md")).length;

    if (tasksEx) {
      const tasksContent = await readTextFile(path.join(featureDir, "tasks.md"));
      if (tasksContent) {
        const parsed = parseTasksMarkdown(tasksContent);
        const runnableTasks = parsed.filter((t) => isRunnableTaskStatus(t.status)).length;
        const completedTasks = parsed.filter((t) => normalizeTaskStatus(t.status) === "done" || normalizeTaskStatus(t.status) === "verified").length;
        const next = findNextRunnableTask(parsed);
        buildInfo = {
          taskSummaries,
          compiledContexts: taskContextInfo?.compiledContexts ?? 0,
          runResults: taskContextInfo?.runResults ?? 0,
          nextRunnableTask: next?.id,
          runnableTasks,
          completedTasks,
        };
      }
    }

    const cavebusLogPath = path.join(featureDir, "cavebus.log");
    const cavebusExists = await fileExists(cavebusLogPath);
    cavebusInfo = { exists: cavebusExists, messageCount: 0 };
    if (cavebusExists) {
      try {
        const cbContent = await readTextFile(cavebusLogPath);
        if (cbContent) {
          const { parseCaveBusLog, validateCaveBusLog } = await import("../cavebus/validate.js");
          const msgs = parseCaveBusLog(cbContent);
          const val = validateCaveBusLog(cbContent);
          cavebusInfo.messageCount = msgs.length;
          cavebusInfo.validationOk = val.ok;
          if (msgs.length > 0) {
            cavebusInfo.lastType = msgs[msgs.length - 1]!.type;
          }
        }
      } catch {
        cavebusInfo.warnings = ["Failed to parse cavebus.log"];
      }
    }
  }

  const nextAction = !harnessExists
    ? "Run `lh init` to initialize."
    : !config.exists
      ? "Run `lh init` to create missing config."
      : activeFeatures.length === 0
        ? 'Run `lh spec "<request>"` to start a feature.'
        : activeEntry
          ? determineStatusNextAction(activeEntry.id, activeEntry.status, discoveryInfo, planningInfo)
          : `Run \`lh show ${activeFeatures[0]!.id}\` to review a feature.`;

  const hostSupport: HostSupportSummary = {
    defaultHost: DEFAULT_AGENT_HOST,
    supportedHosts: listAgentHosts(),
  };

  if (json) {
    printJson({
      harness: {
        exists: harnessExists,
        configExists: config.exists,
        version: state.version,
      },
      features: allFeatures.map((f) => ({
        ...f,
        active: state.activeFeature === f.path,
      })),
      activeFeature: state.activeFeature,
      featureCount: activeFeatures.length,
      archivedCount: archivedFeatures.length,
      discovery: discoveryInfo ?? null,
      planning: planningInfo ?? null,
      taskContext: taskContextInfo ?? null,
      build: buildInfo ?? null,
      check: checkInfo ?? null,
      cavebus: cavebusInfo ? {
        exists: cavebusInfo.exists,
        messages: cavebusInfo.messageCount,
        validationOk: cavebusInfo.validationOk ?? null,
        lastType: cavebusInfo.lastType ?? null,
      } : null,
      hosts: {
        default: hostSupport.defaultHost,
        supported: hostSupport.supportedHosts,
      },
      claude: {
        exists: claudeExists,
        skillCount: skills.length,
        agentCount: agents.length,
      },
      opencode,
      hooks: {
        configured: hooksConfigured,
      },
      policies: {
        exists: policiesExist,
        files: policyFiles,
      },
      nextAction,
    });
    return;
  }

  log.info("LeanHarness status");
  log.info("");

  if (!harnessExists) {
    log.warn(`${HARNESS_DIR}/ not found. Run \`lh init\` to initialize.`);
    return;
  }

  log.info(`Project:          ${cwd}`);
  log.info(`Harness:          ${config.exists ? "configured (v" + state.version + ")" : "config missing"}`);
  log.info(`Active feature:   ${state.activeFeature ?? "none"}`);
  log.info(`Features:         ${activeFeatures.length} active, ${archivedFeatures.length} archived`);

  if (activeEntry && discoveryInfo) {
    log.info("");
    log.info("Active feature artifacts:");
    log.info(`  spec.md:         present`);
    log.info(`  discovery.md:    ${discoveryInfo.discoveryExists ? "present" : "missing"}`);
    log.info(`  boundary.json:   ${discoveryInfo.boundaryExists ? "present" : "missing"}`);
    if (planningInfo) {
      log.info(`  plan.md:         ${planningInfo.planExists ? "present" : "missing"}`);
      log.info(`  tasks.md:        ${planningInfo.tasksExists ? "present" : "missing"}`);
    }
    if (taskContextInfo) {
      log.info("");
      log.info("Task context:");
      log.info(`  compiled:        ${taskContextInfo.compiledContexts}`);
      log.info(`  run results:     ${taskContextInfo.runResults}`);
    }
    if (buildInfo) {
      log.info("");
      log.info("Build:");
      log.info(`  task summaries:  ${buildInfo.taskSummaries}`);
      log.info(`  runnable tasks:  ${buildInfo.runnableTasks}`);
      log.info(`  completed tasks: ${buildInfo.completedTasks}`);
      if (buildInfo.nextRunnableTask) {
        log.info(`  next runnable:   ${buildInfo.nextRunnableTask}`);
      }
    }
    if (checkInfo) {
      log.info("");
      log.info("Check:");
      log.info(`  checks.md:       ${checkInfo.checksExists ? "present" : "missing"}`);
      log.info(`  result.md:       ${checkInfo.resultExists ? "present" : "missing"}`);
      if (checkInfo.verdict) {
        log.info(`  last verdict:    ${checkInfo.verdict}`);
      }
    }
    if (cavebusInfo) {
      log.info("");
      log.info("CaveBus:");
      log.info(`  cavebus.log:     ${cavebusInfo.exists ? "present" : "missing"}`);
      if (cavebusInfo.exists) {
        log.info(`  messages:        ${cavebusInfo.messageCount}`);
        if (cavebusInfo.validationOk !== undefined) {
          log.info(`  validation:      ${cavebusInfo.validationOk ? "ok" : "issues found"}`);
        }
        if (cavebusInfo.lastType) {
          log.info(`  last type:       ${cavebusInfo.lastType}`);
        }
      }
    }
  }

  log.info("");

  log.info(
    `Claude integration: ${claudeExists ? "present" : "not found"}`,
  );
  if (claudeExists) {
    log.info(`  Skills:         ${skills.length > 0 ? skills.join(", ") : "none"}`);
    log.info(`  Agents:         ${agents.length > 0 ? agents.map((a) => a.replace(/\.md$/, "")).join(", ") : "none"}`);
  }
  log.info(`Hooks:            ${hooksConfigured ? "configured" : "not configured"}`);
  log.info(`Policies:         ${policyFiles.length > 0 ? policyFiles.join(", ") : "none"}`);
  log.info("");

  log.info("OpenCode integration:");
  if (ocConfigExists || ocDirExists) {
    log.info(`  config:         ${ocConfigExists ? "present" : "missing"}`);
    log.info(`  agents:         ${ocAgentCount}/5`);
    log.info(`  plugin:         ${ocPluginInstalled ? "installed" : "not installed"}`);
    log.info(`  policy:         ${ocPolicyExists ? "present" : "missing"}`);
    if (!ocPluginInstalled) {
      log.info("  run `lh init --host opencode` to install the guardrail plugin");
    }
  } else {
    log.info("  not installed — run `lh init --host opencode`");
  }
  log.info("");

  log.info("Agent hosts:");
  log.info(`  claude-code:    configured`);
  log.info(`  opencode:       ${ocConfigExists ? "integration pack installed" : "adapter available, integration pack not installed"}`);
  log.info("");

  log.info(`Next action:      ${nextAction}`);
}

function determineStatusNextAction(
  id: string,
  status: string,
  discovery: DiscoveryArtifactSummary | undefined,
  planning?: PlanningArtifactSummary | undefined,
): string {
  if (status === "draft" || status === "specified") {
    if (discovery && !discovery.discoveryExists) {
      return `Run \`lh discover ${id}\` to start on-demand discovery.`;
    }
    if (!discovery) {
      return `Run \`lh discover ${id}\` to start on-demand discovery.`;
    }
  }
  if (discovery?.discoveryExists && discovery?.boundaryExists) {
    if (!planning?.planExists) {
      return `Run \`lh plan ${id}\` to create plan and tasks.`;
    }
    if (planning?.tasksExists) {
      return `Run \`lh compile-task ${id} T01\` to compile bounded task context.`;
    }
  }
  if (planning?.planExists && planning?.tasksExists) {
    if (status === "done") {
      return `Feature done. Run \`lh archive ${id}\` to close it.`;
    }
    if (status === "needs-fix" || status === "blocked") {
      return `Run \`lh check ${id} --force\` after fixing issues.`;
    }
    return `Run \`lh build ${id} --dry-run\` to preview, then \`lh build ${id}\` to execute, then \`lh check ${id}\`.`;
  }
  return `Run \`lh show ${id}\` for details.`;
}
