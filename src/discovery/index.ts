import path from "node:path";
import { fileExists, readTextFile, writeTextFile } from "../core/fs.js";
import { featuresDir } from "../core/paths.js";
import { requireFeature } from "../core/features.js";
import { CLIError } from "../core/errors.js";
import { loadState, saveState, upsertFeatureEntry, nowIso } from "../core/state.js";
import type { DiscoveryDepth, Confidence } from "../core/types.js";
import type { FeatureIndexEntry } from "../core/types.js";
import { appendMemory, loadConfigForMemory } from "../memory/index.js";
import { detectProject, type ProjectDetection } from "./project-detector.js";
import { detectPackage, type PackageDetection } from "./package-detector.js";
import { detectTests, type TestDetection } from "./test-detector.js";
import { extractKeywords, searchRelevantFiles, type SearchResult } from "./search.js";
import { resolveImportChain } from "./import-resolver.js";
import {
  buildBoundary,
  renderDiscoveryMarkdown,
  renderDiscoveryCavebus,
  type BoundaryJson,
  type DiscoveryRenderInput,
} from "./boundary.js";

export type { DiscoveryDepth } from "../core/types.js";

export interface RunDiscoveryOptions {
  root: string;
  featureRef: string;
  depth?: DiscoveryDepth | undefined;
  maxFiles?: number | undefined;
  hints?: string[] | undefined;
}

export interface DiscoveryResult {
  featureId: string;
  featureTitle: string;
  featureDir: string;
  depth: DiscoveryDepth;
  confidence: Confidence;
  discoveryPath: string;
  boundaryPath: string;
  cavebusPath: string;
  eventLogPath: string;
  project: ProjectDetection;
  packageInfo: PackageDetection;
  search: SearchResult;
  tests: TestDetection;
  boundary: BoundaryJson;
  createdOrUpdated: string[];
  warnings: string[];
  nextAction: string;
}

const VALID_DEPTHS: DiscoveryDepth[] = ["D0", "D1", "D2", "D3", "D4"];

export function parseDiscoveryDepth(value: string | undefined): DiscoveryDepth {
  if (value === undefined) return "D2";
  const upper = value.toUpperCase() as DiscoveryDepth;
  if (VALID_DEPTHS.includes(upper)) return upper;
  throw new CLIError(
    `Invalid discovery depth: ${value}. Expected D0, D1, D2, D3, or D4.`,
  );
}

