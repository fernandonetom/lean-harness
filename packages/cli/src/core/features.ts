import path from "node:path";
import { FeatureNotFoundError } from "./errors.js";
import { ensureDir, fileExists, dirExists, listDirs, writeTextFile, readTextFile } from "./fs.js";
import { featuresDir, harnessPath } from "./paths.js";
import { renderTemplate, loadTemplate, ensureFinalNewline } from "./templates.js";
import {
  loadState,
  saveState,
  upsertFeatureEntry,
  setActiveFeature,
  setNextFeatureNumberFromFeatures,
  nowIso,
} from "./state.js";
import type {
  FeatureStatus,
  FeatureIndexEntry,
  FeatureArtifactStatus,
  FeatureSummary,
} from "./types.js";
import type { TemplateValues } from "./templates.js";

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface CreateFeatureOptions {
  root: string;
  request: string;
  title?: string | undefined;
  id?: string | undefined;
  force?: boolean | undefined;
}

export interface CreatedFeature {
  id: string;
  slug: string;
  title: string;
  folderName: string;
  featureDir: string;
  specPath: string;
  status: FeatureStatus;
  created: string[];
  skipped: string[];
}

// ---------------------------------------------------------------------------
// Expected artifacts for summary
// ---------------------------------------------------------------------------

const EXPECTED_ARTIFACTS: Array<{ name: string; kind: "file" | "directory" }> = [
  { name: "spec.md", kind: "file" },
  { name: "discovery.md", kind: "file" },
  { name: "boundary.json", kind: "file" },
  { name: "plan.md", kind: "file" },
  { name: "tasks.md", kind: "file" },
  { name: "checks.md", kind: "file" },
  { name: "result.md", kind: "file" },
  { name: "events.jsonl", kind: "file" },
  { name: "cavebus.log", kind: "file" },
  { name: "task-summaries", kind: "directory" },
  { name: "task-context", kind: "directory" },
];

// ---------------------------------------------------------------------------
// Fallback spec template (used when .lh/templates/spec.md is missing)
// ---------------------------------------------------------------------------

const FALLBACK_SPEC_TEMPLATE = `# Spec: {{FEATURE_ID}} — {{FEATURE_TITLE}}

**Status:** {{STATUS}}

## Original Request

{{REQUEST}}

## Goal

{{FEATURE_TITLE}}

## Non-Goals

_Define what this feature explicitly does not cover._

## Users / Actors

_Who interacts with this feature?_

## Acceptance Criteria

<!-- Each criterion should be an observable, verifiable outcome. Refine before discovery. -->

- [ ] AC1: Define the first observable outcome.
- [ ] AC2: Define important constraints or edge cases.
- [ ] AC3: Define verification expectations.

## Constraints

_Technical, business, or regulatory constraints._

## Assumptions

_What this feature assumes about the existing system._

## Verification Expectations

_How should verification confirm this feature works?_

## Risk Notes

<!-- Anything matching a risk_gate from .lh/config.yml -->

_None identified._

## Clarifying Questions

_Open questions to resolve before or during discovery._

## Notes

_Additional context for discovery and planning._
`;

// ---------------------------------------------------------------------------
// createFeature
// ---------------------------------------------------------------------------

