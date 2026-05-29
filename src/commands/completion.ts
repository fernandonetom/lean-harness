import { CLIError } from "../core/errors.js";

export type CompletionShell = "bash" | "zsh" | "fish";

export interface CompletionOptions {
  shell: string;
}

const COMMANDS = [
  "init", "status", "spec", "new", "list", "show", "archive",
  "discover", "plan", "compile-task", "run-task", "build", "check",
  "compress", "cavebus", "memory", "update", "doctor", "completion",
  "help", "version",
];

const COMMON_FLAGS = ["--help", "--version", "--json", "--cwd"];

const COMMAND_FLAGS: Record<string, string[]> = {
  init: ["--force", "--yes", "--host", "--global", "--team"],
  status: [],
  spec: ["--title", "--id", "--force"],
  new: ["--title", "--id", "--force"],
  list: ["--all"],
  show: [],
  archive: [],
  discover: ["--depth", "--max-files", "--hint"],
  plan: ["--force", "--from-spec", "--max-tasks", "--task-size"],
  "compile-task": ["--task", "--output", "--max-bytes", "--include-file", "--print"],
  "run-task": [
    "--task", "--host", "--allowed-tools", "--permission-mode", "--output-format",
    "--claude-command", "--opencode-command", "--opencode-agent", "--model", "--format",
    "--attach", "--session", "--max-bytes", "--dry-run",
  ],
  build: [
    "--task", "--host", "--dry-run", "--all", "--max-tasks", "--max-bytes",
    "--allowed-tools", "--permission-mode", "--output-format", "--claude-command",
    "--opencode-command", "--opencode-agent", "--format", "--model", "--attach",
    "--session", "--approve-risk", "--strict",
  ],
  check: ["--run", "--no-run", "--strict", "--force", "--command", "--max-command-ms"],
  compress: ["--mode", "--source", "--output", "--dry-run", "--force"],
  cavebus: ["--type", "--tail", "--validate", "--strict"],
  memory: [],
  update: ["--host"],
  uninstall: ["--yes", "--dry-run"],
  watch: ["--run", "--no-run", "--strict"],
  doctor: ["--fix"],
  completion: [],
};

function flagsForCommand(cmd: string): string[] {
  return [...COMMON_FLAGS, ...(COMMAND_FLAGS[cmd] ?? [])];
}

/** Union of all flags (legacy fish/zsh fallback) */
const ALL_FLAGS = [...new Set([...COMMON_FLAGS, ...Object.values(COMMAND_FLAGS).flat()])];

const VALID_SHELLS = new Set<string>(["bash", "zsh", "fish"]);

export async function runCompletionCommand(options: CompletionOptions): Promise<void> {
  const { shell } = options;

  if (!VALID_SHELLS.has(shell)) {
    throw new CLIError(`Unknown shell: ${shell}. Expected bash, zsh, or fish.`);
  }

  const script = generateCompletion(shell as CompletionShell);
  process.stdout.write(script);
}

export function generateCompletion(shell: CompletionShell): string {
  switch (shell) {
    case "bash": return generateBash();
    case "zsh": return generateZsh();
    case "fish": return generateFish();
  }
}

function generateBash(): string {
  const cmds = COMMANDS.join(" ");
  const initFlags = flagsForCommand("init").join(" ");
  const discoverFlags = flagsForCommand("discover").join(" ");
  const allFlags = ALL_FLAGS.join(" ");
  return `# LeanHarness bash completion
# Add to ~/.bashrc: eval "$(lh completion bash)"

_lh_completions() {
  local cur prev commands flags
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  commands="${cmds}"

  if [[ \${COMP_CWORD} -eq 1 ]]; then
    COMPREPLY=( $(compgen -W "\${commands}" -- "\${cur}") )
    return 0
  fi

  if [[ "\${cur}" == -* ]]; then
    case "\${COMP_WORDS[1]}" in
      init) flags="${initFlags}" ;;
      discover) flags="${discoverFlags}" ;;
      *) flags="${allFlags}" ;;
    esac
    COMPREPLY=( $(compgen -W "\${flags}" -- "\${cur}") )
    return 0
  fi

  case "\${prev}" in
    --host)
      COMPREPLY=( $(compgen -W "claude-code opencode all" -- "\${cur}") )
      return 0
      ;;
    --depth)
      COMPREPLY=( $(compgen -W "D0 D1 D2 D3 D4" -- "\${cur}") )
      return 0
      ;;
    --mode)
      COMPREPLY=( $(compgen -W "lite full ultra" -- "\${cur}") )
      return 0
      ;;
    --task-size)
      COMPREPLY=( $(compgen -W "small medium large" -- "\${cur}") )
      return 0
      ;;
    --output-format)
      COMPREPLY=( $(compgen -W "text json stream-json" -- "\${cur}") )
      return 0
      ;;
    completion)
      COMPREPLY=( $(compgen -W "bash zsh fish" -- "\${cur}") )
      return 0
      ;;
    memory)
      COMPREPLY=( $(compgen -W "show clear status" -- "\${cur}") )
      return 0
      ;;
  esac

  # Feature IDs from state.json
  if [[ -f .lh/state.json ]]; then
    local features
    features=$(grep -o '"id":"[^"]*"' .lh/state.json 2>/dev/null | sed 's/"id":"//;s/"//' | tr '\\n' ' ')
    if [[ -n "\${features}" ]]; then
      COMPREPLY=( $(compgen -W "\${features}" -- "\${cur}") )
      return 0
    fi
  fi
}

complete -F _lh_completions lh
`;
}