export async function runDiscovery(options: RunDiscoveryOptions): Promise<DiscoveryResult> {
  const { root, featureRef } = options;
  const depth = options.depth ?? "D2";
  const maxFiles = options.maxFiles ?? 25;
  const hints = options.hints ?? [];

  const entry = await requireFeature(root, featureRef);

  const featureDir = path.join(featuresDir(root), entry.path);
  const specPath = path.join(featureDir, "spec.md");

  if (!(await fileExists(specPath))) {
    throw new CLIError(
      `Cannot run discovery because spec.md is missing for ${entry.path}.`,
    );
  }

  const specContent = (await readTextFile(specPath)) ?? "";
  const parsed = parseSpec(specContent, entry);

  const titleForSearch = parsed.title || entry.title;
  const requestForSearch = parsed.originalRequest || "";

  const allInputText = [titleForSearch, requestForSearch, ...hints].join(" ");
  const keywords = extractKeywords(allInputText);

  const project = await detectProject(root);
  const packageInfo = await detectPackage(root);

  let search: SearchResult;
  let tests: TestDetection;

  const depthNum = parseInt(depth.slice(1), 10);

  if (depthNum >= 1) {
    const searchMaxResults = depthNum >= 4 ? 120 : depthNum >= 3 ? 100 : 80;
    search = await searchRelevantFiles(root, keywords, {
      maxResults: searchMaxResults,
      hints,
    });
    tests = await detectTests(root, keywords, {
      maxResults: depthNum >= 3 ? 40 : 30,
    });

    if (depthNum >= 2) {
      const importMaxDepth = depthNum >= 3 ? 2 : 1;
      const importResult = await resolveImportChain(root, search.candidates, {
        maxDepth: importMaxDepth,
      });
      search.candidates.push(...importResult.newCandidates);
      search.candidates.sort((a, b) => b.score - a.score);
      search.candidates = search.candidates.slice(0, searchMaxResults);
      search.notes.push(...importResult.notes);
    }
  } else {
    search = { candidates: [], scannedFiles: 0, skippedFiles: 0, notes: ["D0: no file search performed."] };
    tests = { testFiles: [], testDirs: [], likelyTestCommands: [], notes: ["D0: no test search performed."] };

    for (const dir of ["tests", "test", "spec", "__tests__", "e2e", "integration"]) {
      const { dirExists } = await import("../core/fs.js");
      if (await dirExists(path.join(root, dir))) {
        tests.testDirs.push(dir);
      }
    }
  }

  const boundary = buildBoundary({
    featureId: entry.id,
    featureTitle: titleForSearch,
    depth,
    project,
    packageInfo,
    search,
    tests,
    hints,
    maxFiles,
  });

  const warnings: string[] = [];
  if (project.notes.length > 0) {
    warnings.push(...project.notes);
  }
  if (search.notes.length > 0) {
    warnings.push(...search.notes);
  }
  if (tests.notes.length > 0) {
    warnings.push(...tests.notes);
  }

  const hasEvidence =
    boundary.touchFiles.length > 0 ||
    boundary.relevantTests.length > 0 ||
    boundary.commands.length > 0;

  const nextAction = hasEvidence
    ? `Review boundary.json, then run /lh-plan ${entry.id} or future lh plan ${entry.id}.`
    : `Add --hint paths or refine the spec, then re-run lh discover ${entry.id}.`;

  const renderInput: DiscoveryRenderInput = {
    featureId: entry.id,
    featureTitle: titleForSearch,
    depth,
    confidence: boundary.confidence,
    project,
    packageInfo,
    boundary,
    search,
    tests,
    specSummary: parsed.originalRequest || `On-demand discovery for ${titleForSearch}.`,
    warnings,
    nextAction,
  };

  const discoveryMd = renderDiscoveryMarkdown(renderInput);
  const cavebusEntry = renderDiscoveryCavebus(renderInput);

  const discoveryPath = path.join(featureDir, "discovery.md");
  const boundaryPath = path.join(featureDir, "boundary.json");
  const eventsPath = path.join(featureDir, "events.jsonl");
  const cavebusPath = path.join(featureDir, "cavebus.log");

  const createdOrUpdated: string[] = [];

  await writeTextFile(discoveryPath, discoveryMd, { overwrite: true });
  createdOrUpdated.push("discovery.md");

  const boundaryContent = JSON.stringify(boundary, null, 2) + "\n";
  await writeTextFile(boundaryPath, boundaryContent, { overwrite: true });
  createdOrUpdated.push("boundary.json");

  const event = {
    timestamp: nowIso(),
    source: "lh-cli",
    event: "feature.discovered",
    featureId: entry.id,
    feature: entry.path,
    depth,
    confidence: boundary.confidence,
    touchFiles: boundary.touchFiles.length,
    readOnlyFiles: boundary.readOnlyFiles.length,
    tests: boundary.relevantTests.length,
    commands: boundary.commands.length,
    riskGates: boundary.riskGates.map((r) => r.name),
  };
  const eventLine = JSON.stringify(event) + "\n";

  const existingEvents = (await readTextFile(eventsPath)) ?? "";
  await writeTextFile(eventsPath, existingEvents + eventLine, { overwrite: true });
  createdOrUpdated.push("events.jsonl");

  const existingCavebus = (await readTextFile(cavebusPath)) ?? "";
  const separator = existingCavebus.length > 0 ? "\n" : "";
  await writeTextFile(cavebusPath, existingCavebus + separator + cavebusEntry, { overwrite: true });
  createdOrUpdated.push("cavebus.log");

  if (hasEvidence) {
    const state = await loadState(root);
    const updated: FeatureIndexEntry = {
      ...entry,
      status: "discovered",
      updatedAt: nowIso(),
    };
    upsertFeatureEntry(state, updated);
    await saveState(root, state);
  }

  try {
    const memConfig = await loadConfigForMemory(root);
    const techParts: string[] = [];
    if (project.languages.length > 0) techParts.push(`Languages: ${project.languages.join(", ")}`);
    if (project.frameworks.length > 0) techParts.push(`Frameworks: ${project.frameworks.join(", ")}`);
    if (packageInfo.packageManager) techParts.push(`Package manager: ${packageInfo.packageManager}`);
    if (tests.likelyTestCommands.length > 0) techParts.push(`Test commands: ${tests.likelyTestCommands.join(", ")}`);
    if (techParts.length > 0) {
      await appendMemory(root, "project", {
        section: "Tech Stack",
        content: techParts.map(p => `- ${p}`).join("\n"),
        timestamp: nowIso(),
        featureId: entry.id,
      }, memConfig);
    }
  } catch {
    // best-effort memory update
  }

  return {
    featureId: entry.id,
    featureTitle: titleForSearch,
    featureDir: `.lh/features/${entry.path}`,
    depth,
    confidence: boundary.confidence,
    discoveryPath: `.lh/features/${entry.path}/discovery.md`,
    boundaryPath: `.lh/features/${entry.path}/boundary.json`,
    cavebusPath: `.lh/features/${entry.path}/cavebus.log`,
    eventLogPath: `.lh/features/${entry.path}/events.jsonl`,
    project,
    packageInfo,
    search,
    tests,
    boundary,
    createdOrUpdated,
    warnings,
    nextAction,
  };
}