export async function createFeature(options: CreateFeatureOptions): Promise<CreatedFeature> {
  const { root, request, force = false } = options;

  if (!request.trim()) {
    throw new Error('Missing feature request.\nUsage: lh spec "Add password reset"');
  }

  await ensureDir(harnessPath(root));
  await ensureDir(featuresDir(root));

  const state = await loadState(root);
  const title = deriveFeatureTitle(request, options.title);
  const slug = slugify(title);

  let id: string;
  if (options.id) {
    if (!isValidFeatureId(options.id)) {
      throw new Error(`Invalid feature ID: ${options.id}. Expected F001 format.`);
    }
    const existing = state.features.find((f) => f.id === options.id);
    if (existing && !force) {
      throw new Error(
        `Feature ID already exists: ${options.id} (${existing.path}). Use --force to overwrite scaffold files.`,
      );
    }
    id = options.id;
  } else {
    id = formatFeatureId(state.nextFeatureNumber);
  }

  const folderName = `${id}-${slug}`;
  const featureDir = path.join(featuresDir(root), folderName);

  if ((await dirExists(featureDir)) && !force) {
    throw new Error(
      `Feature already exists: ${folderName}. Use --force only if you intend to overwrite scaffold files.`,
    );
  }

  await ensureDir(featureDir);

  const created: string[] = [];
  const skipped: string[] = [];

  // Subdirectories
  const subDirs = ["task-summaries", "task-context"];
  for (const d of subDirs) {
    const dp = path.join(featureDir, d);
    if (!(await dirExists(dp))) {
      await ensureDir(dp);
      created.push(d + "/");
    } else {
      skipped.push(d + "/");
    }
  }

  // Template values
  const status: FeatureStatus = "draft";
  const values: TemplateValues = {
    FEATURE_ID: id,
    FEATURE_SLUG: slug,
    FEATURE_TITLE: title,
    DATE: nowIso().slice(0, 10),
    REQUEST: request,
    STATUS: status,
  };

  // Render spec
  const specContent = await renderSpec(root, values, request);
  const specPath = path.join(featureDir, "spec.md");
  const specResult = await writeTextFile(specPath, specContent, { overwrite: force });
  (specResult === "skipped" ? skipped : created).push("spec.md");

  // Event log
  const event = {
    timestamp: nowIso(),
    source: "lh-cli",
    event: "feature.created",
    featureId: id,
    feature: folderName,
    status,
    request,
  };
  const eventsPath = path.join(featureDir, "events.jsonl");
  const eventsContent = JSON.stringify(event) + "\n";
  const eventsResult = await writeTextFile(eventsPath, eventsContent, { overwrite: force });
  (eventsResult === "skipped" ? skipped : created).push("events.jsonl");

  // CaveBus log
  const cavebusContent =
    `REQ ${id} status:${status}\n` +
    `goal:\n` +
    `- ${title}\n` +
    `next:\n` +
    `- refine spec; run /lh-spec ${id} or lh show ${id}\n`;
  const cavebusPath = path.join(featureDir, "cavebus.log");
  const cavebusResult = await writeTextFile(cavebusPath, cavebusContent, { overwrite: force });
  (cavebusResult === "skipped" ? skipped : created).push("cavebus.log");

  // Update state
  const entry: FeatureIndexEntry = {
    id,
    slug,
    title,
    path: folderName,
    status,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  upsertFeatureEntry(state, entry);
  setActiveFeature(state, folderName);

  const num = parseFeatureNumber(id);
  if (num !== null && num >= state.nextFeatureNumber) {
    state.nextFeatureNumber = num + 1;
  }
  setNextFeatureNumberFromFeatures(state);

  await saveState(root, state);

  return {
    id,
    slug,
    title,
    folderName,
    featureDir,
    specPath,
    status,
    created,
    skipped,
  };
}

// ---------------------------------------------------------------------------
// listFeatures
// ---------------------------------------------------------------------------

export async function listFeatures(
  root: string,
  options?: { includeArchived?: boolean | undefined },
): Promise<FeatureIndexEntry[]> {
  const state = await loadState(root);
  const dirs = await listDirs(featuresDir(root));

  const byId = new Map<string, FeatureIndexEntry>();

  for (const entry of state.features) {
    byId.set(entry.id, entry);
  }

  for (const dir of dirs) {
    const id = extractFeatureId(dir);
    if (!id) continue;
    if (byId.has(id)) {
      const existing = byId.get(id)!;
      if (existing.path !== dir) {
        existing.path = dir;
      }
    } else {
      byId.set(id, {
        id,
        slug: dir.slice(id.length + 1),
        title: dir.slice(id.length + 1).replace(/-/g, " "),
        path: dir,
        status: "draft",
      });
    }
  }

  let entries = Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));

  if (!options?.includeArchived) {
    entries = entries.filter((e) => e.status !== "archived");
  }

  return entries;
}

// ---------------------------------------------------------------------------
// findFeature
// ---------------------------------------------------------------------------

