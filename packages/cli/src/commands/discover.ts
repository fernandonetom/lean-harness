import { createLogger, printJson } from "../core/logger.js";
import { CLIError } from "../core/errors.js";
import { runDiscovery, parseDiscoveryDepth } from "../discovery/index.js";
import { loadResolvedConfig } from "../core/resolved-config.js";
import type { DiscoveryDepth } from "../core/types.js";

export interface DiscoverOptions {
  cwd: string;
  ref: string;
  depth?: string | undefined;
  maxFiles?: number | undefined;
  hints?: string[] | undefined;
  json?: boolean | undefined;
}

export async function runDiscoverCommand(options: DiscoverOptions): Promise<void> {
  const { cwd, ref, json = false } = options;
  const log = createLogger({ json });

  if (!ref.trim()) {
    throw new CLIError("Missing feature reference.\nUsage: lh discover F001");
  }

  const resolved = await loadResolvedConfig(cwd, {
    depth: options.depth,
    maxFiles: options.maxFiles,
  });

  let depth: DiscoveryDepth;
  try {
    depth = parseDiscoveryDepth(options.depth ?? resolved.discovery.default_depth);
  } catch (err) {
    throw err;
  }

  const maxFiles = options.maxFiles ?? resolved.discovery.max_initial_files;

  if (maxFiles < 1 || !Number.isFinite(maxFiles)) {
    throw new CLIError("Invalid --max-files value. Expected a positive number.");
  }

  const result = await runDiscovery({
    root: cwd,
    featureRef: ref,
    depth,
    maxFiles,
    hints: options.hints,
  });

  if (json) {
    printJson({
      featureId: result.featureId,
      featureTitle: result.featureTitle,
      featureDir: result.featureDir,
      depth: result.depth,
      confidence: result.confidence,
      discoveryPath: result.discoveryPath,
      boundaryPath: result.boundaryPath,
      project: result.project,
      packageInfo: result.packageInfo,
      touchFiles: result.boundary.touchFiles,
      readOnlyFiles: result.boundary.readOnlyFiles,
      relevantTests: result.boundary.relevantTests,
      commands: result.boundary.commands,
      riskGates: result.boundary.riskGates,
      unknowns: result.boundary.unknowns,
      warnings: result.warnings,
      nextAction: result.nextAction,
    });
    return;
  }

  log.info("LeanHarness discovery complete");
  log.info("");
  log.info(`Feature:          ${result.featureId} — ${result.featureTitle}`);
  log.info(`Depth:            ${result.depth}`);
  log.info(`Confidence:       ${result.confidence}`);
  log.info(`Discovery:        ${result.discoveryPath}`);
  log.info(`Boundary:         ${result.boundaryPath}`);
  log.info("");

  if (result.boundary.touchFiles.length === 0) {
    log.info("Likely touch files: none found");
    log.info("  Add --hint paths or refine the spec to improve results.");
  } else {
    log.info(`Likely touch files: ${result.boundary.touchFiles.length}`);
    for (const f of result.boundary.touchFiles) {
      log.info(`  ${f.path} (${f.confidence})`);
    }
  }
  log.info("");

  if (result.boundary.relevantTests.length === 0) {
    log.info("Relevant tests:   none found");
  } else {
    log.info(`Relevant tests:   ${result.boundary.relevantTests.length}`);
    for (const t of result.boundary.relevantTests) {
      const ref = t.path ?? t.command ?? "unknown";
      log.info(`  ${ref} (${t.confidence})`);
    }
  }
  log.info("");

  if (result.boundary.commands.length > 0) {
    log.info(`Commands:         ${result.boundary.commands.length}`);
    for (const c of result.boundary.commands) {
      log.info(`  ${c.command} — ${c.purpose} (${c.confidence})`);
    }
    log.info("");
  }

  if (result.boundary.riskGates.length > 0) {
    log.info(`Risk gates:       ${result.boundary.riskGates.length}`);
    for (const r of result.boundary.riskGates) {
      log.info(`  ${r.name}: ${r.reason}`);
    }
    log.info("");
  }

  if (result.boundary.unknowns.length > 0) {
    log.info(`Unknowns:         ${result.boundary.unknowns.length}`);
    for (const u of result.boundary.unknowns) {
      log.info(`  ${u}`);
    }
    log.info("");
  }

  log.info(`Next action:      ${result.nextAction}`);
}