interface ParsedSpec {
  title: string;
  status: string;
  originalRequest: string;
  acceptanceCriteriaIds: string[];
  constraints: string;
  riskNotes: string;
}

function parseSpec(content: string, entry: FeatureIndexEntry): ParsedSpec {
  const result: ParsedSpec = {
    title: entry.title,
    status: entry.status,
    originalRequest: "",
    acceptanceCriteriaIds: [],
    constraints: "",
    riskNotes: "",
  };

  const h1Match = /^#\s+(?:Spec:\s*)?(?:F\d{3,}\s*(?:—|-)?\s*)?(.+)$/m.exec(content);
  if (h1Match?.[1]) {
    result.title = h1Match[1].trim();
  }

  const statusMatch = /\*\*Status:\*\*\s*(\S+)/i.exec(content);
  if (statusMatch?.[1]) {
    result.status = statusMatch[1];
  }

  const requestSection = extractSection(content, "Original Request");
  if (requestSection) {
    result.originalRequest = requestSection.trim();
  }

  const acMatches = content.matchAll(/\b(AC\d+)\b/g);
  for (const m of acMatches) {
    if (m[1] && !result.acceptanceCriteriaIds.includes(m[1])) {
      result.acceptanceCriteriaIds.push(m[1]);
    }
  }

  const constraintsSection = extractSection(content, "Constraints");
  if (constraintsSection) {
    result.constraints = constraintsSection.trim();
  }

  const riskSection = extractSection(content, "Risk Notes");
  if (riskSection) {
    result.riskNotes = riskSection.trim();
  }

  return result;
}

function extractSection(content: string, heading: string): string | null {
  const pattern = new RegExp(`^##\\s+${escapeRegex(heading)}\\s*$`, "mi");
  const match = pattern.exec(content);
  if (!match) return null;

  const start = match.index! + match[0].length;
  const nextHeading = /^##\s+/m.exec(content.slice(start));
  const end = nextHeading ? start + nextHeading.index! : content.length;

  return content.slice(start, end);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
