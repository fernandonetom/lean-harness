# Claude Code Host

How LeanHarness integrates with Claude Code.

## Purpose

Claude Code is one of the supported agent hosts in LeanHarness. It provides direct filesystem access, skill-based workflows, subagent orchestration, and hook-based lifecycle events.

LeanHarness uses Claude Code as the execution engine for the Build step. The `lh` CLI handles all deterministic operations (spec creation, discovery, planning, context compilation, verification, compression). Claude Code handles the non-deterministic part: writing code.

## Installation Surface

Since v2.0.0, skills, subagents, and hooks ship as a self-hosted Claude Code **plugin** — they are no longer generated into your repo. `lh init --host claude-code` only writes project-local settings and a reference policy doc:

```bash
lh init --host claude-code
```

| File | Purpose |
|------|---------|
| `.claude/settings.json` | Project-level permissions (allow, ask, deny), plus `extraKnownMarketplaces` and `enabledPlugins` entries that auto-prompt collaborators to install the plugin |
| `.claude/settings.local.json` | Per-developer statusline override — points at the shared `~/.claude/statusline.sh` script, which `lh init` creates the first time if it doesn't already exist |
| `.lh/policies/claude-code.yml` | Human/agent-facing reference doc describing the guardrail model (not read at runtime) |

Then, one time per Claude Code session (auto-prompted via `.claude/settings.json`, or run manually):

```
/plugin marketplace add fernandonetom/lean-harness
/plugin install lh@lean-harness
```

The plugin supplies everything else: skills, subagents, and hooks. `lh doctor` and `lh status` report whether the plugin is enabled.

Use `--force` to regenerate the project-local files:

```bash
lh init --host claude-code --force
```

**Upgrading from v1.x?** Older repos have skills/agents/hooks generated directly into `.claude/`. Run `lh update` (or `lh migrate`) to remove those legacy files once the plugin is confirmed installed — see [docs/migration.md](../migration.md).

## Skills

Skills encode LeanHarness workflows as Claude Code slash commands, provided by the plugin:

| Skill | Command | What It Does |
|-------|---------|-------------|
| lh-do | `/lh-do <request>` | Full workflow: Specify -> Discover -> Build -> Check |
| lh-spec | `/lh-spec <request>` | Create feature spec with acceptance criteria |
| lh-discover | `/lh-discover F001` | Discover relevant code and produce boundary |
| lh-plan | `/lh-plan F001` | Create plan and task breakdown |
| lh-build | `/lh-build F001` | Execute tasks with bounded context |
| lh-check | `/lh-check F001` | Verify acceptance criteria against evidence |
| lh-status | `/lh-status` | Summarize harness/feature state |

Skills call the `lh` CLI internally when it is available. When the CLI is not built, skills create artifacts manually using templates from `.lh/templates/`.

## Subagents

Subagents provide specialized roles with scoped permissions, provided by the plugin:

| Agent | Role | Edits |
|-------|------|-------|
| lh-scout | Discovery and boundary analysis | No |
| lh-builder | Bounded task implementation | Yes (ask) |
| lh-builder-fix | Addresses `lh-reviewer` findings after a `needs-fix` verdict | Yes (ask) |
| lh-reviewer | Code and boundary review | No |
| lh-verifier | Acceptance criteria verification | No |
| lh-compressor | CaveBus compression | Yes (CaveBus files only) |

## Hooks

Hooks run scripts at Claude Code lifecycle events, wired via the plugin's `hooks/hooks.json` (`${CLAUDE_PLUGIN_ROOT}/hooks/*.js` — not project-local files):

| Hook | When | Purpose |
|------|------|---------|
| PreToolUse | Before Bash/Edit/Write/MultiEdit | Boundary enforcement, risk gate warnings |
| PostToolUse / PostToolUseFailure | After Bash/Edit/Write/MultiEdit | Boundary violation detection, event logging |
| Stop / SubagentStop / SessionEnd | Session/subagent end | Session summary logging |

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

The hook layer (from the plugin) provides additional guardrails:

- Boundary enforcement: blocks edits outside `boundary.json`.
- Risk gate detection: warns on auth rewrites, payment changes, destructive migrations.
- Secret protection: blocks reads and writes to `.env` and credential files.

## Troubleshooting

**Claude Code not found:**

```bash
claude --version
```

Ensure Claude Code is installed and in your PATH.

**Skills or subagents not loading:** Confirm the plugin is enabled — run `lh doctor` or `lh status` and check the "Claude Code plugin" line. If it's not enabled, run `/plugin install lh@lean-harness` in a Claude Code session (or re-run `lh init --host claude-code` to re-prompt).

**Hook failures:** Hooks live in the plugin (`${CLAUDE_PLUGIN_ROOT}/hooks/`), not in your repo. Check the plugin version with `/plugin list`. Hooks should exit 0 on success, non-zero to block.

**Permission prompts:** If Claude Code prompts too often, review `.claude/settings.json`. Add safe read-only commands to the allow list.

**Boundary violations:** If Claude Code needs to edit a file outside the boundary, expand discovery:

```bash
lh discover F001 --depth D3
```

## Limitations

- Claude Code must be installed and authenticated separately. LeanHarness does not manage Claude Code credentials.
- Skills work within Claude Code sessions. They are not available from the `lh` CLI directly.
- Hook-based guardrails are best-effort. The final completion gate is `lh check`.
- Boundary enforcement works best when `.lh/features/<feature>/boundary.json` exists.
- Claude Code's own permission system applies in addition to LeanHarness guardrails. The most restrictive setting wins.
