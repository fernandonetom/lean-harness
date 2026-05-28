import { runInitCommand } from "./commands/init.js";
import { runStatusCommand } from "./commands/status.js";
import { runNewCommand } from "./commands/new.js";
import { runSpecCommand } from "./commands/spec.js";
import { runListCommand } from "./commands/list.js";
import { runShowCommand } from "./commands/show.js";
import { runArchiveCommand } from "./commands/archive.js";
import { runDoctorCommand } from "./commands/doctor.js";
import { runDiscoverCommand } from "./commands/discover.js";
import { runCompileTaskCommand } from "./commands/compile-task.js";
import { runRunTaskCommand } from "./commands/run-task.js";
import { runPlanCommand } from "./commands/plan.js";
import { runBuildCommand } from "./commands/build.js";
import { runCheckCommand } from "./commands/check.js";
import { runCompressCommand } from "./commands/compress.js";
import { runCaveBusCommand } from "./commands/cavebus.js";
import { runMemoryCommand } from "./commands/memory.js";
import { runGraphCommand } from "./commands/graph.js";
import { runUpdateCommand } from "./commands/update.js";
import { runUninstallCommand } from "./commands/uninstall.js";
import { runMcpServer } from "./adapters/mcp-server.js";
import { runCompletionCommand } from "./commands/completion.js";
import { runWatchCommand } from "./commands/watch.js";
import { getVersion } from "./core/version.js";
import { CLIError } from "./core/errors.js";

export interface ParsedArgs {
  command: string | null;
  positional: string[];
  flags: {
    help: boolean;
    version: boolean;
    json: boolean;
    force: boolean;
    all: boolean;
    print: boolean;
    dryRun: boolean;
    fromSpec: boolean;
    next: boolean;
    run: boolean;
    noRun: boolean;
    strict: boolean;
    validate: boolean;
    yes: boolean;
    fix: boolean;
    global: boolean;
    team: boolean;
  };
  options: {
    title: string | null;
    cwd: string | null;
    id: string | null;
    depth: string | null;
    maxFiles: string | null;
    task: string | null;
    output: string | null;
    maxBytes: string | null;
    allowedTools: string | null;
    permissionMode: string | null;
    outputFormat: string | null;
    claudeCommand: string | null;
    taskSize: string | null;
    maxTasks: string | null;
    host: string | null;
    opencodeCommand: string | null;
    opencodeAgent: string | null;
    model: string | null;
    format: string | null;
    attach: string | null;
    session: string | null;
    maxCommandMs: string | null;
    mode: string | null;
    source: string | null;
    type: string | null;
    tail: string | null;
    width: string | null;
    height: string | null;
    filter: string | null;
  };
  repeated: {
    hint: string[];
    includeFile: string[];
    command: string[];
    approveRisk: string[];
  };
}

