import path from "node:path";
import { fileExists, readTextFile, readJsonFile, writeTextFile, ensureDir } from "../core/fs.js";
import { featuresDir } from "../core/paths.js";
import { requireFeature } from "../core/features.js";
import { CLIError } from "../core/errors.js";
import { loadState, saveState, upsertFeatureEntry, setActiveFeature, nowIso } from "../core/state.js";
import { parseSpecForPlanning } from "./acceptance.js";
import type { ParsedSpecForPlanning } from "./acceptance.js";
import { normalizeBoundary, generatePlan } from "./task-generator.js";
import type { TaskSize, PlanningBoundary, PlannedTask, GeneratedPlan } from "./task-generator.js";
import { renderPlanMarkdown, renderTasksMarkdown, renderPlanCavebus } from "./plan-renderer.js";

export type { TaskSize } from "./task-generator.js";
export type { ParsedSpecForPlanning } from "./acceptance.js";
export type { PlanningBoundary, PlannedTask, GeneratedPlan } from "./task-generator.js";

export interface RunPlanOptions {
  root: string;
  featureRef: string;
  force?: boolean | undefined;
  fromSpec?: boolean | undefined;
  maxTasks?: number | undefined;
  taskSize?: TaskSize | undefined;
}

export interface PlanResult {
  featureId: string;
  featureTitle: string;
  featureDir: string;
  planPath: string;
  tasksPath: string;
  status: "draft" | "planned" | "blocked";
  taskCount: number;
  tasks: PlannedTask[];
  riskGates: string[];
  unknowns: string[];
  warnings: string[];
  nextAction: string;
}

export async function runPlanning(options: RunPlanOptions): Promise<PlanResult> {
  const { root, featureRef, force = false, fromSpec = false } = options;
  const taskSize: TaskSize = options.taskSize ?? "medium";
  const maxTasks = options.maxTasks ?? 8;

  const entry = await requireFeature(root, featureRef);

  const featureDir = path.join(featuresDir(root), entry.path);
  const specPath = path.join(featureDir, "spec.md");
  const discoveryPath = path.join(featureDir, "discovery.md");
  const boundaryPath = path.join(featureDir, "boundary.json");
  const planPath = path.join(featureDir, "plan.md");
  const tasksPath = path.join(featureDir, "tasks.md");

  if (!(await fileExists(specPath))) {
    throw new CLIError(
      `Cannot create a plan because spec.md is missing for ${entry.path}.\n` +
      `Run: lh spec "<request>" --id ${entry.id}`,
    );
  }

  const specRaw = await readTextFile(specPath);
  if (!specRaw) {
    throw new CLIError(`spec.md is empty for ${entry.path}.`);
  }

  const spec = parseSpecForPlanning(specRaw, { featureId: entry.id, title: entry.title });

  const hasDiscovery = await fileExists(discoveryPath);
  const hasBoundary = await fileExists(boundaryPath);

  if (!fromSpec) {
    if (!hasDiscovery) {
      throw new CLIError(
        `Cannot create a plan because discovery.md is missing for ${entry.path}.\n` +
        `Run: lh discover ${entry.id}\n` +
        `Or use: lh plan ${entry.id} --from-spec`,
      );
    }
    if (!hasBoundary) {
      throw new CLIError(
        `Cannot create a plan because boundary.json is missing for ${entry.path}.\n` +
        `Run: lh discover ${entry.id}\n` +
        `Or use: lh plan ${entry.id} --from-spec`,
      );
    }
  }

  if ((await fileExists(planPath)) && !force) {
    throw new CLIError(
      `plan.md already exists for ${entry.path}. Use --force to overwrite generated planning artifacts.`,
    );
  }
  if ((await fileExists(tasksPath)) && !force) {
    throw new CLIError(
      `tasks.md already exists for ${entry.path}. Use --force to overwrite generated planning artifacts.`,
    );
  }

  let boundary: PlanningBoundary | null = null;
  if (hasBoundary) {
    const boundaryRaw = await readJsonFile<unknown>(boundaryPath);
    boundary = normalizeBoundary(boundaryRaw, { featureId: entry.id, title: entry.title });
  }

  const plan = generatePlan({
    spec,
    boundary,
    featureFolderName: entry.path,
    taskSize,
    maxTasks,
    fromSpecOnly: fromSpec || (!hasDiscovery && !hasBoundary),
  });

  const date = nowIso().slice(0, 10);
  const renderInput = {
    featureId: entry.id,
    featureTitle: entry.title,
    featureFolderName: entry.path,
    date,
    spec,
    boundary,
    plan,
  };

  const planContent = renderPlanMarkdown(renderInput);
  const tasksContent = renderTasksMarkdown(renderInput);
  const cavebusContent = renderPlanCavebus(renderInput);

  await ensureDir(featureDir);
  await writeTextFile(planPath, planContent, { overwrite: true });
  await writeTextFile(tasksPath, tasksContent, { overwrite: true });

  const eventsPath = path.join(featureDir, "events.jsonl");
  const event = {
    timestamp: nowIso(),
    source: "lh-cli",
    event: "feature.planned",
    featureId: entry.id,
    feature: entry.path,
    status: plan.status,
    tasks: plan.tasks.length,
    riskGates: plan.riskGates,
    unknowns: plan.unknowns,
  };
  await appendLine(eventsPath, JSON.stringify(event));

  const cavebusPath = path.join(featureDir, "cavebus.log");
  await appendText(cavebusPath, cavebusContent);

  const state = await loadState(root);
  const newStatus = plan.status === "planned" ? "planned" : entry.status;
  const updatedEntry = {
    ...entry,
    status: newStatus,
    updatedAt: nowIso(),
  };
  upsertFeatureEntry(state, updatedEntry);
  setActiveFeature(state, entry.path);
  await saveState(root, state);

  const relPlanPath = path.relative(root, planPath);
  const relTasksPath = path.relative(root, tasksPath);

  return {
    featureId: entry.id,
    featureTitle: entry.title,
    featureDir: `.lh/features/${entry.path}`,
    planPath: relPlanPath,
    tasksPath: relTasksPath,
    status: plan.status,
    taskCount: plan.tasks.length,
    tasks: plan.tasks,
    riskGates: plan.riskGates,
    unknowns: plan.unknowns,
    warnings: plan.warnings,
    nextAction: plan.nextAction,
  };
}

async function appendLine(filePath: string, line: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const existing = await readTextFile(filePath);
  const content = existing !== null ? existing + line + "\n" : line + "\n";
  await writeTextFile(filePath, content, { overwrite: true });
}

async function appendText(filePath: string, text: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const existing = await readTextFile(filePath);
  const content = existing !== null ? existing + text : text;
  await writeTextFile(filePath, content, { overwrite: true });
}