export async function findFeature(
  root: string,
  ref: string,
): Promise<FeatureIndexEntry | null> {
  const features = await listFeatures(root, { includeArchived: true });

  const normalized = ref.replace(/^\.lh\/features\//, "");

  for (const f of features) {
    if (f.id === normalized || f.path === normalized || f.id === ref) {
      return f;
    }
  }

  if (isValidFeatureId(normalized)) {
    return features.find((f) => f.id === normalized) ?? null;
  }

  return features.find((f) => f.path.startsWith(normalized)) ?? null;
}

export async function requireFeature(
  root: string,
  ref: string,
): Promise<FeatureIndexEntry> {
  const entry = await findFeature(root, ref);
  if (!entry) {
    throw new FeatureNotFoundError(ref);
  }
  return entry;
}

// ---------------------------------------------------------------------------
// readFeatureSummary
// ---------------------------------------------------------------------------

export async function readFeatureSummary(
  root: string,
  ref: string,
): Promise<FeatureSummary> {
  const entry = await findFeature(root, ref);
  if (!entry) {
    throw new FeatureNotFoundError(ref);
  }

  const state = await loadState(root);
  const featureDir = path.join(featuresDir(root), entry.path);

  const artifacts: FeatureArtifactStatus[] = [];
  const missingArtifacts: string[] = [];

  for (const expected of EXPECTED_ARTIFACTS) {
    const p = path.join(featureDir, expected.name);
    const exists =
      expected.kind === "file" ? await fileExists(p) : await dirExists(p);
    artifacts.push({
      name: expected.name,
      path: `.lh/features/${entry.path}/${expected.name}`,
      exists,
      kind: expected.kind,
    });
    if (!exists) {
      missingArtifacts.push(expected.name);
    }
  }

  const nextAction = determineNextAction(entry.id, entry.status, artifacts);
  const active = state.activeFeature === entry.path;

  return {
    id: entry.id,
    slug: entry.slug,
    title: entry.title,
    folderName: entry.path,
    path: `.lh/features/${entry.path}`,
    status: entry.status,
    artifacts,
    missingArtifacts,
    nextAction,
    active,
  };
}

// ---------------------------------------------------------------------------
// archiveFeature
// ---------------------------------------------------------------------------

export async function archiveFeature(
  root: string,
  ref: string,
): Promise<FeatureSummary> {
  const entry = await findFeature(root, ref);
  if (!entry) {
    throw new FeatureNotFoundError(ref);
  }

  const state = await loadState(root);
  entry.status = "archived";
  entry.updatedAt = nowIso();
  upsertFeatureEntry(state, entry);

  if (state.activeFeature === entry.path) {
    setActiveFeature(state, null);
  }

  await saveState(root, state);

  // Append archive event
  const featureDir = path.join(featuresDir(root), entry.path);
  const eventsPath = path.join(featureDir, "events.jsonl");
  const event = {
    timestamp: nowIso(),
    source: "lh-cli",
    event: "feature.archived",
    featureId: entry.id,
    feature: entry.path,
    status: "archived",
  };
  const eventLine = JSON.stringify(event) + "\n";

  const existingEvents = await readTextFile(eventsPath);
  if (existingEvents !== null) {
    await writeTextFile(eventsPath, existingEvents + eventLine, { overwrite: true });
  } else {
    await writeTextFile(eventsPath, eventLine, { overwrite: false });
  }

  // Update spec status if present
  const specPath = path.join(featureDir, "spec.md");
  const specContent = await readTextFile(specPath);
  if (specContent !== null) {
    const updated = specContent.replace(
      /\*\*Status:\*\*\s*\S+/,
      "**Status:** archived",
    );
    if (updated !== specContent) {
      await writeTextFile(specPath, updated, { overwrite: true });
    }
  }

  return readFeatureSummary(root, entry.id);
}

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

export function deriveFeatureTitle(request: string, title?: string | undefined): string {
  if (title) return title.trim();

  let text = request.trim();

  const periodIdx = text.indexOf(". ");
  if (periodIdx > 0 && periodIdx < 80) {
    text = text.slice(0, periodIdx);
  }

  if (text.length > 80) {
    text = text.slice(0, 80).trimEnd();
  }

  if (text.length > 0) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }

  return text;
}

export function slugify(value: string): string {
  let slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug.length > 48) {
    slug = slug.slice(0, 48).replace(/-+$/, "");
  }

  return slug || "feature";
}

export function formatFeatureId(value: number): string {
  return `F${String(value).padStart(3, "0")}`;
}

export function parseFeatureNumber(featureId: string): number | null {
  const match = /^F(\d{3,})$/.exec(featureId);
  if (!match || !match[1]) return null;
  return parseInt(match[1], 10);
}

export function isValidFeatureId(value: string): boolean {
  return /^F\d{3,}$/.test(value);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function extractFeatureId(dirName: string): string | null {
  const match = /^(F\d{3,})/.exec(dirName);
  return match ? match[1]! : null;
}

function determineNextAction(
  id: string,
  status: FeatureStatus,
  artifacts: FeatureArtifactStatus[],
): string {
  if (status === "archived") return "Feature is archived.";

  const has = (name: string) => artifacts.some((a) => a.name === name && a.exists);

  if (!has("spec.md")) return `Create spec: lh spec "<request>" --id ${id}`;
  if (status === "draft") return `Refine spec, then run /lh-discover ${id}`;
  if (!has("discovery.md")) return `Run discovery: /lh-discover ${id}`;
  if (!has("plan.md")) return `Create plan: /lh-plan ${id}`;
  if (!has("tasks.md")) return `Build: /lh-build ${id}`;
  if (!has("checks.md")) return `Check: /lh-check ${id}`;
  if (!has("result.md")) return `Verify: /lh-check ${id}`;
  return `Review result or archive: lh archive ${id}`;
}

async function renderSpec(
  root: string,
  values: TemplateValues,
  request: string,
): Promise<string> {
  const rawTemplate = await loadTemplate(root, "spec");

  if (rawTemplate === null) {
    return ensureFinalNewline(renderTemplate(FALLBACK_SPEC_TEMPLATE, values));
  }

  let rendered = renderTemplate(rawTemplate, values);

  if (!rawTemplate.includes("{{REQUEST}}") && !rendered.includes(request)) {
    rendered += `\n## Original Request\n\n${request}\n`;
  }

  if (!rawTemplate.includes("{{STATUS}}") && !/status:/i.test(rendered)) {
    const headingEnd = rendered.indexOf("\n");
    if (headingEnd > 0) {
      rendered =
        rendered.slice(0, headingEnd + 1) +
        "\n**Status:** draft\n" +
        rendered.slice(headingEnd + 1);
    }
  }

  return ensureFinalNewline(rendered);
}