export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {
    command: null,
    positional: [],
    flags: { help: false, version: false, json: false, force: false, all: false, print: false, dryRun: false, fromSpec: false, next: false, run: false, noRun: false, strict: false, validate: false, yes: false, fix: false, global: false, team: false },
    options: {
      title: null, cwd: null, id: null, depth: null, maxFiles: null,
      task: null, output: null, maxBytes: null, allowedTools: null,
      permissionMode: null, outputFormat: null, claudeCommand: null,
      taskSize: null, maxTasks: null,
      host: null, opencodeCommand: null, opencodeAgent: null,
      model: null, format: null, attach: null, session: null,
      maxCommandMs: null,
      mode: null,
      source: null,
      type: null,
      tail: null,
      width: null,
      height: null,
      filter: null,
    },
    repeated: { hint: [], includeFile: [], command: [], approveRisk: [] },
  };

  const stringFlags = new Set([
    "--title", "--cwd", "--id", "--depth", "--max-files",
    "--task", "--output", "--max-bytes", "--allowed-tools",
    "--permission-mode", "--output-format", "--claude-command",
    "--task-size", "--max-tasks",
    "--host", "--opencode-command", "--opencode-agent",
    "--model", "--format", "--attach", "--session",
    "--max-command-ms",
    "--mode", "--source", "--type", "--tail",
    "--width", "--height", "--filter",
  ]);
  const repeatedFlags = new Set(["--hint", "--include-file", "--command", "--approve-risk"]);
  let i = 0;

  while (i < argv.length) {
    const arg = argv[i]!;

    if (arg === "--help" || arg === "-h") {
      result.flags.help = true;
    } else if (arg === "--version" || arg === "-v") {
      result.flags.version = true;
    } else if (arg === "--json") {
      result.flags.json = true;
    } else if (arg === "--force") {
      result.flags.force = true;
    } else if (arg === "--all") {
      result.flags.all = true;
    } else if (arg === "--print") {
      result.flags.print = true;
    } else if (arg === "--dry-run") {
      result.flags.dryRun = true;
    } else if (arg === "--from-spec") {
      result.flags.fromSpec = true;
    } else if (arg === "--next") {
      result.flags.next = true;
    } else if (arg === "--run") {
      result.flags.run = true;
    } else if (arg === "--no-run") {
      result.flags.noRun = true;
    } else if (arg === "--strict") {
      result.flags.strict = true;
    } else if (arg === "--validate") {
      result.flags.validate = true;
    } else if (arg === "--yes" || arg === "-y") {
      result.flags.yes = true;
    } else if (arg === "--fix") {
      result.flags.fix = true;
    } else if (arg === "--global") {
      result.flags.global = true;
    } else if (arg === "--team") {
      result.flags.team = true;
    } else if (arg.startsWith("--") && arg.includes("=")) {
      const eqIdx = arg.indexOf("=");
      const key = arg.slice(0, eqIdx);
      const val = arg.slice(eqIdx + 1);
      if (!applyStringFlag(result, key, val) && !applyRepeatedFlag(result, key, val)) {
        throw new CLIError(`Unknown flag: ${key}`);
      }
    } else if (repeatedFlags.has(arg)) {
      i++;
      const val = argv[i];
      if (val === undefined) {
        throw new CLIError(`Flag ${arg} requires a value.`);
      }
      applyRepeatedFlag(result, arg, val);
    } else if (stringFlags.has(arg)) {
      i++;
      const val = argv[i];
      if (val === undefined) {
        throw new CLIError(`Flag ${arg} requires a value.`);
      }
      applyStringFlag(result, arg, val);
    } else if (arg.startsWith("-")) {
      throw new CLIError(`Unknown flag: ${arg}`);
    } else {
      if (result.command === null) {
        result.command = arg;
      } else {
        result.positional.push(arg);
      }
    }

    i++;
  }

  return result;
}

function applyStringFlag(result: ParsedArgs, key: string, val: string): boolean {
  switch (key) {
    case "--title": result.options.title = val; return true;
    case "--cwd": result.options.cwd = val; return true;
    case "--id": result.options.id = val; return true;
    case "--depth": result.options.depth = val; return true;
    case "--max-files": result.options.maxFiles = val; return true;
    case "--task": result.options.task = val; return true;
    case "--output": result.options.output = val; return true;
    case "--max-bytes": result.options.maxBytes = val; return true;
    case "--allowed-tools": result.options.allowedTools = val; return true;
    case "--permission-mode": result.options.permissionMode = val; return true;
    case "--output-format": result.options.outputFormat = val; return true;
    case "--claude-command": result.options.claudeCommand = val; return true;
    case "--task-size": result.options.taskSize = val; return true;
    case "--max-tasks": result.options.maxTasks = val; return true;
    case "--host": result.options.host = val; return true;
    case "--opencode-command": result.options.opencodeCommand = val; return true;
    case "--opencode-agent": result.options.opencodeAgent = val; return true;
    case "--model": result.options.model = val; return true;
    case "--format": result.options.format = val; return true;
    case "--attach": result.options.attach = val; return true;
    case "--session": result.options.session = val; return true;
    case "--max-command-ms": result.options.maxCommandMs = val; return true;
    case "--mode": result.options.mode = val; return true;
    case "--source": result.options.source = val; return true;
    case "--type": result.options.type = val; return true;
    case "--tail": result.options.tail = val; return true;
    case "--width": result.options.width = val; return true;
    case "--height": result.options.height = val; return true;
    case "--filter": result.options.filter = val; return true;
    default: return false;
  }
}

function applyRepeatedFlag(result: ParsedArgs, key: string, val: string): boolean {
  switch (key) {
    case "--hint": result.repeated.hint.push(val); return true;
    case "--include-file": result.repeated.includeFile.push(val); return true;
    case "--command": result.repeated.command.push(val); return true;
    case "--approve-risk": result.repeated.approveRisk.push(val); return true;
    default: return false;
  }
}

