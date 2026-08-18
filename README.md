# LeanHarness

AI harness framework for brownfield feature work with on-demand discovery, bounded context, multi-host adapters, CaveBus summaries, and verification evidence.

## Status

**v2.0.0 — cheap build, strong review.** Role-based model routing, independent code review command, reviewer quality pack, adversarial reviewer prompts, touched-file quality gates, and configurable boundary enforcement.

## What it does

LeanHarness provides workflow, artifacts, boundaries, compression, verification, and guardrails around AI coding agents.

The agent provides coding power. LeanHarness provides discipline.

A developer gives a feature request. LeanHarness guides the agent through a structured workflow:

**Specify → Discover → Build → Check**

Each phase produces artifacts. Each artifact is bounded. The result is verifiable feature delivery, not a sprawling code generation session.

## Why brownfield-first

Most software work happens in existing codebases. LeanHarness is designed for brownfield environments:

- No full-repo scan required. On-demand discovery finds only relevant files.
- Respects existing project structure, conventions, and tooling.
- Uses change boundaries to limit agent scope.
- Escalates discovery only when the current boundary is insufficient.

Greenfield projects work too — they are the simpler case.

## Quick start

### Claude Code

```bash
/plugin marketplace add fernandonetom/lean-harness
/plugin install lh@lean-harness
```

### OpenCode

```bash
npm install -g @feneto/lh
lh init --host opencode
```

