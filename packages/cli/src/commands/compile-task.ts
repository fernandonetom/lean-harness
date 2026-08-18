import { createLogger, printJson } from "../core/logger.js";
import { CLIError } from "../core/errors.js";
import { compileTaskContext } from "../context/compiler.js";

export interface CompileTaskOptions {
  cwd: string;
  featureRef: string;
  taskId: string;
  output?: string | undefined;
  includeFiles?: string[] | undefined;
  maxBytes?: number | undefined;
  print?: boolean | undefined;
  json?: boolean | undefined;
}

export async function runCompileTaskCommand(options: CompileTaskOptions): Promise<void> {
  const { cwd, featureRef, taskId, json = false } = options;
  const log = createLogger({ json });

  if (!featureRef) {
    throw new CLIError("Missing feature reference.\nUsage: lh compile-task F001 T01");
  }

  if (!taskId) {
    throw new CLIError("Missing task ID.\nUsage: lh compile-task F001 T01");
  }

  let result;
  try {
    result = await compileTaskContext({
      root: cwd,
      featureRef,
      taskId,
      outputPath: options.output,
      includeFiles: options.includeFiles,
      maxBytes: options.maxBytes,
    });
  } catch (err: unknown) {
    throw err instanceof CLIError ? err : new CLIError(err instanceof Error ? err.message : String(err));
  }

  if (json) {
    printJson({
      featureId: result.featureId,
      featureTitle: result.featureTitle,
      featureDir: result.featureDir,
      taskId: result.taskId,
      taskTitle: result.taskTitle,
      outputPath: result.outputPath,
      includedFiles: result.includedFiles,
      missingFiles: result.missingFiles,
      protectedTokens: result.protectedTokens,
      warnings: result.warnings,
      nextAction: result.nextAction,
    });
    return;
  }

  if (options.print) {
    log.raw(result.content);
    return;
  }

  log.info("LeanHarness task context compiled");
  log.info("");
  log.info(`Feature:          ${result.featureId} — ${result.featureTitle}`);
  log.info(`Task:             ${result.taskId} — ${result.taskTitle}`);
  log.info(`Context:          ${result.outputPath}`);
  log.info(`Included files:   ${result.includedFiles.length > 0 ? result.includedFiles.join(", ") : "none"}`);
  log.info(`Missing files:    ${result.missingFiles.length > 0 ? result.missingFiles.join(", ") : "none"}`);
  log.info(`Protected tokens: ${result.protectedTokens.length}`);

  if (result.warnings.length > 0) {
    log.info(`Warnings:`);
    for (const w of result.warnings) {
      log.warn(w);
    }
  } else {
    log.info(`Warnings:         none`);
  }

  log.info("");
  log.info(`Next action:`);
  log.info(`  Run: lh run-task ${result.featureId} ${result.taskId} --dry-run`);
  log.info(`  Then: lh run-task ${result.featureId} ${result.taskId}`);
}
