# Migration Guide

## Adopting LeanHarness in an existing project

LeanHarness is designed for brownfield codebases. No restructuring required.

### Step 1: Initialize

```bash
cd your-project
npx @feneto/lh init --host claude-code
```

This creates:
- `.lh/` — artifact store, config, templates, policies
- `.claude/` — Claude Code integration files (skills, hooks, settings)

For OpenCode: `--host opencode`. For both: `--host all`.

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
lh update --host opencode      # refresh agents, plugins
```

Update preserves your config customizations. Only LH-managed files are regenerated.

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
