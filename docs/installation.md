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

Clone the repository and install dev dependencies:

```bash
git clone <repository-url>
cd lean-harness
npm install
npm run build
npm link
lh --help
```

`npm run build` compiles TypeScript from `src/` to `dist/`. The entry point is `dist/index.js`.

## Initialize a project

In your target project directory:

```bash
lh init --host all
```

This creates:

- `.lh/` — artifact store, templates, policies, protocols, configuration
- `.claude/` — Claude Code integration files (skills, subagents, hooks, settings)
- `opencode.json` and `.opencode/` — OpenCode integration files (agents, guardrail plugin)

To initialize for a single host:

```bash
lh init --host claude-code
lh init --host opencode
```

## Claude Code setup

1. Install the Claude Code CLI separately. LeanHarness does not manage Claude Code installation.
2. Run `lh init --host claude-code` in your project.
3. Verify: `claude --version`

Claude Code integration files:

| Path | Purpose |
|------|---------|
| `.claude/settings.json` | Project permissions |
| `.claude/skills/` | LeanHarness workflow skills |
| `.claude/agents/` | LeanHarness subagents |
| `.claude/hooks/` | Lifecycle guardrail hooks |
| `scripts/hooks/` | Hook implementation scripts |

See [docs/hosts/claude-code.md](hosts/claude-code.md) for details.

## OpenCode setup

1. Install the OpenCode CLI separately. LeanHarness does not manage OpenCode installation.
2. Run `lh init --host opencode` in your project.
3. Verify: `opencode --version`

OpenCode integration files:

| Path | Purpose |
|------|---------|
| `opencode.json` | Project configuration |
| `.opencode/agents/` | LeanHarness agents |
| `.opencode/plugins/` | Guardrail plugin |

See [docs/hosts/opencode.md](hosts/opencode.md) for details.

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
npm install
npm run build
```

## Uninstalling

```bash
npm uninstall -g @feneto/lh
```

For development installs: `npm unlink`.

## Troubleshooting

If the CLI does not run after build:

```bash
node dist/index.js --help
```

If this fails, check:

- Node.js version: `node --version` (must be 20+)
- Build output exists: `ls dist/index.js`
- TypeScript compiled cleanly: `npm run typecheck`

See [docs/troubleshooting.md](troubleshooting.md) for more.
