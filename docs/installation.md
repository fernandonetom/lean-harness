# Installation

## Requirements

- **Node.js 20** or later
- **npm** (ships with Node.js)
- **Claude Code CLI** (optional, needed for `--host claude-code` builds)
- **OpenCode CLI** (optional, needed for `--host opencode` builds)

LeanHarness itself has no runtime dependencies. Agent hosts are invoked as external processes.

## Install from npm

```bash
npm install -g @feneto/lh
lh --help
```

## Development install (from source)

This repository is a pnpm workspace. Clone it and install dev dependencies with pnpm, not npm:

```bash
git clone <repository-url>
cd lean-harness
pnpm install
pnpm -r run build
pnpm --filter @feneto/lh exec npm link
lh --help
```

`pnpm -r run build` builds every workspace package in dependency order (`hosts/opencode` before `packages/cli`, since the CLI vendors OpenCode's built output). The `@feneto/lh` CLI's own build compiles TypeScript from `packages/cli/src/` to `packages/cli/dist/`; its entry point is `packages/cli/dist/index.js`.

## Claude Code: install the plugin

Since v2.0, LeanHarness ships as a self-hosted Claude Code **plugin** — `lh init` no longer generates skills, agents, or hooks into `.claude/`. Install it once per machine (or per session, if not persisted):

```bash
/plugin marketplace add fernandonetom/lean-harness
/plugin install lh@lean-harness
```

Then, in your target project:

```bash
lh init --host claude-code
```

This writes only:

| Path | Purpose |
|------|---------|
| `.claude/settings.json` | Project permissions (allow, ask, deny), plus `enabledPlugins`/`extraKnownMarketplaces` entries that auto-prompt collaborators to install the plugin |
| `.lh/policies/claude-code.yml` | Human/agent-facing reference doc describing the guardrail model (not read at runtime) |

Skills, subagents, and hooks all come from the installed plugin itself (sourced from `hosts/claude-code/` in this repo) — `lh init` never writes `.claude/skills/`, `.claude/agents/`, or `.claude/hooks/`.

Verify: `claude --version`, then `lh doctor` (reports whether the plugin is enabled).

See [docs/hosts/claude-code.md](hosts/claude-code.md) for details, and [docs/migration.md](migration.md) if you're upgrading a v1.x project that has skills/agents/hooks generated directly into `.claude/`.

## OpenCode setup

1. Install the OpenCode CLI separately. LeanHarness does not manage OpenCode installation.
2. Run `lh init --host opencode` in your project.
3. Verify: `opencode --version`

```bash
lh init --host opencode
# or for a shared cross-project install:
lh init --host opencode --global
```

OpenCode integration files:

| Path | Purpose |
|------|---------|
| `opencode.json` | Project configuration — by default includes `"plugin": ["@feneto/lh-opencode@^X.Y.Z"]`; OpenCode installs it automatically via Bun at startup |
| `.opencode/agents/` | LeanHarness agents |
| `.opencode/plugins/` | Guardrail plugin — only written when you pass `--local-plugin` (offline/air-gapped environments); the default path installs the npm-published `@feneto/lh-opencode` package instead of copying files here |

Both hosts can be initialized together with `lh init --host claude-code --host opencode`, or `lh init --host all`.

See [docs/hosts/opencode.md](hosts/opencode.md) for details.

## Initialize `.lh/`

Regardless of host, `lh init` also creates the host-neutral `.lh/` artifact store:

- `templates/` — artifact shape definitions (`spec.md`, `discovery.md`, `boundary.json`, plan/tasks/checks templates, CaveBus templates)
- `protocols/` — `cavebus.yml` protocol definition
- `policies/` — host-neutral policies (`risk-gates.yml`, `boundary.yml`, `commands.yml`)
- `memory/`, `features/`, `config.yml`, `state.json`

Existing scaffold files are not overwritten on re-init unless you pass `--force`. To install only missing scaffold files, run `lh doctor --fix`.

## Verify installation

```bash
lh --help
lh doctor
```

`lh doctor` checks:

- `.lh/` directory exists
- `config.yml` is present and readable
- Templates directory is populated
- Agent host CLIs are available (if installed)
- State index is consistent

## Updating

```bash
npm update -g @feneto/lh
```

For development installs: pull and rebuild:

```bash
git pull
pnpm install
pnpm -r run build
```

## Uninstalling

```bash
npm uninstall -g @feneto/lh
```

For development installs: `pnpm --filter @feneto/lh exec npm unlink`.

## Troubleshooting

If the CLI does not run after build:

```bash
node packages/cli/dist/index.js --help
```

If this fails, check:

- Node.js version: `node --version` (must be 20+)
- Build output exists: `ls packages/cli/dist/index.js`
- TypeScript compiled cleanly: `pnpm --filter @feneto/lh run typecheck`

See [docs/troubleshooting.md](troubleshooting.md) for more.
