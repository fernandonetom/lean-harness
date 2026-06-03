import { readTextFile, writeTextFile } from "../core/fs.js";
import { configPath } from "../core/paths.js";
import { createLogger } from "../core/logger.js";
import { CLIError } from "../core/errors.js";

export interface BoundaryCommandOptions {
  cwd: string;
}

// ---------------------------------------------------------------------------
// YAML block read helpers
// ---------------------------------------------------------------------------

/**
 * Parse the `boundary_enforcement` block from raw config YAML text.
 * Returns a structured object with mode, always_allow, and session_overrides.
 * Falls back to empty defaults for any missing field.
 */
function parseBoundaryEnforcementBlock(raw: string): {
  mode: string | null;
  always_allow: string[];
  session_overrides: string[];
} {
  const result: { mode: string | null; always_allow: string[]; session_overrides: string[] } = {
    mode: null,
    always_allow: [],
    session_overrides: [],
  };

  const lines = raw.split("\n");
  let inBlock = false;
  let blockIndent = 0;
  let currentList: "always_allow" | "session_overrides" | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const stripped = line.trimStart();

    // Detect start of boundary_enforcement block at indent 0
    if (!inBlock) {
      if (/^boundary_enforcement\s*:/.test(line)) {
        inBlock = true;
        blockIndent = 0;
        currentList = null;
      }
      continue;
    }

    // We are inside the block
    if (stripped === "" || stripped.startsWith("#")) {
      currentList = null;
      continue;
    }

    const indent = line.length - stripped.length;

    // A non-blank, non-comment line at indent 0 ends the block
    if (indent === blockIndent && /^[a-zA-Z_]/.test(stripped)) {
      break;
    }

    // Only parse lines that are children of the block (indent > 0)
    if (indent > blockIndent) {
      // Check for mode field
      const modeMatch = stripped.match(/^mode\s*:\s*(.+)$/);
      if (modeMatch) {
        result.mode = modeMatch[1]!.trim().replace(/^["']|["']$/g, "");
        currentList = null;
        continue;
      }

      // Check for always_allow field
      const alwaysAllowMatch = stripped.match(/^always_allow\s*:\s*(.*)$/);
      if (alwaysAllowMatch) {
        const inline = alwaysAllowMatch[1]!.trim();
        if (inline.startsWith("[") && inline.endsWith("]")) {
          result.always_allow = parseFlowSequenceItems(inline);
          currentList = null;
        } else {
          result.always_allow = [];
          currentList = "always_allow";
        }
        continue;
      }

      // Check for session_overrides field
      const sessionMatch = stripped.match(/^session_overrides\s*:\s*(.*)$/);
      if (sessionMatch) {
        const inline = sessionMatch[1]!.trim();
        if (inline.startsWith("[") && inline.endsWith("]")) {
          result.session_overrides = parseFlowSequenceItems(inline);
          currentList = null;
        } else {
          result.session_overrides = [];
          currentList = "session_overrides";
        }
        continue;
      }

      // Check for block sequence items (- value)
      const seqItemMatch = stripped.match(/^-\s+(.+)$/);
      if (seqItemMatch && currentList !== null) {
        const value = seqItemMatch[1]!.trim().replace(/^["']|["']$/g, "");
        if (currentList === "always_allow") {
          result.always_allow.push(value);
        } else if (currentList === "session_overrides") {
          result.session_overrides.push(value);
        }
        continue;
      }

      // Any other key at this indent resets current list tracking
      if (stripped.includes(":")) {
        currentList = null;
      }
    }
  }

  return result;
}

function parseFlowSequenceItems(raw: string): string[] {
  const inner = raw.slice(1, -1).trim();
  if (inner === "") return [];
  return inner
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, ""))
    .filter((s) => s.length > 0);
}

// ---------------------------------------------------------------------------
// YAML block write helpers
// ---------------------------------------------------------------------------

/**
 * Serialize the boundary_enforcement block as YAML text.
 * Uses block sequence style for lists.
 * Preserves comment placeholders when fields are at default (empty/null).
 */
function serializeBoundaryEnforcementBlock(opts: {
  mode: string | null;
  always_allow: string[];
  session_overrides: string[];
}): string {
  const lines: string[] = ["boundary_enforcement:"];

  if (opts.mode !== null) {
    lines.push(`  mode: ${opts.mode}`);
  } else {
    lines.push(`  # mode: strict   # strict (default) | warn | off`);
  }

  if (opts.always_allow.length === 0) {
    lines.push(`  # always_allow: []   # glob patterns always permitted regardless of boundary`);
  } else {
    lines.push(`  always_allow:`);
    for (const p of opts.always_allow) {
      lines.push(`    - ${p}`);
    }
  }

  if (opts.session_overrides.length === 0) {
    lines.push(
      `  # session_overrides: []   # file paths added at runtime via 'lh boundary allow'`,
    );
  } else {
    lines.push(`  session_overrides:`);
    for (const p of opts.session_overrides) {
      lines.push(`    - ${p}`);
    }
  }

  return lines.join("\n");
}

/**
 * Inject (replace or append) the boundary_enforcement block in raw YAML text.
 * Preserves all content outside the block.
 * Must not destroy comments outside the boundary_enforcement block.
 */
function injectBoundaryEnforcementBlock(rawYaml: string, newBlock: string): string {
  const lines = rawYaml.split("\n");

  // Find the start line of boundary_enforcement block
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^boundary_enforcement\s*:/.test(lines[i]!)) {
      startIdx = i;
      break;
    }
  }

  if (startIdx === -1) {
    // Block does not exist — append at end of file
    const trimmed = rawYaml.trimEnd();
    return trimmed + "\n\n" + newBlock + "\n";
  }

  // Find end of block: first non-blank, non-comment line at indent 0 after startIdx
  let endIdx = startIdx + 1;
  while (endIdx < lines.length) {
    const line = lines[endIdx]!;
    const stripped = line.trimStart();
    if (stripped === "" || stripped.startsWith("#")) {
      endIdx++;
      continue;
    }
    const indent = line.length - stripped.length;
    if (indent === 0) {
      // Next top-level key — stop here
      break;
    }
    endIdx++;
  }

  // Reconstruct: before + new block + after
  const before = lines.slice(0, startIdx);
  const after = lines.slice(endIdx);

  let result = "";

  if (before.length > 0) {
    result += before.join("\n") + "\n";
  }
  result += newBlock;
  if (after.length > 0) {
    result += "\n" + after.join("\n");
  }

  // Ensure file ends with newline
  if (!result.endsWith("\n")) {
    result += "\n";
  }

  return result;
}

