import { createLogger, printJson } from "../core/logger.js";
import { runCheck } from "../verification/index.js";
import type { CheckResult } from "../verification/index.js";
import { loadResolvedConfig } from "../core/resolved-config.js";
import { CLIError } from "../core/errors.js";

export interface CheckOptions {
  cwd: string;
  ref: string;
  run?: boolean | undefined;
  noRun?: boolean | undefined;
  strict?: boolean | undefined;
  force?: boolean | undefined;
  commands?: string[] | undefined;
  maxCommandMs?: number | undefined;
  json?: boolean | undefined;
}

export async function runCheckCommand(options: CheckOptions): Promise<void> {
  const { cwd, ref, json = false } = options;
  const log = createLogger({ json });

  if (!ref) {
    throw new CLIError(
      "Missing feature reference.\n" +
      "Usage: lh check F001",
    );
  }

  if (options.run && options.noRun) {
    throw new CLIError("Cannot use both --run and --no-run.");
  }

  if (options.maxCommandMs !== undefined) {
    if (isNaN(options.maxCommandMs) || options.maxCommandMs <= 0) {
      throw new CLIError("Invalid --max-command-ms value. Expected a positive number.");
    }
  }

  const resolved = await loadResolvedConfig(cwd, { strict: options.strict });
  const strict = options.strict ?? false;

  let runCommands: boolean;
  if (options.noRun) {
    runCommands = false;
  } else if (options.run) {
    runCommands = true;
  } else {
    runCommands = true;
  }

  let result: CheckResult;
  try {
    result = await runCheck({
      root: cwd,
      featureRef: ref,
      runCommands,
      explicitCommands: options.commands ?? [],
      strict,
      force: options.force ?? false,
      maxCommandMs: options.maxCommandMs,
      requireAcceptanceTrace: resolved.verification.require_acceptance_trace,
      requireChangedFiles: resolved.verification.require_changed_files,
      requireReview: resolved.verification.require_review,
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
      verdict: result.verdict,
      checksPath: result.checksPath,
      resultPath: result.resultPath,
      acceptance: result.acceptance.map((a) => ({
        id: a.id,
        text: a.text,
        status: a.status,
        evidence: a.evidence,
        notes: a.notes,
      })),
      commands: result.commands.map((c) => ({
        command: c.command,
        result: c.result,
        exitCode: c.exitCode,
        durationMs: c.durationMs,
        evidence: c.evidence,
      })),
      changedFiles: result.changedFiles.map((f) => ({
        path: f.path,
        changeType: f.changeType,
        inBoundary: f.inBoundary,
      })),
      boundary: {
        status: result.boundary.status,
        violations: result.boundary.violations.map((v) => v.path),
      },
      review: {
        verdict: result.review.verdict,
        blockingFindings: result.review.blockingFindings.map((f) => ({
          severity: f.severity,
          message: f.message,
        })),
      },
      riskGates: result.riskGates,
      unresolvedIssues: result.unresolvedIssues,
      warnings: result.warnings,
      nextAction: result.nextAction,
    });
    return;
  }

  log.info("");
  log.info("LeanHarness check complete");
  log.info("");
  log.info(`Feature:          ${result.featureId} — ${result.featureTitle}`);
  log.info(`Verdict:          ${result.verdict}`);
  log.info(`Checks:           ${result.checksPath}`);
  log.info(`Result:           ${result.resultPath}`);

  const acPass = result.acceptance.filter((a) => a.status === "pass").length;
  const acTotal = result.acceptance.length;
  log.info(`Acceptance:       ${acPass}/${acTotal} pass`);

  const cmdPass = result.commands.filter((c) => c.result === "pass").length;
  const cmdTotal = result.commands.length;
  log.info(`Commands:         ${cmdPass}/${cmdTotal} pass`);

  log.info(`Changed files:    ${result.changedFiles.length}`);
  log.info(`Boundary:         ${result.boundary.status}`);
  log.info(`Risk gates:       ${result.riskGates.length} (${result.riskGates.filter((g) => g.status === "triggered" || g.status === "unresolved").length} unresolved)`);
  log.info(`Unresolved issues: ${result.unresolvedIssues.length}`);
  log.info(`Next action:      ${result.nextAction}`);
  log.info("");

  if (result.verdict === "pass") {
    log.success("Feature verified. State updated to done.");
  } else if (result.verdict === "needs-fix") {
    log.warn("Feature needs fixes before it can be marked done.");
  } else {
    log.warn("Feature is blocked. Resolve missing evidence or approvals before continuing.");
  }
}
