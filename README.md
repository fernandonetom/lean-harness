# LeanHarness

AI harness framework for brownfield feature work with on-demand discovery, bounded context, multi-host adapters, CaveBus summaries, and verification evidence.

## Status

**v0.1.0 — dogfooding-ready.** The core workflow is implemented with a deterministic CLI, two agent host adapters (Claude Code, OpenCode), guardrail layers, and a test suite. Intended for local dogfooding and careful brownfield feature work. Not production-stable.

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

```bash
git clone <repository-url>
cd LeanHarness
npm install
npm run build
node dist/index.js --help
node dist/index.js doctor
```

To link the CLI globally from this checkout:

```bash
npm link
lh --help
lh doctor
```

Initialize in a target project:

```bash
lh init --host all
```

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
- v0.1 is dogfooding-ready. Use dry-runs before invoking real agent hosts.

## Agent hosts

LeanHarness supports multiple agent hosts through adapters:

| Host | Adapter | Integration |
|------|---------|-------------|
| Claude Code | `src/adapters/claude-code.ts` | Skills, subagents, hooks |
| OpenCode | `src/adapters/opencode.ts` | Agents, guardrail plugin |

Both hosts read and write the same `.lh/` artifact store and use the same `lh` CLI for deterministic operations.

- [Agent hosts overview](docs/hosts/README.md)
- [Claude Code host](docs/hosts/claude-code.md)
- [OpenCode host](docs/hosts/opencode.md)
- [Host adapters](docs/host-adapters.md)

## Example

The password reset example shows a complete feature lifecycle with all artifacts:

- [Password reset walkthrough](docs/examples/password-reset.md)
- [Password reset example artifacts](examples/password-reset/README.md)

## Documentation

- [Installation](docs/installation.md)
- [Commands](docs/commands.md)
- [Configuration](docs/configuration.md)
- [Host adapters](docs/host-adapters.md)
- [Claude Code host](docs/hosts/claude-code.md)
- [OpenCode host](docs/hosts/opencode.md)
- [CaveBus protocol](docs/cavebus.md)
- [Dogfooding guide](docs/dogfooding.md)
- [Password reset example](docs/examples/password-reset.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Security and safety](docs/security.md)
- [Roadmap](docs/roadmap.md)
- [Release checklist](docs/release-checklist.md)
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

## Safety model

LeanHarness guardrails are best-effort safety measures, not a security sandbox:

- **Change boundaries** limit which files an agent can modify.
- **Risk gates** require approval for high-risk changes (auth, payments, migrations, dependencies).
- **Command policies** block known-destructive commands.
- **Secret protection** blocks reads of `.env` and credential files.
- **`lh check`** requires evidence before a feature can pass.

Guardrails are enforced by hooks (Claude Code) and plugins (OpenCode). Agent hosts can still execute code if users approve actions. Use dry-runs before real agent execution.

See [docs/security.md](docs/security.md) for the full safety model.

## Roadmap

| Phase | Focus | Status |
|-------|-------|--------|
| v0.1 | Core workflow, CLI, two adapters, guardrails, tests | **Current** |
| v0.2 | Richer planning, stronger checks, better host config | Planned |
| v0.3 | Additional hosts, CI integration, worktree support | Planned |

See [docs/roadmap.md](docs/roadmap.md) for details.

## License

[MIT](LICENSE)
