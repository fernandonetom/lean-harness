import path from "node:path";
import { createLogger, printJson } from "../core/logger.js";
import { CLIError } from "../core/errors.js";
import { normalizeCaveBusType } from "../cavebus/schema.js";
import { inspectCaveBusLog } from "../cavebus/index.js";

export interface CaveBusOptions {
  cwd: string;
  ref: string;
  type?: string | undefined;
  tail?: number | undefined;
  validate?: boolean | undefined;
  strict?: boolean | undefined;
  json?: boolean | undefined;
}

export async function runCaveBusCommand(options: CaveBusOptions): Promise<void> {
  const { cwd, ref, validate = false, strict = false, json = false } = options;
  const log = createLogger({ json });

  if (!ref) {
    throw new CLIError("Missing feature reference.\nUsage: lh cavebus F001");
  }

  let typeFilter = undefined;
  if (options.type) {
    const normalized = normalizeCaveBusType(options.type);
    if (!normalized) {
      throw new CLIError(`Invalid CaveBus message type: ${options.type}.`);
    }
    typeFilter = normalized;
  }

  if (options.tail !== undefined && (isNaN(options.tail) || options.tail <= 0)) {
    throw new CLIError("Invalid --tail value. Expected a positive number.");
  }

  let result;
  try {
    result = await inspectCaveBusLog({
      root: cwd,
      featureRef: ref,
      type: typeFilter,
      tail: options.tail,
      strict,
    });
  } catch (e: unknown) {
    throw e instanceof CLIError ? e : new CLIError(e instanceof Error ? e.message : String(e));
  }

  if (json) {
    printJson({
      featureId: result.featureId,
      featureTitle: result.featureTitle,
      featureDir: result.featureDir,
      logPath: result.logPath,
      exists: result.exists,
      stats: result.stats,
      validation: {
        ok: result.validation.ok,
        issues: result.validation.issues,
      },
      messages: result.messages.map((m) => ({
        type: m.type,
        featureId: m.featureId,
        taskId: m.taskId,
        header: m.header,
        body: m.body,
        startLine: m.startLine,
        endLine: m.endLine,
        managed: m.managed ?? false,
      })),
      warnings: result.warnings,
    });
    return;
  }

  if (!result.exists) {
    log.info("LeanHarness CaveBus log");
    log.info("");
    log.info(`Feature:       ${result.featureId} (${result.featureTitle})`);
    log.info(`Log:           ${path.relative(cwd, result.logPath)}`);
    log.info(`Exists:        no`);
    log.info("");
    log.info("No CaveBus log found.");
    log.info(`Next action:   lh compress ${result.featureId}`);
    return;
  }

  log.info("LeanHarness CaveBus log");
  log.info("");
  log.info(`Feature:       ${result.featureId} (${result.featureTitle})`);
  log.info(`Log:           ${path.relative(cwd, result.logPath)}`);
  log.info(`Exists:        yes`);
  log.info(`Messages:      ${result.stats.totalMessages}`);

  const typeEntries = Object.entries(result.stats.byType);
  if (typeEntries.length > 0) {
    const typeSummary = typeEntries.map(([t, c]) => `${t}:${c}`).join(" ");
    log.info(`Types:         ${typeSummary}`);
  }

  log.info(`Validation:    ${result.validation.ok ? "ok" : "issues found"}`);

  if (validate || !result.validation.ok) {
    const errors = result.validation.issues.filter((i) => i.severity === "error");
    const warnings = result.validation.issues.filter((i) => i.severity === "warning");
    if (errors.length > 0) {
      log.info("");
      log.info("Errors:");
      for (const issue of errors) {
        log.error(`  line ${issue.line}: ${issue.message} [${issue.code}]`);
      }
    }
    if (warnings.length > 0) {
      log.info("");
      log.info("Warnings:");
      for (const issue of warnings) {
        log.warn(`  line ${issue.line}: ${issue.message} [${issue.code}]`);
      }
    }
  }

  if (result.messages.length > 0) {
    log.info("");
    const label = options.type
      ? `${options.type} entries`
      : options.tail
        ? `Last ${result.messages.length} entries`
        : "Recent entries";
    log.info(`${label}:`);
    for (const msg of result.messages) {
      log.info(`  [${msg.startLine}] ${msg.header}`);
    }
  }

  if (result.warnings.length > 0) {
    log.info("");
    for (const w of result.warnings) {
      log.warn(w);
    }
  }

  log.info("");
  const nextAction = result.validation.ok
    ? `lh compress ${result.featureId} --force`
    : `lh compress ${result.featureId} --force (fix warnings first)`;
  log.info(`Next action:   ${nextAction}`);
}
