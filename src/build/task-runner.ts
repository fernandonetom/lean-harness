import path from "node:path";
import type { AgentHost, AgentRunResult } from "../adapters/types.js";
import type { ParsedTask } from "../context/task-context.js";
import { compileTaskContext } from "../context/compiler.js";
import { normalizeAgentHost, getAgentAdapter } from "../adapters/registry.js";
import { featuresDir } from "../core/paths.js";
import { requireFeature } from "../core/features.js";
import { ensureDir, writeTextFile, readTextFile } from "../core/fs.js";
import { nowIso } from "../core/state.js";
import { renderTaskSummary, renderTaskCavebusSummary } from "./task-summary.js";

export interface RunBuildTaskOptions {
  root: string;
  workingDir?: string | undefined;
  featureRef: string;
  task: ParsedTask;
  host: AgentHost;
  dryRun?: boolean | undefined;
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
}

export interface BuildTaskResult {
  featureId: string;
  featureTitle: string;
  featureFolderName: string;
  taskId: string;
  taskTitle: string;
  host: AgentHost;
  status: "done" | "needs-fix" | "blocked" | "dry-run";
  contextPath: string;
  resultPath?: string | undefined;
  runResult: AgentRunResult;
  summaryPath?: string | undefined;
  warnings: string[];
  nextAction: string;
}

export async function runBuildTask(options: RunBuildTaskOptions): Promise<BuildTaskResult> {
  const { root, featureRef, task, host, dryRun = false } = options;
  const warnings: string[] = [];
  const startedAt = nowIso();

  const entry = await requireFeature(root, featureRef);

  const featureDir = path.join(featuresDir(root), entry.path);

  const compiled = await compileTaskContext({
    root,
    featureRef,
    taskId: task.id,
    maxBytes: options.maxBytes,
  });

  if (compiled.warnings.length > 0) {
    warnings.push(...compiled.warnings);
  }

  const adapter = getAgentAdapter(host);

  const resultExt = resolveResultExtension(host, options);
  const resultPath = path.join(featureDir, "task-context", `${task.id}${resultExt}`);
  const relResultPath = path.relative(root, resultPath);

  if (dryRun) {
    const result = await adapter.run({
      host,
      root,
      workingDir: options.workingDir,
      prompt: compiled.content,
      featureRef,
      taskId: task.id,
      dryRun: true,
      model: options.model,
      allowedTools: options.allowedTools,
      permissionMode: options.permissionMode,
      outputFormat: options.outputFormat ?? "json",
      claudeCommand: options.claudeCommand,
      opencodeCommand: options.opencodeCommand,
      opencodeAgent: options.opencodeAgent,
      opencodeFormat: options.opencodeFormat,
      attach: options.attach,
      session: options.session,
    });

    await appendEvent(featureDir, {
      timestamp: nowIso(),
      source: "lh-cli",
      event: "task.build.started",
      featureId: entry.id,
      feature: entry.path,
      taskId: task.id,
      host,
      dryRun: true,
    });

    await appendCavebus(featureDir, renderCavebusTaskStart(entry.id, task.id, host, compiled.outputPath, true));

    return {
      featureId: entry.id,
      featureTitle: entry.title,
      featureFolderName: entry.path,
      taskId: task.id,
      taskTitle: task.title,
      host,
      status: "dry-run",
      contextPath: compiled.outputPath,
      runResult: result,
      warnings,
      nextAction: `lh build ${entry.id} ${task.id} --host ${host}`,
    };
  }

  const commandOverride = host === "claude-code" ? options.claudeCommand : options.opencodeCommand;
  const detection = await adapter.detect(root, commandOverride);
  if (!detection.available) {
    const hostLabel = host === "claude-code" ? "Claude Code" : "OpenCode";
    throw new Error(
      `${hostLabel} CLI was not found.\n` +
      `Install or configure ${hostLabel}, or run with --dry-run to inspect the command.\n` +
      (detection.error ? `Detail: ${detection.error}` : ""),
    );
  }

  await appendEvent(featureDir, {
    timestamp: nowIso(),
    source: "lh-cli",
    event: "task.build.started",
    featureId: entry.id,
    feature: entry.path,
    taskId: task.id,
    host,
    dryRun: false,
  });

  await appendCavebus(featureDir, renderCavebusTaskStart(entry.id, task.id, host, compiled.outputPath, false));

  const result = await adapter.run({
    host,
    root,
    workingDir: options.workingDir,
    prompt: compiled.content,
    featureRef,
    taskId: task.id,
    dryRun: false,
    model: options.model,
    allowedTools: options.allowedTools,
    permissionMode: options.permissionMode,
    outputFormat: options.outputFormat ?? "json",
    claudeCommand: options.claudeCommand,
    opencodeCommand: options.opencodeCommand,
    opencodeAgent: options.opencodeAgent,
    opencodeFormat: options.opencodeFormat,
    attach: options.attach,
    session: options.session,
  });

  await ensureDir(path.dirname(resultPath));
  await writeTextFile(resultPath, result.stdout || result.stderr || "(empty output)", { overwrite: true });

  const finishedAt = nowIso();
  const buildStatus: "done" | "needs-fix" = result.ok ? "done" : "needs-fix";

  const summaryContent = renderTaskSummary({
    featureId: entry.id,
    featureTitle: entry.title,
    featureFolderName: entry.path,
    task,
    host,
    status: buildStatus,
    contextPath: compiled.outputPath,
    resultPath: relResultPath,
    runResult: result,
    dryRun: false,
    startedAt,
    finishedAt,
    warnings,
  });

  const summaryDir = path.join(featureDir, "task-summaries");
  await ensureDir(summaryDir);
  const summaryPath = path.join(summaryDir, `${task.id}.md`);
  await writeTextFile(summaryPath, summaryContent, { overwrite: true });
  const relSummaryPath = path.relative(root, summaryPath);

  await appendEvent(featureDir, {
    timestamp: finishedAt,
    source: "lh-cli",
    event: "task.build.finished",
    featureId: entry.id,
    feature: entry.path,
    taskId: task.id,
    host,
    status: buildStatus,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    contextPath: compiled.outputPath,
    resultPath: relResultPath,
    summaryPath: relSummaryPath,
  });

  const cavebusEntry = renderTaskCavebusSummary({
    featureId: entry.id,
    featureTitle: entry.title,
    featureFolderName: entry.path,
    task,
    host,
    status: buildStatus,
    contextPath: compiled.outputPath,
    resultPath: relResultPath,
    runResult: result,
    dryRun: false,
    startedAt,
    finishedAt,
    warnings,
  });
  await appendCavebus(featureDir, cavebusEntry);

  const nextAction = buildStatus === "done"
    ? `Review task summary, inspect changes, then run future \`lh check ${entry.id}\` once implemented.\nFor now, review task summaries and run project verification commands manually.`
    : `Inspect the task summary and host result file before continuing.\nResult: ${relResultPath}`;

  return {
    featureId: entry.id,
    featureTitle: entry.title,
    featureFolderName: entry.path,
    taskId: task.id,
    taskTitle: task.title,
    host,
    status: buildStatus,
    contextPath: compiled.outputPath,
    resultPath: relResultPath,
    runResult: result,
    summaryPath: relSummaryPath,
    warnings,
    nextAction,
  };
}

