import path from "node:path";
import { ensureDir, writeTextFile, readTextFile } from "../core/fs.js";
import { featuresDir } from "../core/paths.js";
import { nowIso } from "../core/state.js";
import type { ProtectedToken } from "./protected-tokens.js";
import {
  extractProtectedTokens,
  mergeProtectedTokens,
  renderProtectedTokenSection,
} from "./protected-tokens.js";
import {
  loadFeatureContextArtifacts,
  parseTasksMarkdown,
  findTask,
  extractRelevantFilePaths,
  readBoundedFileExcerpts,
} from "./task-context.js";
import type { ParsedTask } from "./task-context.js";

export interface CompileTaskContextOptions {
  root: string;
  featureRef: string;
  taskId: string;
  outputPath?: string | undefined;
  includeFiles?: string[] | undefined;
  maxBytes?: number | undefined;
}

export interface CompiledTaskContext {
  featureId: string;
  featureTitle: string;
  featureDir: string;
  taskId: string;
  taskTitle: string;
  outputPath: string;
  content: string;
  includedFiles: string[];
  missingFiles: string[];
  protectedTokens: ProtectedToken[];
  warnings: string[];
  nextAction: string;
}

export interface RenderTaskPromptInput {
  featureId: string;
  featureTitle: string;
  featureDir: string;
  task: ParsedTask;
  spec: string | null;
  discovery: string | null;
  boundary: unknown | null;
  plan: string | null;
  cavebus: string | null;
  memory: Record<string, string | null>;
  priorTaskSummaries: Array<{ path: string; content: string }>;
  fileExcerpts: Array<{ path: string; content: string; truncated: boolean; bytes: number }>;
  missingFiles: string[];
  protectedTokens: ProtectedToken[];
  maxBytes: number;
}

export async function compileTaskContext(
  options: CompileTaskContextOptions,
): Promise<CompiledTaskContext> {
  const { root, featureRef, taskId, includeFiles, maxBytes = 60000 } = options;
  const warnings: string[] = [];

  const artifacts = await loadFeatureContextArtifacts(root, featureRef);
  const { feature } = artifacts;

  if (!artifacts.tasks) {
    throw new Error(
      `Cannot compile task context because tasks.md is missing for ${feature.path}.\n` +
      `Run /lh-plan ${feature.id} in Claude Code or create tasks.md before compiling a task.`,
    );
  }

  const parsedTasks = parseTasksMarkdown(artifacts.tasks);
  const task = findTask(parsedTasks, taskId);

  if (!task) {
    const knownIds = parsedTasks.map((t) => t.id).join(", ");
    throw new Error(
      `Could not find task ${taskId} in .lh/features/${feature.path}/tasks.md.\n` +
      (knownIds ? `Known tasks: ${knownIds}` : "No tasks found in tasks.md."),
    );
  }

  const relevantPaths = extractRelevantFilePaths(task, artifacts.boundary, includeFiles);

  const fileExcerpts = await readBoundedFileExcerpts(root, relevantPaths, {
    maxBytesPerFile: 8000,
    maxTotalBytes: Math.floor(maxBytes * 0.5),
  });

  const includedFiles = fileExcerpts.map((f) => f.path);
  const existingPaths = new Set(includedFiles);
  const missingFiles = task.expectedFiles.filter((f) => !existingPaths.has(f));

  const tokenGroups: ProtectedToken[][] = [];
  if (artifacts.spec) tokenGroups.push(extractProtectedTokens(artifacts.spec, "spec"));
  tokenGroups.push(extractProtectedTokens(task.raw, "task"));
  if (artifacts.boundary && typeof artifacts.boundary === "object") {
    const boundaryStr = JSON.stringify(artifacts.boundary);
    tokenGroups.push(extractProtectedTokens(boundaryStr, "boundary"));
  }
  const protectedTokens = mergeProtectedTokens(tokenGroups);

  const featureDir = `.lh/features/${feature.path}`;
  const defaultOutputPath = path.join(
    featuresDir(root),
    feature.path,
    "task-context",
    `${task.id}.md`,
  );
  const outputPath = options.outputPath ?? defaultOutputPath;

  const content = renderTaskPrompt({
    featureId: feature.id,
    featureTitle: feature.title,
    featureDir,
    task,
    spec: artifacts.spec,
    discovery: artifacts.discovery,
    boundary: artifacts.boundary,
    plan: artifacts.plan,
    cavebus: artifacts.cavebus,
    memory: artifacts.memory,
    priorTaskSummaries: artifacts.priorTaskSummaries,
    fileExcerpts,
    missingFiles,
    protectedTokens,
    maxBytes,
  });

  if (content.length > maxBytes) {
    warnings.push(`Compiled context (${content.length} bytes) exceeds maxBytes (${maxBytes}). Lower-priority sections were truncated.`);
  }

  for (const excerpt of fileExcerpts) {
    if (excerpt.truncated) {
      warnings.push(`File ${excerpt.path} was truncated to fit within byte limits.`);
    }
  }

  await ensureDir(path.dirname(outputPath));
  await writeTextFile(outputPath, content, { overwrite: true });

  const eventsPath = path.join(featuresDir(root), feature.path, "events.jsonl");
  const event = {
    timestamp: nowIso(),
    source: "lh-cli",
    event: "task.context.compiled",
    featureId: feature.id,
    feature: feature.path,
    taskId: task.id,
    outputPath: path.relative(root, outputPath),
    includedFiles,
    missingFiles,
    warnings,
  };
  await appendLine(eventsPath, JSON.stringify(event));

  const cavebusPath = path.join(featuresDir(root), feature.path, "cavebus.log");
  const cavebusEntry = renderCavebusTaskHandoff(feature.id, task);
  await appendText(cavebusPath, cavebusEntry);

  const nextAction = `Run: lh run-task ${feature.id} ${task.id} --dry-run\nThen: lh run-task ${feature.id} ${task.id}`;

  return {
    featureId: feature.id,
    featureTitle: feature.title,
    featureDir,
    taskId: task.id,
    taskTitle: task.title,
    outputPath: path.relative(root, outputPath),
    content,
    includedFiles,
    missingFiles,
    protectedTokens,
    warnings,
    nextAction,
  };
}

