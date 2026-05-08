# Claude Code Host

How LeanHarness integrates with Claude Code.

## Purpose

Claude Code is one of the supported agent hosts in LeanHarness. It provides direct filesystem access, skill-based workflows, subagent orchestration, and hook-based lifecycle events.

LeanHarness uses Claude Code as the execution engine for the Build step. The `lh` CLI handles all deterministic operations (spec creation, discovery, planning, context compilation, verification, compression). Claude Code handles the non-deterministic part: writing code.

## Installation Surface

```bash
lh init --host claude-code
```

This creates or updates the Claude Code integration files. Use `--force` to regenerate:

```bash
lh init --host claude-code --force
```

## Files

| File | Purpose |
|------|---------|
| `.claude/settings.json` | Project-level permissions (allow, ask, deny) |
| `.claude/settings.local.example.json` | Template for per-developer overrides |
| `.claude/README.md` | Integration documentation |
| `.claude/skills/lh-do/SKILL.md` | Full workflow skill: Specify -> Discover -> Build -> Check |
| `.claude/skills/lh-spec/SKILL.md` | Feature specification skill |
| `.claude/skills/lh-discover/SKILL.md` | Discovery and boundary skill |
| `.claude/skills/lh-plan/SKILL.md` | Planning skill |
| `.claude/skills/lh-build/SKILL.md` | Build execution skill |
| `.claude/skills/lh-check/SKILL.md` | Verification skill |
| `.claude/agents/lh-scout.md` | Discovery subagent |
| `.claude/agents/lh-builder.md` | Implementation subagent |
| `.claude/agents/lh-reviewer.md` | Review subagent |
| `.claude/agents/lh-verifier.md` | Verification subagent |
| `.claude/agents/lh-compressor.md` | CaveBus compression subagent |
| `.claude/hooks/leanharness-hooks.json` | Hook definitions for lifecycle events |
| `scripts/hooks/` | Hook scripts executed by Claude Code |

## Skills

Skills encode LeanHarness workflows as Claude Code slash commands:

| Skill | Command | What It Does |
|-------|---------|-------------|
| lh-do | `/lh-do <request>` | Full workflow: Specify -> Discover -> Build -> Check |
| lh-spec | `/lh-spec <request>` | Create feature spec with acceptance criteria |
| lh-discover | `/lh-discover F001` | Discover relevant code and produce boundary |
| lh-plan | `/lh-plan F001` | Create plan and task breakdown |
| lh-build | `/lh-build F001` | Execute tasks with bounded context |
| lh-check | `/lh-check F001` | Verify acceptance criteria against evidence |

Skills call the `lh` CLI internally when it is available. When the CLI is not built, skills create artifacts manually using templates from `.lh/templates/`.

## Subagents

Subagents provide specialized roles with scoped permissions:

| Agent | Role | Edits |
|-------|------|-------|
| lh-scout | Discovery and boundary analysis | No |
| lh-builder | Bounded task implementation | Yes (ask) |
| lh-reviewer | Code and boundary review | No |
| lh-verifier | Acceptance criteria verification | No |
| lh-compressor | CaveBus compression | Yes (CaveBus files only) |

## Hooks

Hooks run scripts at lifecycle events:

| Hook | When | Purpose |
|------|------|---------|
| Pre-edit | Before file edits | Boundary enforcement |
| Post-edit | After file edits | Boundary violation detection |
| Pre-command | Before risky commands | Command safety check |

Hook scripts live in `scripts/hooks/` and are referenced from `.claude/hooks/leanharness-hooks.json`.

## Running Tasks

Single task:

```bash
lh run-task F001 T01 --host claude-code
```

All tasks:

```bash
lh build F001 --host claude-code
```

## Dry Run First

Always preview before invoking Claude Code:

```bash
lh run-task F001 T01 --host claude-code --dry-run
lh build F001 --host claude-code --dry-run
```

Dry-run validates the task context, boundary, and plan without spending agent tokens. It does not produce execution evidence, so `lh check` will report `needs-fix` after a dry-run-only flow.

## Permissions and Guardrails

The permission model in `.claude/settings.json` is conservative:

- **Allow:** Read-only tools, safe git commands, test runners.
- **Ask:** File edits, dependency installs, git writes.
- **Deny:** Destructive commands (force push, hard reset, `rm -rf`, secret exposure).

The hook layer provides additional guardrails:

- Boundary enforcement: blocks edits outside `boundary.json`.
- Risk gate detection: warns on auth rewrites, payment changes, destructive migrations.
- Secret protection: blocks reads and writes to `.env` and credential files.

## Troubleshooting

**Claude Code not found:**

```bash
claude --version
```

Ensure Claude Code is installed and in your PATH.

**Skills not loading:** Check that `.claude/skills/` directory exists with `SKILL.md` files. Reinstall:

```bash
lh init --host claude-code --force
```

**Hook failures:** Check `scripts/hooks/` for script errors. Hooks should exit 0 on success, non-zero to block.

**Permission prompts:** If Claude Code prompts too often, review `.claude/settings.json`. Add safe read-only commands to the allow list.

**Boundary violations:** If Claude Code needs to edit a file outside the boundary, expand discovery:

```bash
lh discover F001 --depth D3
```

## Limitations

- Claude Code must be installed and authenticated separately. LeanHarness does not manage Claude Code credentials.
- Skills work within Claude Code sessions. They are not available from the `lh` CLI directly.
- Hook-based guardrails are best-effort. The final completion gate is `lh check`.
- Claude Code's own permission system applies in addition to LeanHarness guardrails. The most restrictive setting wins.
