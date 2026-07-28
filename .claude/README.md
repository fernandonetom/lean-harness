# .claude/ — Claude Code Integration Surface

This directory contains Claude Code configuration for LeanHarness.

**Important:** `.claude/` does not own LeanHarness state. All harness state, artifacts, templates, and memory live in `.lh/`. This directory only teaches Claude Code how to operate within that state.

## Files

### settings.json

Project-level Claude Code permissions and environment.

- **allow** — Read-only tools and safe git inspection commands run without prompting.
- **ask** — File edits, dependency installs, git writes, migrations, and deployments prompt before running.
- **deny** — Destructive commands (force push, hard reset, secret exposure, filesystem destruction) are blocked.

This file is committed to the repository. All contributors share the same guardrails.

### settings.local.json

Per-developer overrides. Add personal permissions, environment variables, or user-specific settings here. This file is gitignored and not shared with other contributors.

### skills/

Only `lh-release/` lives here — a project-local skill for releasing LeanHarness itself, not shipped to consumers. The LeanHarness workflow skills (`lh-do`, `lh-spec`, `lh-discover`, `lh-plan`, `lh-build`, `lh-check`, `lh-status`), agents, and hooks are delivered by the Claude Code plugin (`/plugin install lh@lean-harness`) — their canonical source is `skills/`, `agents/`, and `hooks/` at the repo root, not this directory. See `CLAUDE.md`'s file-ownership table.

## Permission design notes

The permission model is intentionally conservative:

- Read operations are allowed freely because LeanHarness relies on on-demand discovery.
- Write operations require confirmation because LeanHarness tracks changes through feature artifacts and change boundaries.
- Destructive operations are denied because they bypass the verification workflow.

Claude Code's own default permission handling applies for any tool or command not explicitly listed in `settings.json`. The project settings layer additional restrictions, not relaxations.

### Pattern matching

Permission patterns use Claude Code's glob-style matching. `Bash(git push*)` matches any command starting with `git push`. Patterns in the deny list take precedence over ask and allow.

Some deny patterns may be redundant with Claude Code's built-in safety checks. They are included as defense-in-depth. If a future Claude Code version changes its default handling of a pattern, the explicit deny ensures the behavior remains blocked for this project.
