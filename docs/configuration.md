# Configuration

## Configuration surfaces

LeanHarness uses several configuration files, each with a distinct purpose:

| Surface | Owner | Purpose |
|---------|-------|---------|
| `.lh/config.yml` | LeanHarness | Project-wide harness behavior |
| `.lh/state.json` | LeanHarness | Feature index and active feature tracking |
| `.lh/templates/` | LeanHarness | Artifact shape definitions |
| `.lh/policies/` | LeanHarness | Guardrail policy definitions |
| `.lh/protocols/` | LeanHarness | Protocol definitions (CaveBus) |
| `.claude/` | Claude Code | Claude Code integration files |
| `opencode.json` | OpenCode | OpenCode project configuration |
| `.opencode/` | OpenCode | OpenCode agents and plugins |

## `.lh/config.yml`

The primary project configuration file. Created by `lh init`.

Key sections:

```yaml
version: "0.1"

project:
  name: auto
  mode: brownfield-first

host:
  primary: claude-code

workflow:
  visible_steps: [specify, discover, build, check]
  require_worktree: false
  require_review: true
  require_verification: true

discovery:
  strategy: on-demand
  default_depth: D2
  max_initial_files: 25

context:
  bounded_context: true
  compile_per_task: true

compression:
  enabled: true
  protocol: cavebus
  mode: full

verification:
  require_acceptance_trace: true
  require_changed_files: true
  require_review: true

risk_gates:
  require_approval:
    - destructive_migration
    - auth_rewrite
    - payment_logic
    - new_dependency
    - public_api_break
    - broad_refactor
    - security_sensitive_change

features:
  commit: false   # default: solo-first (gitignored)
  # commit: true  # team mode: feature artifacts are committed

build:
  session_budget: 15   # default: 15 weight units per wave
```

See `.lh/config.yml` in the repository for the full annotated default.

### `features`

Controls whether feature artifacts (specs, discovery, plans, tasks) are tracked by git.

```yaml
features:
  commit: false   # default: solo-first (gitignored)
  # commit: true  # team mode: feature artifacts are committed
```

When `commit: false` (default), `lh init` writes `.lh/.gitignore` excluding `/features/` and `/state.json`. This keeps personal WIP out of client repos.

When `commit: true`, run `lh init --force --team` to regenerate `.lh/.gitignore` without those exclusions. Feature specs and plans then become shared team artifacts, visible in code review.

### `build`

Controls session wave sizing for the build phase.

```yaml
build:
  session_budget: 15   # default: 15 weight units per wave
```

`lh-plan` groups tasks into waves that stay under this budget. A higher budget fits more tasks per session; a lower budget creates smaller, more focused sessions. Useful for features where context window pressure is a concern.

Task weights: 1 = trivial, 2 = small, 3 = mid-size, 5 = complex/risky.

### `memory`

Controls where and how LeanHarness stores project knowledge.

```yaml
memory:
  store: local                                # local | remote (default: local)
  scope: feature                              # feature | project (default: feature)
  project_file: .lh/memory/project.md
  decisions_file: .lh/memory/decisions.md
  patterns_file: .lh/memory/patterns.md
  cave_file: .lh/memory/cave.md
```

| Key | Purpose |
|-----|---------|
| `store` | Where memory is persisted (`local` in the repo, or remote storage in future) |
| `scope` | Memory scope (`feature` = per-feature learning, `project` = shared across team) |
| `project_file` | Path to tech stack and structure notes (seeded by lh-discover) |
| `decisions_file` | Path to architectural decisions (appended by lh-check, capped at 120 lines) |
| `patterns_file` | Path to recurring patterns and idioms (appended by lh-check, capped at 120 lines) |
| `cave_file` | Path to CaveBus abbreviation map (appended by lh-compressor, capped at 60 lines) |

These files are populated automatically by the lh-discover, lh-check, and lh-compressor skills during normal workflow — you do not edit them directly. However, you can commit `project.md`, `decisions.md`, and `patterns.md` to share team knowledge across features. Keep `cave.md` gitignored (session-specific abbreviations).

### `command_enforcement`

Controls how LeanHarness's Bash command guardrails treat `git push --force`.

```yaml
command_enforcement:
  force_push: warn   # warn (default) | deny | off
```

| Mode | Behavior |
|------|----------|
| `deny` | Blocks `git push --force*` / `git push -f *` outright. |
| `warn` | Warns via the guardrail hook but allows the push (default). |
| `off` | No enforcement; force-push is allowed silently. |

Use the CLI to manage this setting:

```bash
lh command status                    # view current command_enforcement config
lh command set-force-push deny       # block force pushes
lh command set-force-push warn       # warn only (default)
lh command set-force-push off        # disable enforcement
```

### `boundary_enforcement`

Controls how strictly LeanHarness enforces change boundaries.

