import path from "node:path";
import { readTextFile, writeTextFile, fileExists } from "./fs.js";
import { harnessPath } from "./paths.js";

export interface ConfigSetResult {
  ok: boolean;
  path: string[];
  previousValue: unknown;
  newValue: unknown;
  reloadRequired: boolean;
  hostFilesUpdated: string[];
  reloadInstructions: string[];
}

export interface ConfigGetResult {
  ok: boolean;
  path: string[];
  value: unknown;
  source: "config" | "default";
}

export interface ConfigListEntry {
  path: string[];
  value: unknown;
  source: "config" | "default";
  settable: boolean;
  type: string;
  enums?: string[] | undefined;
}

const DOT_PATH_SCHEMA: Record<string, { type: string; enums?: string[] }> = {
  "version": { type: "string" },
  "project.name": { type: "string" },
  "project.mode": { type: "string" },
  "host.primary": { type: "string", enums: ["claude-code", "opencode"] },
  "host.adapter": { type: "string" },
  "workflow.visible_steps": { type: "array" },
  "workflow.one_command": { type: "string" },
  "workflow.require_worktree": { type: "boolean" },
  "workflow.require_review": { type: "boolean" },
  "workflow.require_verification": { type: "boolean" },
  "discovery.strategy": { type: "string" },
  "discovery.default_depth": { type: "string", enums: ["D0", "D1", "D2", "D3", "D4"] },
  "discovery.max_initial_files": { type: "number" },
  "context.bounded_context": { type: "boolean" },
  "context.compile_per_task": { type: "boolean" },
  "context.include_full_repo_map": { type: "boolean" },
  "compression.enabled": { type: "boolean" },
  "compression.protocol": { type: "string" },
  "compression.mode": { type: "string", enums: ["lite", "full", "ultra"] },
  "models.agent": { type: "string" },
  "models.subagent": { type: "string" },
  "models.planner": { type: "string" },
  "models.builder": { type: "string" },
  "models.reviewer": { type: "string" },
  "models.verifier": { type: "string" },
  "models.compressor": { type: "string" },
  "models.fix": { type: "string" },
  "verification.require_acceptance_trace": { type: "boolean" },
  "verification.require_changed_files": { type: "boolean" },
  "verification.require_review": { type: "boolean" },
  "verification.allow_self_review": { type: "boolean" },
  "risk_gates.require_approval": { type: "array" },
  "features.commit": { type: "boolean" },
  "build.session_budget": { type: "number" },
  "build.with_review": { type: "boolean" },
  "build.max_fix_iterations": { type: "number" },
  "build.model_profile": { type: "string" },
  "build.exec_mode": { type: "string", enums: ["subagents", "current", "ask"] },
  "boundary_enforcement.mode": { type: "string", enums: ["strict", "warn", "off"] },
  "boundary_enforcement.always_allow": { type: "array" },
  "boundary_enforcement.session_overrides": { type: "array" },
  "command_enforcement.force_push": { type: "string", enums: ["deny", "warn", "off"] },
};

export function getConfigPaths(): string[] {
  return Object.keys(DOT_PATH_SCHEMA).sort();
}

export function getConfigPathSchema(dotPath: string): { type: string; enums?: string[] } | null {
  return DOT_PATH_SCHEMA[dotPath] ?? null;
}

export function listConfigPaths(): ConfigListEntry[] {
  return Object.entries(DOT_PATH_SCHEMA).map(([dotPath, schema]) => ({
    path: dotPath.split("."),
    value: null,
    source: "default" as const,
    settable: true,
    type: schema.type,
    enums: schema.enums,
  }));
}

export function parseConfigValue(raw: string, targetType: string, enums?: string[]): unknown {
  switch (targetType) {
    case "boolean": {
      const lower = raw.trim().toLowerCase();
      if (lower === "true" || lower === "yes" || lower === "1") return true;
      if (lower === "false" || lower === "no" || lower === "0") return false;
      throw new Error(`Invalid boolean value: "${raw}". Use true/false.`);
    }
    case "number": {
      const n = Number(raw);
      if (isNaN(n)) throw new Error(`Invalid number value: "${raw}"`);
      return n;
    }
    case "string": {
      if (enums && enums.length > 0) {
        if (!enums.includes(raw.trim())) {
          throw new Error(`Invalid value "${raw}". Allowed: ${enums.join(", ")}`);
        }
      }
      return raw.trim();
    }
    case "array": {
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) throw new Error("Not an array");
        return parsed;
      } catch {
        return raw.split(",").map((s) => s.trim()).filter(Boolean);
      }
    }
    default:
      return raw;
  }
}

