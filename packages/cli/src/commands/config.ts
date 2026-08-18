import { createLogger, printJson } from "../core/logger.js";
import { loadHarnessConfig } from "../core/config.js";
import { CLIError } from "../core/errors.js";
import {
  configSet,
  configGet,
  configUnset,
  listConfigPaths,
  getConfigPathSchema,
  parseConfigValue,
} from "../core/config-mutate.js";
import type { ConfigMutateResult } from "../core/config-mutate.js";

export interface ConfigOptions {
  cwd: string;
  subcommand?: string | undefined;
  dotPath?: string | undefined;
  value?: string | undefined;
  json?: boolean | undefined;
  host?: string | undefined;
  yes?: boolean | undefined;
}

export async function runConfigCommand(options: ConfigOptions): Promise<void> {
  const { cwd, json = false } = options;
  const log = createLogger({ json });

  const subcommand = options.subcommand ?? "show";

  switch (subcommand) {
    case "get": {
      if (!options.dotPath) throw new CLIError("Usage: lh config get <dot.path>");
      const result = await configGet(cwd, options.dotPath);
      outputConfigResult(result, json, log);
      break;
    }
    case "set": {
      if (!options.dotPath || options.value === undefined) {
        throw new CLIError("Usage: lh config set <dot.path> <value>");
      }
      const schema = getConfigPathSchema(options.dotPath);
      if (!schema) throw new CLIError(`Unknown config path: "${options.dotPath}"`);
      const parsedValue = parseConfigValue(options.value, schema.type, schema.enums);
      const result = await configSet(cwd, options.dotPath, parsedValue);
      outputConfigResult(result, json, log);
      break;
    }
    case "unset": {
      if (!options.dotPath) throw new CLIError("Usage: lh config unset <dot.path>");
      const result = await configUnset(cwd, options.dotPath);
      outputConfigResult(result, json, log);
      break;
    }
    case "list": {
      const paths = listConfigPaths();
      if (json) {
        printJson({ paths: paths.map((p) => ({ path: p.path.join("."), type: p.type, enums: p.enums })) });
        return;
      }
      log.info("Available config paths:");
      log.info("");
      const { parsed } = await loadHarnessConfig(cwd);
      for (const p of paths) {
        const dotPath = p.path.join(".");
        const value = parsed ? getNested(parsed as unknown as Record<string, unknown>, dotPath) : undefined;
        const status = value !== undefined ? "set" : "default";
        log.info(`  ${dotPath} (${p.type}) [${status}]`);
      }
      break;
    }
    case "validate": {
      const { exists, parsed } = await loadHarnessConfig(cwd);
      if (json) {
        printJson({ valid: exists && parsed !== null });
        return;
      }
      if (!exists || !parsed) {
        log.warn("No .lh/config.yml found. Run 'lh init' first.");
      } else {
        log.success("Config file exists and is valid YAML.");
      }
      break;
    }
    default: {
      const { parsed } = await loadHarnessConfig(cwd);
      if (json) {
        printJson(parsed ?? {});
        return;
      }
      if (!parsed) {
        log.warn("No .lh/config.yml found. Run 'lh init' first.");
        return;
      }
      printConfigSummary(parsed as unknown as Record<string, unknown>, log);
      break;
    }
  }
}

function outputConfigResult(result: ConfigMutateResult, json: boolean, log: ReturnType<typeof createLogger>): void {
  if (json) {
    printJson({
      ok: result.ok,
      path: result.path.join("."),
      previousValue: result.previousValue,
      newValue: result.newValue,
    });
    return;
  }

  log.info(`Config path: ${result.path.join(".")}`);
  log.info(`Previous value: ${JSON.stringify(result.previousValue)}`);
  log.info(`New value: ${JSON.stringify(result.newValue)}`);

  if (result.reloadInstructions.length > 0) {
    log.warn("");
    log.warn("Reload required:");
    for (const instr of result.reloadInstructions) {
      log.warn(`  ${instr}`);
    }
  }

  if (result.warnings.length > 0) {
    for (const w of result.warnings) {
      log.warn(w);
    }
  }
}

function getNested(obj: Record<string, unknown>, dottedPath: string): unknown {
  const parts = dottedPath.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function printConfigSummary(config: Record<string, unknown>, log: ReturnType<typeof createLogger>): void {
  log.info("LeanHarness configuration summary");
  log.info("");

  const sections: Array<[string, string[]]> = [
    ["project", ["name", "mode"]],
    ["host", ["primary", "adapter"]],
    ["workflow", ["visible_steps", "require_review", "require_verification", "require_worktree", "worktree_dir"]],
    ["discovery", ["strategy", "default_depth", "max_initial_files"]],
    ["compression", ["enabled", "protocol", "mode"]],
    ["verification", ["require_acceptance_trace", "require_changed_files", "require_review", "allow_self_review"]],
    ["models", ["agent", "subagent", "planner", "builder", "reviewer", "verifier", "compressor", "fix"]],
    ["build", ["session_budget", "with_review", "max_fix_iterations", "model_profile", "exec_mode"]],
    ["risk_gates", ["require_approval"]],
    ["features", ["commit"]],
    ["boundary_enforcement", ["mode", "always_allow", "session_overrides"]],
    ["command_enforcement", ["force_push"]],
  ];

  for (const [section, keys] of sections) {
    const sectionObj = config[section];
    if (sectionObj && typeof sectionObj === "object") {
      log.info(`[${section}]`);
      for (const key of keys) {
        const value = (sectionObj as Record<string, unknown>)[key];
        if (value !== undefined) {
          const display = Array.isArray(value) ? `[${(value as unknown[]).length} items]` : JSON.stringify(value);
          log.info(`  ${key}: ${display}`);
        }
      }
      log.info("");
    }
  }
}
