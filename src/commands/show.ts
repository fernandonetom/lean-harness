import { readFeatureSummary } from "../core/features.js";
import { createLogger, printJson } from "../core/logger.js";
import { CLIError } from "../core/errors.js";

export interface ShowOptions {
  cwd: string;
  ref: string;
  json?: boolean | undefined;
}

export async function runShowCommand(options: ShowOptions): Promise<void> {
  const { cwd, ref, json = false } = options;
  const log = createLogger({ json });

  if (!ref.trim()) {
    throw new CLIError("Missing feature reference.\nUsage: lh show F001");
  }

  const summary = await readFeatureSummary(cwd, ref);

  if (json) {
    printJson({ ok: true, ...summary });
    return;
  }

  log.info("LeanHarness feature");
  log.info("");
  log.info(`ID:         ${summary.id}`);
  log.info(`Title:      ${summary.title}`);
  log.info(`Status:     ${summary.status}`);
  log.info(`Path:       ${summary.path}`);
  log.info(`Active:     ${summary.active ? "yes" : "no"}`);
  log.info("");
  log.info("Artifacts:");
  for (const a of summary.artifacts) {
    const icon = a.exists ? "[ok]" : "[  ]";
    const suffix = a.kind === "directory" ? "/" : "";
    log.info(`  ${icon} ${a.name}${suffix}`);
  }

  if (summary.missingArtifacts.length > 0) {
    log.info("");
    log.info(`Missing:    ${summary.missingArtifacts.join(", ")}`);
  }

  log.info("");
  log.info(`Next action: ${summary.nextAction}`);
}
