# OpenCode Flow — Password Reset Example

> Step-by-step commands for the password reset feature using OpenCode as the agent host.
> This is a reference for the command sequence. No agent was invoked to produce this document.

## Prerequisites

- Node.js >= 20
- LeanHarness CLI installed (`npm install` and `npm run build` in the LeanHarness repo)
- OpenCode installed
- An existing project with `src/auth/password.ts`, `src/auth/session.ts`, `src/email/send.ts`

## Step 1: Initialize LeanHarness

```bash
lh init --host opencode
```

Creates `.lh/` artifact store, `opencode.json`, `.opencode/` integration surface (agents, plugins).

To initialize both hosts at once:

```bash
lh init --host all
```

## Step 2: Create Feature Spec

```bash
lh spec "Add password reset without replacing existing auth" --title "Password reset"
```

Creates `.lh/features/F001-password-reset/spec.md`. This step is host-neutral — the spec is the same regardless of which agent host runs the build.

## Step 3: Discover Relevant Code

```bash
lh discover F001 --depth D2
```

Produces `discovery.md` and `boundary.json`. Host-neutral — discovery reads the codebase directly, not through an agent.

## Step 4: Plan Implementation

```bash
lh plan F001
```

Creates `plan.md` and `tasks.md`. Host-neutral.

## Step 5: Compile Task Context

```bash
lh compile-task F001 T01
```

Generates bounded context for task T01. Host-neutral.

## Step 6: Dry Run First

```bash
lh build F001 --host opencode --opencode-agent lh-builder --dry-run
```

Shows what would happen without invoking OpenCode. **Always dry-run first.**

Host-neutral dry-run (no agent specified):

```bash
lh build F001 --host opencode --dry-run
```

## Step 7: Build with OpenCode

```bash
lh build F001 --host opencode --opencode-agent lh-builder
```

Invokes OpenCode with the `lh-builder` agent for each task. The builder agent receives compiled task context and operates within the change boundary.

To run a single task:

```bash
lh run-task F001 T01 --host opencode --opencode-agent lh-builder
```

### What OpenCode Receives

- The compiled task context from `.lh/features/F001-password-reset/task-context/T01.md`
- The `lh-builder` agent definition from `.opencode/agents/lh-builder.md`
- Permission constraints from `opencode.json`
- Guardrail enforcement from `.opencode/plugins/leanharness-guardrails.js`

### What OpenCode Produces

- Code changes inside the change boundary
- Task summary (written by the agent or extracted by `lh`)
- Status updates in `tasks.md`

## Step 8: Check Verification

```bash
lh check F001
```

Runs verification commands, reviews changed files, checks boundary compliance. Host-neutral — `lh check` does not depend on which agent host ran the build.

The OpenCode guardrail plugin is a best-effort safety layer during the build. `lh check` is the final completion gate.

## Step 9: Compress CaveBus

```bash
lh compress F001
```

Compresses feature artifacts into CaveBus summaries. Host-neutral.

Validate:

```bash
lh cavebus F001 --validate
```

## OpenCode Direct Agent Invocation

If you prefer to invoke OpenCode agents directly (outside the `lh` orchestrator):

```bash
opencode run --agent lh-builder "Implement task T01 for feature F001. Read compiled context from .lh/features/F001-password-reset/task-context/T01.md"
```

The `lh-builder` agent will read the compiled context and follow the task instructions. The guardrail plugin enforces boundary and risk gate checks during the session.

## How OpenCode Uses the Same Artifacts

OpenCode and Claude Code share the same `.lh/` artifact store:

| Artifact | Location | Used By |
|----------|----------|---------|
| Feature spec | `.lh/features/F001-password-reset/spec.md` | Both |
| Discovery | `.lh/features/F001-password-reset/discovery.md` | Both |
| Boundary | `.lh/features/F001-password-reset/boundary.json` | Both |
| Plan | `.lh/features/F001-password-reset/plan.md` | Both |
| Tasks | `.lh/features/F001-password-reset/tasks.md` | Both |
| Checks | `.lh/features/F001-password-reset/checks.md` | Both |
| Result | `.lh/features/F001-password-reset/result.md` | Both |
| CaveBus | `.lh/features/F001-password-reset/cavebus.log` | Both |
| Events | `.lh/features/F001-password-reset/events.jsonl` | Both |

Host-specific files:

| File | Host |
|------|------|
| `.claude/settings.json` | Claude Code |
| `.claude/skills/` | Claude Code |
| `.claude/agents/` | Claude Code |
| `opencode.json` | OpenCode |
| `.opencode/agents/` | OpenCode |
| `.opencode/plugins/` | OpenCode |

## Key Safety Rules

1. **Always dry-run first.** `--dry-run` before real invocation.
2. **The plugin is best-effort.** The OpenCode guardrail plugin catches common boundary violations and risky commands, but it is not a complete security sandbox.
3. **`lh check` is the final gate.** The plugin does not determine whether a feature passes. Only `lh check` does.
4. **Boundary updates require re-discovery.** If OpenCode needs to edit files outside the boundary, run `lh discover F001 --depth D3` to expand it.
5. **No secrets in agent prompts.** Do not pass API keys, tokens, or credentials through the task context.

## Troubleshooting

**OpenCode not found:** Ensure `opencode` is in your PATH. Run `opencode --version` to verify.

**Plugin not loading:** Check that `.opencode/plugins/leanharness-guardrails.js` exists. Reinstall:

```bash
lh init --host opencode --force
```

**Too many boundary blocks:** The plugin may block edits to files not listed in `boundary.json`. Expand the boundary:

```bash
lh discover F001 --depth D3
```

**Plugin syntax errors:** Verify the plugin:

```bash
node --check .opencode/plugins/shared.js && node --check .opencode/plugins/leanharness-guardrails.js
```

**Check fails after build:** Read `checks.md` for specific issues. Fix and re-run:

```bash
lh build F001 --host opencode --opencode-agent lh-builder
lh check F001
```