export function renderTaskPrompt(input: RenderTaskPromptInput): string {
  const sections: Array<{ label: string; content: string; priority: number }> = [];

  sections.push({
    label: "header",
    priority: 0,
    content: renderHeader(),
  });

  sections.push({
    label: "feature",
    priority: 0,
    content: renderFeatureSection(input.featureId, input.featureTitle, input.featureDir),
  });

  sections.push({
    label: "task",
    priority: 0,
    content: renderTaskSection(input.task),
  });

  if (input.spec) {
    sections.push({
      label: "spec",
      priority: 2,
      content: `## Relevant Spec\n\n${truncateSection(input.spec, 6000)}`,
    });
  }

  if (input.discovery) {
    sections.push({
      label: "discovery",
      priority: 3,
      content: `## Discovery Summary\n\n${truncateSection(input.discovery, 4000)}`,
    });
  }

  sections.push({
    label: "boundary",
    priority: 0,
    content: renderBoundarySection(input.boundary),
  });

  if (input.plan) {
    sections.push({
      label: "plan",
      priority: 4,
      content: `## Plan Context\n\n${truncateSection(input.plan, 3000)}`,
    });
  }

  if (input.priorTaskSummaries.length > 0) {
    sections.push({
      label: "summaries",
      priority: 5,
      content: renderPriorSummaries(input.priorTaskSummaries),
    });
  }

  if (input.cavebus) {
    sections.push({
      label: "cavebus",
      priority: 8,
      content: `## CaveBus Handoff\n\n${truncateSection(input.cavebus, 2000)}`,
    });
  }

  const memoryEntries = Object.entries(input.memory).filter(([, v]) => v !== null);
  if (memoryEntries.length > 0) {
    sections.push({
      label: "memory",
      priority: 7,
      content: renderMemorySection(memoryEntries as Array<[string, string]>),
    });
  }

  if (input.fileExcerpts.length > 0) {
    sections.push({
      label: "files",
      priority: 4,
      content: renderFileExcerpts(input.fileExcerpts),
    });
  }

  if (input.missingFiles.length > 0) {
    sections.push({
      label: "missing",
      priority: 1,
      content: renderMissingFiles(input.missingFiles),
    });
  }

  sections.push({
    label: "tokens",
    priority: 0,
    content: `## Protected Tokens\n\n${renderProtectedTokenSection(input.protectedTokens)}`,
  });

  sections.push({
    label: "output",
    priority: 0,
    content: renderRequiredOutput(input.featureId, input.task.id, input.featureDir),
  });

  let assembled = sections.map((s) => s.content).join("\n\n");

  if (assembled.length > input.maxBytes) {
    assembled = truncateByPriority(sections, input.maxBytes);
  }

  return assembled;
}

function renderHeader(): string {
  return `# LeanHarness Task Context

## Mission

You are implementing one LeanHarness task with bounded context.

## Non-Negotiable Rules

- Treat \`.lh/\` as the source of truth.
- Implement only the assigned task.
- Stay inside the approved change boundary.
- If another file is required, stop and update discovery/boundary first.
- Preserve existing architecture by default.
- Do not perform opportunistic refactors.
- Do not add dependencies without approval.
- Do not mark done without verification evidence.
- Preserve protected tokens exactly.`;
}

