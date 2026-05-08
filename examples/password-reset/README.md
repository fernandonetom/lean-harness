# Password Reset Example

> Static illustrative example of the full LeanHarness workflow.
> No agent was invoked to produce these artifacts. They demonstrate what real artifacts look like.

## Purpose

Show the complete LeanHarness feature lifecycle using a realistic brownfield scenario: adding password reset to an existing app without replacing its auth system.

## Scenario

A small app has:

```
src/auth/password.ts      # Password hashing and validation
src/auth/session.ts        # Session management
src/email/send.ts          # Email sender
tests/auth/password.test.ts # Existing auth tests
```

The request: **Add password reset without replacing existing auth.**

## What This Example Shows

The full Specify -> Discover -> Plan -> Build -> Check -> Compress workflow:

1. **Specify** — Turn the request into a feature spec with acceptance criteria, constraints, and risk flags.
2. **Discover** — Find relevant files, tests, commands, and risks. Produce a change boundary.
3. **Plan** — Break the feature into slices and tasks with acceptance criteria coverage.
4. **Build** — Compile bounded context and execute tasks (shown as dry-run in this example).
5. **Check** — Verify acceptance criteria against evidence. Produce a verdict.
6. **Compress** — Produce CaveBus summaries for internal communication.

## Files

| File | What It Shows |
|------|--------------|
| [spec.md](spec.md) | Feature specification with acceptance criteria |
| [discovery.md](discovery.md) | Discovery report with relevant files and risks |
| [boundary.json](boundary.json) | Machine-readable change boundary |
| [plan.md](plan.md) | Implementation plan with slices and task coverage |
| [tasks.md](tasks.md) | Parseable task list compatible with `lh compile-task` |
| [checks.md](checks.md) | Verification report with `needs-fix` verdict |
| [result.md](result.md) | Final result matching the check verdict |
| [cavebus.log](cavebus.log) | CaveBus messages including compressed block |
| [events.jsonl](events.jsonl) | Event log in JSONL format |
| [claude-code-flow.md](claude-code-flow.md) | Step-by-step Claude Code commands |
| [opencode-flow.md](opencode-flow.md) | Step-by-step OpenCode commands |

## Claude Code Flow

See [claude-code-flow.md](claude-code-flow.md) for the complete command sequence using Claude Code as the agent host.

## OpenCode Flow

See [opencode-flow.md](opencode-flow.md) for the complete command sequence using OpenCode as the agent host.

## Expected Learning

After reading this example, you should understand:

- How LeanHarness artifacts relate to each other.
- How acceptance criteria flow from spec through plan to check.
- How change boundaries protect existing code.
- How risk gates provide early warning for security-sensitive changes.
- How CaveBus summaries compress internal communication while preserving protected tokens.
- Why `needs-fix` is the correct verdict for a static or dry-run example.
- How the same `.lh/` artifacts work with both Claude Code and OpenCode.

## What Is Static vs Executable

| Aspect | In This Example | In a Real Run |
|--------|----------------|---------------|
| Spec creation | Static file | `lh spec` generates from request |
| Discovery | Static file | `lh discover` reads actual codebase |
| Boundary | Static JSON | `lh discover` generates from analysis |
| Plan and tasks | Static files | `lh plan` generates from spec + discovery |
| Build | Not executed | `lh build` invokes Claude Code or OpenCode |
| Check | Static report | `lh check` runs commands and reviews evidence |
| CaveBus | Static log | `lh compress` generates from feature artifacts |

## Safety Notes

- This example does not modify any files in the LeanHarness repository.
- This example does not invoke Claude Code or OpenCode.
- This example does not create artifacts under `.lh/features/`.
- The `needs-fix` verdict is intentional and correct for static evidence.
- Do not copy these artifacts into `.lh/features/` and claim they represent a real feature run.

## Next Steps

1. Read the [Claude Code flow](claude-code-flow.md) or [OpenCode flow](opencode-flow.md) to understand the command sequence.
2. Read the [dogfooding guide](../../docs/dogfooding.md) to try LeanHarness on a real project.
3. Read the [password reset walkthrough](../../docs/examples/password-reset.md) for a narrative explanation.
