# Password Reset Walkthrough

A narrative walkthrough of the password reset example that ships with LeanHarness. This explains what each artifact contains and how the workflow steps connect.

All example artifacts are in [`examples/password-reset/`](../../examples/password-reset/README.md).

## Scenario

A small existing app has authentication (`src/auth/password.ts`, `src/auth/session.ts`) and email (`src/email/send.ts`). The request is:

> Add password reset without replacing existing auth.

This is a classic brownfield feature: new functionality layered onto an existing codebase with preservation constraints.

## Step 1: Specify

**Command:** `lh spec "Add password reset without replacing existing auth" --title "Password reset"`

**Artifact:** [`spec.md`](../../examples/password-reset/spec.md)

The spec captures:

- **Goal:** Allow users to reset passwords through the existing login flow.
- **Non-goals:** No OAuth, no SSO, no admin resets, no session changes.
- **Acceptance criteria:** Five criteria covering the request flow, token behavior, failure handling, password policy reuse, and preservation of existing auth.
- **Constraints:** Must use existing email sender and password policy.
- **Risk notes:** `security_sensitive_change` flagged because password reset is security-sensitive. `auth_rewrite` noted as mitigated because the spec explicitly preserves existing auth.

The spec avoids premature implementation details. It says *what* the feature should do, not *how* to implement it.

## Step 2: Discover

**Command:** `lh discover F001 --depth D2`

**Artifacts:** [`discovery.md`](../../examples/password-reset/discovery.md), [`boundary.json`](../../examples/password-reset/boundary.json)

Discovery identifies:

- **Touch files:** `src/auth/reset-token.ts` (new), `src/auth/password.ts` (modify), `tests/auth/reset-token.test.ts` (new).
- **Read-only files:** `src/auth/session.ts`, `src/email/send.ts`, `tests/auth/password.test.ts`.
- **Risk gates:** `security_sensitive_change` triggered. `auth_rewrite` confirmed not needed.
- **Unknowns:** Token storage mechanism, login page route structure.

The change boundary (`boundary.json`) is the machine-readable version. It lists allowed and blocked edit globs, do-not-touch paths, and protected tokens that must survive CaveBus compression.

Key insight: `src/auth/session.ts` is in `blockedEditGlobs`. If the agent tries to modify it, the guardrail layer will block the edit.

## Step 3: Plan

**Command:** `lh plan F001`

**Artifacts:** [`plan.md`](../../examples/password-reset/plan.md), [`tasks.md`](../../examples/password-reset/tasks.md)

The plan breaks the feature into four slices:

1. **Password reset foundation** (T01) — Token service.
2. **Reset request flow** (T02) — Wire up request endpoint with email sender.
3. **Reset completion flow** (T03) — Wire up completion with password policy.
4. **Testing and verification** (T04, T05) — Negative tests and final verification.

Every acceptance criterion maps to at least one task. The acceptance criteria coverage table in `plan.md` makes this traceable.

The `tasks.md` file uses the exact field labels expected by `lh compile-task`: Status, Acceptance criteria, Slice, Goal, Expected files, Read-only context, Test expectation, Verification commands, Risk notes, Dependencies, Summary file.

## Step 4: Build with Claude Code

**Command:** `lh build F001 --host claude-code --dry-run` (first), then `lh build F001 --host claude-code`

**Reference:** [`claude-code-flow.md`](../../examples/password-reset/claude-code-flow.md)

For each task, `lh compile-task` generates bounded context. Claude Code receives only the files relevant to that task, not the entire codebase.

In this static example, no agent was invoked. The `--dry-run` flag validates the plan without executing it. A dry-run does not produce execution evidence, so it cannot lead to a `pass` verdict.

In a real run, Claude Code would:

1. Read the compiled task context.
2. Implement the code changes inside the boundary.
3. Run verification commands.
4. Produce a task summary.
5. Move to the next task.

## Step 5: Build with OpenCode

**Command:** `lh build F001 --host opencode --opencode-agent lh-builder --dry-run` (first), then `lh build F001 --host opencode --opencode-agent lh-builder`

**Reference:** [`opencode-flow.md`](../../examples/password-reset/opencode-flow.md)

OpenCode uses the same `.lh/` artifacts. The only differences are:

- The agent is invoked through `opencode run --agent lh-builder` instead of `claude -p`.
- Guardrails come from `.opencode/plugins/leanharness-guardrails.js` instead of `.claude/` hooks.
- `lh check` is still the final completion gate, regardless of which host ran the build.

## Step 6: Check

**Command:** `lh check F001`

**Artifact:** [`checks.md`](../../examples/password-reset/checks.md), [`result.md`](../../examples/password-reset/result.md)

The check traces each acceptance criterion to evidence:

| AC | Status | Reason |
|----|--------|--------|
| AC1 | pending | No execution evidence |
| AC2 | passed | Design evidence (token service) |
| AC3 | passed | Design evidence (negative cases) |
| AC4 | pending | No execution evidence |
| AC5 | passed | Boundary confirms session untouched |

**Verdict: `needs-fix`**

This is correct. Two criteria lack execution evidence because no agent was invoked. LeanHarness does not false-pass — a dry-run or static example cannot produce a `pass` verdict.

The `result.md` matches the check verdict. It records what happened, what remains, and lessons learned.

## Step 7: Compress and Inspect CaveBus

**Command:** `lh compress F001`, then `lh cavebus F001 --validate`

**Artifact:** [`cavebus.log`](../../examples/password-reset/cavebus.log)

The CaveBus log contains compact messages for each workflow step: REQ, DISC, BOUNDARY, PLAN, TASK, SUM, VERIFY, NOTE.

The compressed block at the end (`LH-COMPRESS-BEGIN` / `LH-COMPRESS-END`) is a full-feature summary that preserves all protected tokens (file paths, function names, IDs) while stripping prose filler.

## Reading the Example Artifacts

Start with the spec to understand what was requested. Then read discovery to see what files are relevant. Then read the plan to understand the approach. Then read checks and result to see the verification outcome.

The event log ([`events.jsonl`](../../examples/password-reset/events.jsonl)) provides a machine-readable timeline of the workflow.

## Lessons

1. **Specs drive everything.** Acceptance criteria flow from spec through plan to check. If the spec is vague, everything downstream suffers.
2. **Boundaries prevent scope creep.** Declaring what can and cannot be touched before implementation keeps the agent focused.
3. **Risk gates provide early warning.** `security_sensitive_change` was flagged at discovery time, before any code was written.
4. **Honest verdicts matter.** `needs-fix` is the right answer when evidence is incomplete. False passes erode trust.
5. **Host-neutral artifacts enable multi-host.** The same spec, discovery, plan, and check work with both Claude Code and OpenCode.
6. **CaveBus compression preserves meaning.** Protected tokens survive compression exactly. Filler words do not.
