# F001 Plan — Password reset

> Example plan for the LeanHarness dogfooding walkthrough.
> This is a static illustrative artifact, not output from a real agent run.

## Status

planned

## Summary

Add password reset capability using three implementation slices: a token service, a request flow, and a completion flow. Each slice stays inside the approved change boundary. Existing auth and session behavior remain untouched.

## Inputs

- Spec: `examples/password-reset/spec.md`
- Discovery: `examples/password-reset/discovery.md`
- Boundary: `examples/password-reset/boundary.json`

## Acceptance Criteria Coverage

| AC | Description | Covered By |
|----|-------------|------------|
| AC1 | User can request reset from login flow | T02 |
| AC2 | System creates single-use token with expiration | T01 |
| AC3 | Expired/invalid/used tokens fail safely | T01, T04 |
| AC4 | New password uses existing policy | T03 |
| AC5 | Existing auth and session not replaced | T04, T05 |

## Slices

### Slice 1: Password reset foundation

**Tasks:** T01

Build the reset token service first. This is the core primitive that other slices depend on.

### Slice 2: Reset request flow

**Tasks:** T02

Wire up the request endpoint using the token service and existing email sender.

### Slice 3: Reset completion flow

**Tasks:** T03

Wire up the completion endpoint using the token service and existing password policy.

### Slice 4: Testing and verification

**Tasks:** T04, T05

Add focused tests, run full suite, produce verification evidence.

## Task List Reference

See `examples/password-reset/tasks.md` for detailed task definitions.

## Risk Gates

| Gate | Status | Mitigation |
|------|--------|------------|
| `security_sensitive_change` | triggered | Use `crypto.randomBytes` for token generation. Use `crypto.timingSafeEqual` for comparison. Review in T04. |
| `auth_rewrite` | unresolved | Spec explicitly preserves auth. T05 verifies existing auth tests pass. If auth changes are needed, escalate. |

## Test Strategy

- **T01:** Unit tests for token creation, expiration, single-use consumption.
- **T02:** Test that reset request sends email with valid token. Mock email sender if needed.
- **T03:** Test that completion applies password policy and invalidates token.
- **T04:** Negative tests: expired tokens, invalid tokens, reused tokens, wrong format.
- **T05:** Run full `npm test` to confirm no regressions in existing auth tests.

## Rollback / Recovery

- Token service is additive (new file). Rollback: delete `src/auth/reset-token.ts`.
- Password module changes are minimal (add reset entry point). Rollback: revert the change.
- No database migrations. No schema changes.
- No changes to session behavior.

## Out of Scope

- Rate limiting on reset requests.
- Admin-initiated password resets.
- Password reset email templates or styling.
- Logging or audit trail for reset events.

## Review Checklist

- [ ] All acceptance criteria mapped to at least one task.
- [ ] No task edits files outside the change boundary.
- [ ] Risk gates addressed or escalated.
- [ ] Test strategy covers positive and negative paths.
- [ ] Rollback path is clear.

## Notes

This plan was written as a LeanHarness example. It demonstrates the plan step between discover and build.
