# F001 Result — Password reset

> Example result report for the LeanHarness dogfooding walkthrough.
> This is a static illustrative artifact, not output from a real agent run.

## Outcome

- **Status:** needs-fix
- **Completed at:** not completed
- **Duration:** n/a (static example)

## Summary

Password reset feature was specified, discovered, planned, and partially verified. Two acceptance criteria (AC1 request flow, AC4 password policy reuse) lack execution evidence because no agent was invoked during this example. The design is sound, the boundary is clear, and the risk gates are addressed, but the feature cannot be marked as pass without running the implementation and tests.

## Acceptance Results

| AC | Description | Status |
|----|-------------|--------|
| AC1 | User can request reset from login flow | pending |
| AC2 | System creates single-use token with expiration | passed (design evidence) |
| AC3 | Expired/invalid/used tokens fail safely | passed (design evidence) |
| AC4 | New password uses existing password policy | pending |
| AC5 | Existing auth and session not replaced | passed |

## What Changed

No files were actually modified. This is a static example. The planned changes are:

| File | Action |
|------|--------|
| `src/auth/reset-token.ts` | create (planned) |
| `src/auth/password.ts` | modify (planned) |
| `tests/auth/reset-token.test.ts` | create (planned) |

## Verification Evidence

| Evidence | Source | Available |
|----------|--------|-----------|
| Token service unit tests | `tests/auth/reset-token.test.ts` | no (planned) |
| Existing auth tests pass | `tests/auth/password.test.ts` | no (not run) |
| Full test suite passes | `npm test` | no (not run) |
| Type check passes | `npm run typecheck` | no (not run) |
| Boundary compliance | `boundary.json` review | yes |
| Risk gate review | checks.md | yes |

## Known Follow-ups

1. Implement T01-T05 using `lh build F001 --host claude-code` or `lh build F001 --host opencode --opencode-agent lh-builder`.
2. Re-run `lh check F001` after implementation.
3. Add rate limiting for reset requests (separate feature).
4. Consider audit logging for reset events (separate feature).

## Commands Run

| Command | Purpose | Result |
|---------|---------|--------|
| `lh spec "Add password reset..." --title "Password reset"` | Create spec | example |
| `lh discover F001 --depth D2` | Discover relevant files | example |
| `lh plan F001` | Create plan and tasks | example |
| `lh check F001 --no-run` | Check without running commands | needs-fix |
| `lh compress F001 --dry-run` | Compress CaveBus summaries | example |

## Review Notes

- The `needs-fix` verdict correctly reflects that a dry-run or static example cannot produce a `pass` verdict. This is intentional LeanHarness behavior.
- Design evidence (task definitions, boundary review, risk gate review) is sufficient to confirm the approach is sound.
- Execution evidence (test output, type check output) is required before the feature can pass.

## Lessons Learned

1. **LeanHarness does not false-pass.** Even with a complete plan and sound design, the check step requires execution evidence. This prevents claiming work is done when it was only planned.
2. **Boundary-driven development works.** Declaring what can and cannot be touched before implementation reduces scope creep and protects existing behavior.
3. **Risk gates provide early warning.** The `security_sensitive_change` gate flagged the need for cryptographic practices before any code was written.
4. **CaveBus compression preserves protected tokens.** File paths, function names, and identifiers survive compression exactly.

## Reusable Memory Updates

- Pattern: Password reset as an additive feature using existing auth and email infrastructure.
- Convention: Use `crypto.randomBytes` for token generation in this codebase.
- Risk: Any feature touching `src/auth/` should check whether `security_sensitive_change` gate applies.
