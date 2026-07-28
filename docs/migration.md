# Migration Guide

## Adopting LeanHarness in an existing project

LeanHarness is designed for brownfield codebases. No restructuring required.

### Step 1: Initialize

For Claude Code:

```bash
/plugin marketplace add fernandonetom/lean-harness
/plugin install lh@lean-harness
```

For OpenCode:

```bash
npm i -g @feneto/lh
lh init --host opencode
```

Or for a shared cross-project OpenCode install:

```bash
npm i -g @feneto/lh
lh init --host opencode --global
```

This creates:
- `.lh/` — artifact store, config, templates, policies
- `.claude/settings.json` — Claude Code permissions (Claude Code only)
- `.opencode/{commands,agents,plugins}/` — OpenCode integration files (OpenCode only)

### Step 2: Verify setup

```bash
lh doctor
```

Doctor checks: directory structure, config validity, host CLI availability, template completeness.

### Step 3: Start a feature

```bash
lh spec "Add password reset flow via email"
```

This creates a feature folder under `.lh/features/` with a spec template. Fill in acceptance criteria, constraints, and risk flags.

### Step 4: Discover, plan, build, check

```bash
lh discover F001              # find relevant files, produce boundary
lh plan F001                  # generate plan and tasks from spec + discovery
lh build F001 --dry-run       # preview what would run
lh build F001 --host claude-code  # execute tasks
lh check F001 --run           # verify against acceptance criteria
```

---

## Upgrading from v1.x to v2.0

LeanHarness v2.0 transitions from generated integration files to a plugin-based distribution model.

### What changed

**v1.x:** `lh init` wrote generated skills, agents, and hooks into `.claude/` and `.opencode/` directories in every consuming repository.

**v2.0:** LeanHarness ships as a self-hosted Claude Code plugin and a standalone CLI package. Integration files are no longer generated into consuming repositories.

| Aspect | v1.x | v2.0 |
|--------|------|------|
| **Claude Code** | Generated skills + hooks in `.claude/` | Plugin installed via `/plugin marketplace` |
| **OpenCode** | Generated agents + plugins in `.opencode/` | `lh init --host opencode` writes from real source files |
| **Project config** | `.lh/config.yml` etc. | Unchanged — still project-local |

### Migration path

#### For Claude Code users:

1. **Install the plugin:**
   ```bash
   /plugin marketplace add fernandonetom/lean-harness
   /plugin install lh@lean-harness
   ```

2. **Update your repository** (preview first, no files deleted):
   ```bash
   lh migrate --dry-run
   lh update
   ```
   `lh update` auto-detects your v1.x setup and delegates to `lh migrate`. Migration only proceeds once the plugin is confirmed installed — otherwise it prints install instructions and exits without deleting anything. In CI/scripted environments where the plugin can't be installed interactively, `lh migrate --force` bypasses that check (only if you've already confirmed the plugin is installed).

3. **Verify:**
   ```bash
   lh doctor
   ```
   Legacy generated files have been removed. Your `.lh/` config, policies, and features are untouched.

#### For OpenCode users:

1. **Reinstall:**
   ```bash
   npm i -g @feneto/lh@latest
   lh init --host opencode
   ```
   Your `.lh/` config is preserved.

#### For dual-host users (Claude Code + OpenCode):

Run the Claude Code migration first, then the OpenCode step above.

### What gets deleted vs. preserved

**Deleted (v1.x generated files):**
- `.claude/skills/lh-*.md` (all `lh-spec`, `lh-discover`, `lh-build`, etc.)
- `.claude/agents/lh-*.md`
- `.lh/scripts/hooks/` (legacy hook storage)
- Any similar generated assets

**Preserved (your project state):**
- `.lh/config.yml` — your project configuration
- `.lh/policies/` — your guardrail policies
- `.lh/features/` — your feature work in progress
- `.lh/templates/` — your artifact templates
- Custom non-`lh-*` skills in `.claude/skills/` (e.g., `.claude/skills/lh-release/`)
- Any other hand-authored files

### Git worktrees

**New in v2.0:** isolated git worktrees for feature development, set up by the **`lh-worktree` skill** (agent-driven — ask Claude Code to run it, or invoke `/lh-worktree <feature-id>`). The CLI only tracks the result via `lh worktree link|list|unlink`; it does not create or remove worktrees itself. Features under `.lh/features/` and the global state file `.lh/state.json` are not copied into worktrees (they are gitignored and remain in the main repo) — the skill symlinks them in.

