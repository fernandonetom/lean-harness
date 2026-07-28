# Commands

## Command overview

| Command | Purpose |
|---------|---------|
| `init` | Initialize LeanHarness in a project |
| `status` | Show current LeanHarness status |
| `doctor` | Check local setup health |
| `spec` | Create a feature spec from a request |
| `new` | Alias for spec with scaffold behavior |
| `list` | List features |
| `show` | Show feature artifact status |
| `archive` | Mark a feature archived |
| `discover` | Run on-demand discovery and produce boundary |
| `plan` | Create plan and tasks from spec and discovery |
| `compile-task` | Compile bounded context for a task |
| `run-task` | Compile context and invoke an agent host |
| `build` | Run planned tasks through an agent host |
| `boundary` | Manage boundary enforcement configuration |
| `check` | Verify a feature against acceptance criteria |
| `compress` | Generate CaveBus summaries from feature artifacts |
| `cavebus` | Inspect and validate CaveBus log |
| `memory` | Manage LeanHarness memory files |
| `update` | Refresh `.lh/` scaffold (preserves config); delegates to `migrate` on v1.x repos |
| `migrate` | Migrate a v1.x repo to the v2 plugin-based layout |
| `worktree` | Track per-feature git worktrees in `.lh/state.json` (creation is handled by the `lh-worktree` skill) |
| `watch` | Watch boundary files, re-run verification on change |
| `completion` | Generate shell tab completion scripts |
| `graph` | Build and inspect the code graph (imports, symbols, knowledge) |

## Global options

```
--cwd <path>       Run as if invoked from this path
--json             Output machine-readable JSON where supported
--help, -h         Show help
--version, -v      Show version
```

## init

Initialize the LeanHarness artifact store and host integration files.

```bash
lh init --host all
lh init --host claude-code --host opencode
lh init --host claude-code
lh init --host opencode
```

**Options:**

- `--host <host>` — Agent host integration (repeatable): `claude-code`, `opencode`, or `all` (both). Omit to choose interactively with multi-select.
- `--force` — Overwrite existing integration files
- `--yes` / `-y` — Skip interactive prompts, use defaults
- `--global` — Install skills/agents to user-level directories (OpenCode only)
- `--no-pin` — Skip pinning the Claude Code plugin marketplace/enabled-plugins entries in `.claude/settings.json`

**Creates:**

- `.lh/` directory with config, templates, policies, protocols
- **Claude Code:** `.claude/settings.json` (permissions, env, plugin marketplace pin) and `.lh/policies/claude-code.yml`, plus printed `/plugin marketplace add` / `/plugin install` instructions — skills, agents, and hooks are delivered by the plugin, not written into the repo
- **OpenCode:** `.opencode/{commands,agents,plugins}/` and a merged `opencode.json`

**Safety:** Non-destructive by default. Existing files are preserved unless `--force` is used.

## status

Show current LeanHarness status: active features, artifact state, host availability.

```bash
lh status
lh status --json
```

## doctor

Check local setup health and optionally auto-fix issues.

```bash
lh doctor
lh doctor --fix
lh doctor --json
```

**Options:**

- `--fix` — Auto-fix detected issues (missing dirs, templates, invalid state)

**Checks:**

- `.lh/` directory exists
- `config.yml` is readable
- Templates are present
- Agent host CLIs are available
- State index consistency

## spec

Create a feature spec scaffold from a natural language request.

```bash
lh spec "Add password reset without replacing existing auth" --title "Password reset"
lh spec "Add rate limiting to public API" --id F005
```

**Options:**

- `--title <text>` — Set feature title explicitly
- `--id <id>` — Set feature ID explicitly (e.g., F005)
- `--force` — Overwrite existing spec

**Creates:**

- `.lh/features/<id>-<slug>/spec.md`
- Updates `.lh/state.json`

## new

Alias-style feature scaffold command. Behaves like `spec`.

```bash
lh new "Add user profile editing" --title "Profile editing"
```

## list

List features in the artifact store.

```bash
lh list
lh list --all
lh list --json
```

**Options:**

- `--all` — Include archived features
- `--json` — JSON output

## show

Show artifact status for a feature.

```bash
lh show F001
lh show F001 --json
```

Shows which artifacts exist (spec, discovery, boundary, plan, tasks, checks, result) and current status.

## archive

Mark a feature as archived without deleting files.

```bash
lh archive F001
```

