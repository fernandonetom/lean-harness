import { Command, CommanderError } from "commander";
import { runInitCommand } from "../commands/init.js";
import { runStatusCommand } from "../commands/status.js";
import { runNewCommand } from "../commands/new.js";
import { runSpecCommand } from "../commands/spec.js";
import { runListCommand } from "../commands/list.js";
import { runShowCommand } from "../commands/show.js";
import { runArchiveCommand } from "../commands/archive.js";
import { runDoctorCommand } from "../commands/doctor.js";
import { runDiscoverCommand } from "../commands/discover.js";
import { runCompileTaskCommand } from "../commands/compile-task.js";
import { runRunTaskCommand } from "../commands/run-task.js";
import { runPlanCommand } from "../commands/plan.js";
import { runBuildCommand } from "../commands/build.js";
import { runCheckCommand } from "../commands/check.js";
import { runCompressCommand } from "../commands/compress.js";
import { runCaveBusCommand } from "../commands/cavebus.js";
import { runMemoryCommand } from "../commands/memory.js";
import { runUpdateCommand } from "../commands/update.js";
import { runMigrateCommand } from "../commands/migrate.js";
import { runWorktreeLinkCommand, runWorktreeListCommand, runWorktreeUnlinkCommand } from "../commands/worktree.js";
import { runBoundaryAllow, runBoundarySetMode, runBoundaryStatus } from "../commands/boundary.js";
import { runCommandStatus, runCommandSetForcePush } from "../commands/command-enforcement.js";
import { runConfigCommand } from "../commands/config.js";
import { runUninstallCommand } from "../commands/uninstall.js";
import { runCompletionCommand } from "../commands/completion.js";
import { runWatchCommand } from "../commands/watch.js";
import { runReviewCommand } from "../commands/review.js";
import { getVersion } from "../core/version.js";
import { CLIError } from "../core/errors.js";
import { renderBanner, shouldShowHelpHeader } from "./banner.js";
import { collectString, parseOpenCodeFormat, parseOutputFormat, resolveCwd } from "./options.js";

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("lh")
    .description("Claude Code-first AI harness for brownfield feature work")
    .version(getVersion(), "-v, --version", "Show CLI version")
    .option("--cwd <path>", "Run as if LeanHarness was invoked from this directory")
    .configureHelp({ sortSubcommands: true })
    .showHelpAfterError(true)
    .addHelpText("beforeAll", () => (shouldShowHelpHeader() ? renderBanner() + "\n" : ""))
    .addHelpText(
      "after",
      "\nRun 'lh <command> --help' for command-specific options.\n",
    );

  program
    .command("init")
    .description("Initialize the local LeanHarness artifact store")
    .option("-f, --force", "Overwrite files where supported")
    .option("-y, --yes", "Skip interactive prompts")
    .option(
      "--host <host>",
      "Agent host (repeatable: claude-code, opencode; `all` installs both)",
      collectString,
      [],
    )
    .option("--global", "Install skills/agents to user-level directories")
    .option("--team", "Commit feature artifacts in team mode")
    .option("--json", "Print machine-readable JSON")
    .action(async (opts) => {
      await runInitCommand({
        cwd: resolveCwd(opts),
        force: opts.force,
        json: opts.json,
        host: opts.host?.length ? opts.host : undefined,
        yes: opts.yes,
        global: opts.global,
        team: opts.team,
      });
    });

  program
    .command("status")
    .description("Show current LeanHarness status")
    .option("--json", "Print machine-readable JSON")
    .action(async (opts) => {
      await runStatusCommand({ cwd: resolveCwd(opts), json: opts.json });
    });

  program
    .command("spec")
    .description("Create a feature spec scaffold")
    .argument("<request...>", "Feature request in natural language")
    .option("--title <text>", "Set feature title explicitly")
    .option("--id <id>", "Set feature ID explicitly (e.g. F005)")
    .option("-f, --force", "Overwrite existing spec")
    .option("--json", "Print machine-readable JSON")
    .action(async (request: string[], opts) => {
      await runSpecCommand({
        cwd: resolveCwd(opts),
        request: request.join(" "),
        title: opts.title,
        id: opts.id,
        force: opts.force,
        json: opts.json,
      });
    });

  program
    .command("new")
    .description("Alias for spec — create a feature scaffold")
    .argument("<request...>", "Feature request in natural language")
    .option("--title <text>", "Set feature title explicitly")
    .option("--id <id>", "Set feature ID explicitly")
    .option("-f, --force", "Overwrite existing spec")
    .option("--json", "Print machine-readable JSON")
    .action(async (request: string[], opts) => {
      await runNewCommand({
        cwd: resolveCwd(opts),
        request: request.join(" "),
        title: opts.title,
        id: opts.id,
        force: opts.force,
        json: opts.json,
      });
    });

  program
    .command("list")
    .description("List LeanHarness features")
    .option("--all", "Include archived features")
    .option("--json", "Print machine-readable JSON")
    .action(async (opts) => {
      await runListCommand({ cwd: resolveCwd(opts), json: opts.json, all: opts.all });
    });

  program
    .command("show")
    .description("Show feature artifact status")
    .argument("<feature>", "Feature ID or slug")
    .option("--json", "Print machine-readable JSON")
    .action(async (feature: string, opts) => {
      await runShowCommand({ cwd: resolveCwd(opts), ref: feature, json: opts.json });
    });

  program
    .command("archive")
    .description("Mark a feature archived without deleting files")
    .argument("<feature>", "Feature ID or slug")
    .option("--json", "Print machine-readable JSON")
    .action(async (feature: string, opts) => {
      await runArchiveCommand({ cwd: resolveCwd(opts), ref: feature, json: opts.json });
    });

  program
    .command("discover")
    .description("Run on-demand discovery and write discovery.md plus boundary.json")
    .argument("<feature>", "Feature ID or slug")
    .option("--depth <D0-D4>", "Discovery depth (default: D2)")
    .option("--max-files <n>", "Max candidate files in output (default: 25)")
    .option("--hint <path>", "Hint path or keyword (repeatable)", collectString, [])
    .option("--json", "Print machine-readable JSON")
    .action(async (feature: string, opts) => {
      await runDiscoverCommand({
        cwd: resolveCwd(opts),
        ref: feature,
        depth: opts.depth,
        maxFiles: opts.maxFiles ? parseInt(opts.maxFiles, 10) : undefined,
        hints: opts.hint?.length ? opts.hint : undefined,
        json: opts.json,
      });
    });

  program
    .command("plan")
    .description("Create plan.md and tasks.md from spec plus discovery artifacts")
    .argument("<feature>", "Feature ID or slug")
    .option("-f, --force", "Overwrite existing plan")
    .option("--from-spec", "Create draft plan from spec only")
    .option("--max-tasks <n>", "Max tasks to generate (default: 8, max: 12)")
    .option("--task-size <size>", "Task grouping: small, medium, or large")
    .option("--json", "Print machine-readable JSON")
    .action(async (feature: string, opts) => {
      await runPlanCommand({
        cwd: resolveCwd(opts),
        ref: feature,
        force: opts.force,
        fromSpec: opts.fromSpec,
        maxTasks: opts.maxTasks ? parseInt(opts.maxTasks, 10) : undefined,
        taskSize: opts.taskSize,
        json: opts.json,
      });
    });

  program
    .command("compile-task")
    .description("Compile bounded context for a planned task")
    .argument("<feature>", "Feature ID or slug")
    .argument("[task]", "Task ID")
    .option("--task <task-id>", "Task ID (alternative to positional)")
    .option("--output <path>", "Output path for compiled context")
    .option("--max-bytes <number>", "Max bytes for compiled context")
    .option("--include-file <path>", "Include additional file (repeatable)", collectString, [])
    .option("--print", "Print compiled context to stdout")
    .option("--json", "Print machine-readable JSON")
    .action(async (feature: string, task: string | undefined, opts) => {
      await runCompileTaskCommand({
        cwd: resolveCwd(opts),
        featureRef: feature,
        taskId: opts.task ?? task ?? "",
        output: opts.output,
        includeFiles: opts.includeFile?.length ? opts.includeFile : undefined,
        maxBytes: opts.maxBytes ? parseInt(opts.maxBytes, 10) : undefined,
        print: opts.print,
        json: opts.json,
      });
    });

  program
    .command("run-task")
    .description("Compile context and run an agent host")
    .argument("<feature>", "Feature ID or slug")
    .argument("[task]", "Task ID")
    .option("--task <task-id>", "Task ID (alternative to positional)")
    .option("--host <host>", "Agent host: claude-code or opencode")
    .option("--allowed-tools <tools>", "Comma-separated Claude Code tools")
    .option("--permission-mode <mode>", "Claude Code permission mode")
    .option("--output-format <format>", "Claude output format: text, json, stream-json")
    .option("--claude-command <command>", "Claude Code CLI command")
    .option("--opencode-command <command>", "OpenCode CLI command")
    .option("--opencode-agent <agent>", "OpenCode agent name")
    .option("--model <provider/model>", "Model override")
    .option("--format <default|json>", "OpenCode output format")
    .option("--attach <url>", "OpenCode attach URL")
    .option("--session <session-id>", "OpenCode session ID")
    .option("--max-bytes <number>", "Max bytes for compiled context")
    .option("--dry-run", "Preview without executing")
    .option("--json", "Print machine-readable JSON")
    .action(async (feature: string, task: string | undefined, opts) => {
      await runRunTaskCommand({
        cwd: resolveCwd(opts),
        featureRef: feature,
        taskId: opts.task ?? task ?? "",
        host: opts.host,
        allowedTools: opts.allowedTools ? opts.allowedTools.split(",") : undefined,
        permissionMode: opts.permissionMode,
        outputFormat: parseOutputFormat(opts.outputFormat),
        claudeCommand: opts.claudeCommand,
        opencodeCommand: opts.opencodeCommand,
        opencodeAgent: opts.opencodeAgent,
        model: opts.model,
        opencodeFormat: parseOpenCodeFormat(opts.format),
        attach: opts.attach,
        session: opts.session,
        maxBytes: opts.maxBytes ? parseInt(opts.maxBytes, 10) : undefined,
        dryRun: opts.dryRun,
        json: opts.json,
      });
    });

  program
    .command("build")
    .description("Run planned tasks through an agent host")
    .argument("<feature>", "Feature ID or slug")
    .argument("[task]", "Task ID (optional)")
    .option("--task <task-id>", "Task ID (alternative to positional)")
    .option("--host <host>", "Agent host: claude-code or opencode")
    .option("--dry-run", "Preview without executing")
    .option("--all", "Run all pending tasks in the feature")
    .option("--max-tasks <n>", "Max tasks to run in one invocation")
    .option("--max-bytes <number>", "Max bytes for compiled context")
    .option("--allowed-tools <tools>", "Comma-separated Claude Code tools")
    .option("--permission-mode <mode>", "Claude Code permission mode")
    .option("--output-format <format>", "Claude output format")
    .option("--claude-command <command>", "Claude Code CLI command")
    .option("--opencode-command <command>", "OpenCode CLI command")
    .option("--opencode-agent <agent>", "OpenCode agent name")
    .option("--format <default|json>", "OpenCode output format")
    .option("--model <provider/model>", "Model override")
    .option("--attach <url>", "OpenCode attach URL")
    .option("--session <session-id>", "OpenCode session ID")
    .option("--approve-risk <gate>", "Approve a risk gate (repeatable)", collectString, [])
    .option("--strict", "Require strong evidence during build")
    .option("--no-worktree", "Bypass workflow.require_worktree and build in the main working tree")
    .option("--json", "Print machine-readable JSON")
    .action(async (feature: string, task: string | undefined, opts) => {
      await runBuildCommand({
        cwd: resolveCwd(opts),
        ref: feature,
        taskId: opts.task ?? task,
        host: opts.host,
        dryRun: opts.dryRun,
        all: opts.all,
        maxTasks: opts.maxTasks ? parseInt(opts.maxTasks, 10) : undefined,
        maxBytes: opts.maxBytes ? parseInt(opts.maxBytes, 10) : undefined,
        json: opts.json,
        allowedTools: opts.allowedTools ? opts.allowedTools.split(",") : undefined,
        permissionMode: opts.permissionMode,
        outputFormat: opts.outputFormat,
        claudeCommand: opts.claudeCommand,
        opencodeCommand: opts.opencodeCommand,
        opencodeAgent: opts.opencodeAgent,
        opencodeFormat: opts.format,
        model: opts.model,
        attach: opts.attach,
        session: opts.session,
        approveRisk: opts.approveRisk?.length ? opts.approveRisk : undefined,
        strict: opts.strict || undefined,
        noWorktree: opts.worktree === false,
      });
    });

  program
    .command("check")
    .description("Verify a feature and write checks.md plus result.md")
    .argument("<feature>", "Feature ID or slug")
    .option("--run", "Run safe verification commands")
    .option("--no-run", "Skip all command execution")
    .option("--strict", "Require strong evidence for pass verdict")
    .option("-f, --force", "Overwrite existing checks")
    .option("--command <cmd>", "Add verification command (repeatable)", collectString, [])
    .option("--max-command-ms <number>", "Max time per verification command (ms)")
    .option("--json", "Print machine-readable JSON")
    .action(async (feature: string, opts) => {
      await runCheckCommand({
        cwd: resolveCwd(opts),
        ref: feature,
        run: opts.run || undefined,
        noRun: opts.noRun || undefined,
        strict: opts.strict || undefined,
        force: opts.force || undefined,
        commands: opts.command?.length ? opts.command : undefined,
        maxCommandMs: opts.maxCommandMs ? parseInt(opts.maxCommandMs, 10) : undefined,
        json: opts.json,
      });
    });

  program
    .command("review")
    .description("Run an independent code review on a feature or specific task")
    .argument("<feature>", "Feature ID or slug")
    .argument("[task]", "Task ID (optional)")
    .option("--host <host>", "Agent host for model resolution")
    .option("--model <provider/model>", "Model override for reviewer")
    .option("--dry-run", "Preview without writing review artifacts")
    .option("--json", "Print machine-readable JSON")
    .action(async (feature: string, task: string | undefined, opts) => {
      await runReviewCommand({
        cwd: resolveCwd(opts),
        featureRef: feature,
        taskId: task,
        host: opts.host,
        model: opts.model,
        dryRun: opts.dryRun,
        json: opts.json,
      });
    });

  program
    .command("compress")
    .description("Generate compact CaveBus summaries from feature artifacts")
    .argument("<feature>", "Feature ID or slug")
    .option("--mode <lite|full|ultra>", "Compression mode (default: full)")
    .option("--source <source>", "Compression source filter")
    .option("--output <path>", "Output path")
    .option("--dry-run", "Preview without writing")
    .option("-f, --force", "Overwrite existing output")
    .option("--json", "Print machine-readable JSON")
    .action(async (feature: string, opts) => {
      await runCompressCommand({
        cwd: resolveCwd(opts),
        ref: feature,
        mode: opts.mode,
        source: opts.source,
        output: opts.output,
        dryRun: opts.dryRun,
        force: opts.force,
        json: opts.json,
      });
    });

  program
    .command("cavebus")
    .description("Inspect and validate a feature CaveBus log")
    .argument("<feature>", "Feature ID or slug")
    .option("--type <type>", "CaveBus message type filter")
    .option("--tail <number>", "Show only the last N entries")
    .option("--validate", "Show validation details")
    .option("--strict", "Treat warnings as errors")
    .option("--json", "Print machine-readable JSON")
    .action(async (feature: string, opts) => {
      await runCaveBusCommand({
        cwd: resolveCwd(opts),
        ref: feature,
        type: opts.type,
        tail: opts.tail ? parseInt(opts.tail, 10) : undefined,
        validate: opts.validate,
        strict: opts.strict,
        json: opts.json,
      });
    });

  program
    .command("memory")
    .description("Manage LeanHarness memory files")
    .argument("[subcommand]", "show, clear, or status", "status")
    .argument("[kind]", "project, decisions, patterns, or cave")
    .option("--json", "Print machine-readable JSON")
    .action(async (subcommand: string | undefined, kind: string | undefined, opts) => {
      await runMemoryCommand({
        cwd: resolveCwd(opts),
        subcommand: subcommand ?? "status",
        kind,
        json: opts.json,
      });
    });

  const boundary = program.command("boundary").description("Manage boundary enforcement config");

  boundary
    .command("allow")
    .argument("<file-path>", "File path to add to session_overrides")
    .description("Add a file path to boundary_enforcement.session_overrides in .lh/config.yml")
    .action(async (filePath: string) => {
      await runBoundaryAllow(resolveCwd(boundary.optsWithGlobals()), filePath);
    });

  boundary
    .command("set-mode")
    .argument("<mode>", "Enforcement mode: strict, warn, or off")
    .description("Set boundary_enforcement.mode in .lh/config.yml")
    .action(async (mode: string) => {
      await runBoundarySetMode(resolveCwd(boundary.optsWithGlobals()), mode);
    });

  boundary
    .command("status")
    .description("Print current boundary_enforcement configuration from .lh/config.yml")
    .action(async () => {
      await runBoundaryStatus(resolveCwd(boundary.optsWithGlobals()));
    });

  const commandEnf = program.command("command").description("Manage command enforcement config");

  commandEnf
    .command("set-force-push")
    .argument("<mode>", "Enforcement mode for git push --force: deny, warn, or off")
    .description("Set command_enforcement.force_push in .lh/config.yml")
    .action(async (mode: string) => {
      await runCommandSetForcePush(resolveCwd(commandEnf.optsWithGlobals()), mode);
    });

  commandEnf
    .command("status")
    .description("Print current command_enforcement configuration from .lh/config.yml")
    .action(async () => {
      await runCommandStatus(resolveCwd(commandEnf.optsWithGlobals()));
    });

  const cfg = program.command("config").description("Manage LeanHarness configuration");

  cfg
    .command("get")
    .argument("<dot.path>", "Config path (e.g., models.builder)")
    .option("--json", "JSON output")
    .description("Get a config value")
    .action(async (dotPath: string, opts: Record<string, unknown>) => {
      await runConfigCommand({
        cwd: resolveCwd(cfg.optsWithGlobals()),
        subcommand: "get",
        dotPath,
        json: opts.json as boolean | undefined,
      });
    });

  cfg
    .command("set")
    .argument("<dot.path>", "Config path (e.g., models.builder)")
    .argument("<value>", "Value to set")
    .option("--json", "JSON output")
    .description("Set a config value")
    .action(async (dotPath: string, value: string, opts: Record<string, unknown>) => {
      await runConfigCommand({
        cwd: resolveCwd(cfg.optsWithGlobals()),
        subcommand: "set",
        dotPath,
        value,
        json: opts.json as boolean | undefined,
      });
    });

  cfg
    .command("unset")
    .argument("<dot.path>", "Config path to unset")
    .option("--json", "JSON output")
    .description("Unset a config value (restore default)")
    .action(async (dotPath: string, opts: Record<string, unknown>) => {
      await runConfigCommand({
        cwd: resolveCwd(cfg.optsWithGlobals()),
        subcommand: "unset",
        dotPath,
        json: opts.json as boolean | undefined,
      });
    });

  cfg
    .command("list")
    .option("--json", "JSON output")
    .description("List all config paths")
    .action(async (opts: Record<string, unknown>) => {
      await runConfigCommand({
        cwd: resolveCwd(cfg.optsWithGlobals()),
        subcommand: "list",
        json: opts.json as boolean | undefined,
      });
    });

  cfg
    .command("validate")
    .option("--json", "JSON output")
    .description("Validate config.yml")
    .action(async (opts: Record<string, unknown>) => {
      await runConfigCommand({
        cwd: resolveCwd(cfg.optsWithGlobals()),
        subcommand: "validate",
        json: opts.json as boolean | undefined,
      });
    });

  cfg
    .command("show", { isDefault: true })
    .option("--json", "JSON output")
    .description("Show effective config summary")
    .action(async (opts: Record<string, unknown>) => {
      await runConfigCommand({
        cwd: resolveCwd(cfg.optsWithGlobals()),
        subcommand: "show",
        json: opts.json as boolean | undefined,
      });
    });

  program
    .command("update")
    .description("Refresh LH-managed files (preserves user config)")
    .option("--host <host>", "Host pack to refresh: claude-code, opencode, or all")
    .option("--json", "Print machine-readable JSON")
    .action(async (opts) => {
      await runUpdateCommand({
        cwd: resolveCwd(opts),
        host: opts.host,
        json: opts.json,
      });
    });

  program
    .command("migrate")
    .description("Migrate a v1.x repo to the v2 plugin-based layout (deletes legacy generated files once the lh plugin is confirmed installed)")
    .option("-y, --yes", "Skip confirmation prompt")
    .option("--dry-run", "Preview what would be removed without deleting anything")
    .option("--force", "Proceed even if the plugin isn't detected as installed (for CI/scripted use)")
    .option("--json", "Print machine-readable JSON")
    .action(async (opts) => {
      await runMigrateCommand({
        cwd: resolveCwd(opts),
        yes: opts.yes,
        dryRun: opts.dryRun,
        force: opts.force,
        json: opts.json,
      });
    });

  const worktree = program
    .command("worktree")
    .description("Track per-feature git worktrees in .lh/state.json (creation/removal is handled by the lh-worktree skill)");

  worktree
    .command("link")
    .argument("<feature>", "Feature ID or slug")
    .requiredOption("--path <dir>", "Path to an existing git worktree")
    .option("--branch <name>", "Branch name (default: the worktree's actual branch, or feature/<id>-<slug>)")
    .option("-f, --force", "Record the path even if it isn't a registered git worktree")
    .option("--json", "Print machine-readable JSON")
    .description("Record an existing git worktree against a feature")
    .action(async (feature: string, opts) => {
      await runWorktreeLinkCommand({
        cwd: resolveCwd(worktree.optsWithGlobals()),
        ref: feature,
        path: opts.path,
        branch: opts.branch,
        force: opts.force,
        json: opts.json,
      });
    });

  worktree
    .command("list")
    .option("--json", "Print machine-readable JSON")
    .description("List feature worktrees")
    .action(async (opts) => {
      await runWorktreeListCommand({
        cwd: resolveCwd(worktree.optsWithGlobals()),
        json: opts.json,
      });
    });

  worktree
    .command("unlink")
    .argument("<feature>", "Feature ID or slug")
    .option("--json", "Print machine-readable JSON")
    .description("Clear a feature's worktree record (does not touch the git worktree itself)")
    .action(async (feature: string, opts) => {
      await runWorktreeUnlinkCommand({
        cwd: resolveCwd(worktree.optsWithGlobals()),
        ref: feature,
        json: opts.json,
      });
    });

  program
    .command("uninstall")
    .description("Remove LeanHarness-managed files from this project")
    .option("-y, --yes", "Skip prompts and use safe defaults")
    .option("--dry-run", "Preview removal without deleting")
    .option("--json", "Print machine-readable JSON")
    .action(async (opts) => {
      await runUninstallCommand({
        cwd: resolveCwd(opts),
        yes: opts.yes,
        dryRun: opts.dryRun,
        json: opts.json,
      });
    });

  program
    .command("watch")
    .description("Watch boundary files and re-run verification on change")
    .argument("<feature>", "Feature ID or slug")
    .option("--run", "Run safe verification commands on change")
    .option("--no-run", "Skip command execution on change")
    .option("--strict", "Require strong evidence")
    .option("--json", "Print machine-readable JSON")
    .action(async (feature: string, opts) => {
      await runWatchCommand({
        cwd: resolveCwd(opts),
        ref: feature,
        run: opts.run || undefined,
        noRun: opts.noRun || undefined,
        strict: opts.strict || undefined,
        json: opts.json,
      });
    });

  program
    .command("doctor")
    .description("Check local LeanHarness setup health")
    .option("--fix", "Auto-fix issues where supported")
    .option("--json", "Print machine-readable JSON")
    .action(async (opts) => {
      await runDoctorCommand({ cwd: resolveCwd(opts), json: opts.json, fix: opts.fix });
    });

  program
    .command("completion")
    .description("Generate shell tab completion script")
    .argument("[shell]", "bash, zsh, or fish")
    .action(async (shell: string | undefined) => {
      await runCompletionCommand({ shell: shell ?? "" });
    });

  program
    .command("version")
    .description("Show CLI version")
    .action(() => {
      process.stdout.write(`lh ${getVersion()}\n`);
    });

  return program;
}

export async function runCli(argv: string[]): Promise<void> {
  const program = buildProgram();

  if (argv.length === 0) {
    program.outputHelp();
    return;
  }

  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (err) {
    if (err instanceof CommanderError) {
      if (err.code === "commander.helpDisplayed" || err.code === "commander.version") {
        return;
      }
      throw new CLIError(err.message);
    }
    throw err;
  }
}
