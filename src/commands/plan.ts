import { createLogger, printJson } from "../core/logger.js";
import { CLIError } from "../core/errors.js";
import { runPlanning } from "../planning/index.js";
import type { TaskSize } from "../planning/index.js";

export interface PlanOptions {
  cwd: string;
  ref: string;
  force?: boolean | undefined;
  fromSpec?: boolean | undefined;
  maxTasks?: number | undefined;
  taskSize?: string | undefined;
  json?: boolean | undefined;
}

const VALID_TASK_SIZES = new Set(["small", "medium", "large"]);

export async function runPlanCommand(options: PlanOptions): Promise<void> {
  const { cwd, ref, json = false } = options;
  const log = createLogger({ json });

  if (!ref.trim()) {
    throw new CLIError("Missing feature reference.\nUsage: lh plan F001");
  }

  let taskSize: TaskSize = "medium";
  if (options.taskSize !== undefined) {
    if (!VALID_TASK_SIZES.has(options.taskSize)) {
      throw new CLIError(
        `Invalid task size: ${options.taskSize}. Expected small, medium, or large.`,
      );
    }
    taskSize = options.taskSize as TaskSize;
  }

  let maxTasks = 8;
  if (options.maxTasks !== undefined) {
    if (!Number.isFinite(options.maxTasks) || options.maxTasks < 1) {
      throw new CLIError("Invalid --max-tasks value. Expected a positive number.");
    }
    maxTasks = Math.min(options.maxTasks, 12);
  }

  const result = await runPlanning({
    root: cwd,
    featureRef: ref,
    force: options.force,
    fromSpec: options.fromSpec,
    maxTasks,
    taskSize,
  });

  if (json) {
    printJson({
      featureId: result.featureId,
      featureTitle: result.featureTitle,
      featureDir: result.featureDir,
      status: result.status,
      planPath: result.planPath,
      tasksPath: result.tasksPath,
      taskCount: result.taskCount,
      tasks: result.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        acceptanceCriteria: t.acceptanceCriteria,
        expectedFiles: t.expectedFiles,
        verificationCommands: t.verificationCommands,
      })),
      riskGates: result.riskGates,
      unknowns: result.unknowns,
      warnings: result.warnings,
      nextAction: result.nextAction,
    });
    return;
  }

  log.info("LeanHarness plan created");
  log.info("");
  log.info(`Feature:          ${result.featureId} — ${result.featureTitle}`);
  log.info(`Status:           ${result.status}`);
  log.info(`Plan:             ${result.planPath}`);
  log.info(`Tasks:            ${result.tasksPath}`);
  log.info(`Task count:       ${result.taskCount}`);

  if (result.riskGates.length > 0) {
    log.info(`Risk gates:       ${result.riskGates.join(", ")}`);
  } else {
    log.info(`Risk gates:       none`);
  }

  if (result.unknowns.length > 0) {
    log.info(`Unknowns:         ${result.unknowns.length}`);
    for (const u of result.unknowns) {
      log.info(`  - ${u}`);
    }
  } else {
    log.info(`Unknowns:         none`);
  }

  if (result.warnings.length > 0) {
    log.info(`Warnings:         ${result.warnings.length}`);
    for (const w of result.warnings) {
      log.warn(w);
    }
  } else {
    log.info(`Warnings:         none`);
  }

  log.info("");

  if (result.status === "draft") {
    log.info("This is a draft plan. Run discovery before implementation.");
    log.info(`  Run: lh discover ${result.featureId} --depth D2`);
    log.info(`  Then: lh plan ${result.featureId} --force`);
  } else {
    log.info("Next action:");
    log.info(`  Run: lh compile-task ${result.featureId} ${result.tasks[0]?.id ?? "T01"}`);
    log.info(`  Then: lh run-task ${result.featureId} ${result.tasks[0]?.id ?? "T01"} --dry-run`);
  }
}