// ---------------------------------------------------------------------------
// Command implementations
// ---------------------------------------------------------------------------

/**
 * `lh boundary allow <file-path>`
 * Appends filePath to boundary_enforcement.session_overrides in .lh/config.yml
 */
export async function runBoundaryAllow(root: string, filePath: string): Promise<void> {
  const log = createLogger();
  const cfgPath = configPath(root);
  const rawYaml = await readTextFile(cfgPath);

  if (rawYaml === null) {
    throw new CLIError("No .lh/config.yml found. Run `lh init` first.");
  }

  const parsed = parseBoundaryEnforcementBlock(rawYaml);

  if (parsed.session_overrides.includes(filePath)) {
    log.info(`${filePath} is already in session_overrides — no change needed.`);
    return;
  }

  parsed.session_overrides.push(filePath);

  const newBlock = serializeBoundaryEnforcementBlock(parsed);
  const updatedYaml = injectBoundaryEnforcementBlock(rawYaml, newBlock);

  await writeTextFile(cfgPath, updatedYaml, { overwrite: true });
  log.success(`Added ${filePath} to boundary_enforcement.session_overrides in .lh/config.yml`);
}

/**
 * `lh boundary set-mode <mode>`
 * Validates and updates boundary_enforcement.mode in .lh/config.yml
 */
export async function runBoundarySetMode(root: string, mode: string): Promise<void> {
  const log = createLogger();
  const validModes = ["strict", "warn", "off"] as const;

  if (!(validModes as readonly string[]).includes(mode)) {
    throw new CLIError(`Invalid mode "${mode}". Must be one of: strict, warn, off.`);
  }

  const cfgPath = configPath(root);
  const rawYaml = await readTextFile(cfgPath);

  if (rawYaml === null) {
    throw new CLIError("No .lh/config.yml found. Run `lh init` first.");
  }

  const parsed = parseBoundaryEnforcementBlock(rawYaml);
  parsed.mode = mode;

  const newBlock = serializeBoundaryEnforcementBlock(parsed);
  const updatedYaml = injectBoundaryEnforcementBlock(rawYaml, newBlock);

  await writeTextFile(cfgPath, updatedYaml, { overwrite: true });
  log.success(`Set boundary_enforcement.mode to "${mode}" in .lh/config.yml`);
}

/**
 * `lh boundary status`
 * Reads and prints the boundary_enforcement configuration from .lh/config.yml
 */
export async function runBoundaryStatus(root: string): Promise<void> {
  const log = createLogger();
  const cfgPath = configPath(root);
  const rawYaml = await readTextFile(cfgPath);

  if (rawYaml === null) {
    throw new CLIError("No .lh/config.yml found. Run `lh init` first.");
  }

  const parsed = parseBoundaryEnforcementBlock(rawYaml);

  log.info("boundary_enforcement:");
  log.info(`  mode: ${parsed.mode ?? "strict (default)"}`);

  if (parsed.always_allow.length === 0) {
    log.info("  always_allow: []");
  } else {
    log.info("  always_allow:");
    for (const p of parsed.always_allow) {
      log.info(`    - ${p}`);
    }
  }

  if (parsed.session_overrides.length === 0) {
    log.info("  session_overrides: []");
  } else {
    log.info("  session_overrides:");
    for (const p of parsed.session_overrides) {
      log.info(`    - ${p}`);
    }
  }
}
