import { readJsonFile, readTextFile, writeJsonFile, writeTextFile } from "./fs.js";
import { configPath, statePath } from "./paths.js";
import type { HarnessConfig, HarnessState } from "./types.js";
import { getVersion } from "./version.js";

export async function loadHarnessConfig(
  root: string,
): Promise<{ path: string; exists: boolean; raw: string | null; parsed: HarnessConfig | null }> {
  const p = configPath(root);
  const raw = await readTextFile(p);
  if (raw === null) return { path: p, exists: false, raw: null, parsed: null };

  const parsed = parseMinimalYaml(raw);
  return { path: p, exists: true, raw, parsed };
}

export async function loadHarnessState(root: string): Promise<HarnessState> {
  const p = statePath(root);
  const data = await readJsonFile<Record<string, unknown>>(p);
  if (data === null) return createDefaultState();
  return normalizeState(data);
}

export async function saveHarnessState(
  root: string,
  state: HarnessState,
  options?: { overwrite?: boolean },
): Promise<void> {
  const p = statePath(root);
  await writeJsonFile(p, state, { overwrite: options?.overwrite ?? true });
}

export function createDefaultState(): HarnessState {
  return {
    version: getVersion(),
    schema: "leanharness-state",
    activeFeature: null,
    nextFeatureNumber: 1,
    features: [],
    lastUpdated: null,
    notes:
      "State is a cache/index. Feature artifacts under .lh/features are the source of truth.",
  };
}

export function createDefaultConfigYaml(): string {
  const version = getVersion();
  return `# LeanHarness configuration
# Source of truth for project-wide harness behavior.

version: "${version}"

project:
  name: auto
  mode: brownfield-first

host:
  primary: claude-code
  adapter: claude-cli

workflow:
  visible_steps:
    - specify
    - discover
    - build
    - check
  one_command: do
  require_worktree: false
  # worktree_dir: .worktrees
  require_review: true
  require_verification: true

artifacts:
  root: .lh
  features_dir: .lh/features
  templates_dir: .lh/templates
  memory_dir: .lh/memory
  event_log: events.jsonl
  cavebus_log: cavebus.log

discovery:
  strategy: on-demand
  default_depth: D2
  max_initial_files: 25

context:
  bounded_context: true
  compile_per_task: true
  include_full_repo_map: false

compression:
  enabled: true
  protocol: cavebus
  mode: full

models:
  # Semantic role → model id (host-native strings or "auto").
  # planner/builder/reviewer/verifier/compressor/fix
  # Legacy agent/subagent map to builder/other fallbacks.
  agent: auto
  subagent: auto
  # planner: auto
  # builder: auto
  # reviewer: auto
  # verifier: auto
  # compressor: auto
  # fix: auto
  # by_host:
  #   opencode:
  #     builder: "google/gemini-2.5-flash"
  #     reviewer: "anthropic/claude-sonnet-4-20250514"
  #   claude-code:
  #     builder: haiku
  #     reviewer: sonnet
  # profiles:
  #   cheap:
  #     builder: "google/gemini-2.5-flash"
  #   strong:
  #     builder: "anthropic/claude-sonnet-4-20250514"

verification:
  require_acceptance_trace: true
  require_changed_files: true
  require_review: true
  # When false, mode:self reviews are ignored — independent review mandatory.
  # Defaults to true for backward compatibility with pre-1.5.0 workflows.
  allow_self_review: true

risk_gates:
  require_approval:
    - destructive_migration
    - auth_rewrite
    - payment_logic
    - new_dependency
    - public_api_break
    - broad_refactor
    - security_sensitive_change

memory:
  store: local
  scope: feature
  project_file: .lh/memory/project.md
  decisions_file: .lh/memory/decisions.md
  patterns_file: .lh/memory/patterns.md
  cave_file: .lh/memory/cave.md

logging:
  event_format: jsonl
  write_events: true
  write_cavebus: true
  log_level: info

features:
  # solo-first default: feature work is not committed to the repo.
  # Set to true for team workflows where specs and plans are shared artifacts.
  commit: false

build:
  # Maximum complexity weight per session wave.
  # lh-plan groups tasks into waves that stay under this budget.
  session_budget: 15
  # When true, every task gets an independent review (default: true if require_review).
  # with_review: true
  # Maximum fix-then-re-review iterations per task (default: 3).
  # max_fix_iterations: 3
  # Active profile from models.profiles to use (null = use roles directly).
  # model_profile: null
  # Execution mode: subagents (recommended), current, ask.
  # exec_mode: subagents
  # gates:
  #   enabled: true
  #   when: after_task        # after_task | before_review | both
  #   fail_task_on: error
  #   include_globs:
  #     - "**/*.{ts,tsx,js,jsx,mts,cts}"
  #     - "**/*.{test,spec}.{ts,tsx,js}"
  #   exclude_globs:
  #     - "dist/**"
  #     - "node_modules/**"
  #   typecheck: touched      # touched | project | off
  #   lint: touched
  #   test: related

command_enforcement:
  # force_push: warn   # warn (default) | deny | off

boundary_enforcement:
  # mode: strict   # strict (default) | warn | off
  # always_allow: []   # glob patterns always permitted regardless of boundary
  # session_overrides: []   # file paths added at runtime via 'lh boundary allow'

adapters:
  claude-cli:
    skills_dir: .claude/skills
    hooks_enabled: true
    settings_file: .claude/settings.json
`;
}

