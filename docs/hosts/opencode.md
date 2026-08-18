# OpenCode Host

How LeanHarness integrates with OpenCode.

## Purpose

OpenCode is one of the supported agent hosts in LeanHarness. It provides agent-based code generation with configurable permissions and a plugin system for guardrails.

LeanHarness uses OpenCode as the execution engine for the Build step. The `lh` CLI handles all deterministic operations. OpenCode handles the non-deterministic part: writing code.

## Installation Surface

```bash
lh init --host opencode
```

This creates or updates the OpenCode integration files. Use `--force` to regenerate:

```bash
lh init --host opencode --force
```

## Files

| File | Purpose |
|------|---------|
| `opencode.json` | Root OpenCode project configuration — includes `"plugin": ["@feneto/lh-opencode@^X.Y.Z"]` by default |
| `.opencode/README.md` | Integration documentation |
| `.opencode/agents/lh-scout.md` | Discovery agent |
| `.opencode/agents/lh-builder.md` | Implementation agent |
| `.opencode/agents/lh-reviewer.md` | Review agent |
| `.opencode/agents/lh-verifier.md` | Verification agent |
| `.opencode/agents/lh-compressor.md` | CaveBus compression agent |
| `.opencode/plugins/shared.js`, `.opencode/plugins/leanharness-guardrails.js` | Guardrail plugin — **only written with `--local-plugin`**; the default installs the npm-published `@feneto/lh-opencode` package instead (see "Guardrail Plugin" below) |
| `.lh/policies/opencode.yml` | Policy file documenting guardrail behavior |

## Agents

| Agent | Mode | Purpose | Edits |
|-------|------|---------|-------|
| lh-scout | subagent | Discovery and boundary analysis | No |
| lh-builder | primary | Bounded task implementation | Yes (ask) |
| lh-reviewer | subagent | Code and boundary review | No |
| lh-verifier | subagent | Acceptance criteria verification | No |
| lh-compressor | subagent | CaveBus compression | Yes (CaveBus files only) |

All agents read `.lh/` artifacts before acting. None rely on hidden chat memory as the source of truth.

## Guardrail Plugin

