# Claude Code Flow — Password Reset Example

> Step-by-step commands for the password reset feature using Claude Code as the agent host.
> This is a reference for the command sequence. No agent was invoked to produce this document.

## Prerequisites

- Node.js >= 20
- LeanHarness CLI installed (`npm install` and `npm run build` in the LeanHarness repo)
- Claude Code installed and authenticated
- An existing project with `src/auth/password.ts`, `src/auth/session.ts`, `src/email/send.ts`

## Step 1: Initialize LeanHarness

```bash
lh init --host claude-code
```

Creates `.lh/` artifact store, `.claude/` integration surface (settings, skills, agents, hooks).

## Step 2: Create Feature Spec

```bash
lh spec "Add password reset without replacing existing auth" --title "Password reset"
```

Creates `.lh/features/F001-password-reset/spec.md` with acceptance criteria, constraints, and risk flags.

Inspect the spec:

```bash
cat .lh/features/F001-password-reset/spec.md
```

## Step 3: Discover Relevant Code

```bash
lh discover F001 --depth D2
```

Reads the codebase, produces `discovery.md` and `boundary.json` under the feature folder.

Inspect discovery:

```bash
cat .lh/features/F001-password-reset/discovery.md
cat .lh/features/F001-password-reset/boundary.json
```

## Step 4: Plan Implementation

```bash
lh plan F001
```

Creates `plan.md` and `tasks.md` with slices, task breakdown, and acceptance criteria coverage.

Inspect the plan:

```bash
cat .lh/features/F001-password-reset/plan.md
cat .lh/features/F001-password-reset/tasks.md
```

## Step 5: Compile Task Context

```bash
lh compile-task F001 T01
```

Generates bounded context for task T01 from the feature artifacts. Output goes to `.lh/features/F001-password-reset/task-context/T01.md`.

## Step 6: Dry Run First

```bash
lh build F001 --host claude-code --dry-run
```

Shows what would happen without invoking Claude Code. Validates task definitions, boundary, and context compilation. **Always dry-run first.**

Review the dry-run output. If the plan looks wrong, fix it before proceeding:

```bash
lh plan F001 --force
```

## Step 7: Build with Claude Code

```bash
lh build F001 --host claude-code
```

Invokes Claude Code for each task in order. Claude Code receives bounded context from `lh compile-task`. Each task produces:

- Code changes inside the change boundary
- Task summary in `task-summaries/T01.md`
- CaveBus entry in `cavebus.log`
- Status update in `tasks.md`

To run a single task:

```bash
lh run-task F001 T01 --host claude-code
```

## Step 8: Check Verification

```bash
lh check F001
```

Runs verification commands, reviews changed files against the spec, checks boundary compliance, reviews risk gates, and produces a verdict.

Expected verdicts:

- **pass** — All acceptance criteria verified with evidence.
- **needs-fix** — Some criteria lack evidence or tests failed.
- **blocked** — Cannot proceed without a decision or external input.

If verdict is `needs-fix`:

```bash
lh build F001 --host claude-code
lh check F001
```

Repeat until pass or escalate as blocked.

## Step 9: Compress CaveBus

```bash
lh compress F001
```

Compresses feature artifacts into compact CaveBus summaries. Protected tokens are preserved.

Validate CaveBus output:

```bash
lh cavebus F001 --validate
```

## Claude Code Interactive Equivalents

Inside a Claude Code session, these skills invoke the same workflow:

```
/lh-do Add password reset without replacing existing auth
```

Or step by step:

```
/lh-spec Add password reset without replacing existing auth
/lh-discover F001
/lh-plan F001
/lh-build F001
/lh-check F001
```

The skills call the `lh` CLI internally when available, or create artifacts manually using templates when the CLI is not yet built.

## Key Safety Rules

1. **Always dry-run first.** `lh build F001 --host claude-code --dry-run` before the real build.
2. **Dry-run does not produce a pass.** A dry-run-only flow will get `needs-fix` from `lh check`.
3. **`lh check` is the completion gate.** Do not mark work done without a passing check.
4. **Respect risk gates.** If `security_sensitive_change` or `auth_rewrite` triggers, review before proceeding.
5. **Use `--force` intentionally.** `lh plan F001 --force` regenerates the plan. `lh check F001 --force` regenerates the check. Only use when you want to replace existing artifacts.

## Troubleshooting

**Claude Code not found:** Ensure `claude` is in your PATH. Run `claude --version` to verify.

**Permission denied:** Check `.claude/settings.json`. The default settings require confirmation for file edits and risky commands.

**Boundary violation:** If Claude Code tries to edit files outside the boundary, the hook layer will warn or block. Update discovery to expand the boundary if needed:

```bash
lh discover F001 --depth D3
```

**Check fails repeatedly:** Read `checks.md` for specific unresolved issues. Fix the root cause, then re-run:

```bash
lh build F001 --host claude-code
lh check F001
```