export function printHelp(): void {
  const text = `LeanHarness

Claude Code-first AI harness for brownfield feature work.

Usage:
  lh <command> [options]

Commands:
  init                          Initialize the local LeanHarness artifact store
  status                        Show current LeanHarness status
  spec <request>                Create a feature spec scaffold
  new <request>                 Alias-style feature scaffold command
  list                          List LeanHarness features
  show <feature>                Show feature artifact status
  archive <feature>             Mark a feature archived without deleting files
  discover <feature>            Run on-demand discovery and write discovery.md plus boundary.json
  plan <feature>                Create plan.md and tasks.md from spec plus discovery artifacts
  compile-task <feature> <task> Compile bounded context for a planned task
  run-task <feature> <task>     Compile context and run an agent host
  build <feature> [task]        Run one or more planned tasks through an agent host
  check <feature>               Verify a feature and write checks.md plus result.md
  compress <feature>            Generate compact CaveBus summaries from feature artifacts
  cavebus <feature>             Inspect and validate a feature's CaveBus log
  memory [show|clear|status]    Manage LeanHarness memory files
  graph <build|update|inspect|clear|export> Manage code graph (imports, symbols, knowledge)
  graph export html        Export interactive HTML visualization
  graph export json        Export JSON data for programmatic access
  graph export dot         Export DOT format for Graphviz
  graph export svg         Export static SVG image
  graph export subgraph    Export filtered subgraph by pattern
  update                        Refresh LH-managed files (preserves user config)
  uninstall                     Remove all LeanHarness-managed files from this project
  watch <feature>               Watch boundary files and re-run verification on change
  completion [bash|zsh|fish]     Generate shell tab completion script
  doctor                        Check local LeanHarness setup health
  help                          Show this help
  version                       Show CLI version

Options:
  --cwd <path>                  Run as if LeanHarness was invoked from this path
  --title <text>                Set feature title explicitly
  --id <id>                     Set feature ID explicitly (e.g. F005)
  --depth <D0-D4>               Set discovery depth (default: D2)
  --max-files <n>               Max touch/read-only candidate files in output (default: 25)
  --hint <path>                 Hint path or keyword for discovery (repeatable)
  --task <task-id>              Set task ID explicitly
  --output <path>               Output path for compiled context
  --max-bytes <number>          Max bytes for compiled context (default: 60000)
  --include-file <path>         Include additional file in context (repeatable)
  --host <host>                 Agent host: claude-code or opencode
  --allowed-tools <tools>       Comma-separated Claude Code tools
  --permission-mode <mode>      Claude Code permission mode
  --output-format <format>      Claude Code output format: text, json, stream-json
  --claude-command <command>    Claude Code CLI command (default: claude)
  --opencode-command <command>  OpenCode CLI command (default: opencode)
  --opencode-agent <agent>      OpenCode agent name for opencode host
  --model <provider/model>      Model override for compatible hosts
  --format <default|json>       OpenCode output format
  --attach <url>                OpenCode attach URL
  --session <session-id>        OpenCode session ID
  --task-size <size>            Task grouping: small, medium, or large (default: medium)
  --max-tasks <n>               Max tasks to generate (default: 8, max: 12)
  --from-spec                   Create draft plan from spec only (skip discovery requirement)
  --json                        Print machine-readable JSON where supported
  --force                       Overwrite files where supported
  --all                         Include archived features in list
  --print                       Print compiled context to stdout
  --dry-run                     Preview command without executing
  --run                         Run safe verification commands during check
  --no-run                      Skip all command execution during check
  --strict                      Require strong evidence for pass verdict
  --approve-risk <gate>          Approve a risk gate for this build (repeatable)
  --command <cmd>               Add explicit verification command (repeatable)
  --max-command-ms <number>     Max time per verification command (default: 120000)
  --mode <lite|full|ultra>      Compression mode (default: full)
  --source <source>             Compression source: all, discovery, plan, tasks, build, check, memory
  --type <type>                 CaveBus message type filter
  --tail <number>               Show only the last N CaveBus entries
  --validate                    Show validation details for CaveBus log
  --fix                          Auto-fix issues found by doctor
  --global                       Install skills/agents to user-level directories
  --team                        Use team mode: feature artifacts are committed (default: solo)
  -y, --yes                     Skip interactive prompts (use defaults)
  --width <number>              SVG export width (default: 1920)
  --height <number>             SVG export height (default: 1080)
  --filter <pattern>            Subgraph export filter pattern (glob)
  -h, --help                    Show help
  -v, --version                 Show version

`;
  process.stdout.write(text);
}