function resolveResultExtension(
  host: AgentHost,
  options: RunBuildTaskOptions,
): string {
  if (host === "claude-code") {
    const fmt = options.outputFormat ?? "json";
    return fmt === "text" ? ".claude-result.txt" : ".claude-result.json";
  }
  const fmt = options.opencodeFormat ?? "json";
  return fmt === "default" ? ".opencode-result.txt" : ".opencode-result.json";
}

function renderCavebusTaskStart(
  featureId: string,
  taskId: string,
  host: AgentHost,
  contextPath: string,
  dryRun: boolean,
): string {
  const lines: string[] = [];
  lines.push(`TASK ${featureId} ${taskId}`);
  lines.push("host:");
  lines.push(`- ${host}`);
  lines.push("ctx:");
  lines.push(`- ${contextPath}`);
  lines.push("next:");
  lines.push(dryRun ? "- dry run (no host invocation)" : "- run host");
  lines.push("");
  return lines.join("\n");
}

async function appendEvent(featureDir: string, event: Record<string, unknown>): Promise<void> {
  const eventsPath = path.join(featureDir, "events.jsonl");
  await ensureDir(path.dirname(eventsPath));
  const existing = await readTextFile(eventsPath);
  const line = JSON.stringify(event) + "\n";
  const content = existing !== null ? existing + line : line;
  await writeTextFile(eventsPath, content, { overwrite: true });
}

async function appendCavebus(featureDir: string, entry: string): Promise<void> {
  const cavebusPath = path.join(featureDir, "cavebus.log");
  await ensureDir(path.dirname(cavebusPath));
  const existing = await readTextFile(cavebusPath);
  const content = existing !== null ? existing + entry : entry;
  await writeTextFile(cavebusPath, content, { overwrite: true });
}