**Best practice:** Run `lh` commands from the main repo root, not from inside a worktree. Use the worktree for the actual build/test/edit work:

```bash
# Ask the agent to set up a worktree for feature F001, e.g.:
#   "Use the lh-worktree skill to set up F001"
# This creates the worktree (default: .worktrees/feature-F001-<slug>), runs
# install/baseline tests, and records it via `lh worktree link` for you.

# Run lh commands from main repo
lh plan F001
lh build F001 --dry-run

# Switch to the worktree and edit
cd .worktrees/feature-F001-<slug>

# Build and test inside the worktree
npm test
git commit ...

# Back in main repo, verify
lh check F001
# Ask the agent to run lh-worktree's removal mode for F001 when done,
# or manually: git worktree remove <path> && lh worktree unlink F001
```

If you already have a worktree checked out some other way, register it directly:

```bash
lh worktree link F001 --path .worktrees/feature-F001-test-feature
```

Enforce worktree usage project-wide via `.lh/config.yml`:

```yaml
workflow:
  require_worktree: true  # lh build refuses to proceed without an active worktree
```

---

## Updating from v0.1 to v1.0

### Config changes

The `models` section was added to `config.yml`:

```yaml
models:
  agent: auto
  subagent: auto
```

Run `lh update` to merge new config keys while preserving your customizations.

### New commands

| Command | Purpose |
|---------|---------|
| `memory` | Manage project memory files |
| `update` | Refresh LH-managed files |
| `watch` | Watch boundary files, re-run verification |
| `completion` | Generate shell tab completion |

### New flags

| Flag | On command | Purpose |
|------|-----------|---------|
| `--fix` | `doctor` | Auto-fix detected issues |
| `--global` | `init` | Install skills to user-level directories |
| `--yes` / `-y` | `init` | Skip interactive prompts |
| `--approve-risk` | `build` | Approve a risk gate (repeatable) |
| `--model` | `build`, `run-task` | Override agent model |

### Breaking changes from pre-1.0

- YAML parser replaced. Arrays in `config.yml` now parse correctly (they were silently dropped before).
- `process.exit()` removed from commands. Exit codes set via `process.exitCode`.
- Error types changed. `CLIError`, `ConfigError`, `FeatureNotFoundError` replace generic `Error`.
- `declaration: true` enabled in tsconfig. Type declarations (`.d.ts`) now emitted.
- `exports` field added to `package.json`. Import paths are `leanharness/types`, `leanharness/adapters`, etc.

### Refreshing integration files

```bash
lh update --host claude-code   # refresh skills, hooks, settings
```

Update preserves your config customizations. Only LH-managed files are regenerated.

**Note (v2.0+):** `lh update` no longer touches OpenCode's `.opencode/{agents,commands,plugins}/` files — those are refreshed by re-running `lh init --host opencode --force`.

---

## Git integration

### What to commit

```
.lh/config.yml          # project config
.lh/templates/           # artifact templates
.lh/policies/            # guardrail policies
.lh/protocols/           # protocol definitions
.claude/settings.json    # Claude Code permissions
```

### What to gitignore

```
.lh/state.json           # rebuilt automatically
.lh/features/*/tasks/    # per-task runtime artifacts
.lh/memory/              # optional — commit if sharing knowledge
```

Feature artifacts (`spec.md`, `discovery.md`, `plan.md`, `checks.md`, `result.md`) are up to team preference. They serve as audit trail if committed.

---

## CI/CD integration

### GitHub Actions

```yaml
- name: LeanHarness doctor
  run: npx @feneto/lh doctor --json

- name: LeanHarness check
  run: npx @feneto/lh check $FEATURE_ID --no-run --json
```

Use `--no-run` in CI to skip command execution (tests should run separately). Use `--json` for machine-readable output.

---

## Plugin migration

If you wrote custom scripts that interact with `.lh/`, consider converting them to plugins:

1. Create `.lh/plugins/my-plugin/`
2. Add `plugin.json` manifest:
   ```json
   { "name": "my-plugin", "version": "1.0.0", "main": "index.js" }
   ```
3. Export an `LHPlugin` object from `index.js`
4. Use lifecycle hooks (`beforeDiscover`, `afterBuild`, etc.) instead of file watching
