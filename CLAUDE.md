# LeanHarness Claude Code Instructions

## What this repository is

LeanHarness is a Claude Code-first AI coding harness framework for existing codebases.
It provides workflow, artifacts, boundaries, compression, verification, and guardrails around AI coding agents.
The agent provides coding power. LeanHarness provides discipline.

**Status:** v2.x — pnpm monorepo distributing three packages: the `@feneto/lh` CLI, a real [OpenCode plugin](https://opencode.ai/docs/plugins/) (`@feneto/lh-opencode`, published to npm), and the Claude Code plugin (`hosts/claude-code/`, distributed via git + `/plugin marketplace add`, never published to npm). Skill-driven git worktree support (see the `lh-worktree` skill) and an npm-provenance release workflow.

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

### Monorepo layout

This is a **pnpm workspace** (`pnpm-workspace.yaml`: `packages/*`, `hosts/*`). It publishes three packages, each an equally first-class "host" except the CLI itself:

| Package | Path | Published to npm? | What it is |
|---|---|---|---|
| `@feneto/lh` | `packages/cli/` | Yes | The `lh` CLI |
| `@feneto/lh-opencode` | `hosts/opencode/` | Yes | The real [OpenCode plugin](https://opencode.ai/docs/plugins/) — a spec-compliant `Plugin` export, registered via a consumer's `opencode.json` `"plugin"` array |
| `@feneto/lh-claude-code-plugin` | `hosts/claude-code/` | No (`private: true`) | The Claude Code plugin — skills, agents, hooks — distributed via git + `/plugin marketplace add`, never installed from npm |

Do not treat Claude Code as the "primary" host and OpenCode as an afterthought — both `hosts/*` packages are equally canonical sources for their respective agent host.

### File ownership

**Claude Code plugin source files** (`hosts/claude-code/`, canonical source for Claude Code distribution):

| File / directory | Purpose | How to change |
|---|---|---|
| `hosts/claude-code/skills/` | Claude Code skills | Edit directly — no build step, published via git/marketplace |
| `hosts/claude-code/agents/` | Claude Code agents | Edit directly — no build step |
| `hosts/claude-code/hooks/` | Claude Code hooks and guardrail logic | Edit directly — plain CommonJS, no build step |
| `hosts/claude-code/.claude-plugin/plugin.json` | Plugin manifest | Edit directly; `version` is changesets-managed (fixed alongside `@feneto/lh`) — don't hand-edit it |
| `.claude-plugin/marketplace.json` (repo root) | Marketplace catalog — **stays at repo root**, required by Claude Code's `/plugin marketplace add` convention | `source` points at `./hosts/claude-code`; `version` is synced by `scripts/sync-plugin-version.mjs` |

**OpenCode plugin source files** (`hosts/opencode/`, canonical source for the npm-published OpenCode plugin):

| File / directory | Purpose | How to change |
|---|---|---|
| `hosts/opencode/src/*.ts` | The real OpenCode plugin (guardrails: boundary enforcement, dangerous-command blocking, secret-path protection) | Edit source, then `pnpm --filter @feneto/lh-opencode run build` |
| `hosts/opencode/templates/agents/*.md` | OpenCode agent templates | Edit source; `packages/cli`'s build vendors a copy — run `pnpm -r run build` before testing `lh init --host opencode` |
| `hosts/opencode/templates/commands/*.md` | OpenCode slash-command templates | Same as above |

**CLI source files** (`packages/cli/`):

| File / directory | Purpose | How to change |
|---|---|---|
| `packages/cli/src/` | `@feneto/lh` CLI source | Edit source, then `pnpm --filter @feneto/lh run build` |
| `packages/cli/scripts/copy-opencode-vendor.mjs` | Vendors `hosts/opencode`'s built plugin + templates into `packages/cli/dist/vendor/opencode/` at build time | Do not hand-edit vendored output; fix the source in `hosts/opencode/` instead |

**Project-local files** (never regenerated):

| File / directory | Purpose |
|---|---|
| `.claude/skills/lh-release/` | Project-only skills (e.g., release workflow) |
| `.claude/settings.json` | Claude Code project permissions |

The `.opencode/` directory in a *consuming* project is generated by `lh init --host opencode`; do not edit it directly there. By default, `lh init --host opencode` registers the npm-published `@feneto/lh-opencode` package in that project's `opencode.json` (OpenCode auto-installs it via Bun) instead of copying plugin JS files — pass `--local-plugin` to restore the old copy-files behavior for offline/restricted environments. See [docs/hosts/opencode.md](docs/hosts/opencode.md).

### Build

```sh
pnpm -r run build       # build all workspace packages, in dependency order (hosts/opencode before packages/cli)
pnpm -r run typecheck   # type-check every package without emitting
pnpm --filter <pkg> run dev   # watch mode for a single package, e.g. pnpm --filter @feneto/lh run dev
```

After editing `hosts/opencode/src/` or `hosts/opencode/templates/`, run `pnpm -r run build` (not just `packages/cli`'s own build) before testing `lh init --host opencode` — `packages/cli`'s build vendors `hosts/opencode`'s *built* output, so a stale `hosts/opencode/dist/` means stale vendored content. After editing `hosts/claude-code/{skills,agents,hooks}/`, no build is needed — Claude Code picks up plugin source files directly.

Adding a fourth host later: create `hosts/<name>/` with its own `package.json`. `pnpm -r` build/typecheck/test and changesets publish/skip (based on `private`) pick it up automatically — no CI edits required beyond any host-specific validation tooling.

See [docs/migration.md](docs/migration.md) for upgrading from v1.x, and its "Migrating to the pnpm monorepo" section for this restructure specifically.
