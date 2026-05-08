import path from "node:path";
import fsp from "node:fs/promises";
import { readTextFile, readJsonFile, fileExists, dirExists, listFiles } from "../core/fs.js";
import { featuresDir, memoryDir } from "../core/paths.js";
import { requireFeature } from "../core/features.js";
import type { FeatureSummary, FeatureIndexEntry } from "../core/types.js";

export interface ParsedTask {
  id: string;
  title: string;
  status?: string | undefined;
  acceptanceCriteria: string[];
  slice?: string | undefined;
  goal?: string | undefined;
  expectedFiles: string[];
  readOnlyContext: string[];
  testExpectation?: string | undefined;
  verificationCommands: string[];
  riskNotes: string[];
  dependencies: string[];
  summaryFile?: string | undefined;
  raw: string;
}

export interface FeatureContextArtifacts {
  spec: string | null;
  discovery: string | null;
  boundary: unknown | null;
  plan: string | null;
  tasks: string | null;
  cavebus: string | null;
  memory: Record<string, string | null>;
  priorTaskSummaries: Array<{ path: string; content: string }>;
}

export async function loadFeatureContextArtifacts(
  root: string,
  featureRef: string,
): Promise<FeatureContextArtifacts & { feature: FeatureIndexEntry }> {
  const entry = await requireFeature(root, featureRef);

  const featureDir = path.join(featuresDir(root), entry.path);

  const [spec, discovery, boundary, plan, tasks, cavebus] = await Promise.all([
    readTextFile(path.join(featureDir, "spec.md")),
    readTextFile(path.join(featureDir, "discovery.md")),
    readJsonFile<unknown>(path.join(featureDir, "boundary.json")),
    readTextFile(path.join(featureDir, "plan.md")),
    readTextFile(path.join(featureDir, "tasks.md")),
    readTextFile(path.join(featureDir, "cavebus.log")),
  ]);

  const memory: Record<string, string | null> = {};
  const memDir = memoryDir(root);
  if (await dirExists(memDir)) {
    const memFiles = await listFiles(memDir);
    for (const f of memFiles.slice(0, 10)) {
      memory[f] = await readTextFile(path.join(memDir, f));
    }
  }

  const priorTaskSummaries: Array<{ path: string; content: string }> = [];
  const summariesDir = path.join(featureDir, "task-summaries");
  if (await dirExists(summariesDir)) {
    const summaryFiles = (await listFiles(summariesDir)).sort();
    for (const sf of summaryFiles) {
      const content = await readTextFile(path.join(summariesDir, sf));
      if (content !== null) {
        priorTaskSummaries.push({ path: `task-summaries/${sf}`, content });
      }
    }
  }

  return {
    feature: entry,
    spec,
    discovery,
    boundary,
    plan,
    tasks,
    cavebus,
    memory,
    priorTaskSummaries,
  };
}

export function parseTasksMarkdown(markdown: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];
  const headingRe = /^#{1,3}\s+(T\d{2,}):\s*(.+)$/;

  const lines = markdown.split("\n");
  let current: { id: string; title: string; startLine: number } | null = null;
  let currentLines: string[] = [];

  function flush(): void {
    if (!current) return;
    const raw = currentLines.join("\n");
    tasks.push(parseTaskBlock(current.id, current.title, raw));
    currentLines = [];
    current = null;
  }

  for (const line of lines) {
    const m = headingRe.exec(line);
    if (m) {
      flush();
      current = { id: m[1]!, title: m[2]!.trim(), startLine: 0 };
      currentLines = [line];
    } else if (current) {
      currentLines.push(line);
    }
  }
  flush();

  return tasks;
}

function parseTaskBlock(id: string, title: string, raw: string): ParsedTask {
  const task: ParsedTask = {
    id,
    title,
    acceptanceCriteria: [],
    expectedFiles: [],
    readOnlyContext: [],
    verificationCommands: [],
    riskNotes: [],
    dependencies: [],
    raw,
  };

  const lines = raw.split("\n");
  let currentField: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    const fieldMatch = /^-\s+([A-Za-z ]+?):\s*(.*)$/.exec(trimmed);
    if (fieldMatch) {
      const fieldName = fieldMatch[1]!.toLowerCase().trim();
      const fieldValue = fieldMatch[2]!.trim();

      currentField = fieldName;

      if (fieldValue) {
        applyField(task, fieldName, fieldValue);
        continue;
      }
      continue;
    }

    if (currentField && /^\s+-\s+/.test(line)) {
      const bullet = line.replace(/^\s+-\s+/, "").trim();
      if (bullet) {
        applyField(task, currentField, bullet);
      }
      continue;
    }

    if (currentField && trimmed === "") {
      currentField = null;
    }
  }

  return task;
}

