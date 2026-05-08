import path from "node:path";
import type { AgentHost } from "../adapters/types.js";
import type { BuildTaskResult } from "./task-runner.js";
import { runBuildTask } from "./task-runner.js";
import { normalizeAgentHost } from "../adapters/registry.js";
import { requireFeature } from "../core/features.js";
import { CLIError } from "../core/errors.js";
import { featuresDir } from "../core/paths.js";
import { fileExists, readTextFile, readJsonFile, ensureDir, writeTextFile } from "../core/fs.js";
import { loadState, saveState, upsertFeatureEntry, setActiveFeature, nowIso } from "../core/state.js";
import { parseTasksMarkdown } from "../context/task-context.js";
import { selectTasks, updateTaskStatusInMarkdown, normalizeTaskStatus } from "./task-status.js";
import type { BuildTaskStatus } from "./task-status.js";
import { checkRiskGates, loadApprovals, saveApproval, enforceRiskGates } from "../core/risk-gates.js";
import type { ResolvedConfig } from "../core/resolved-config.js";

export interface RunBuildOptions {
  root: string;
  featureRef: string;
  taskId?: string | undefined;
  host?: AgentHost | undefined;
  dryRun?: boolean | undefined;
  all?: boolean | undefined;
  maxTasks?: number | undefined;
  maxBytes?: number | undefined;

  allowedTools?: string[] | undefined;
  permissionMode?: string | undefined;
  outputFormat?: "text" | "json" | "stream-json" | undefined;
  claudeCommand?: string | undefined;

  opencodeCommand?: string | undefined;
  opencodeAgent?: string | undefined;
  opencodeFormat?: "default" | "json" | undefined;
  model?: string | undefined;
  attach?: string | undefined;
  session?: string | undefined;

  approveRisk?: string[] | undefined;
  strict?: boolean | undefined;
  resolvedConfig?: ResolvedConfig | undefined;
}

export interface BuildResult {
  featureId: string;
  featureTitle: string;
  featureDir: string;
  host: AgentHost;
  dryRun: boolean;
  attempted: number;
  results: BuildTaskResult[];
  warnings: string[];
  nextAction: string;
}

