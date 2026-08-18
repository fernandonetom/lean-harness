import path from "node:path";
import { readTextFile, writeTextFile, fileExists } from "../core/fs.js";
import { createLogger, printJson } from "../core/logger.js";
import {
  normalizeCompressionMode,
  normalizeCompressionSource,
  compressFeatureArtifacts,
  renderManagedCompressionBlock,
  replaceManagedCompressionBlock,
  appendManagedCompressionBlock,
} from "../cavebus/compress.js";
import type { CompressionResult } from "../cavebus/compress.js";
import { loadResolvedConfig } from "../core/resolved-config.js";
import { CLIError } from "../core/errors.js";
import { appendMemory, loadConfigForMemory } from "../memory/index.js";

export interface CompressOptions {
  cwd: string;
  ref: string;
  mode?: string | undefined;
  source?: string | undefined;
  output?: string | undefined;
  dryRun?: boolean | undefined;
  force?: boolean | undefined;
  json?: boolean | undefined;
}

export async function runCompressCommand(options: CompressOptions): Promise<void> {
  const { cwd, ref, dryRun = false, force = false, json = false } = options;
  const log = createLogger({ json });

  if (!ref) {
    throw new CLIError("Missing feature reference.\nUsage: lh compress F001");
  }

  const resolved = await loadResolvedConfig(cwd, { mode: options.mode });

  let mode;
  try {
    mode = normalizeCompressionMode(options.mode ?? resolved.compression.mode);
  } catch (e: unknown) {
    throw e instanceof CLIError ? e : new CLIError(e instanceof Error ? e.message : String(e));
  }

  let source;
  try {
    source = normalizeCompressionSource(options.source);
  } catch (e: unknown) {
    throw e instanceof CLIError ? e : new CLIError(e instanceof Error ? e.message : String(e));
  }

  let result: CompressionResult;
  try {
    result = await compressFeatureArtifacts({ root: cwd, featureRef: ref, mode, source });
  } catch (e: unknown) {
    throw e instanceof CLIError ? e : new CLIError(e instanceof Error ? e.message : String(e));
  }

  const resolvedOutput = options.output
    ? resolveOutputPath(cwd, options.output)
    : null;

  if (options.output && !resolvedOutput) {
    throw new CLIError("Refusing to write compression output outside the project root.");
  }

  const outputPath = resolvedOutput ?? result.outputPath;

  if (dryRun) {
    if (json) {
      printJson({
        featureId: result.featureId,
        featureTitle: result.featureTitle,
        featureDir: result.featureDir,
        mode: result.mode,
        source: result.source,
        outputPath,
        messages: result.messages.map((m) => ({
          type: m.type,
          source: m.source,
          content: m.content,
        })),
        validation: result.validation,
        warnings: result.warnings,
        dryRun: true,
        nextAction: result.nextAction,
      });
      return;
    }

    log.info("LeanHarness compression preview (dry-run)");
    log.info("");
    log.info(`Feature:       ${result.featureId} (${result.featureTitle})`);
    log.info(`Mode:          ${result.mode}`);
    log.info(`Source:        ${result.source}`);
    log.info(`Messages:      ${result.messages.length}`);
    log.info(`Validation:    ${result.validation.ok ? "ok" : "issues found"}`);

    if (result.warnings.length > 0) {
      log.info(`Warnings:      ${result.warnings.length}`);
      for (const w of result.warnings) {
        log.warn(w);
      }
    }

    log.info("");
    log.info("--- Preview ---");
    log.info(result.content);
    log.info("--- End preview ---");
    log.info("");
    log.info(`Next action:   ${result.nextAction}`);
    return;
  }

  const hasErrors = result.validation.issues.some((i) => i.severity === "error");
  if (hasErrors && !force) {
    const details = result.validation.issues.filter((i) => i.severity === "error").map((i) => `  line ${i.line}: ${i.message}`).join("\n");
    throw new CLIError("Compression produced validation errors. Use --force to write anyway.\n" + details);
  }

  const generatedAt = new Date().toISOString();
  const managedBlock = renderManagedCompressionBlock({
    source: result.source,
    mode: result.mode,
    generatedAt,
    content: result.content,
  });

  const existing = await readTextFile(outputPath);
  let finalContent: string;

  if (existing && force) {
    finalContent = replaceManagedCompressionBlock(existing, result.source, managedBlock);
  } else if (existing) {
    finalContent = appendManagedCompressionBlock(existing, managedBlock);
  } else {
    finalContent = managedBlock + "\n";
  }

  await writeTextFile(outputPath, finalContent, { overwrite: true });

  try {
    const memConfig = await loadConfigForMemory(cwd);
    await appendMemory(cwd, "cave", {
      section: "Abbreviation Map",
      content: `- ${result.featureId} compressed (${result.mode}, ${result.messages.length} messages)`,
      featureId: result.featureId,
    }, memConfig);
  } catch {
    // best-effort
  }

  const eventsPath = path.join(result.featureDir, "events.jsonl");
  const event = {
    timestamp: generatedAt,
    source: "lh-cli",
    event: "feature.compressed",
    featureId: result.featureId,
    feature: path.basename(result.featureDir),
    mode: result.mode,
    compressionSource: result.source,
    messages: result.messages.length,
    outputPath: path.relative(cwd, outputPath),
    validationOk: result.validation.ok,
    warnings: result.warnings.length,
  };
  const eventLine = JSON.stringify(event) + "\n";
  const existingEvents = await readTextFile(eventsPath);
  if (existingEvents !== null) {
    await writeTextFile(eventsPath, existingEvents + eventLine, { overwrite: true });
  } else {
    await writeTextFile(eventsPath, eventLine, { overwrite: false });
  }

  if (json) {
    printJson({
      featureId: result.featureId,
      featureTitle: result.featureTitle,
      featureDir: result.featureDir,
      mode: result.mode,
      source: result.source,
      outputPath,
      messages: result.messages.map((m) => ({
        type: m.type,
        source: m.source,
        content: m.content,
      })),
      validation: result.validation,
      warnings: result.warnings,
      dryRun: false,
      nextAction: result.nextAction,
    });
    return;
  }

  log.info("LeanHarness compression complete");
  log.info("");
  log.info(`Feature:       ${result.featureId} (${result.featureTitle})`);
  log.info(`Mode:          ${result.mode}`);
  log.info(`Source:        ${result.source}`);
  log.info(`Output:        ${path.relative(cwd, outputPath)}`);
  log.info(`Messages:      ${result.messages.length}`);
  log.info(`Validation:    ${result.validation.ok ? "ok" : "issues found"}`);

  if (result.warnings.length > 0) {
    log.info(`Warnings:      ${result.warnings.length}`);
    for (const w of result.warnings) {
      log.warn(w);
    }
  }

  log.info("");
  log.info(`Next action:   ${result.nextAction}`);
}

function resolveOutputPath(cwd: string, output: string): string | null {
  const resolved = path.resolve(cwd, output);
  if (!resolved.startsWith(path.resolve(cwd))) return null;
  return resolved;
}
