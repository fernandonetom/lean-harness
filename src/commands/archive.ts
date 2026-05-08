import { archiveFeature } from "../core/features.js";
import { createLogger, printJson } from "../core/logger.js";
import { CLIError } from "../core/errors.js";

export interface ArchiveOptions {
  cwd: string;
  ref: string;
  json?: boolean | undefined;
}

export async function runArchiveCommand(options: ArchiveOptions): Promise<void> {
  const { cwd, ref, json = false } = options;
  const log = createLogger({ json });

  if (!ref.trim()) {
    throw new CLIError("Missing feature reference.\nUsage: lh archive F001");
  }

  const summary = await archiveFeature(cwd, ref);

  if (json) {
    printJson({ ok: true, ...summary });
    return;
  }

  log.info("LeanHarness feature archived");
  log.info("");
  log.info(`Feature:    ${summary.id} — ${summary.title}`);
  log.info(`Path:       ${summary.path}`);
  log.info("");
  log.info("Next action:");
  log.info('  lh spec "Describe the next feature"');
  log.info("  lh list --all");
}