```yaml
boundary_enforcement:
  mode: warn           # strict | warn | off
  always_allow: []     # glob patterns always permitted
  session_overrides: [] # file paths added at runtime
```

| Mode | Behavior |
|------|----------|
| `strict` | Blocks edits outside boundary. Use `lh boundary allow <file>` to unblock specific files. |
| `warn` | Logs warnings but allows edits (default). |
| `off` | Boundary enforcement disabled. |

**always_allow** — Glob patterns for files that are always allowed, regardless of boundary. Example:

```yaml
always_allow:
  - "**/*.test.ts"
  - "**/package.json"
```

**session_overrides** — File paths added at runtime via `lh boundary allow`. These persist until you remove them with `lh boundary exempt <file>`.

Use the CLI to manage these settings:

```bash
lh boundary status          # view current config
lh boundary set-mode strict # enable strict mode
lh boundary set-mode warn   # warnings only (default)
lh boundary set-mode off    # disable enforcement
lh boundary allow <path>    # add to session_overrides
lh boundary exempt <path>   # remove from session_overrides
```

## `.lh/state.json`

An index/cache that tracks feature IDs, slugs, statuses, and the active feature. Updated automatically by CLI commands.

Feature artifacts (spec, discovery, plan, checks, result) are more authoritative than state.json. If state.json and feature files disagree, trust the feature files.

Do not edit `state.json` manually unless recovering from corruption.

## `.lh/templates/`

Defines the shape of feature artifacts:

| Template | Creates |
|----------|---------|
| `spec.md` | Feature specification |
| `discovery.md` | Discovery results |
| `boundary.json` | Machine-readable change boundary |
| `plan.md` | Plan and task breakdown |
| `tasks.md` | Task definitions |
| `checks.md` | Verification checklist |
| `result.md` | Final verification result |

Templates can be customized carefully. Changes affect all new features. Existing features keep their original artifact shape.

## `.lh/policies/`

Defines guardrail behavior:

| Policy | Purpose |
|--------|---------|
| `boundary.yml` | Change boundary enforcement rules |
| `risk-gates.yml` | High-risk change categories requiring approval |
| `commands.yml` | Command classification for hooks (deny, ask, safe) |
| `opencode.yml` | OpenCode-specific guardrail configuration |

Policies are read by hook scripts, guardrail plugins, and the CLI. Edit with care — loosening policies weakens guardrails.

## `.claude/`

Claude Code integration surface. Created by `lh init --host claude-code`.

| File | Purpose |
|------|---------|
| `settings.json` | Project-level permissions (allow, ask, deny) |
| `skills/` | LeanHarness workflow skills (slash commands) |
| `agents/` | LeanHarness subagent definitions |
| `hooks/` | Lifecycle hook definitions |

See [docs/hosts/claude-code.md](hosts/claude-code.md) for details.

## `opencode.json`

OpenCode project configuration. Created by `lh init --host opencode`.

Contains OpenCode-specific settings: permissions, model configuration, agent references.

## `.opencode/`

OpenCode integration surface. Created by `lh init --host opencode`.

| Directory | Purpose |
|-----------|---------|
| `agents/` | LeanHarness agent definitions |
| `plugins/` | Guardrail plugin (boundary enforcement, risk gate detection) |

See [docs/hosts/opencode.md](hosts/opencode.md) for details.

## Environment variables

| Variable | Purpose |
|----------|---------|
| `LEANHARNESS_ACTIVE_FEATURE` | Override the active feature ID |
| `LEANHARNESS_ACTIVE_TASK` | Override the active task ID |

These are read by hooks, plugins, and the CLI when determining which feature context to use. They override `state.json`.

## Safe customization

**Safe to edit:**

- `.lh/config.yml` — adjust discovery depth, compression mode, risk gates
- `.lh/templates/` — change artifact shape for new features
- `.lh/policies/` — adjust guardrail strictness (with care)
- `.claude/settings.json` — adjust Claude Code permissions

**Edit with caution:**

- `.lh/policies/commands.yml` — loosening command policy weakens safety
- `.lh/policies/risk-gates.yml` — removing gates disables approval requirements

## What not to edit manually

- `.lh/state.json` — managed by the CLI; manual edits may cause inconsistency
- `.lh/features/<id>/boundary.json` — generated by `lh discover`; re-run discovery instead
- `dist/` — generated by `npm run build`; rebuild instead

## Recovery

If artifacts become inconsistent:

```bash
lh doctor                    # diagnose issues
lh status                    # check feature state
lh show F001                 # inspect specific feature
lh discover F001 --depth D2  # regenerate discovery and boundary
lh check F001 --force        # re-run verification
```

If `state.json` is corrupted, delete it and run `lh status` — the CLI will rebuild it from existing feature folders.

Do not delete `.lh/` without understanding the consequences. Feature artifacts, templates, policies, and protocols will be lost.