function renderFeatureSection(id: string, title: string, dir: string): string {
  return `## Feature

- Feature ID: ${id}
- Feature title: ${title}
- Feature directory: ${dir}`;
}

function renderTaskSection(task: ParsedTask): string {
  const lines: string[] = [];
  lines.push("## Task");
  lines.push("");
  lines.push(`- Task ID: ${task.id}`);
  lines.push(`- Task title: ${task.title}`);
  if (task.status) lines.push(`- Status: ${task.status}`);
  if (task.acceptanceCriteria.length > 0) {
    lines.push(`- Acceptance criteria:`);
    for (const ac of task.acceptanceCriteria) lines.push(`  - ${ac}`);
  }
  if (task.goal) lines.push(`- Goal: ${task.goal}`);
  if (task.expectedFiles.length > 0) {
    lines.push(`- Expected files:`);
    for (const f of task.expectedFiles) lines.push(`  - ${f}`);
  }
  if (task.readOnlyContext.length > 0) {
    lines.push(`- Read-only context:`);
    for (const f of task.readOnlyContext) lines.push(`  - ${f}`);
  }
  if (task.testExpectation) lines.push(`- Test expectation: ${task.testExpectation}`);
  if (task.verificationCommands.length > 0) {
    lines.push(`- Verification commands:`);
    for (const c of task.verificationCommands) lines.push(`  - ${c}`);
  }
  if (task.riskNotes.length > 0) {
    lines.push(`- Risk notes:`);
    for (const r of task.riskNotes) lines.push(`  - ${r}`);
  }
  if (task.dependencies.length > 0) {
    lines.push(`- Dependencies:`);
    for (const d of task.dependencies) lines.push(`  - ${d}`);
  } else {
    lines.push(`- Dependencies: none`);
  }
  return lines.join("\n");
}

function renderBoundarySection(boundary: unknown): string {
  const lines: string[] = [];
  lines.push("## Change Boundary");
  lines.push("");

  if (!boundary || typeof boundary !== "object") {
    lines.push("_No boundary.json found. Discovery may not have run yet._");
    return lines.join("\n");
  }

  const b = boundary as Record<string, unknown>;

  // accept touchFiles (current) or touch (docs/migration) or files (older object form)
  let touchFilesRaw: unknown = b["touchFiles"];
  if (touchFilesRaw == null) touchFilesRaw = b["touch"];
  if (touchFilesRaw == null) {
    const files = b["files"];
    if (Array.isArray(files)) touchFilesRaw = files;
    else if (files && typeof files === "object") {
      const merged: unknown[] = [];
      for (const key of ["modify", "create", "delete"]) {
        const list = (files as Record<string, unknown>)[key];
        if (Array.isArray(list)) merged.push(...list);
      }
      touchFilesRaw = merged;
    }
  }
  const touchFiles = Array.isArray(touchFilesRaw) ? touchFilesRaw : [];

  // accept readOnlyFiles (current) or readOnly (docs/migration)
  const readOnlyRaw = b["readOnlyFiles"] != null ? b["readOnlyFiles"] : b["readOnly"];
  const readOnlyFiles = Array.isArray(readOnlyRaw) ? readOnlyRaw : [];
  const allowedEditGlobs = Array.isArray(b["allowedEditGlobs"]) ? b["allowedEditGlobs"] : [];
  const blockedEditGlobs = Array.isArray(b["blockedEditGlobs"]) ? b["blockedEditGlobs"] : [];
  const doNotTouch = Array.isArray(b["doNotTouch"]) ? b["doNotTouch"] : [];
  const riskGates = Array.isArray(b["riskGates"]) ? b["riskGates"] : [];
  const unknowns = Array.isArray(b["unknowns"]) ? b["unknowns"] : [];

  lines.push(`Touch files: ${touchFiles.length}`);
  for (const f of touchFiles.slice(0, 20)) {
    if (typeof f === "object" && f !== null) {
      const fp = (f as Record<string, unknown>)["path"];
      if (typeof fp === "string") lines.push(`  - ${fp}`);
    }
  }

  lines.push(`Read-only files: ${readOnlyFiles.length}`);
  for (const f of readOnlyFiles.slice(0, 10)) {
    if (typeof f === "object" && f !== null) {
      const fp = (f as Record<string, unknown>)["path"];
      if (typeof fp === "string") lines.push(`  - ${fp}`);
    }
  }

  if (allowedEditGlobs.length > 0) {
    lines.push(`Allowed edit globs: ${allowedEditGlobs.join(", ")}`);
  }
  if (blockedEditGlobs.length > 0) {
    lines.push(`Blocked edit globs: ${blockedEditGlobs.slice(0, 5).join(", ")}`);
  }
  if (doNotTouch.length > 0) {
    lines.push(`Do-not-touch: ${doNotTouch.join(", ")}`);
  }

  if (riskGates.length > 0) {
    lines.push("Risk gates:");
    for (const rg of riskGates) {
      if (typeof rg === "object" && rg !== null) {
        const name = (rg as Record<string, unknown>)["name"];
        const reason = (rg as Record<string, unknown>)["reason"];
        lines.push(`  - ${name}: ${reason}`);
      }
    }
  }

  if (unknowns.length > 0) {
    lines.push("Unknowns:");
    for (const u of unknowns) {
      if (typeof u === "string") lines.push(`  - ${u}`);
    }
  }

  return lines.join("\n");
}