Archived features are hidden from `lh list` unless `--all` is used. No files are deleted.

## discover

Run on-demand discovery for a feature. Produces `discovery.md` and `boundary.json`.

```bash
lh discover F001
lh discover F001 --depth D2
lh discover F001 --depth D3 --hint src/auth --hint src/email
lh discover F001 --max-files 50
```

**Options:**

- `--depth <D0-D4>` — Discovery depth (default: D2)
- `--hint <path>` — Hint path or keyword for discovery (repeatable)
- `--max-files <n>` — Max touch/read-only candidate files (default: 25)

**Discovery depths:**

| Depth | Scope |
|-------|-------|
| D0 | Repo shape: package manager, major folders, test commands |
| D1 | Candidate surfaces: relevant files, routes, components, services |
| D2 | Dependency boundary: imports, callers, callees, neighboring tests |
| D3 | Risk probes: focused test runs, security checks |
| D4 | Deep dive: broader architecture when D0-D3 insufficient |

**Creates:**

- `.lh/features/<id>-<slug>/discovery.md`
- `.lh/features/<id>-<slug>/boundary.json`

**Requires:** `spec.md` must exist for the feature.

## plan

Create a plan and task breakdown from spec and discovery artifacts.

```bash
lh plan F001
lh plan F001 --from-spec
lh plan F001 --task-size small --max-tasks 6
```

**Options:**

- `--from-spec` — Create draft plan from spec only (skip discovery requirement)
- `--task-size <size>` — Task grouping: small, medium, or large (default: medium)
- `--max-tasks <n>` — Max tasks to generate (default: 8, max: 12)
- `--force` — Overwrite existing plan

**Creates:**

- `.lh/features/<id>-<slug>/plan.md`
- `.lh/features/<id>-<slug>/tasks.md`

**Requires:** `spec.md` and `discovery.md` (unless `--from-spec` is used).

## compile-task

Compile bounded context for a single planned task. Produces a self-contained context file an agent can consume.

```bash
lh compile-task F001 T01
lh compile-task F001 T01 --print
lh compile-task F001 T01 --output /tmp/context.md
lh compile-task F001 T01 --max-bytes 40000
lh compile-task F001 T01 --include-file src/auth/types.ts
```

**Options:**

- `--task <id>` — Task ID (alternative to positional argument)
- `--output <path>` — Write context to specific path
- `--print` — Print compiled context to stdout
- `--max-bytes <n>` — Max bytes for compiled context (default: 60000)
- `--include-file <path>` — Include additional file in context (repeatable)

**Creates:**

- `.lh/features/<id>-<slug>/task-context/T<nn>.md`

**Requires:** `plan.md` and `tasks.md` must exist.

## run-task

Compile context and invoke an agent host for a single task.

```bash
lh run-task F001 T01 --host claude-code --dry-run
lh run-task F001 T01 --host opencode --opencode-agent lh-builder --dry-run
lh run-task F001 T01 --host claude-code
```

**Options:**

- `--host <host>` — Agent host: `claude-code` or `opencode`
- `--dry-run` — Preview without invoking agent
- `--allowed-tools <tools>` — Comma-separated Claude Code tools
- `--permission-mode <mode>` — Claude Code permission mode
- `--output-format <format>` — Claude Code output: text, json, stream-json
- `--claude-command <cmd>` — Claude Code CLI command (default: claude)
- `--opencode-command <cmd>` — OpenCode CLI command (default: opencode)
- `--opencode-agent <agent>` — OpenCode agent name
- `--model <model>` — Model override for compatible hosts
- `--max-bytes <n>` — Max context bytes

**Safety:** Always use `--dry-run` first. Real runs invoke an external agent host.

## build

Run one or more planned tasks through an agent host.

```bash
lh build F001 --host claude-code --dry-run
lh build F001 --host opencode --opencode-agent lh-builder --dry-run
lh build F001 --host claude-code
lh build F001 T03 --host claude-code
```

**Options:**

All `run-task` options plus:

- `--all` — Run all tasks including completed ones
- `--max-tasks <n>` — Limit tasks per build run
- `--strict` — Strict risk gate enforcement
- `--approve-risk <gate>` — Approve a risk gate for this build (repeatable)

**Behavior:**

- Without a task ID, runs pending tasks in dependency order.
- With a task ID, runs only that task.
- With `--dry-run`, validates context and plan without invoking agents.

**Safety:** Always use `--dry-run` before a real build. Real builds invoke an external agent host and may modify files.

