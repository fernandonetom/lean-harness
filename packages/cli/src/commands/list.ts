import { listFeatures } from "../core/features.js";
import { loadState } from "../core/state.js";
import { createLogger, printJson } from "../core/logger.js";

export interface ListOptions {
  cwd: string;
  json?: boolean | undefined;
  all?: boolean | undefined;
}

export async function runListCommand(options: ListOptions): Promise<void> {
  const { cwd, json = false, all = false } = options;
  const log = createLogger({ json });

  const features = await listFeatures(cwd, { includeArchived: all });
  const state = await loadState(cwd);

  if (json) {
    printJson({
      ok: true,
      features: features.map((f) => ({
        ...f,
        active: state.activeFeature === f.path,
      })),
      count: features.length,
    });
    return;
  }

  if (features.length === 0) {
    log.info('No LeanHarness features found.');
    log.info('Next action: lh spec "Describe the feature"');
    return;
  }

  log.info("LeanHarness features");
  log.info("");

  const idWidth = 6;
  const statusWidth = 12;
  log.info(
    `${"Active".padEnd(8)}${"ID".padEnd(idWidth)}${"Status".padEnd(statusWidth)}Title`,
  );

  for (const f of features) {
    const active = state.activeFeature === f.path ? "*" : "";
    log.info(
      `${active.padEnd(8)}${f.id.padEnd(idWidth)}${f.status.padEnd(statusWidth)}${f.title}`,
    );
  }

  log.info("");
  log.info("Next action:");

  const active = features.find((f) => state.activeFeature === f.path);
  if (active) {
    log.info(`  lh show ${active.id}`);
  } else {
    log.info(`  lh show ${features[0]!.id}`);
  }
}
