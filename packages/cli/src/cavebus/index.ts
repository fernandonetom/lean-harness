import path from "node:path";
import { readTextFile, fileExists } from "../core/fs.js";
import { featuresDir } from "../core/paths.js";
import { requireFeature } from "../core/features.js";

export * from "./schema.js";
export * from "./protected.js";
export * from "./validate.js";
export * from "./compress.js";

import type { CaveBusMessage, CaveBusMessageType, CaveBusValidationResult, CaveBusStats } from "./schema.js";
import { normalizeCaveBusType } from "./schema.js";
import { parseCaveBusLog, validateCaveBusLog, computeCaveBusStats, filterCaveBusMessages } from "./validate.js";

export interface CaveBusInspectionResult {
  featureId: string;
  featureTitle: string;
  featureDir: string;
  logPath: string;
  exists: boolean;
  messages: CaveBusMessage[];
  stats: CaveBusStats;
  validation: CaveBusValidationResult;
  warnings: string[];
}

export async function inspectCaveBusLog(input: {
  root: string;
  featureRef: string;
  type?: CaveBusMessageType | undefined;
  tail?: number | undefined;
  strict?: boolean | undefined;
}): Promise<CaveBusInspectionResult> {
  const { root, featureRef, strict } = input;

  const feature = await requireFeature(root, featureRef);

  const featureDir = path.join(featuresDir(root), feature.path);
  const logPath = path.join(featureDir, "cavebus.log");
  const warnings: string[] = [];

  const logExists = await fileExists(logPath);
  if (!logExists) {
    return {
      featureId: feature.id,
      featureTitle: feature.title,
      featureDir,
      logPath,
      exists: false,
      messages: [],
      stats: { totalMessages: 0, byType: {}, managedBlocks: 0, manualMessages: 0 },
      validation: { ok: true, issues: [], messages: [], stats: { totalMessages: 0, byType: {}, managedBlocks: 0, manualMessages: 0 } },
      warnings: ["No CaveBus log found"],
    };
  }

  const content = await readTextFile(logPath);
  if (!content || content.trim().length === 0) {
    return {
      featureId: feature.id,
      featureTitle: feature.title,
      featureDir,
      logPath,
      exists: true,
      messages: [],
      stats: { totalMessages: 0, byType: {}, managedBlocks: 0, manualMessages: 0 },
      validation: { ok: true, issues: [], messages: [], stats: { totalMessages: 0, byType: {}, managedBlocks: 0, manualMessages: 0 } },
      warnings: ["CaveBus log is empty"],
    };
  }

  const allMessages = parseCaveBusLog(content);
  const filtered = filterCaveBusMessages(allMessages, {
    type: input.type,
    tail: input.tail,
  });

  const stats = computeCaveBusStats(allMessages);
  const validation = validateCaveBusLog(content, { strict });

  return {
    featureId: feature.id,
    featureTitle: feature.title,
    featureDir,
    logPath,
    exists: true,
    messages: filtered,
    stats,
    validation,
    warnings,
  };
}