## boundary

Manage boundary enforcement configuration.

```bash
lh boundary status
lh boundary set-mode strict
lh boundary set-mode warn
lh boundary set-mode off
lh boundary allow <file-path>
lh boundary exempt <file-path>
```

**Options:**

- `status` — Print current `boundary_enforcement` configuration from `.lh/config.yml`
- `set-mode <mode>` — Set `boundary_enforcement.mode` (`strict`, `warn`, `off`)
- `allow <file-path>` — Add a file path to `boundary_enforcement.session_overrides` in `.lh/config.yml`
- `exempt <file-path>` — Remove a file path from `session_overrides`

**Modes:**

| Mode | Behavior |
|------|----------|
| `strict` | Blocks edits outside boundary |
| `warn` | Logs warnings but allows edits (default) |
| `off` | Disabled |

**Examples:**

```bash
# View current configuration
lh boundary status

# Enable strict mode
lh boundary set-mode strict

# Allow a specific file temporarily
lh boundary allow src/legacy/old-code.ts

# Remove override
lh boundary exempt src/legacy/old-code.ts
```

## check

Verify a feature against its acceptance criteria. Produces `checks.md` and `result.md`.

```bash
lh check F001
lh check F001 --no-run
lh check F001 --run
lh check F001 --strict
lh check F001 --command "npm test" --command "npm run lint"
lh check F001 --force
```

**Options:**

- `--run` — Run safe verification commands during check
- `--no-run` — Skip all command execution
- `--strict` — Require strong evidence for pass verdict
- `--force` — Re-check even if result already exists
- `--command <cmd>` — Add explicit verification command (repeatable)
- `--max-command-ms <n>` — Max time per verification command (default: 120000)

**Verdicts:**

| Verdict | Meaning |
|---------|---------|
| `pass` | All acceptance criteria have evidence, all checks passed |
| `needs-fix` | Issues found, action required |
| `blocked` | Cannot verify without intervention |

**Creates:**

- `.lh/features/<id>-<slug>/checks.md`
- `.lh/features/<id>-<slug>/result.md`

`lh check` is the completion gate. Do not mark a feature done without a passing check.

## compress

Generate compact CaveBus summaries from feature artifacts.

```bash
lh compress F001
lh compress F001 --mode lite
lh compress F001 --source discovery
lh compress F001 --dry-run
```

**Options:**

- `--mode <lite|full|ultra>` — Compression mode (default: full)
- `--source <source>` — Compress specific source: all, discovery, plan, tasks, build, check, memory
- `--output <path>` — Write to specific path
- `--dry-run` — Preview without writing
- `--force` — Overwrite existing CaveBus log

**Creates or updates:**

- `.lh/features/<id>-<slug>/cavebus.log`

## cavebus

Inspect and validate a feature's CaveBus log.

```bash
lh cavebus F001
lh cavebus F001 --validate
lh cavebus F001 --type DISC
lh cavebus F001 --tail 5
lh cavebus F001 --validate --strict
```

**Options:**

- `--validate` — Show validation details
- `--strict` — Strict validation mode
- `--type <type>` — Filter by message type (REQ, DISC, PLAN, TASK, SUM, REV, VERIFY, ERR, BLOCK, etc.)
- `--tail <n>` — Show only last N entries

## memory

Manage LeanHarness memory files.

```bash
lh memory                     # show memory status
lh memory show                # show all memory
lh memory show patterns       # show specific memory kind
lh memory clear               # clear all memory
lh memory clear cave          # clear specific kind
lh memory status              # show memory status
```

**Subcommands:**

- `show [kind]` — Display memory contents (kinds: project, decisions, patterns, cave)
- `clear [kind]` — Clear memory (all or specific kind)
- `status` — Show memory file status

## update

Refresh the `.lh/` scaffold while preserving user config customizations.

```bash
lh update
lh update --json
```

**Behavior:**

- If the repo still has v1.x generated files (`.claude/skills/lh-*`, `.claude/agents/lh-*.md`, `.lh/scripts/`), delegates entirely to `lh migrate`.
- Otherwise, refreshes `.lh/` templates/protocols/policies only, bumps the config version, and preserves customized files.
- Prints a reminder to update the Claude Code plugin (`/plugin update lh@lean-harness`) or re-run `lh init --host opencode --force` separately — `update` no longer regenerates plugin content itself.

## migrate