export function createDefaultMemoryFile(title: string): string {
  return `# ${title}

<!-- LeanHarness memory file. Add entries as the project evolves. -->
`;
}

function normalizeState(data: Record<string, unknown>): HarnessState {
  const version = typeof data["version"] === "string" ? data["version"] : "0.1";
  const schema = typeof data["schema"] === "string" ? data["schema"] : "leanharness-state";
  const activeFeature =
    typeof data["activeFeature"] === "string"
      ? data["activeFeature"]
      : typeof data["active_feature"] === "string"
        ? data["active_feature"]
        : null;
  const nextFeatureNumber =
    typeof data["nextFeatureNumber"] === "number" ? data["nextFeatureNumber"] : 1;
  const features = Array.isArray(data["features"]) ? data["features"] : [];
  const lastUpdated =
    typeof data["lastUpdated"] === "string"
      ? data["lastUpdated"]
      : typeof data["last_updated"] === "string"
        ? data["last_updated"]
        : null;
  const notes = typeof data["notes"] === "string" ? data["notes"] : undefined;

  return { version, schema, activeFeature, nextFeatureNumber, features, lastUpdated, notes };
}

// ---------------------------------------------------------------------------
// Recursive-descent YAML subset parser
// Handles: scalars, block mappings, block sequences, flow sequences,
//          comments, quoted strings. No anchors, tags, or multi-line scalars.
// ---------------------------------------------------------------------------

interface ParseResult {
  value: unknown;
  nextLine: number;
}

/** Count leading spaces on a line. */
function getIndent(line: string): number {
  let n = 0;
  while (n < line.length && line[n] === " ") n++;
  return n;
}

/**
 * Strip trailing inline comment from a line, respecting quoted strings.
 * Returns the line content without the comment.
 */
function stripComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (ch === "#" && !inSingle && !inDouble) {
      // Must be preceded by whitespace to be a comment (YAML spec)
      if (i === 0 || line[i - 1] === " " || line[i - 1] === "\t") {
        return line.slice(0, i).trimEnd();
      }
    }
  }
  return line;
}

/** Parse a scalar value string into a typed JS value. */
function parseScalar(raw: string): string | number | boolean | null {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null" || raw === "~") return null;
  if (/^-?\d+$/.test(raw)) return parseInt(raw, 10);
  if (/^-?\d+\.\d+$/.test(raw)) return parseFloat(raw);
  // Strip matching quotes
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    return raw.slice(1, -1);
  }
  return raw;
}