The guardrail plugin is a real, spec-compliant [OpenCode plugin](https://opencode.ai/docs/plugins/), published to npm as [`@feneto/lh-opencode`](https://www.npmjs.com/package/@feneto/lh-opencode). It provides deterministic safety checks during OpenCode sessions.

**By default**, `lh init --host opencode` registers it in `opencode.json`:

```json
{
  "plugin": ["@feneto/lh-opencode@^0.1.0"]
}
```

OpenCode installs it automatically via Bun at startup (cached in `~/.cache/opencode/node_modules/`) — no manual `npm install` step, and no local files written into `.opencode/plugins/`. The version pin tracks whatever `@feneto/lh-opencode` version was current when your `@feneto/lh` CLI was built.

**`--local-plugin` fallback** — for offline/air-gapped/restricted environments where OpenCode's npm-plugin auto-install isn't viable:

```bash
lh init --host opencode --local-plugin
```

This restores the pre-npm-package behavior: writing `.opencode/plugins/shared.js` and `.opencode/plugins/leanharness-guardrails.js` directly, using OpenCode's documented zero-config local-plugin mechanism (any file dropped into `.opencode/plugins/` is auto-loaded at startup, no `opencode.json` entry required). When using this fallback, do **not** also register the npm package in `opencode.json` — OpenCode's local-plugin loader treats every `.js` file in that directory as an independent plugin module, so mixing both distribution modes would register the guardrail hooks twice.

**Enforcement is layered:**

1. **`tool.execute.before`** (primary) — throws to abort the tool call. This is undocumented-but-relied-upon OpenCode behavior (the plugin API's published types show no deny field on this hook's output), kept as the enforcement backbone because it's what's been verified to work in production.
2. **`permission.ask`** (additive) — sets `output.status = "deny"` for the same violations, using the hook's documented deny mechanism. This does **not** replace layer 1: `lh init`'s generated `opencode.json` sets `permission.edit: "allow"` for the primary `lh-builder` agent, so relying on `permission.ask` alone would silently under-enforce for exactly the agent guardrails exist to catch.

**What it enforces:**

- Dangerous commands blocked (`rm -rf /`, `git push --force`, `git reset --hard`, `DROP DATABASE`, `cat .env`, `printenv`).
- Secret file access blocked (`.env`, `.env.*`, `**/secrets/**`).
- Boundary enforcement when `boundary.json` exists.
- Risk gate detection for auth rewrites, payment logic, destructive migrations, new dependencies.
- Risky command warnings for package installs, git push/reset, deployments.

**What it logs:**

- `events.jsonl`: Tool executions, guardrail blocks, warnings, session events.
- `cavebus.log`: Compact CaveBus entries for boundary violations, risk gates, command failures.

**Limitations:**

- The plugin is best-effort. Event payload shapes may vary by OpenCode version.
- The plugin does not intercept all possible tool types.
- The plugin is not a complete security sandbox.
- Whether `permission.ask` actually fires for `permission.edit: "allow"`-tier calls is unverified against real agent sessions (it's exercised structurally by `hosts/opencode`'s test suite and a startup smoke check against a real `opencode` binary, but not by a full agent run driving real tool calls, which needs a configured LLM provider).

## Running Tasks

Single task:

```bash
lh run-task F001 T01 --host opencode --opencode-agent lh-builder
```

All tasks:

```bash
lh build F001 --host opencode --opencode-agent lh-builder
```

Direct OpenCode invocation (outside `lh` orchestrator):

```bash
opencode run --agent lh-builder "Implement task T01 for feature F001. Read context from .lh/features/F001-password-reset/task-context/T01.md"
```

## Dry Run First

Always preview before invoking OpenCode:

```bash
lh run-task F001 T01 --host opencode --opencode-agent lh-builder --dry-run
lh build F001 --host opencode --opencode-agent lh-builder --dry-run
```

Dry-run does not invoke OpenCode. It validates task context, boundary, and plan. A dry-run-only flow will get `needs-fix` from `lh check`.

## Permissions and Guardrails

Permissions are configured in `opencode.json`:

- **Allow:** Read, list, glob, grep, safe git commands, test runners.
- **Ask:** File edits, dependency installs, git writes.
- **Deny:** `rm -rf`, `cat .env`, `printenv`, `env`.

Each agent has scoped permissions matching its role (see `.opencode/agents/` for details).

The guardrail plugin provides boundary enforcement on top of OpenCode's permission system. When `boundary.json` exists, edits outside `touchFiles` and `allowedEditGlobs` are blocked.

**`lh check` is the final completion gate.** Neither the OpenCode permission system nor the guardrail plugin determines whether a feature passes. Only `lh check` does.

## Troubleshooting

**OpenCode not found:**

```bash
opencode --version
```

Ensure OpenCode is installed and in your PATH.

**Plugin not loading (default, npm-registered path):** Check `opencode.json`'s `"plugin"` array contains `@feneto/lh-opencode`, then inspect what OpenCode actually resolved:

```bash
opencode debug config
```

Look for `@feneto/lh-opencode` under `plugin_origins`. If it's missing, confirm network access to the npm registry (OpenCode installs npm plugins via Bun at startup) or fall back to `lh init --host opencode --local-plugin --force`.

**Plugin not loading (`--local-plugin` path):** Check that `.opencode/plugins/leanharness-guardrails.js` exists. Reinstall:

```bash
lh init --host opencode --local-plugin --force
```

**Plugin syntax errors (`--local-plugin` path only):**

```bash
node --check .opencode/plugins/shared.js && node --check .opencode/plugins/leanharness-guardrails.js
```

**Too many boundary blocks:** The plugin may block edits to files not in `boundary.json`. Expand the boundary:

```bash
lh discover F001 --depth D3
```

**Check fails after build:** Read `.lh/features/F001-*/checks.md` for specific issues. Fix and re-run:

```bash
lh build F001 --host opencode --opencode-agent lh-builder
lh check F001
```

## Limitations

- OpenCode must be installed separately. LeanHarness does not manage OpenCode credentials or model configuration.
- OpenCode does not have a skill/slash-command system. Workflows are invoked through the `lh` CLI or direct agent invocation.
- The guardrail plugin is project-local. It requires no external dependencies but is not a complete security sandbox.
- `lh check` is the final completion gate, not the guardrail plugin.
- If no active feature or boundary exists, the plugin blocks only clearly risky operations.
