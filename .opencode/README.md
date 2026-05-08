# OpenCode Integration

LeanHarness OpenCode integration pack. Configures OpenCode to operate within the LeanHarness artifact-driven workflow.

## Purpose

This pack teaches OpenCode how to work with LeanHarness feature artifacts, change boundaries, verification evidence, risk gates, and CaveBus summaries.

OpenCode is one of the supported agent hosts in LeanHarness. Claude Code is the other. Both operate against the same `.lh/` artifact store.

## Relationship to `.lh/`

`.lh/` is the source of truth for all LeanHarness state:

- Feature specs, discovery reports, boundaries, plans, tasks, checks, results
- CaveBus summaries and event logs
- Policies, templates, protocols, memory

`opencode.json` and `.opencode/` are the OpenCode integration surface. They configure how OpenCode agents interact with `.lh/` artifacts. They do not own LeanHarness state.

This mirrors the Claude Code integration model where `.claude/` configures Claude Code but `.lh/` owns state.

## Files

```
opencode.json              Root OpenCode project configuration
.opencode/
  README.md                This file
  agents/
    lh-scout.md            Targeted brownfield discovery agent
    lh-builder.md          Bounded implementation agent
    lh-reviewer.md         Read-only review agent
    lh-verifier.md         Final verification agent
    lh-compressor.md       CaveBus compression agent
```

## Agents

| Agent | Mode | Purpose |
|-------|------|---------|
| lh-scout | subagent | On-demand discovery of relevant files, tests, commands, constraints, risks, and change-boundary candidates |
| lh-builder | primary | Implements bounded tasks using compiled task context from `.lh/` |
| lh-reviewer | subagent | Reviews implementation against spec, boundary, risk gates, and verification evidence |
| lh-verifier | subagent | Checks acceptance criteria, evidence, boundary compliance, and risk gates before marking done |
| lh-compressor | subagent | Converts verbose notes into compact CaveBus summaries preserving protected tokens |

All agents read `.lh/` artifacts before acting. None rely on hidden chat memory as the source of truth.

## Using OpenCode with LeanHarness

### Running tasks

```bash
lh build F001 --host opencode --opencode-agent lh-builder
lh run-task F001 T01 --host opencode --opencode-agent lh-builder
```

### Dry-run preview

```bash
lh build F001 --host opencode --opencode-agent lh-builder --dry-run
```

### Direct agent invocation

```bash
opencode run --agent lh-builder "Implement task T01 for feature F001"
opencode run --agent lh-scout "Discover relevant code for password reset"
```

## CLI Integration

Install or refresh the OpenCode integration pack:

```bash
lh init --host opencode
lh init --host all
lh init --host opencode --force
```

Check integration health:

```bash
lh status
lh doctor
```

## Permission Strategy

Permissions are conservative by default:

- **Read, list, glob, grep** — allowed (low friction for discovery and review)
- **Edit** — ask (requires confirmation)
- **Risky shell commands** — ask (installs, pushes, resets, deploys, migrations)
- **Dangerous commands** — deny (`rm -rf`, `cat .env`, `printenv`, `env`)
- **Safe read-only commands** — allow (git status, git diff, git log, test runners)

Each agent has scoped permissions matching its role:

- lh-scout: no edits, read-only shell access
- lh-builder: edits with confirmation, test runners allowed
- lh-reviewer: no edits, read-only with test runners
- lh-verifier: no edits, verification commands allowed
- lh-compressor: edits with confirmation for CaveBus output files

## Token Strategy

Human-facing artifacts (specs, plans, checks, results) remain readable.

CaveBus summaries are compact internal communication. Protected tokens (file paths, function names, commands, error messages, test names, routes, env vars, class names, symbols, config keys, URLs, migration names, table names, feature IDs, task IDs, acceptance criteria IDs) are preserved exactly in both formats.

## Guardrail Plugin

The LeanHarness guardrail plugin provides deterministic safety checks for OpenCode sessions, similar to the Claude Code hook layer.

**Files:**

```
.opencode/plugins/
  shared.js                    Shared utility module (path, boundary, pattern matching, logging)
  leanharness-guardrails.js    Main guardrail plugin (tool.execute.before/after, event handler)

.lh/policies/opencode.yml Policy file documenting guardrail behavior
```

The plugin is project-local — it lives inside the repository and requires no external dependencies.

## What the Plugin Enforces

- **Dangerous commands blocked**: `rm -rf /`, `git push --force`, `git reset --hard`, `DROP DATABASE`, `cat .env`, `printenv`, fork bombs
- **Secret file access blocked**: `.env`, `.env.*`, `**/secrets/**`
- **Boundary enforcement**: When `boundary.json` exists, edits outside `touchFiles` and `allowedEditGlobs` are blocked; edits to `doNotTouch` and `blockedEditGlobs` paths are blocked
- **Risk gate detection**: Auth rewrites, payment logic, destructive migrations, new dependencies, public API breaks, security-sensitive changes trigger warnings or blocks
- **Risky commands warned**: Package installs, git push/reset/clean, deployments, curl-to-shell pipes

## What the Plugin Logs

- **events.jsonl**: Tool executions, guardrail blocks, warnings, session events — appended to the active feature's `.lh/features/<feature>/events.jsonl`
- **cavebus.log**: Compact CaveBus entries for boundary violations (`BOUNDARY`), risk gates (`RISK`), command failures (`CMD`), errors (`ERR`), and session notes (`NOTE`)

## Boundary Enforcement

Boundary enforcement works best when `.lh/features/<feature>/boundary.json` exists:

- **With boundary**: Out-of-boundary edits are blocked. Blocked paths are blocked. Bootstrap paths (`.lh/`, `.opencode/`, `docs/`, etc.) are always allowed.
- **Without boundary**: Only clearly high-risk edits (auth, payment, migrations, security) trigger warnings. Ordinary edits proceed with a log entry.

If the plugin is too strict, update discovery and boundary:

```bash
lh discover F001 --depth D3
```

## Secret Protection

The plugin blocks reads and writes to secret paths (`.env`, `**/secrets/**`) and redacts secret-like values (`sk-*`, `ghp_*`, `AKIA*`, `DATABASE_URL=*`, etc.) from all log output.

## Limitations

- OpenCode permissions and the plugin are guardrails, not a complete security sandbox.
- The plugin is best-effort because event payload shapes may vary by OpenCode version.
- Final feature completion is still determined by `lh check`.
- If no active feature or boundary exists, the plugin blocks only clearly risky operations and logs context.
- The plugin does not intercept all possible OpenCode tool types — it covers bash/shell, read, edit/write, and generic events.

## Troubleshooting

**Plugin not loading**: Ensure `.opencode/plugins/leanharness-guardrails.js` exists. Run `lh init --host opencode --force` to reinstall.

**Too many blocks**: Check `boundary.json` — the file you need to edit may not be listed in `touchFiles` or `allowedEditGlobs`. Run `lh discover` to update.

**Plugin errors**: The plugin wraps all hooks in try/catch. If it fails silently, check `events.jsonl` for logged errors.

**Syntax check**: Run `node --check .opencode/plugins/shared.js && node --check .opencode/plugins/leanharness-guardrails.js`.

## Maintenance Rules

- Do not move LeanHarness state into `.opencode/`. State belongs in `.lh/`.
- Keep `opencode.json`, agent files, and plugin files in sync with `lh init --host opencode --force`.
- When updating agent roles, update both `.claude/agents/` and `.opencode/agents/` consistently.
- Do not add model IDs to `opencode.json` unless the user explicitly configures a model.
- Do not add provider credentials or secrets to any integration file.
