# LeanHarness Claude Code Instructions

## What this repository is

LeanHarness is a Claude Code-first AI coding harness framework for existing codebases.
It provides workflow, artifacts, boundaries, compression, verification, and guardrails around AI coding agents.
The agent provides coding power. LeanHarness provides discipline.

**Status:** v2.0.0 — plugin-based distribution, skill-driven git worktree support (see the `lh-worktree` skill), and improved release workflow.

## Core workflow

```
Specify -> Discover -> Build -> Check
```

- **Specify** — Turn a user request into a feature spec with acceptance criteria, constraints, and risk flags.
- **Discover** — On-demand exploration of only the code relevant to the feature. Produce a change boundary.
- **Build** — Convert spec and discovery into a plan, break into tasks, execute with bounded context.
- **Check** — Verify implementation against acceptance criteria. Produce a verdict: pass, needs-fix, or blocked.

## Source of truth

- `.lh/` owns all LeanHarness state and artifacts. Read `.lh/config.yml` for project-wide settings.
- `.claude/` is only the Claude Code integration surface. It does not own LeanHarness state.
- Feature work is tracked under `.lh/features/<feature-id>-<slug>/`.
- Read feature artifacts (spec, discovery, boundary, plan, tasks, checks) before making implementation decisions.
- Templates live in `.lh/templates/`. Use them when creating new feature artifacts.

## Always follow these rules

1. Follow `.lh/config.yml` when present.
2. Treat feature specs as the source of truth for requested behavior.
3. Preserve existing architecture unless a spec explicitly allows changing it.
4. Use on-demand discovery instead of broad full-repo mapping.
5. Prefer bounded context over accumulated context. Each task gets only the context it needs.
6. Keep human-facing artifacts readable.
7. Use compact CaveBus summaries only for internal agent-to-agent communication.
8. Preserve protected tokens exactly. Never compress file paths, function names, or code references.
9. Do not mark work done without verification evidence.
10. Do not mark a feature pass if acceptance criteria are unchecked.
11. Do not mark a feature pass if required checks did not run.
12. Do not mark a feature pass if blocking review findings remain.
13. If a task needs files outside the current change boundary, update discovery and boundary artifacts before editing those files.
14. Scope changes tightly. Do not refactor, clean up, or restructure code outside the feature scope.

## Never do these without approval

These actions require explicit human approval before proceeding:

- Broad refactors beyond the active feature scope
- Authentication or authorization rewrites
- Payment logic changes
- Destructive database migrations
- Adding new dependencies
- Public API breaking changes
- Security-sensitive behavior changes
- Force pushes or destructive git operations
- Deleting large directories or data
- Editing generated files without confirming they are meant to be edited

These map to `risk_gates.require_approval` in `.lh/config.yml`.

## Claude Code usage expectations

- Use skills when they exist. Skills encode LeanHarness workflows.
- Use subagents when they exist and context isolation is useful.
- Respect hooks and settings as guardrails when configured.
- Prefer exact file paths, commands, and evidence in reports.
- Ask clarifying questions only when ambiguity blocks safe progress.
- Otherwise proceed with a clear assumption and record it in the feature artifacts.
- When writing CaveBus messages, follow `.lh/templates/cavebus-message.md` format.

## Development guide

### File ownership: plugin and CLI sources

**Claude Code plugin source files** (canonical source for Claude Code distribution):

| File / directory | Purpose | How to change |
|---|---|---|
| `skills/` | Claude Code skills | Edit directly — these are published to the plugin |
| `agents/` | Claude Code agents | Edit directly — these are published to the plugin |
| `hooks/` | Claude Code hooks and guardrail logic | Edit directly — these are published to the plugin |
| `.claude-plugin/plugin.json` | Plugin manifest | Edit directly — defines the Claude Code plugin |

**OpenCode source files** (canonical source for OpenCode distribution):

| File / directory | Purpose | How to change |
|---|---|---|
| `src/commands/opencode-command-bundles/*.md` | OpenCode commands | Edit source, then `npm run build` to compile to `.opencode/` |
| `src/commands/opencode-agent-bundles/*.md` | OpenCode agents | Edit source, then `npm run build` to compile to `.opencode/` |
| `src/commands/opencode-plugin-bundles/*.js` | OpenCode guardrail plugin | Edit source, then `npm run build` to compile to `.opencode/` |

**Project-local files** (never regenerated):

| File / directory | Purpose |
|---|---|
| `.claude/skills/lh-release/` | Project-only skills (e.g., release workflow) |
| `.claude/settings.json` | Claude Code project permissions |

The `.opencode/` directory is generated; do not edit it directly. Instead, modify the source files in `src/commands/opencode-*-bundles/` and run `npm run build`.

The guardrail plugin's distribution — writing `.opencode/plugins/leanharness-guardrails.js` at `lh init` time — matches OpenCode's own documented local-plugin auto-load convention (see [docs/hosts/opencode.md](docs/hosts/opencode.md)), not a LeanHarness-specific mechanism. The package also exposes it as `"./opencode"` (`package.json` `exports`), pointing at the same file `npm run build` already produces — no separate build step needed for that export.

### Build

```sh
npm run build       # compile TS → dist/, copy opencode-command-bundles
npm run typecheck   # type-check without emitting
npm run dev         # watch mode
```

After editing `skills/`, `agents/`, `hooks/`, or `src/commands/opencode-*-bundles/*`, run `npm run build` before testing with `lh init --host opencode` (Claude Code picks up plugin source files directly, no build needed).

See [docs/migration.md](docs/migration.md) for upgrading from v1.x to v2.0.