export function getConfigValueNested(obj: Record<string, unknown>, dottedPath: string): unknown {
  const parts = dottedPath.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function setConfigValueNested(obj: Record<string, unknown>, dottedPath: string, value: unknown): void {
  const parts = dottedPath.split(".");
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (!(part in current) || typeof current[part] !== "object" || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  const last = parts[parts.length - 1]!;
  current[last] = value;
}

export function deleteConfigValueNested(obj: Record<string, unknown>, dottedPath: string): boolean {
  const parts = dottedPath.split(".");
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    if (!(part in current) || typeof current[part] !== "object") return false;
    current = current[part] as Record<string, unknown>;
  }
  const last = parts[parts.length - 1]!;
  if (last in current) {
    delete current[last];
    return true;
  }
  return false;
}

export interface ConfigMutateResult {
  ok: boolean;
  path: string[];
  previousValue: unknown;
  newValue: unknown;
  reloadRequired: boolean;
  hostFilesUpdated: string[];
  reloadInstructions: string[];
  warnings: string[];
}

export async function configSet(
  root: string,
  dotPath: string,
  value: unknown,
): Promise<ConfigMutateResult> {
  const schema = DOT_PATH_SCHEMA[dotPath];
  if (!schema) {
    throw new Error(`Unknown config path: "${dotPath}". Use "lh config list" to see available paths.`);
  }

  const configPath = path.join(harnessPath(root), "config.yml");
  if (!(await fileExists(configPath))) {
    throw new Error("No .lh/config.yml found. Run 'lh init' first.");
  }

  const yamlText = await readTextFile(configPath);
  if (!yamlText) throw new Error("Unable to read config.yml");

  const parsed = parseConfigYaml(yamlText);
  const previousValue = getConfigValueNested(parsed, dotPath);
  setConfigValueNested(parsed, dotPath, value);

  const newYaml = renderConfigYaml(parsed);
  await writeTextFile(configPath, newYaml, { overwrite: true });

  const hostFilesUpdated: string[] = [];
  if (dotPath.startsWith("models.")) {
    const host = parsed.host as Record<string, unknown> | undefined;
    const primary = host?.["primary"];
    if (primary === "opencode") {
      hostFilesUpdated.push("opencode.json");
    } else if (primary === "claude-code") {
      hostFilesUpdated.push(".claude/agents/");
    }
  }

  const reloadRequired = hostFilesUpdated.length > 0 || dotPath.startsWith("boundary_enforcement.");
  const reloadInstructions: string[] = [];
  if (hostFilesUpdated.includes("opencode.json")) {
    reloadInstructions.push("Start a new OpenCode session so agent model pins are applied.");
  }
  if (hostFilesUpdated.includes(".claude/agents/")) {
    reloadInstructions.push("Start a new Claude Code session so agent model settings apply.");
  }

  return {
    ok: true,
    path: dotPath.split("."),
    previousValue,
    newValue: value,
    reloadRequired,
    hostFilesUpdated,
    reloadInstructions,
    warnings: [],
  };
}

export async function configGet(
  root: string,
  dotPath: string,
): Promise<ConfigMutateResult> {
  const schema = DOT_PATH_SCHEMA[dotPath];
  if (!schema) {
    throw new Error(`Unknown config path: "${dotPath}". Use "lh config list" to see available paths.`);
  }

  const configPath = path.join(harnessPath(root), "config.yml");
  const yamlText = await readTextFile(configPath);
  const parsed = yamlText ? parseConfigYaml(yamlText) : {};
  const value = getConfigValueNested(parsed, dotPath);

  return {
    ok: true,
    path: dotPath.split("."),
    previousValue: value,
    newValue: value,
    reloadRequired: false,
    hostFilesUpdated: [],
    reloadInstructions: [],
    warnings: [],
  };
}

export async function configUnset(
  root: string,
  dotPath: string,
): Promise<ConfigMutateResult> {
  const schema = DOT_PATH_SCHEMA[dotPath];
  if (!schema) {
    throw new Error(`Unknown config path: "${dotPath}". Use "lh config list" to see available paths.`);
  }

  const configPath = path.join(harnessPath(root), "config.yml");
  if (!(await fileExists(configPath))) {
    throw new Error("No .lh/config.yml found. Run 'lh init' first.");
  }

  const yamlText = await readTextFile(configPath);
  if (!yamlText) throw new Error("Unable to read config.yml");

  const parsed = parseConfigYaml(yamlText);
  const previousValue = getConfigValueNested(parsed, dotPath);
  const deleted = deleteConfigValueNested(parsed, dotPath);

  if (!deleted) {
    return {
      ok: true,
      path: dotPath.split("."),
      previousValue: undefined,
      newValue: undefined,
      reloadRequired: false,
      hostFilesUpdated: [],
      reloadInstructions: [],
      warnings: [`Path "${dotPath}" was not set. Nothing to unset.`],
    };
  }

  const newYaml = renderConfigYaml(parsed);
  await writeTextFile(configPath, newYaml, { overwrite: true });

  return {
    ok: true,
    path: dotPath.split("."),
    previousValue,
    newValue: undefined,
    reloadRequired: false,
    hostFilesUpdated: [],
    reloadInstructions: [],
    warnings: [],
  };
}

export function parseConfigYaml(text: string): Record<string, unknown> {
  const lines = text.split("\n");
  const root: Record<string, unknown> = {};
  const stack: Array<{ key: string; obj: Record<string, unknown>; indent: number }> = [];
  let currentObj = root;
  let currentIndent = 0;
  let currentKey = "";
  let listContext: { obj: Record<string, unknown>; key: string } | null = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+#.*$/, "");
    if (line.trim() === "") continue;

    const indent = rawLine.length - rawLine.trimStart().length;
    const trimmed = line.trim();

    const keyMatch = /^([\w_-]+)\s*:\s*(.*)$/.exec(trimmed);
    if (keyMatch) {
      const key = keyMatch[1]!;
      const rest = keyMatch[2]!;

      listContext = null;

      while (stack.length > 0 && indent <= currentIndent) {
        const popped = stack.pop()!;
        currentObj = popped.obj;
        currentIndent = stack.length > 0 ? stack[stack.length - 1]!.indent : 0;
      }

      if (rest === "") {
        currentObj[key] = {};
        stack.push({ key, obj: currentObj, indent });
        currentObj = currentObj[key] as Record<string, unknown>;
        currentIndent = indent;
        currentKey = key;
      } else {
        currentObj[key] = parseScalarValue(rest);
      }
      continue;
    }

    const listItemMatch = /^-\s+(.*)$/.exec(trimmed);
    if (listItemMatch) {
      const itemVal = listItemMatch[1]!;
      if (currentKey) {
        if (listContext && listContext.key !== currentKey) {
          listContext = null;
        }
        if (!listContext) {
          (currentObj as Record<string, unknown>)[currentKey] = [];
          listContext = { obj: currentObj as Record<string, unknown>, key: currentKey };
        }
        const arr = (listContext.obj[listContext.key] as unknown[]);
        arr.push(parseScalarValue(itemVal));
      }
    }
  }

  return root;
}

function parseScalarValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "true" || trimmed === "yes") return true;
  if (trimmed === "false" || trimmed === "no") return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (trimmed === "auto" || trimmed === "null") return trimmed;
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function renderConfigYaml(obj: Record<string, unknown>, indent = 0): string {
  const lines: string[] = [];
  const prefix = "  ".repeat(indent);

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${prefix}${key}: []`);
      } else {
        lines.push(`${prefix}${key}:`);
        for (const item of value) {
          lines.push(`${prefix}  - ${item}`);
        }
      }
    } else if (typeof value === "object") {
      lines.push(`${prefix}${key}:`);
      lines.push(renderConfigYaml(value as Record<string, unknown>, indent + 1));
    } else if (typeof value === "string") {
      lines.push(`${prefix}${key}: ${value}`);
    } else if (typeof value === "boolean") {
      lines.push(`${prefix}${key}: ${value}`);
    } else if (typeof value === "number") {
      lines.push(`${prefix}${key}: ${value}`);
    }
  }

  return lines.join("\n");
}