Migrate a v1.x repo (generated `.claude`/`.opencode` skills, agents, hooks) to the v2 plugin-based layout. Deletes legacy generated files only once the `lh` plugin is confirmed installed.

```bash
lh migrate --dry-run
lh migrate
lh migrate --force   # CI/scripted use: skip the plugin-installed check
```

**Options:**

- `--dry-run` — Preview what would be removed without deleting anything
- `--yes` / `-y` — Skip the confirmation prompt
- `--force` — Proceed even if the plugin isn't detected as installed

**Preserves:** `.lh/config.yml`, `.lh/policies/`, `.lh/state.json`, `.lh/features/`, `.lh/templates/`, `.claude/settings.local.json`, and any non-`lh-*` skill under `.claude/skills/`.

## worktree

Track a feature's git worktree in `.lh/state.json`. This command does no git work itself —
creating (and tearing down) the actual worktree, running install/baseline tests, and linking
`.lh/features`/`.lh/state.json` into it is handled by the **`lh-worktree` skill** (ask the agent
to run it, or invoke `/lh-worktree <feature-id>`). `worktree link`/`unlink` only ever read/write
the state record.

```bash
lh worktree list
lh worktree link F001 --path .worktrees/feature-F001-test-feature
lh worktree link F001 --path .worktrees/feature-F001-test-feature --branch custom/name
lh worktree unlink F001
```

**`link <feature>` options:**

- `--path <dir>` — Path to an existing git worktree (required)
- `--branch <name>` — Branch name (default: the worktree's actual branch, or `feature/<id>-<slug>`)
- `-f, --force` — Record the path even if it isn't a registered git worktree
- `--json` — Print machine-readable JSON

**Behavior:** `.lh/features/` and `.lh/state.json` are gitignored, so a fresh worktree checkout has no feature artifacts on its own — the `lh-worktree` skill symlinks them in from the main repo. Run `lh` commands from the main repo root; use the worktree path for edits and test runs. Enable `workflow.require_worktree: true` in `.lh/config.yml` to make `lh build` refuse to run without an active, linked worktree.

**`unlink <feature>` options:**

- `--json` — Print machine-readable JSON

Clears the feature's worktree record only — it does not touch the git worktree or branch. Run `git worktree remove`/`git branch -d` (or let the `lh-worktree` skill's removal mode do it) before or after unlinking.

## watch

Watch boundary files and re-run verification on change.

```bash
lh watch F001
lh watch F001 --run
lh watch F001 --strict
```

**Options:**

- `--run` — Run verification commands during re-check
- `--no-run` — Skip command execution during re-check
- `--strict` — Strict verification mode

**Behavior:**

- Monitors all files in `boundary.json` (touch, read-only, tests)
- 1-second debounce prevents rapid re-runs
- Re-runs `lh check` on detected change
- Stop with Ctrl+C (SIGINT/SIGTERM)

## completion

Generate shell tab completion scripts.

```bash
lh completion bash
lh completion zsh
lh completion fish
```

Completes commands, flags, and feature IDs from `state.json`.

Install:

```bash
lh completion bash >> ~/.bashrc
lh completion zsh >> ~/.zshrc
lh completion fish > ~/.config/fish/completions/lh.fish
```

## Common flows

### Full feature lifecycle

```bash
lh spec "Add password reset" --title "Password reset"
lh discover F001 --depth D2
lh plan F001
lh build F001 --host claude-code --dry-run   # preview
lh build F001 --host claude-code             # real build
lh check F001
lh compress F001
lh cavebus F001 --validate
```

### Dry-run validation only

```bash
lh spec "Add feature X" --title "Feature X"
lh discover F001
lh plan F001
lh build F001 --host claude-code --dry-run
lh check F001 --no-run
```

### Multi-host comparison

```bash
lh build F001 --host claude-code --dry-run
lh build F001 --host opencode --opencode-agent lh-builder --dry-run
```

## JSON output

Most commands support `--json` for machine-readable output:

```bash
lh status --json
lh list --json
lh show F001 --json
lh doctor --json
```

## Dry-run behavior

`--dry-run` validates the plan, boundary, and context without invoking any agent host. It does not:

- Invoke Claude Code or OpenCode
- Modify source files
- Produce execution evidence

A dry-run-only flow will produce a `needs-fix` verdict from `lh check` because no execution evidence exists.

## Exit behavior

- Exit 0: success
- Exit 1: error or unknown command
- Errors are printed to stderr with `[error]` prefix