/** Parse a flow sequence like `[foo, bar, "baz qux"]`. */
function parseFlowSequence(raw: string): unknown[] {
  // Remove surrounding brackets
  const inner = raw.slice(1, -1).trim();
  if (inner === "") return [];
  const items: unknown[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let depth = 0;

  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (!inSingle && !inDouble) {
      if (ch === "[") depth++;
      else if (ch === "]") depth--;
    }
    if (ch === "," && !inSingle && !inDouble && depth === 0) {
      items.push(parseScalar(current.trim()));
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim() !== "") {
    items.push(parseScalar(current.trim()));
  }
  return items;
}

/**
 * Parse a raw value string that appears after `key: ` on a line.
 * Detects flow sequences `[...]` and falls back to scalar parsing.
 */
function parseInlineValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return parseFlowSequence(trimmed);
  }
  return parseScalar(trimmed);
}

/**
 * Parse a block mapping starting at `startLine` with entries at `indent` spaces.
 * Returns the parsed object and the line index where parsing stopped.
 */
function parseMapping(
  lines: string[],
  startLine: number,
  indent: number,
): ParseResult {
  const result: Record<string, unknown> = {};
  let i = startLine;

  while (i < lines.length) {
    const rawLine = lines[i]!;
    // Skip blank lines and full-line comments
    const stripped = rawLine.trimStart();
    if (stripped === "" || stripped.startsWith("#")) {
      i++;
      continue;
    }

    const lineIndent = getIndent(rawLine);

    // If this line is less indented than our mapping, we're done
    if (lineIndent < indent) break;

    // If this line is more indented than our mapping, we shouldn't be here —
    // it means the caller should have handled it. Break to avoid consuming it.
    if (lineIndent > indent) break;

    // Line is at our indent level — try to parse as key: value
    const content = stripComment(rawLine).trimEnd();
    const afterIndent = content.slice(indent);

    // Check for sequence item at this indent (shouldn't happen in a mapping call)
    if (afterIndent.startsWith("- ")) break;

    // Match key: [value]
    const colonIdx = afterIndent.indexOf(":");
    if (colonIdx === -1) {
      // Not a valid mapping entry — skip
      i++;
      continue;
    }

    const key = afterIndent.slice(0, colonIdx).trim();
    const afterColon = afterIndent.slice(colonIdx + 1);
    const valueStr = afterColon.trim();

    if (valueStr === "") {
      // No inline value — look ahead for a nested block
      i++;
      // Skip blank/comment lines to find the next content line
      let nextContentLine = i;
      while (nextContentLine < lines.length) {
        const peek = lines[nextContentLine]!.trimStart();
        if (peek === "" || peek.startsWith("#")) {
          nextContentLine++;
          continue;
        }
        break;
      }

      if (nextContentLine < lines.length) {
        const nextIndent = getIndent(lines[nextContentLine]!);
        if (nextIndent > indent) {
          const nextContent = lines[nextContentLine]!.trimStart();
          if (nextContent.startsWith("- ")) {
            // It's a sequence
            const seqResult = parseSequence(lines, nextContentLine, nextIndent);
            result[key] = seqResult.value;
            i = seqResult.nextLine;
          } else {
            // It's a nested mapping
            const mapResult = parseMapping(lines, nextContentLine, nextIndent);
            result[key] = mapResult.value;
            i = mapResult.nextLine;
          }
        } else {
          // Next content is at same or lesser indent — value is null
          result[key] = null;
        }
      } else {
        // End of file — value is null
        result[key] = null;
      }
    } else {
      // Inline value
      result[key] = parseInlineValue(valueStr);
      i++;
    }
  }

  return { value: result, nextLine: i };
}

/**
 * Parse a block sequence starting at `startLine` with items at `indent` spaces.
 * Each item starts with `- ` at `indent`.
 */
