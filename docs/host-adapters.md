# Host Adapters

## Purpose

LeanHarness is host-neutral. The `lh` CLI handles all deterministic operations — spec creation, discovery, planning, context compilation, verification, and compression. Agent hosts handle the non-deterministic part: writing code.

Adapters bridge between the host-neutral CLI and specific agent host CLIs. Each adapter translates LeanHarness task context into host-specific invocation and captures results.

## Adapter contract

Each adapter implements the `AgentAdapter` interface:

```ts
interface AgentAdapter {
  host: AgentHost;
  detect(root: string, commandOverride?: string): Promise<AgentDetection>;
  run(input: AgentRunInput): Promise<AgentRunResult>;
}
```

**`detect`** checks whether the host CLI is installed and available. Returns version information or an error.

**`run`** invokes the agent host with a compiled prompt and returns execution results (stdout, stderr, exit code, timing).

Adapters live in `src/adapters/`. The registry in `src/adapters/registry.ts` maps host names to adapters.

## Current hosts

| Host | Adapter | Source |
|------|---------|--------|
| Claude Code | `claude-code` | `src/adapters/claude-code.ts` |
| OpenCode | `opencode` | `src/adapters/opencode.ts` |

## Claude Code adapter

**CLI:** `claude` (configurable via `--claude-command`)

**Invocation:** `claude -p <prompt> --cwd <root> [options]`

**Features:**

- Permission mode selection (`--permission-mode`)
- Tool allow-listing (`--allowedTools`)
- Output format control (`--output-format text|json|stream-json`)
- Subprocess invocation with stdout/stderr capture

**Integration files:** `.claude/settings.json`, `.claude/skills/`, `.claude/agents/`, `.claude/hooks/`

See [docs/hosts/claude-code.md](hosts/claude-code.md) for full details.

## OpenCode adapter

**CLI:** `opencode` (configurable via `--opencode-command`)

**Invocation:** `opencode run --agent <agent> <prompt> [options]`

**Features:**

- Agent selection (`--opencode-agent`)
- Model override (`--model`)
- Output format control (`--format default|json`)
- Session management (`--session`, `--attach`)
- Subprocess invocation with stdout/stderr capture

**Integration files:** `opencode.json`, `.opencode/agents/`, `.opencode/plugins/`

See [docs/hosts/opencode.md](hosts/opencode.md) for full details.

## Adding a new host

1. **Create the adapter.** Add `src/adapters/<host-name>.ts` implementing `AgentAdapter`.
2. **Register the adapter.** Add it to `ADAPTERS` in `src/adapters/registry.ts` and update the `AgentHost` type in `src/adapters/types.ts`.
3. **Add detection.** Implement `detect()` to check if the host CLI exists (e.g., `<cli> --version`).
4. **Build CLI arguments.** Implement argument construction from `AgentRunInput`.
5. **Handle dry-run.** When `input.dryRun` is true, return results without invoking the host.
6. **Create integration files.** Add host-specific configuration, agent definitions, and guardrail mechanisms.
7. **Update `lh init`.** Add `--host <host-name>` support in `src/commands/init.ts`.
8. **Add tests.** Create `tests/adapters/<host-name>.test.ts`.
9. **Document.** Add `docs/hosts/<host-name>.md` and update this file.

## Detection

Detection checks whether a host CLI is installed and reachable:

```bash
lh doctor          # checks all registered hosts
```

Detection uses subprocess calls (e.g., `claude --version`, `opencode --version`). If the command is not found, the adapter reports `available: false` with an actionable error message.

## Dry runs

Every adapter must support `--dry-run`. In dry-run mode:

- The compiled prompt is generated
- CLI arguments are built
- The host CLI is NOT invoked
- No files are modified
- No agent tokens are spent

Dry-run results include the command that would have been executed, allowing review before real execution.

## Result files

Task execution results are written under the feature's `task-context/` directory. The build orchestrator and check engine read these results.

Adapters do not modify `.lh/` artifacts directly. The CLI handles result integration.

## Events and CaveBus

Adapters produce execution events (start time, end time, exit code, duration). The build orchestrator logs these to the feature's `events.jsonl`. CaveBus summaries are generated separately by `lh compress`.

## Safety expectations

- **No shell interpolation.** Adapters use subprocess argument arrays, not shell strings.
- **Missing host CLI = actionable error.** Do not silently fail.
- **Dry-run by default in documentation.** All examples show `--dry-run` first.
- **No secret handling.** Adapters do not manage credentials. Host CLIs handle their own authentication.
- **Result capture.** Stdout and stderr are captured and stored for verification.

## Adapter checklist

When contributing a new adapter:

- [ ] Implements `AgentAdapter` interface
- [ ] Registered in adapter registry
- [ ] `detect()` checks CLI availability
- [ ] `run()` invokes host with argument arrays (no shell interpolation)
- [ ] Dry-run support works
- [ ] Missing CLI produces actionable error
- [ ] Tests exist in `tests/adapters/`
- [ ] Documentation in `docs/hosts/`
- [ ] `lh init --host <name>` support added
- [ ] Integration files created by init