function generateZsh(): string {
  const cmdsArray = COMMANDS.map((c) => `'${c}:${getCommandDescription(c)}'`).join("\n    ");
  const flagsArray = ALL_FLAGS.map((f) => `'${f}'`).join("\n    ");
  return `#compdef lh
# LeanHarness zsh completion
# Add to ~/.zshrc: eval "$(lh completion zsh)"

_lh() {
  local -a commands flags

  commands=(
    ${cmdsArray}
  )

  flags=(
    ${flagsArray}
  )

  _arguments -C \\
    '1: :->command' \\
    '*: :->args'

  case \$state in
    command)
      _describe 'command' commands
      ;;
    args)
      case \$words[2] in
        completion)
          _values 'shell' bash zsh fish
          ;;
        memory)
          _values 'subcommand' show clear status
          ;;
        *)
          if [[ "\$cur" == -* ]]; then
            _describe 'flag' flags
          else
            # Complete feature IDs
            if [[ -f .lh/state.json ]]; then
              local -a features
              features=(\${(f)"$(grep -o '"id":"[^"]*"' .lh/state.json 2>/dev/null | sed 's/"id":"//;s/"//')"})
              _describe 'feature' features
            fi
          fi
          ;;
      esac
      ;;
  esac
}

_lh
`;
}

function generateFish(): string {
  const lines: string[] = [
    "# LeanHarness fish completion",
    "# Add to fish: lh completion fish | source",
    "",
  ];

  for (const cmd of COMMANDS) {
    lines.push(`complete -c lh -n '__fish_use_subcommand' -a '${cmd}' -d '${getCommandDescription(cmd)}'`);
  }

  lines.push("");

  for (const flag of ALL_FLAGS) {
    const name = flag.replace(/^--/, "");
    lines.push(`complete -c lh -l '${name}'`);
  }

  lines.push("");
  lines.push("# --host values");
  lines.push("complete -c lh -l host -xa 'claude-code opencode all'");
  lines.push("complete -c lh -l depth -xa 'D0 D1 D2 D3 D4'");
  lines.push("complete -c lh -l mode -xa 'lite full ultra'");
  lines.push("complete -c lh -l task-size -xa 'small medium large'");
  lines.push("complete -c lh -l output-format -xa 'text json stream-json'");
  lines.push("");
  lines.push("# completion subcommands");
  lines.push("complete -c lh -n '__fish_seen_subcommand_from completion' -xa 'bash zsh fish'");
  lines.push("complete -c lh -n '__fish_seen_subcommand_from memory' -xa 'show clear status'");
  lines.push("");

  return lines.join("\n") + "\n";
}

function getCommandDescription(cmd: string): string {
  const descriptions: Record<string, string> = {
    init: "Initialize LeanHarness",
    status: "Show current status",
    spec: "Create feature spec",
    new: "Create feature scaffold",
    list: "List features",
    show: "Show feature details",
    archive: "Archive a feature",
    discover: "Run discovery",
    plan: "Create plan from spec",
    "compile-task": "Compile task context",
    "run-task": "Run a task via agent",
    build: "Build feature tasks",
    check: "Verify feature",
    compress: "Generate CaveBus summaries",
    cavebus: "Inspect CaveBus log",
    memory: "Manage memory files",
    update: "Refresh LH-managed files",
    doctor: "Check setup health",
    completion: "Generate shell completion",
    help: "Show help",
    version: "Show version",
  };
  return descriptions[cmd] ?? cmd;
}