By default this registers the real [OpenCode plugin](https://opencode.ai/docs/plugins/), [`@feneto/lh-opencode`](https://www.npmjs.com/package/@feneto/lh-opencode), in your `opencode.json` — OpenCode installs it automatically via Bun at startup. For offline/restricted environments, pass `--local-plugin` to write the guardrail plugin as local files under `.opencode/plugins/` instead (see [docs/hosts/opencode.md](docs/hosts/opencode.md)).

Or for a shared cross-project install:

```bash
npm install -g @feneto/lh
lh init --host opencode --global
```

### Verify setup

```bash
lh --help
lh doctor
```

## Graph System

LeanHarness maintains a code graph for smarter discovery and bounded context:

- **Import graph** — File-level dependencies and import relationships
- **Symbol graph** — Class, function, and interface tracking (TypeScript AST-based)
- **Knowledge graph** — Cross-feature patterns and decisions

### Commands

```bash
lh graph build          # Build graphs from scratch
lh graph update         # Incremental update (detects changes)
lh graph inspect        # Show graph statistics
lh graph clear          # Remove graph files
```

### How it's used

- **Discovery:** Graph scoring boosts files near your change boundary
- **Context compiler:** Knowledge graph adds relevant patterns to task context
- **Symbol lookup:** Find class/interface/function declarations via AST
- **Call graph:** Track function calls and type references

### When to rebuild

Rebuild the graph when:
- Starting work in a new codebase
- After large refactors
- If discovery seems to miss relevant files
- `lh doctor` reports graph files missing

## Core workflow

```bash
# Create a feature spec
lh spec "Add password reset without replacing existing auth" --title "Password reset"

# Discover relevant code and produce change boundary
lh discover F001 --depth D2

# Create plan and task breakdown
lh plan F001

# Preview build without invoking agent (always dry-run first)
lh build F001 --host claude-code --dry-run

# Or with OpenCode
lh build F001 --host opencode --opencode-agent lh-builder --dry-run

# Run real build (invokes agent host)
lh build F001 --host claude-code

# Verify against acceptance criteria (completion gate)
lh check F001

# Generate compact CaveBus summaries
lh compress F001

# Validate CaveBus log
lh cavebus F001 --validate
```

**Important:**

- `lh build` without `--dry-run` invokes an external agent host. Always dry-run first.
- `lh check` is the completion gate. Do not mark work done without a passing check.
- Use dry-runs before invoking real agent hosts.

## Boundary enforcement

Change boundaries are enforced via hooks (Claude Code) and plugins (OpenCode). You can configure enforcement strictness:

```bash
lh boundary status          # view current config
lh boundary set-mode strict # block edits outside boundary
lh boundary set-mode warn   # warnings only (default)
lh boundary set-mode off    # disable enforcement
```

Or via `.lh/config.yml`:

```yaml
boundary_enforcement:
  mode: warn           # strict | warn | off
  always_allow:        # glob patterns always permitted
    - "**/*.test.ts"
```

## Agent hosts

LeanHarness supports multiple agent hosts through adapters:

| Host | CLI adapter | Distribution package | Integration |
|------|---------|---------|-------------|
| Claude Code | `packages/cli/src/adapters/claude-code.ts` | `@feneto/lh-claude-code-plugin` (`hosts/claude-code/`, git/marketplace only) | Skills, subagents, hooks |
| OpenCode | `packages/cli/src/adapters/opencode.ts` | [`@feneto/lh-opencode`](https://www.npmjs.com/package/@feneto/lh-opencode) (`hosts/opencode/`, published to npm) | Agents, real OpenCode plugin |

Both hosts read and write the same `.lh/` artifact store and use the same `lh` CLI for deterministic operations.

- [Agent hosts overview](docs/hosts/README.md)
- [Claude Code host](docs/hosts/claude-code.md)
- [OpenCode host](docs/hosts/opencode.md)
- [Host adapters](docs/host-adapters.md)

## Example

The password reset example shows a complete feature lifecycle with all artifacts:

- [Password reset walkthrough](docs/examples/password-reset.md)
- [Password reset example artifacts](examples/password-reset/README.md)

The reading list example is a real, live-running feature history (not static) built with both Claude Code and OpenCode:

- [Reading list walkthrough](docs/examples/reading-list.md)
- [Reading list example artifacts](examples/reading-list/README.md)

## Documentation

- [Installation](docs/installation.md)
- [Commands](docs/commands.md)
- [Configuration](docs/configuration.md)
- [Boundary enforcement](docs/security.md#boundary-enforcement)
- [Graph system](docs/graph.md)
- [Host adapters](docs/host-adapters.md)
- [Claude Code host](docs/hosts/claude-code.md)
- [OpenCode host](docs/hosts/opencode.md)
- [CaveBus protocol](docs/cavebus.md)
- [Dogfooding guide](docs/dogfooding.md)
- [Password reset example](docs/examples/password-reset.md)
- [Cookbook](docs/cookbook.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Release checklist](docs/release-checklist.md)
- [Migration guide](docs/migration.md)
- [Security and safety](docs/security.md)
- [Contributing](CONTRIBUTING.md)

Design documentation:

- [Vision](docs/docs/vision.md)
- [Workflow](docs/docs/workflow.md)
- [Architecture](docs/docs/architecture.md)
- [Principles](docs/docs/principles.md)
- [Glossary](docs/docs/glossary.md)

## Development

```bash
npm install
npm run build
npm run typecheck
npm test
npm run test:watch
node dist/index.js doctor
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and contribution guidelines.

## Releasing

LeanHarness uses [Changesets](https://github.com/changesets/changesets) for automated releases:

1. Add a changeset in your feature PR:
   ```bash
   npm run changeset
   ```
2. Merge PRs to `main`.
3. GitHub Actions opens/updates a "Version Packages" release PR.
4. Merge that release PR to automatically create tag(s), GitHub Release notes, and publish to npm.

Repository maintainers must configure the `NPM_TOKEN` GitHub Actions secret for publishing.

## Safety model

LeanHarness guardrails are best-effort safety measures, not a security sandbox:

- **Change boundaries** limit which files an agent can modify.
- **Boundary enforcement modes** — configure strict (block), warn (log), or off (disabled) via `lh boundary set-mode` or `boundary_enforcement.mode` in `.lh/config.yml`.
- **Risk gates** require approval for high-risk changes (auth, payments, migrations, dependencies).
- **Command policies** block known-destructive commands.
- **Secret protection** blocks reads of `.env` and credential files.
- **`lh check`** requires evidence before a feature can pass.

Guardrails are enforced by hooks (Claude Code, `hosts/claude-code/hooks/`) and a real OpenCode plugin (`@feneto/lh-opencode`, see [docs/hosts/opencode.md](docs/hosts/opencode.md)). Agent hosts can still execute code if users approve actions. Use dry-runs before real agent execution.

See [docs/security.md](docs/security.md) for the full safety model.

## License

[MIT](LICENSE)
