import path from "node:path";
import { createLogger, printJson } from "../core/logger.js";
import { featuresDir } from "../core/paths.js";
import { requireFeature } from "../core/features.js";
import { CLIError } from "../core/errors.js";
import { ensureDir, writeTextFile, readTextFile } from "../core/fs.js";
import { nowIso } from "../core/state.js";
import { compileTaskContext } from "../context/compiler.js";
import { normalizeAgentHost, getAgentAdapter } from "../adapters/registry.js";
import { loadResolvedConfig } from "../core/resolved-config.js";
import { loadHarnessConfig } from "../core/config.js";
import { resolveModelForRole, type ResolvedModelConfig } from "../core/types.js";
import type { AgentHost, AgentRunResult } from "../adapters/types.js";

export interface RunTaskOptions {
  cwd: string;
  featureRef: string;
  taskId: string;
  host?: string | undefined;
  allowedTools?: string[] | undefined;
  permissionMode?: string | undefined;
  outputFormat?: "text" | "json" | "stream-json" | undefined;
  claudeCommand?: string | undefined;
  opencodeCommand?: string | undefined;
  opencodeAgent?: string | undefined;
  model?: string | undefined;
  opencodeFormat?: "default" | "json" | undefined;
  attach?: string | undefined;
  session?: string | undefined;
  maxBytes?: number | undefined;
  dryRun?: boolean | undefined;
  json?: boolean | undefined;
}