export async function runBuild(options: RunBuildOptions): Promise<BuildResult> {
  const { root, featureRef, dryRun = false } = options;
  const host: AgentHost = options.host ?? "claude-code";
  const warnings: string[] = [];

  const entry = await requireFeature(root, featureRef);

  if (entry.status === "archived") {
    throw new CLIError(
      `Feature ${entry.id} is archived. Cannot build archived features.`,
    );
  }

  const featureDir = path.join(featuresDir(root), entry.path);

  const specPath = path.join(featureDir, "spec.md");
  if (!(await fileExists(specPath))) {
    throw new CLIError(
      `Cannot build because spec.md is missing for ${entry.path}.\n` +
      `Run: lh spec "<request>" --id ${entry.id}`,
    );
  }

  const tasksPath = path.join(featureDir, "tasks.md");
  const tasksContent = await readTextFile(tasksPath);
  if (tasksContent === null) {
    throw new CLIError(
      `Cannot build because tasks.md is missing for ${entry.path}.\n` +
      `Run: lh plan ${entry.id}`,
    );
  }

  const boundaryPath = path.join(featureDir, "boundary.json");
  const hasBoundary = await fileExists(boundaryPath);
  if (!hasBoundary && !dryRun) {
    throw new CLIError(
      `Cannot build because boundary.json is missing for ${entry.path}.\n` +
      `Run: lh discover ${entry.id}\n` +
      `Then: lh plan ${entry.id} --force`,
    );
  }
  if (!hasBoundary && dryRun) {
    warnings.push("boundary.json is missing. Discovery has not run. Dry run will proceed but real build requires boundary.");
  }

  const planPath = path.join(featureDir, "plan.md");
  if (!(await fileExists(planPath))) {
    warnings.push("plan.md is missing. Tasks are the executable unit; proceeding with tasks.md.");
  }

  const parsedTasks = parseTasksMarkdown(tasksContent);

  // --- Risk gate enforcement ---
  const configGates = options.resolvedConfig?.risk_gates.require_approval ?? [];
  if (configGates.length > 0) {
    const boundaryData = await readJsonFile<{ riskGates?: Array<{ name: string }> }>(boundaryPath);
    const boundaryRiskNames = (boundaryData?.riskGates ?? []).map((g) => g.name);

    const taskFiles = parsedTasks.flatMap((t) => t.expectedFiles ?? []);
    const taskNotes = parsedTasks.flatMap((t) => {
      const notes: string[] = [];
      if (t.title) notes.push(t.title);
      for (const ac of t.acceptanceCriteria ?? []) notes.push(ac);
      return notes;
    });

    const matches = checkRiskGates(configGates, taskFiles, taskNotes, boundaryRiskNames);

    if (matches.length > 0) {
      const approvals = await loadApprovals(root, entry.path);

      const cliApprovedGates = options.approveRisk ?? [];
      for (const gate of cliApprovedGates) {
        if (!approvals.some((a) => a.gate === gate)) {
          await saveApproval(root, entry.path, gate);
          approvals.push({ gate, approvedAt: new Date().toISOString(), approvedBy: "cli" });
        }
      }

      const enforcement = enforceRiskGates(matches, approvals, options.strict ?? false);
      warnings.push(...enforcement.warnings);

      if (!enforcement.allClear) {
        const gateList = enforcement.blocked.join(", ");
        throw new CLIError(
          `Build blocked by unapproved risk gates: ${gateList}\n` +
          `Use --approve-risk <gate> to approve, or remove --strict to warn instead of block.`,
        );
      }
    }
  }

  const selection = selectTasks(parsedTasks, {
    taskId: options.taskId,
    all: options.all,
    maxTasks: options.maxTasks,
  });
  warnings.push(...selection.warnings);

  if (selection.tasks.length === 0) {
    const nextAction = "No runnable tasks. Runnable statuses: planned, needs-fix.\n" +
      "When check is implemented, run `lh check " + entry.id + "`.";

    await appendBuildEvent(featureDir, entry.id, entry.path, host, dryRun, 0, []);

    return {
      featureId: entry.id,
      featureTitle: entry.title,
      featureDir: `.lh/features/${entry.path}`,
      host,
      dryRun,
      attempted: 0,
      results: [],
      warnings,
      nextAction,
    };
  }

  const results: BuildTaskResult[] = [];

  for (const task of selection.tasks) {
    if (!dryRun) {
      const updatedTasks = updateTaskStatusInMarkdown(
        await readTextFile(tasksPath) ?? tasksContent,
        task.id,
        "building" as BuildTaskStatus,
      );
      await writeTextFile(tasksPath, updatedTasks, { overwrite: true });
    }

    const result = await runBuildTask({
      root,
      featureRef: entry.id,
      task,
      host,
      dryRun,
      maxBytes: options.maxBytes,
      allowedTools: options.allowedTools,
      permissionMode: options.permissionMode,
      outputFormat: options.outputFormat,
      claudeCommand: options.claudeCommand,
      opencodeCommand: options.opencodeCommand,
      opencodeAgent: options.opencodeAgent,
      opencodeFormat: options.opencodeFormat,
      model: options.model,
      attach: options.attach,
      session: options.session,
    });

    results.push(result);

    if (!dryRun) {
      const newStatus: BuildTaskStatus = result.status === "done" ? "done" : "needs-fix";
      const current = await readTextFile(tasksPath) ?? tasksContent;
      const updated = updateTaskStatusInMarkdown(current, task.id, newStatus);
      await writeTextFile(tasksPath, updated, { overwrite: true });
    }

    if (result.status === "needs-fix" || result.status === "blocked") {
      break;
    }
  }

  if (!dryRun && results.length > 0) {
    const state = await loadState(root);
    const featureEntry = state.features.find((f) => f.id === entry.id);
    if (featureEntry && featureEntry.status !== "archived") {
      featureEntry.status = "building";
      featureEntry.updatedAt = nowIso();
      upsertFeatureEntry(state, featureEntry);
      setActiveFeature(state, featureEntry.path);
      await saveState(root, state);
    }
  }

  const statuses = results.map((r) => r.status);
  await appendBuildEvent(featureDir, entry.id, entry.path, host, dryRun, results.length, statuses);

  const lastResult = results[results.length - 1];
  let nextAction: string;
  if (dryRun) {
    nextAction = `Run \`lh build ${entry.id} --host ${host}\` to execute for real.`;
  } else if (lastResult && (lastResult.status === "needs-fix" || lastResult.status === "blocked")) {
    nextAction = lastResult.nextAction;
  } else {
    nextAction = `Review task summaries, inspect changes, then run future \`lh check ${entry.id}\` once implemented.\nFor now, review task summaries and run project verification commands manually.`;
  }

  return {
    featureId: entry.id,
    featureTitle: entry.title,
    featureDir: `.lh/features/${entry.path}`,
    host,
    dryRun,
    attempted: results.length,
    results,
    warnings,
    nextAction,
  };
}

async function appendBuildEvent(
  featureDir: string,
  featureId: string,
  featurePath: string,
  host: AgentHost,
  dryRun: boolean,
  attempted: number,
  statuses: string[],
): Promise<void> {
  const eventsPath = path.join(featureDir, "events.jsonl");
  await ensureDir(path.dirname(eventsPath));
  const event = {
    timestamp: nowIso(),
    source: "lh-cli",
    event: "feature.build",
    featureId,
    feature: featurePath,
    host,
    dryRun,
    attempted,
    statuses,
  };
  const line = JSON.stringify(event) + "\n";
  const existing = await readTextFile(eventsPath);
  const content = existing !== null ? existing + line : line;
  await writeTextFile(eventsPath, content, { overwrite: true });
}
