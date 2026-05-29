import path from "node:path";
import { readTextFile, writeTextFile, fileExists } from "../core/fs.js";
import { memoryDir } from "../core/paths.js";
import { loadHarnessConfig, createDefaultMemoryFile } from "../core/config.js";
import type { HarnessConfig } from "../core/types.js";

export type MemoryFileKind = "project" | "decisions" | "patterns" | "cave";

export interface MemoryEntry {
  section: string;
  content: string;
  timestamp?: string;
  featureId?: string;
}

export interface MemoryFileInfo {
  kind: MemoryFileKind;
  path: string;
  exists: boolean;
  content: string | null;
}

export interface MemoryStatus {
  dir: string;
  files: MemoryFileInfo[];
}

const DEFAULT_FILES: Record<MemoryFileKind, string> = {
  project: "project.md",
  decisions: "decisions.md",
  patterns: "patterns.md",
  cave: "cave.md",
};

const DEFAULT_TITLES: Record<MemoryFileKind, string> = {
  project: "Project Memory",
  decisions: "Decision Log",
  patterns: "Patterns",
  cave: "Cave Memory",
};

export function resolveMemoryFilePath(
  root: string,
  kind: MemoryFileKind,
  config?: HarnessConfig | null,
): string {
  const memCfg = config?.memory;
  const fileMap: Record<MemoryFileKind, string | undefined> = {
    project: memCfg?.project_file,
    decisions: memCfg?.decisions_file,
    patterns: memCfg?.patterns_file,
    cave: memCfg?.cave_file,
  };
  const configPath = fileMap[kind];
  if (configPath) {
    if (path.isAbsolute(configPath)) return configPath;
    return path.resolve(root, configPath);
  }
  return path.resolve(memoryDir(root), DEFAULT_FILES[kind]);
}

export async function readMemory(
  root: string,
  kind: MemoryFileKind,
  config?: HarnessConfig | null,
): Promise<string | null> {
  const filePath = resolveMemoryFilePath(root, kind, config);
  return readTextFile(filePath);
}

export async function writeMemory(
  root: string,
  kind: MemoryFileKind,
  content: string,
  config?: HarnessConfig | null,
): Promise<"created" | "updated"> {
  const filePath = resolveMemoryFilePath(root, kind, config);
  const result = await writeTextFile(filePath, content, { overwrite: true });
  return result === "skipped" ? "updated" : result;
}

export async function appendMemory(
  root: string,
  kind: MemoryFileKind,
  entry: MemoryEntry,
  config?: HarnessConfig | null,
): Promise<void> {
  const filePath = resolveMemoryFilePath(root, kind, config);
  let existing = await readTextFile(filePath);
  if (existing === null) {
    existing = createDefaultMemoryFile(DEFAULT_TITLES[kind]);
  }

  const block = formatMemoryEntry(entry);
  const updated = appendToSection(existing, entry.section, block);
  await writeTextFile(filePath, updated, { overwrite: true });
}

export async function clearMemory(
  root: string,
  kind: MemoryFileKind,
  config?: HarnessConfig | null,
): Promise<void> {
  const filePath = resolveMemoryFilePath(root, kind, config);
  const title = DEFAULT_TITLES[kind];
  await writeTextFile(filePath, createDefaultMemoryFile(title), { overwrite: true });
}

export async function getMemoryStatus(
  root: string,
  config?: HarnessConfig | null,
): Promise<MemoryStatus> {
  const dir = memoryDir(root);
  const kinds: MemoryFileKind[] = ["project", "decisions", "patterns", "cave"];
  const files: MemoryFileInfo[] = [];

  for (const kind of kinds) {
    const filePath = resolveMemoryFilePath(root, kind, config);
    const exists = await fileExists(filePath);
    const content = exists ? await readTextFile(filePath) : null;
    files.push({ kind, path: filePath, exists, content });
  }

  return { dir, files };
}

export async function loadConfigForMemory(root: string): Promise<HarnessConfig | null> {
  const { parsed } = await loadHarnessConfig(root);
  return parsed;
}

function formatMemoryEntry(entry: MemoryEntry): string {
  const parts: string[] = [];
  if (entry.timestamp || entry.featureId) {
    const meta: string[] = [];
    if (entry.featureId) meta.push(entry.featureId);
    if (entry.timestamp) meta.push(entry.timestamp);
    parts.push(`_${meta.join(" — ")}_`);
  }
  parts.push(entry.content);
  return parts.join("\n");
}

function appendToSection(
  markdown: string,
  sectionHeading: string,
  block: string,
): string {
  const lines = markdown.split("\n");
  const sectionPattern = new RegExp(
    `^##\\s+${escapeRegex(sectionHeading)}\\s*$`,
    "i",
  );

  let sectionIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (sectionPattern.test(lines[i]!)) {
      sectionIdx = i;
      break;
    }
  }

  if (sectionIdx === -1) {
    const trimmed = markdown.trimEnd();
    return trimmed + "\n\n## " + sectionHeading + "\n\n" + block + "\n";
  }

  let insertIdx = sectionIdx + 1;
  while (insertIdx < lines.length) {
    const line = lines[insertIdx]!;
    if (/^##\s/.test(line)) break;
    insertIdx++;
  }

  // Remove placeholder lines like "_Discovered on first feature run._"
  let placeholderStart = sectionIdx + 1;
  while (placeholderStart < insertIdx) {
    const line = lines[placeholderStart]!.trim();
    if (line === "" || line.startsWith("_") && line.endsWith("_") && line.includes("opulated") || line.includes("iscovered") || line.includes("onstraints")) {
      placeholderStart++;
    } else {
      break;
    }
  }

  const hasContent = placeholderStart < insertIdx && lines.slice(placeholderStart, insertIdx).some(l => l.trim() !== "");

  if (!hasContent) {
    const before = lines.slice(0, sectionIdx + 1);
    const after = lines.slice(insertIdx);
    return [...before, "", block, "", ...after].join("\n");
  }

  const before = lines.slice(0, insertIdx);
  const after = lines.slice(insertIdx);
  return [...before, "", block, ...after].join("\n");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