function renderPriorSummaries(summaries: Array<{ path: string; content: string }>): string {
  const lines: string[] = [];
  lines.push("## Prior Task Summaries");
  lines.push("");
  for (const s of summaries) {
    lines.push(`### ${s.path}`);
    lines.push("");
    lines.push(truncateSection(s.content, 1500));
    lines.push("");
  }
  return lines.join("\n");
}

function renderMemorySection(entries: Array<[string, string]>): string {
  const lines: string[] = [];
  lines.push("## Memory Context");
  lines.push("");
  for (const [name, content] of entries) {
    lines.push(`### ${name}`);
    lines.push("");
    lines.push(truncateSection(content, 800));
    lines.push("");
  }
  return lines.join("\n");
}

function renderFileExcerpts(
  excerpts: Array<{ path: string; content: string; truncated: boolean; bytes: number }>,
): string {
  const lines: string[] = [];
  lines.push("## Included File Excerpts");
  lines.push("");
  for (const e of excerpts) {
    lines.push(`### ${e.path}`);
    lines.push("");
    lines.push("````text");
    lines.push(e.content);
    lines.push("````");
    if (e.truncated) {
      lines.push(`_Truncated (${e.bytes} bytes shown)_`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function renderMissingFiles(files: string[]): string {
  const lines: string[] = [];
  lines.push("## Missing Expected Files");
  lines.push("");
  lines.push("These files are expected by the task but do not exist yet. You may need to create them.");
  lines.push("");
  for (const f of files) {
    lines.push(`- ${f}`);
  }
  return lines.join("\n");
}

function renderRequiredOutput(featureId: string, taskId: string, featureDir: string): string {
  return `## Required Output

At the end of the task, update or produce:

- Task summary: ${featureDir}/task-summaries/${taskId}.md
- Commands run: list all commands executed
- Verification evidence: output of verification commands
- CaveBus summary: append to ${featureDir}/cavebus.log`;
}

function renderCavebusTaskHandoff(featureId: string, task: ParsedTask): string {
  const lines: string[] = [];
  lines.push(`TASK ${featureId} ${task.id}`);
  lines.push("ac:");
  if (task.acceptanceCriteria.length > 0) {
    for (const ac of task.acceptanceCriteria) lines.push(`- ${ac}`);
  } else {
    lines.push("- none specified");
  }
  lines.push("goal:");
  lines.push(`- ${task.goal ?? task.title}`);
  lines.push("files:");
  if (task.expectedFiles.length > 0) {
    for (const f of task.expectedFiles) lines.push(`- ${f} action:edit`);
  } else {
    lines.push("- none specified");
  }
  lines.push("read:");
  if (task.readOnlyContext.length > 0) {
    for (const f of task.readOnlyContext) lines.push(`- ${f} reason:reference`);
  } else {
    lines.push("- none");
  }
  lines.push("verify:");
  if (task.verificationCommands.length > 0) {
    for (const c of task.verificationCommands) lines.push(`- ${c}`);
  } else {
    lines.push("- none specified");
  }
  lines.push("risk:");
  if (task.riskNotes.length > 0) {
    for (const r of task.riskNotes) lines.push(`- ${r}`);
  } else {
    lines.push("- none");
  }
  lines.push("next:");
  lines.push(`- run-task ${task.id}`);
  lines.push("");
  return lines.join("\n");
}

function truncateSection(content: string, maxLen: number): string {
  if (content.length <= maxLen) return content;
  return content.slice(0, maxLen) + "\n\n_[truncated]_";
}

function truncateByPriority(
  sections: Array<{ label: string; content: string; priority: number }>,
  maxBytes: number,
): string {
  const sorted = [...sections].sort((a, b) => b.priority - a.priority);

  let totalLen = sections.reduce((sum, s) => sum + s.content.length + 2, 0);

  for (const section of sorted) {
    if (totalLen <= maxBytes) break;
    if (section.priority === 0) continue;

    const original = section.content.length;
    const targetLen = Math.max(200, Math.floor(original * 0.3));
    section.content = truncateSection(section.content, targetLen);
    totalLen -= original - section.content.length;
  }

  return sections.map((s) => s.content).join("\n\n");
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
