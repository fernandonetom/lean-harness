import { createLogger, printJson } from "../core/logger.js";
import { CLIError } from "../core/errors.js";
import {
  readMemory,
  clearMemory,
  getMemoryStatus,
  loadConfigForMemory,
  type MemoryFileKind,
} from "../memory/index.js";

export interface MemoryCommandOptions {
  cwd: string;
  subcommand: string;
  kind?: string | undefined;
  json?: boolean;
}

const VALID_KINDS = new Set<string>(["project", "decisions", "patterns", "cave"]);
const VALID_SUBCOMMANDS = new Set<string>(["show", "clear", "status"]);

export async function runMemoryCommand(options: MemoryCommandOptions): Promise<void> {
  const { cwd, subcommand, kind, json = false } = options;
  const log = createLogger({ json });

  if (!VALID_SUBCOMMANDS.has(subcommand)) {
    throw new CLIError(`Unknown memory subcommand: ${subcommand}. Expected: show, clear, status`);
  }

  if (kind !== undefined && !VALID_KINDS.has(kind)) {
    throw new CLIError(`Unknown memory file: ${kind}. Expected: project, decisions, patterns, cave`);
  }

  const config = await loadConfigForMemory(cwd);

  switch (subcommand) {
    case "show":
      await handleShow(cwd, kind as MemoryFileKind | undefined, config, log, json);
      break;
    case "clear":
      await handleClear(cwd, kind as MemoryFileKind | undefined, config, log, json);
      break;
    case "status":
      await handleStatus(cwd, config, log, json);
      break;
  }
}

async function handleShow(
  root: string,
  kind: MemoryFileKind | undefined,
  config: ReturnType<typeof Object> | null,
  log: ReturnType<typeof createLogger>,
  json: boolean,
): Promise<void> {
  const kinds: MemoryFileKind[] = kind ? [kind] : ["project", "decisions", "patterns", "cave"];
  const results: Record<string, string | null> = {};

  for (const k of kinds) {
    const content = await readMemory(root, k, config);
    results[k] = content;
  }

  if (json) {
    printJson(results);
    return;
  }

  for (const k of kinds) {
    const content = results[k] ?? null;
    if (content === null) {
      log.warn(`${k}: not found`);
    } else {
      if (kinds.length > 1) {
        log.info(`--- ${k} ---`);
      }
      log.raw(content);
      if (!content.endsWith("\n")) log.raw("\n");
    }
  }
}

async function handleClear(
  root: string,
  kind: MemoryFileKind | undefined,
  config: ReturnType<typeof Object> | null,
  log: ReturnType<typeof createLogger>,
  json: boolean,
): Promise<void> {
  const kinds: MemoryFileKind[] = kind ? [kind] : ["project", "decisions", "patterns", "cave"];
  const cleared: string[] = [];

  for (const k of kinds) {
    await clearMemory(root, k, config);
    cleared.push(k);
  }

  if (json) {
    printJson({ cleared });
    return;
  }

  for (const k of cleared) {
    log.success(`${k} memory cleared.`);
  }
}

async function handleStatus(
  root: string,
  config: ReturnType<typeof Object> | null,
  log: ReturnType<typeof createLogger>,
  json: boolean,
): Promise<void> {
  const status = await getMemoryStatus(root, config);

  if (json) {
    printJson({
      dir: status.dir,
      files: status.files.map(f => ({
        kind: f.kind,
        path: f.path,
        exists: f.exists,
        lines: f.content ? f.content.split("\n").length : 0,
        bytes: f.content ? f.content.length : 0,
      })),
    });
    return;
  }

  log.info(`Memory directory: ${status.dir}`);
  log.info("");
  for (const f of status.files) {
    const lines = f.content ? f.content.split("\n").length : 0;
    const sizeInfo = f.exists ? `${lines} lines` : "missing";
    log.info(`  ${f.kind}: ${sizeInfo} (${f.path})`);
  }
}