export async function runCli(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const cwd = args.options.cwd ?? process.cwd();

  if (args.flags.version || args.command === "version") {
    process.stdout.write(`lh ${getVersion()}\n`);
    return;
  }

  if (args.flags.help || args.command === "help" || args.command === null) {
    printHelp();
    return;
  }

  switch (args.command) {
    case "init":
      await runInitCommand({ cwd, force: args.flags.force, json: args.flags.json, host: args.options.host ?? undefined, yes: args.flags.yes, global: args.flags.global, team: args.flags.team });
      break;
    case "status":
      await runStatusCommand({ cwd, json: args.flags.json });
      break;
    case "spec":
      await runSpecCommand({
        cwd,
        request: args.positional.join(" "),
        title: args.options.title ?? undefined,
        id: args.options.id ?? undefined,
        force: args.flags.force,
        json: args.flags.json,
      });
      break;
    case "new":
      await runNewCommand({
        cwd,
        request: args.positional.join(" "),
        title: args.options.title ?? undefined,
        id: args.options.id ?? undefined,
        force: args.flags.force,
        json: args.flags.json,
      });
      break;
    case "list":
      await runListCommand({
        cwd,
        json: args.flags.json,
        all: args.flags.all,
      });
      break;
    case "show":
      await runShowCommand({
        cwd,
        ref: args.positional[0] ?? "",
        json: args.flags.json,
      });
      break;
    case "archive":
      await runArchiveCommand({
        cwd,
        ref: args.positional[0] ?? "",
        json: args.flags.json,
      });
      break;
    case "discover":
      await runDiscoverCommand({
        cwd,
        ref: args.positional[0] ?? "",
        depth: args.options.depth ?? undefined,
        maxFiles: args.options.maxFiles ? parseInt(args.options.maxFiles, 10) : undefined,
        hints: args.repeated.hint.length > 0 ? args.repeated.hint : undefined,
        json: args.flags.json,
      });
      break;
    case "plan":
      await runPlanCommand({
        cwd,
        ref: args.positional[0] ?? "",
        force: args.flags.force,
        fromSpec: args.flags.fromSpec,
        maxTasks: args.options.maxTasks ? parseInt(args.options.maxTasks, 10) : undefined,
        taskSize: args.options.taskSize ?? undefined,
        json: args.flags.json,
      });
      break;
    case "compile-task":
      await runCompileTaskCommand({
        cwd,
        featureRef: args.positional[0] ?? "",
        taskId: args.options.task ?? args.positional[1] ?? "",
        output: args.options.output ?? undefined,
        includeFiles: args.repeated.includeFile.length > 0 ? args.repeated.includeFile : undefined,
        maxBytes: args.options.maxBytes ? parseInt(args.options.maxBytes, 10) : undefined,
        print: args.flags.print,
        json: args.flags.json,
      });
      break;
    case "run-task":
      await runRunTaskCommand({
        cwd,
        featureRef: args.positional[0] ?? "",
        taskId: args.options.task ?? args.positional[1] ?? "",
        host: args.options.host ?? undefined,
        allowedTools: args.options.allowedTools ? args.options.allowedTools.split(",") : undefined,
        permissionMode: args.options.permissionMode ?? undefined,
        outputFormat: parseOutputFormat(args.options.outputFormat),
        claudeCommand: args.options.claudeCommand ?? undefined,
        opencodeCommand: args.options.opencodeCommand ?? undefined,
        opencodeAgent: args.options.opencodeAgent ?? undefined,
        model: args.options.model ?? undefined,
        opencodeFormat: parseOpenCodeFormat(args.options.format),
        attach: args.options.attach ?? undefined,
        session: args.options.session ?? undefined,
        maxBytes: args.options.maxBytes ? parseInt(args.options.maxBytes, 10) : undefined,
        dryRun: args.flags.dryRun,
        json: args.flags.json,
      });
      break;
    case "build":
      await runBuildCommand({
        cwd,
        ref: args.positional[0] ?? "",
        taskId: args.options.task ?? args.positional[1] ?? undefined,
        host: args.options.host ?? undefined,
        dryRun: args.flags.dryRun,
        all: args.flags.all,
        maxTasks: args.options.maxTasks ? parseInt(args.options.maxTasks, 10) : undefined,
        maxBytes: args.options.maxBytes ? parseInt(args.options.maxBytes, 10) : undefined,
        json: args.flags.json,
        allowedTools: args.options.allowedTools ? args.options.allowedTools.split(",") : undefined,
        permissionMode: args.options.permissionMode ?? undefined,
        outputFormat: args.options.outputFormat ?? undefined,
        claudeCommand: args.options.claudeCommand ?? undefined,
        opencodeCommand: args.options.opencodeCommand ?? undefined,
        opencodeAgent: args.options.opencodeAgent ?? undefined,
        opencodeFormat: args.options.format ?? undefined,
        model: args.options.model ?? undefined,
        attach: args.options.attach ?? undefined,
        session: args.options.session ?? undefined,
        approveRisk: args.repeated.approveRisk.length > 0 ? args.repeated.approveRisk : undefined,
        strict: args.flags.strict || undefined,
      });
      break;
    case "check":
      await runCheckCommand({
        cwd,
        ref: args.positional[0] ?? "",
        run: args.flags.run || undefined,
        noRun: args.flags.noRun || undefined,
        strict: args.flags.strict || undefined,
        force: args.flags.force || undefined,
        commands: args.repeated.command.length > 0 ? args.repeated.command : undefined,
        maxCommandMs: args.options.maxCommandMs ? parseInt(args.options.maxCommandMs, 10) : undefined,
        json: args.flags.json,
      });
      break;
    case "compress":
      await runCompressCommand({
        cwd,
        ref: args.positional[0] ?? "",
        mode: args.options.mode ?? undefined,
        source: args.options.source ?? undefined,
        output: args.options.output ?? undefined,
        dryRun: args.flags.dryRun,
        force: args.flags.force,
        json: args.flags.json,
      });
      break;
    case "cavebus":
      await runCaveBusCommand({
        cwd,
        ref: args.positional[0] ?? "",
        type: args.options.type ?? undefined,
        tail: args.options.tail ? parseInt(args.options.tail, 10) : undefined,
        validate: args.flags.validate,
        strict: args.flags.strict,
        json: args.flags.json,
      });
      break;
    case "memory":
      await runMemoryCommand({
        cwd,
        subcommand: args.positional[0] ?? "status",
        kind: args.positional[1] ?? undefined,
        json: args.flags.json,
      });
      break;
    case "graph":
      await runGraphCommand({
        cwd,
        subcommand: args.positional[0] ?? "inspect",
        positional: args.positional.slice(1),
        json: args.flags.json,
        options: {
          width: args.options.width ?? undefined,
          height: args.options.height ?? undefined,
          filter: args.options.filter ?? undefined,
        } as any,
      });
      break;
    case "update":
      await runUpdateCommand({
        cwd,
        host: args.options.host ?? undefined,
        json: args.flags.json,
      });
      break;
    case "uninstall":
      await runUninstallCommand({
        cwd,
        yes: args.flags.yes,
        dryRun: args.flags.dryRun,
        json: args.flags.json,
      });
      break;
    case "watch":
      await runWatchCommand({
        cwd,
        ref: args.positional[0] ?? "",
        run: args.flags.run || undefined,
        noRun: args.flags.noRun || undefined,
        strict: args.flags.strict || undefined,
        json: args.flags.json,
      });
      break;
    case "doctor":
      await runDoctorCommand({ cwd, json: args.flags.json, fix: args.flags.fix });
      break;
    case "mcp-server":
      await runMcpServer(cwd);
      break;
    case "completion":
      await runCompletionCommand({ shell: args.positional[0] ?? "" });
      break;
    default:
      throw new CLIError(`Unknown command: ${args.command}`);
  }
}

function parseOutputFormat(value: string | null): "text" | "json" | "stream-json" | undefined {
  if (!value) return undefined;
  if (value === "text" || value === "json" || value === "stream-json") return value;
  return undefined;
}

function parseOpenCodeFormat(value: string | null): "default" | "json" | undefined {
  if (!value) return undefined;
  if (value === "default" || value === "json") return value;
  throw new CLIError(`Invalid OpenCode format: ${value}. Expected default or json.`);
}
