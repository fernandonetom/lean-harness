import { createFeature } from "../core/features.js";
import { createLogger, printJson } from "../core/logger.js";
import { CLIError } from "../core/errors.js";

export interface SpecOptions {
  cwd: string;
  request: string;
  title?: string | undefined;
  id?: string | undefined;
  force?: boolean | undefined;
  json?: boolean | undefined;
}

export async function runSpecCommand(options: SpecOptions): Promise<void> {
  const { cwd, request, json = false } = options;
  const log = createLogger({ json });

  if (!request.trim()) {
    throw new CLIError('Missing feature request.\nUsage: lh spec "Add password reset"');
  }

  const result = await createFeature({
    root: cwd,
    request,
    title: options.title,
    id: options.id,
    force: options.force,
  });

  if (json) {
    printJson({
      ok: true,
      id: result.id,
      slug: result.slug,
      title: result.title,
      folderName: result.folderName,
      featureDir: `.lh/features/${result.folderName}`,
      specPath: `.lh/features/${result.folderName}/spec.md`,
      status: result.status,
      created: result.created,
      skipped: result.skipped,
    });
    return;
  }

  log.info("LeanHarness feature created");
  log.info("");
  log.info(`Feature:    ${result.id} — ${result.title}`);
  log.info(`Status:     ${result.status}`);
  log.info(`Spec:       .lh/features/${result.folderName}/spec.md`);
  log.info(`Artifacts:  ${result.created.join(", ")}`);
  if (result.skipped.length > 0) {
    log.info(`Skipped:    ${result.skipped.join(", ")}`);
  }
  log.info("");
  log.info("Next action:");
  log.info(`  Refine .lh/features/${result.folderName}/spec.md`);
  log.info(`  Run /lh-spec ${result.id} in Claude Code`);
  log.info(`  Run /lh-discover ${result.id} after the spec is ready`);
}
