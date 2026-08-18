import { readTextFile, writeTextFile } from "../core/fs.js";
import { configPath } from "../core/paths.js";
import { createLogger } from "../core/logger.js";
import { CLIError } from "../core/errors.js";

// ---------------------------------------------------------------------------
// YAML block read helpers
// ---------------------------------------------------------------------------

/**
 * Parse the `command_enforcement` block from raw config YAML text.
 * Returns the force_push mode value, or null if not set.
 */
function parseCommandEnforcementBlock(raw: string): {
  force_push: string | null;
} {
  const result: { force_push: string | null } = {
    force_push: null,
  };

  const lines = raw.split("\n");
  let inBlock = false;
  let blockIndent = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const stripped = line.trimStart();

    // Detect start of command_enforcement block at indent 0
    if (!inBlock) {
      if (/^command_enforcement\s*:/.test(line)) {
        inBlock = true;
        blockIndent = 0;
      }
      continue;
    }

    // We are inside the block
    if (stripped === "" || stripped.startsWith("#")) {
      continue;
    }

    const indent = line.length - stripped.length;

    // A non-blank, non-comment line at indent 0 ends the block
    if (indent === blockIndent && /^[a-zA-Z_]/.test(stripped)) {
      break;
    }

    // Only parse lines that are children of the block (indent > 0)
    if (indent > blockIndent) {
      const forcePushMatch = stripped.match(/^force_push\s*:\s*(.+)$/);
      if (forcePushMatch) {
        result.force_push = forcePushMatch[1]!.trim().replace(/^["']|["']$/g, "");
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// YAML block write helpers
// ---------------------------------------------------------------------------

/**
 * Serialize the command_enforcement block as YAML text.
 */
function serializeCommandEnforcementBlock(opts: {
  force_push: string | null;
}): string {
  const lines: string[] = ["command_enforcement:"];

  if (opts.force_push !== null) {
    lines.push(`  force_push: ${opts.force_push}`);
  } else {
    lines.push(`  # force_push: warn   # warn (default) | deny | off`);
  }

  return lines.join("\n");
}

/**
 * Inject (replace or append) the command_enforcement block in raw YAML text.
 */
function injectCommandEnforcementBlock(rawYaml: string, newBlock: string): string {
  const lines = rawYaml.split("\n");

  // Find the start line of command_enforcement block
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^command_enforcement\s*:/.test(lines[i]!)) {
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
  if (!result.endsWith("\n")) {
    result += "\n";
  }

  return result;
}

// ---------------------------------------------------------------------------
// Command implementations
// ---------------------------------------------------------------------------

/**
 * `lh command status`
 * Reads and prints the command_enforcement configuration from .lh/config.yml
 */
export async function runCommandStatus(root: string): Promise<void> {
  const log = createLogger();
  const cfgPath = configPath(root);
  const rawYaml = await readTextFile(cfgPath);

  if (rawYaml === null) {
    throw new CLIError("No .lh/config.yml found. Run `lh init` first.");
  }

  const parsed = parseCommandEnforcementBlock(rawYaml);

  log.info("command_enforcement:");
  log.info(`  force_push: ${parsed.force_push ?? "warn (default)"}`);
}

/**
 * `lh command set-force-push <mode>`
 * Validates and updates command_enforcement.force_push in .lh/config.yml
 */
export async function runCommandSetForcePush(root: string, mode: string): Promise<void> {
  const log = createLogger();
  const validModes = ["deny", "warn", "off"] as const;

  if (!(validModes as readonly string[]).includes(mode)) {
    throw new CLIError(`Invalid mode "${mode}". Must be one of: deny, warn, off.`);
  }

  const cfgPath = configPath(root);
  const rawYaml = await readTextFile(cfgPath);

  if (rawYaml === null) {
    throw new CLIError("No .lh/config.yml found. Run `lh init` first.");
  }

  const parsed = parseCommandEnforcementBlock(rawYaml);
  parsed.force_push = mode;

  const newBlock = serializeCommandEnforcementBlock(parsed);
  const updatedYaml = injectCommandEnforcementBlock(rawYaml, newBlock);

  await writeTextFile(cfgPath, updatedYaml, { overwrite: true });
  log.success(`Set command_enforcement.force_push to "${mode}" in .lh/config.yml`);
}