function parseSequence(
  lines: string[],
  startLine: number,
  indent: number,
): ParseResult {
  const result: unknown[] = [];
  let i = startLine;

  while (i < lines.length) {
    const rawLine = lines[i]!;
    const stripped = rawLine.trimStart();
    if (stripped === "" || stripped.startsWith("#")) {
      i++;
      continue;
    }

    const lineIndent = getIndent(rawLine);
    if (lineIndent < indent) break;
    if (lineIndent > indent) break;

    const content = stripComment(rawLine).trimEnd();
    const afterIndent = content.slice(indent);

    if (!afterIndent.startsWith("- ")) break;

    const itemValue = afterIndent.slice(2).trim();

    if (itemValue === "") {
      // Empty sequence item — look ahead for nested block
      i++;
      let nextContentLine = i;
      while (nextContentLine < lines.length) {
        const peek = lines[nextContentLine]!.trimStart();
        if (peek === "" || peek.startsWith("#")) {
          nextContentLine++;
          continue;
        }
        break;
      }
      if (nextContentLine < lines.length) {
        const nextIndent = getIndent(lines[nextContentLine]!);
        if (nextIndent > indent) {
          const nextContent = lines[nextContentLine]!.trimStart();
          if (nextContent.startsWith("- ")) {
            const nested = parseSequence(lines, nextContentLine, nextIndent);
            result.push(nested.value);
            i = nested.nextLine;
          } else {
            const nested = parseMapping(lines, nextContentLine, nextIndent);
            result.push(nested.value);
            i = nested.nextLine;
          }
        } else {
          result.push(null);
        }
      } else {
        result.push(null);
      }
    } else if (itemValue.includes(":") && !itemValue.startsWith("[")) {
      // Could be an inline mapping item like `- key: value`
      // Check if it looks like a key: value pair
      const colonPos = itemValue.indexOf(":");
      const beforeColon = itemValue.slice(0, colonPos).trim();
      const afterColon = itemValue.slice(colonPos + 1).trim();
      // If it's a simple key (no spaces, no quotes starting it), treat as mapping
      if (/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(beforeColon)) {
        // This is a mapping entry that starts on the `- ` line.
        // The item's content indent is indent + 2 (after "- ")
        const itemIndent = indent + 2;
        // Build a mini mapping: first entry is from this line, then continue parsing
        const entryResult: Record<string, unknown> = {};
        if (afterColon === "") {
          // Look ahead for nested block under this key
          i++;
          let nextContentLine = i;
          while (nextContentLine < lines.length) {
            const peek = lines[nextContentLine]!.trimStart();
            if (peek === "" || peek.startsWith("#")) {
              nextContentLine++;
              continue;
            }
            break;
          }
          if (nextContentLine < lines.length) {
            const nextIndent = getIndent(lines[nextContentLine]!);
            if (nextIndent > itemIndent) {
              const nextContent = lines[nextContentLine]!.trimStart();
              if (nextContent.startsWith("- ")) {
                const nested = parseSequence(lines, nextContentLine, nextIndent);
                entryResult[beforeColon] = nested.value;
                i = nested.nextLine;
              } else {
                const nested = parseMapping(lines, nextContentLine, nextIndent);
                entryResult[beforeColon] = nested.value;
                i = nested.nextLine;
              }
            } else {
              entryResult[beforeColon] = null;
            }
          } else {
            entryResult[beforeColon] = null;
          }
        } else {
          entryResult[beforeColon] = parseInlineValue(afterColon);
          i++;
        }
        // Continue collecting more mapping keys at itemIndent
        const moreResult = parseMapping(lines, i, itemIndent);
        const moreMap = moreResult.value as Record<string, unknown>;
        for (const [k, v] of Object.entries(moreMap)) {
          entryResult[k] = v;
        }
        i = moreResult.nextLine;
        result.push(entryResult);
      } else {
        // Not a mapping key — treat the whole thing as a scalar
        result.push(parseScalar(itemValue));
        i++;
      }
    } else {
      // Simple scalar item or flow sequence
      result.push(parseInlineValue(itemValue));
      i++;
    }
  }

  return { value: result, nextLine: i };
}

function parseMinimalYaml(text: string): HarnessConfig | null {
  try {
    const lines = text.split("\n");
    const result = parseMapping(lines, 0, 0);
    return result.value as HarnessConfig;
  } catch {
    return null;
  }
}