export async function runRunTaskCommand(options: RunTaskOptions): Promise<void> {
  const { cwd, featureRef, taskId, json = false, dryRun = false } = options;
  const log = createLogger({ json });

  if (!featureRef) {
    throw new CLIError("Missing feature reference.\nUsage: lh run-task F001 T01");
  }

  if (!taskId) {
    throw new CLIError("Missing task ID.\nUsage: lh run-task F001 T01");
  }

  const resolved = await loadResolvedConfig(cwd, { host: options.host, model: options.model });
  const host: AgentHost = normalizeAgentHost(options.host ?? resolved.host.primary);
  const { parsed: rawConfig } = await loadHarnessConfig(cwd);
  const effectiveModel = resolveModelForRole(rawConfig?.models, "builder", host, options.model) ?? undefined;

  const compiled = await compileTaskContext({
    root: cwd,
    featureRef,
    taskId,
    maxBytes: options.maxBytes,
  });

  const entry = await requireFeature(cwd, featureRef);

  const featureDir = path.join(featuresDir(cwd), entry.path);
  const adapter = getAgentAdapter(host);

  const resultExt = resolveResultExtension(host, options);
  const resultPath = path.join(featureDir, "task-context", `${taskId}${resultExt}`);

  const commandOverride = host === "claude-code" ? options.claudeCommand : options.opencodeCommand;

  if (dryRun) {
    const detection = await adapter.detect(cwd, commandOverride);
    const result = await adapter.run({
      host,
      root: cwd,
      prompt: compiled.content,
      featureRef,
      taskId,
      dryRun: true,
      model: effectiveModel,
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

    appendDryRunEvent(featureDir, compiled.featureId, entry.path, compiled.taskId, host).catch(() => {});

    if (json) {
      const jsonOutput: Record<string, unknown> = {
        featureId: compiled.featureId,
        taskId: compiled.taskId,
        host,
        dryRun: true,
        contextPath: compiled.outputPath,
        command: result.command,
        resultPath: null,
        exitCode: null,
        durationMs: 0,
        nextAction: `lh run-task ${compiled.featureId} ${compiled.taskId} --host ${host}`,
      };

      if (host === "claude-code") {
        jsonOutput["claudeCodeAvailable"] = detection.available;
        jsonOutput["claudeCodeVersion"] = detection.version ?? null;
      } else {
        jsonOutput["opencodeAvailable"] = detection.available;
        jsonOutput["opencodeVersion"] = detection.version ?? null;
      }

      printJson(jsonOutput);
      return;
    }

    log.info("LeanHarness task run (dry run)");
    log.info("");
    log.info(`Feature:          ${compiled.featureId} — ${compiled.featureTitle}`);
    log.info(`Task:             ${compiled.taskId} — ${compiled.taskTitle}`);
    log.info(`Host:             ${host}`);
    log.info(`Dry run:          true`);
    log.info(`Context:          ${compiled.outputPath}`);

    if (host === "claude-code") {
      log.info(`Claude Code:      ${detection.available ? `available (${detection.version})` : "not found"}`);
    } else {
      log.info(`OpenCode:         ${detection.available ? `available (${detection.version})` : "not found"}`);
      if (options.opencodeAgent) {
        log.info(`OpenCode agent:   ${options.opencodeAgent}`);
      }
      if (options.opencodeFormat) {
        log.info(`OpenCode format:  ${options.opencodeFormat}`);
      }
    }

    log.info("");
    log.info(`Command that would run:`);
    log.info(`  ${result.command.join(" ")}`);
    log.info("");
    log.info(`Next action:`);
    log.info(`  lh run-task ${compiled.featureId} ${compiled.taskId} --host ${host}`);
    return;
  }

  const detection = await adapter.detect(cwd, commandOverride);
  if (!detection.available) {
    const hostLabel = host === "claude-code" ? "Claude Code" : "OpenCode";
    const installHint = host === "claude-code"
      ? "Install or authenticate Claude Code"
      : "Install or configure OpenCode";
    throw new CLIError(
      `${hostLabel} CLI was not found. ${installHint}, or run with --dry-run to inspect the command.\n` +
      (detection.error ? `Detail: ${detection.error}` : ""),
    );
  }

  if (!json) {
    log.info(`Running task ${compiled.taskId} for ${compiled.featureId} via ${host}...`);
  }

  const result = await adapter.run({
    host,
    root: cwd,
    prompt: compiled.content,
    featureRef,
    taskId,
    dryRun: false,
    model: effectiveModel,
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
  await writeTextFile(resultPath, result.stdout, { overwrite: true });

  const eventsPath = path.join(featureDir, "events.jsonl");
  const event = {
    timestamp: nowIso(),
    source: "lh-cli",
    event: "task.run",
    host,
    featureId: compiled.featureId,
    feature: entry.path,
    taskId: compiled.taskId,
    dryRun: false,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    outputPath: path.relative(cwd, resultPath),
  };
  await appendLine(eventsPath, JSON.stringify(event));

  const cavebusPath = path.join(featureDir, "cavebus.log");
  const cavebusEntry = renderCavebusRunSummary(compiled.featureId, compiled.taskId, host, result, resultPath, cwd);
  await appendText(cavebusPath, cavebusEntry);

  const relResultPath = path.relative(cwd, resultPath);

  if (json) {
    printJson({
      featureId: compiled.featureId,
      taskId: compiled.taskId,
      host,
      dryRun: false,
      contextPath: compiled.outputPath,
      command: result.command,
      resultPath: relResultPath,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      ok: result.ok,
      stderrPreview: result.stderr.slice(0, 500) || null,
      nextAction: result.ok
        ? `Review changes and run verification. Then: lh check ${compiled.featureId}`
        : `Inspect result: cat ${relResultPath}`,
    });
    return;
  }

  log.info("");
  log.info("LeanHarness task run complete");
  log.info("");
  log.info(`Feature:          ${compiled.featureId} — ${compiled.featureTitle}`);
  log.info(`Task:             ${compiled.taskId} — ${compiled.taskTitle}`);
  log.info(`Host:             ${host}`);
  log.info(`Dry run:          false`);
  log.info(`Context:          ${compiled.outputPath}`);
  log.info(`Result:           ${relResultPath}`);
  log.info(`Exit code:        ${result.exitCode}`);
  log.info(`Duration:         ${result.durationMs}ms`);

  if (host === "opencode") {
    if (options.opencodeAgent) {
      log.info(`OpenCode agent:   ${options.opencodeAgent}`);
    }
    if (options.opencodeFormat) {
      log.info(`OpenCode format:  ${options.opencodeFormat}`);
    }
  }

  if (!result.ok) {
    log.info("");
    log.warn("Task run failed.");
    if (result.stderr) {
      const preview = result.stderr.slice(0, 300);
      log.info(`Stderr preview:\n${preview}`);
    }
    log.info(`Inspect full result: cat ${relResultPath}`);
  } else {
    log.info("");
    log.info("Next action:");
    log.info("  Review changes and collect verification evidence.");
    log.info(`  Then: lh check ${compiled.featureId} (planned)`);
    log.info("  Verification evidence is still required before marking done.");
  }
}

function resolveResultExtension(
  host: AgentHost,
  options: RunTaskOptions,
): string {
  if (host === "claude-code") {
    const fmt = options.outputFormat ?? "json";
    return fmt === "text" ? ".claude-result.txt" : ".claude-result.json";
  }
  const fmt = options.opencodeFormat ?? "json";
  return fmt === "default" ? ".opencode-result.txt" : ".opencode-result.json";
}

function renderCavebusRunSummary(
  featureId: string,
  taskId: string,
  host: AgentHost,
  result: AgentRunResult,
  resultPath: string,
  root: string,
): string {
  const status = result.ok ? "pass" : "fail";
  const cmdPreview = result.command.slice(0, 3).join(" ") + " ...";
  const relResult = path.relative(root, resultPath);

  const lines: string[] = [];
  lines.push(`CMD ${featureId} ${taskId} result:${status}`);
  lines.push("host:");
  lines.push(`- ${host}`);
  lines.push("cmd:");
  lines.push(`- ${cmdPreview}`);
  lines.push("evidence:");
  lines.push(`- ${relResult}`);
  lines.push("next:");
  if (result.ok) {
    lines.push("- review task output and collect verification evidence");
  } else {
    lines.push(`- inspect result file and retry: lh run-task ${featureId} ${taskId} --host ${host}`);
  }
  lines.push("");
  return lines.join("\n");
}

async function appendDryRunEvent(
  featureDir: string,
  featureId: string,
  featurePath: string,
  taskId: string,
  host: AgentHost,
): Promise<void> {
  const eventsPath = path.join(featureDir, "events.jsonl");
  const event = {
    timestamp: nowIso(),
    source: "lh-cli",
    event: "task.run.dry",
    host,
    featureId,
    feature: featurePath,
    taskId,
    dryRun: true,
  };
  await appendLine(eventsPath, JSON.stringify(event));
}

async function appendLine(filePath: string, line: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const existing = await readTextFile(filePath);
  const content = existing !== null ? existing + line + "\n" : line + "\n";
  await writeTextFile(filePath, content, { overwrite: true });
}

async function appendText(filePath: string, text: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const existing = await readTextFile(filePath);
  const content = existing !== null ? existing + text : text;
  await writeTextFile(filePath, content, { overwrite: true });
}
