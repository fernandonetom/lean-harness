import { createLogger, printJson } from "../core/logger.js";
import { normalizeAgentHost } from "../adapters/registry.js";
import type { AgentHost } from "../adapters/types.js";
import { runBuild } from "../build/index.js";
import { loadResolvedConfig } from "../core/resolved-config.js";
import { loadHarnessConfig } from "../core/config.js";
import { resolveModelForRole, type ResolvedModelConfig } from "../core/types.js";
import { CLIError } from "../core/errors.js";

export interface BuildOptions {
  cwd: string;
  ref: string;
  taskId?: string | undefined;
  host?: string | undefined;
  dryRun?: boolean | undefined;
  all?: boolean | undefined;
  maxTasks?: number | undefined;
  maxBytes?: number | undefined;
  json?: boolean | undefined;

  allowedTools?: string[] | undefined;
  permissionMode?: string | undefined;
  outputFormat?: string | undefined;
  claudeCommand?: string | undefined;

  opencodeCommand?: string | undefined;
  opencodeAgent?: string | undefined;
  opencodeFormat?: string | undefined;
  model?: string | undefined;
  attach?: string | undefined;
  session?: string | undefined;

  approveRisk?: string[] | undefined;
  strict?: boolean | undefined;
  noWorktree?: boolean | undefined;
}

export async function runBuildCommand(options: BuildOptions): Promise<void> {
  const { cwd, ref, json = false, dryRun = false } = options;
  const log = createLogger({ json });

  if (!ref) {
    throw new CLIError("Missing feature reference.\nUsage: lh build F001");
  }

  const resolved = await loadResolvedConfig(cwd, { host: options.host, model: options.model });

  const host: AgentHost = normalizeAgentHost(options.host ?? resolved.host.primary);
  const { parsed: rawConfig } = await loadHarnessConfig(cwd);
  const effectiveModel = resolveModelForRole(rawConfig?.models, "builder", host, options.model) ?? undefined;

  if (options.maxTasks !== undefined) {
    if (isNaN(options.maxTasks) || options.maxTasks < 1) {
      throw new CLIError("--max-tasks must be a positive integer.");
    }
  }

  let outputFormat: "text" | "json" | "stream-json" | undefined;
  if (options.outputFormat) {
    if (options.outputFormat === "text" || options.outputFormat === "json" || options.outputFormat === "stream-json") {
      outputFormat = options.outputFormat;
    }
  }

  let opencodeFormat: "default" | "json" | undefined;
  if (options.opencodeFormat) {
    if (options.opencodeFormat === "default" || options.opencodeFormat === "json") {
      opencodeFormat = options.opencodeFormat;
    }
  }

  let result;
  try {
    result = await runBuild({
      root: cwd,
      featureRef: ref,
      taskId: options.taskId,
      host,
      dryRun,
      all: options.all,
      maxTasks: options.maxTasks,
      maxBytes: options.maxBytes,
      allowedTools: options.allowedTools,
      permissionMode: options.permissionMode,
      outputFormat,
      claudeCommand: options.claudeCommand,
      opencodeCommand: options.opencodeCommand,
      opencodeAgent: options.opencodeAgent,
      opencodeFormat,
      model: effectiveModel,
      attach: options.attach,
      session: options.session,
      approveRisk: options.approveRisk,
      strict: options.strict,
      resolvedConfig: resolved,
      noWorktree: options.noWorktree,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (json) { printJson({ error: msg }); process.exitCode = 1; return; }
    throw err instanceof CLIError ? err : new CLIError(msg);
  }

  if (json) {
    printJson({
      featureId: result.featureId,
      featureTitle: result.featureTitle,
      featureDir: result.featureDir,
      host: result.host,
      dryRun: result.dryRun,
      attempted: result.attempted,
      results: result.results.map((r) => ({
        taskId: r.taskId,
        taskTitle: r.taskTitle,
        status: r.status,
        contextPath: r.contextPath,
        resultPath: r.resultPath ?? null,
        summaryPath: r.summaryPath ?? null,
        exitCode: r.runResult.exitCode ?? null,
        durationMs: r.runResult.durationMs,
      })),
      warnings: result.warnings,
      nextAction: result.nextAction,
    });
    return;
  }

  log.info("LeanHarness build complete");
  log.info("");
  log.info(`Feature:          ${result.featureId} — ${result.featureTitle}`);
  log.info(`Host:             ${result.host}`);
  log.info(`Dry run:          ${result.dryRun}`);
  log.info(`Tasks attempted:  ${result.attempted}`);

  if (result.results.length > 0) {
    log.info("");
    log.info("Results:");
    for (const r of result.results) {
      const statusPad = r.status.padEnd(10);
      log.info(`  ${r.taskId}  ${statusPad}  ${r.taskTitle}`);
    }
  }

  if (result.results.length > 0) {
    log.info("");
    log.info("Context:");
    for (const r of result.results) {
      log.info(`  ${r.contextPath}`);
    }

    const summaries = result.results.filter((r) => r.summaryPath);
    if (summaries.length > 0) {
      log.info("");
      log.info("Summaries:");
      for (const r of summaries) {
        log.info(`  ${r.summaryPath}`);
      }
    }
  }

  if (result.warnings.length > 0) {
    log.info("");
    log.info("Warnings:");
    for (const w of result.warnings) {
      log.warn(w);
    }
  }

  log.info("");

  if (result.dryRun) {
    log.info("This was a dry run. No agent host was invoked and task status was not changed.");
    if (result.results.length > 0) {
      log.info("");
      log.info("Commands that would run:");
      for (const r of result.results) {
        log.info(`  ${r.runResult.command.join(" ")}`);
      }
    }
  } else {
    const failed = result.results.find((r) => r.status === "needs-fix" || r.status === "blocked");
    if (failed) {
      log.info(`The build stopped because ${failed.taskId} returned ${failed.status}.`);
      log.info("Inspect the task summary and host result file before continuing.");
    }
  }

  log.info("");
  log.info("Next action:");
  for (const line of result.nextAction.split("\n")) {
    log.info(`  ${line}`);
  }
}
