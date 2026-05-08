# Agent Hosts

How LeanHarness works with different AI coding agents.

## Purpose

LeanHarness is a harness framework. It provides workflow, artifacts, boundaries, compression, verification, and guardrails. The actual coding is done by an agent running in a host environment.

This document explains how LeanHarness connects to agent hosts and how the host-neutral core works.

## Host-Neutral Core

All LeanHarness state lives in `.lh/`:

- Feature specs, discovery reports, boundaries, plans, tasks, checks, results
- CaveBus summaries and event logs
- Templates, policies, protocols, memory
- Configuration (`config.yml`)

The `lh` CLI performs all deterministic operations: file creation, validation, status reporting, bounded context compilation, task orchestration, verification, and compression. These operations do not depend on which agent host runs the build.

Host-specific files live outside `.lh/`:

| Host | Integration Files |
|------|------------------|
| Claude Code | `.claude/settings.json`, `.claude/skills/`, `.claude/agents/`, `.claude/hooks/` |
| OpenCode | `opencode.json`, `.opencode/agents/`, `.opencode/plugins/` |

## Supported Hosts

| Host | Adapter | Status |
|------|---------|--------|
| [Claude Code](claude-code.md) | `src/adapters/claude-code.ts` | Implemented |
| [OpenCode](opencode.md) | `src/adapters/opencode.ts` | Implemented |

## Host Comparison

| Capability | Claude Code | OpenCode |
|------------|------------|----------|
| Agent invocation | `claude -p <prompt>` | `opencode run --agent <name> <prompt>` |
| Skills / slash commands | `.claude/skills/` | Not supported |
| Subagents | `.claude/agents/` | `.opencode/agents/` |
| Hook-based guardrails | `.claude/hooks/` + `scripts/hooks/` | `.opencode/plugins/` |
| Permission model | `settings.json` allow/ask/deny | `opencode.json` permissions |
| Boundary enforcement | Hook layer | Guardrail plugin |
| Final completion gate | `lh check` | `lh check` |

Both hosts:

- Read from and write to the same `.lh/` artifact store.
- Use the same `lh` CLI for deterministic operations.
- Produce the same artifact formats (spec, discovery, boundary, plan, tasks, checks, result, CaveBus).
- Are subject to the same `lh check` completion gate.

## Choosing a Host

Use **Claude Code** if:

- You are already using Claude Code as your primary coding agent.
- You want skill-based LeanHarness workflows (e.g., `/lh-do`, `/lh-build`).
- You want the deepest integration (hooks, skills, subagents).

Use **OpenCode** if:

- You are already using OpenCode as your primary coding agent.
- You prefer explicit agent invocation over skill-based workflows.
- You want to use the guardrail plugin for boundary enforcement.

Use **both** if:

- You want to compare agents on the same feature.
- Different team members prefer different hosts.
- You want to validate that LeanHarness artifacts are truly host-neutral.

Initialize both:

```bash
lh init --host all
```

## Adding a New Host

To add support for a new agent host:

1. **Implement the adapter.** Create `src/adapters/<host-name>.ts` implementing the `AgentAdapter` interface from `src/adapters/types.ts`.
2. **Register the adapter.** Add it to the adapter registry so `lh build --host <host-name>` works.
3. **Create integration files.** Add host-specific configuration, agent definitions, and guardrail mechanisms.
4. **Update `lh init`.** Add `--host <host-name>` support to generate integration files.
5. **Test.** Verify that `lh build --host <host-name> --dry-run` works, and that `lh check` produces correct verdicts after a real build.

## Adapter Contract

Each adapter must implement:

| Method | Purpose |
|--------|---------|
| `detect(root)` | Check if the agent host is installed and available |
| `buildArgs(input)` | Convert `AgentRunInput` into host-specific CLI arguments |
| `run(input)` | Invoke the agent and return `AgentRunResult` |

The adapter translates between LeanHarness's host-neutral task context and the host's specific invocation mechanism. It does not own LeanHarness state or modify `.lh/` artifacts directly.

See `src/adapters/types.ts` for the full interface definition.

For the full adapter contribution guide, see [Host Adapters](../host-adapters.md).