function applyField(task: ParsedTask, field: string, value: string): void {
  switch (field) {
    case "status":
      task.status = value;
      break;
    case "acceptance criteria":
      task.acceptanceCriteria.push(value);
      break;
    case "slice":
      task.slice = value;
      break;
    case "goal":
      task.goal = value;
      break;
    case "expected files":
      task.expectedFiles.push(value);
      break;
    case "read-only context":
      task.readOnlyContext.push(value);
      break;
    case "test expectation":
      task.testExpectation = value;
      break;
    case "verification commands":
      task.verificationCommands.push(value);
      break;
    case "risk notes":
      task.riskNotes.push(value);
      break;
    case "dependencies":
      if (value.toLowerCase() !== "none") {
        task.dependencies.push(value);
      }
      break;
    case "summary file":
      task.summaryFile = value;
      break;
  }
}

export function findTask(tasks: ParsedTask[], taskId: string): ParsedTask | null {
  const normalized = taskId.toUpperCase();
  return tasks.find((t) => t.id.toUpperCase() === normalized) ?? null;
}

export function extractRelevantFilePaths(
  task: ParsedTask,
  boundary: unknown,
  includeFiles?: string[],
): string[] {
  const paths = new Set<string>();

  for (const f of task.expectedFiles) paths.add(f);
  for (const f of task.readOnlyContext) paths.add(f);
  if (includeFiles) {
    for (const f of includeFiles) paths.add(f);
  }

  if (boundary && typeof boundary === "object") {
    const b = boundary as Record<string, unknown>;
    const touchFiles = b["touchFiles"];
    if (Array.isArray(touchFiles)) {
      for (const tf of touchFiles) {
        if (typeof tf === "object" && tf !== null && typeof (tf as Record<string, unknown>)["path"] === "string") {
          paths.add((tf as Record<string, unknown>)["path"] as string);
        }
      }
    }
    const readOnlyFiles = b["readOnlyFiles"];
    if (Array.isArray(readOnlyFiles)) {
      for (const rf of readOnlyFiles) {
        if (typeof rf === "object" && rf !== null && typeof (rf as Record<string, unknown>)["path"] === "string") {
          paths.add((rf as Record<string, unknown>)["path"] as string);
        }
      }
    }
  }

  const filtered = Array.from(paths).filter((p) => {
    if (!p) return false;
    if (p.includes("node_modules/")) return false;
    if (p.startsWith("dist/") || p.startsWith("build/") || p.startsWith("coverage/")) return false;
    if (p.startsWith(".git/")) return false;
    return true;
  });

  return filtered.sort();
}

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".avif",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".zip", ".tar", ".gz", ".bz2", ".7z",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx",
  ".mp3", ".mp4", ".avi", ".mov",
  ".exe", ".dll", ".so", ".dylib", ".bin",
  ".lock", ".lockb",
]);

export async function readBoundedFileExcerpts(
  root: string,
  files: string[],
  options?: { maxBytesPerFile?: number | undefined; maxTotalBytes?: number | undefined },
): Promise<Array<{ path: string; content: string; truncated: boolean; bytes: number }>> {
  const maxPerFile = options?.maxBytesPerFile ?? 8000;
  const maxTotal = options?.maxTotalBytes ?? 40000;
  const results: Array<{ path: string; content: string; truncated: boolean; bytes: number }> = [];
  let totalBytes = 0;

  for (const relPath of files) {
    if (totalBytes >= maxTotal) break;

    const ext = path.extname(relPath).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) continue;

    const fullPath = path.resolve(root, relPath);
    if (!fullPath.startsWith(path.resolve(root))) continue;

    try {
      const stat = await fsp.stat(fullPath);
      if (!stat.isFile()) continue;

      const bytesToRead = Math.min(maxPerFile, maxTotal - totalBytes, stat.size);
      if (bytesToRead <= 0) break;

      const buf = Buffer.alloc(bytesToRead);
      const fh = await fsp.open(fullPath, "r");
      try {
        const { bytesRead } = await fh.read(buf, 0, bytesToRead, 0);
        const content = buf.subarray(0, bytesRead).toString("utf-8");
        const truncated = stat.size > bytesToRead;
        results.push({ path: relPath, content, truncated, bytes: bytesRead });
        totalBytes += bytesRead;
      } finally {
        await fh.close();
      }
    } catch {
      // file doesn't exist or unreadable — skip
    }
  }

  return results;
}
