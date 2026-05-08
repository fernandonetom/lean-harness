# F001 Checks — Password reset

> Example check report for the LeanHarness dogfooding walkthrough.
> This is a static illustrative artifact, not output from a real agent run.
> Verdict is `needs-fix` because this example has intentionally partial evidence.

## Verification Summary

- **Total AC:** 5
- **Verified:** 3
- **Failed:** 0
- **Pending:** 2

## Verdict

**needs-fix**

Two acceptance criteria (AC1, AC4) have insufficient evidence. Tests exist but were not run against a live implementation. This is expected for a static example.

## Acceptance Trace

### AC1: User can request a password reset from the login flow

- **Status:** pending
- **Evidence:**
  - T02 defines the request flow but no implementation was run.
  - No test execution output available.
- **Changed Files:**
  - src/auth/password.ts (planned, not executed)
- **Tests:**
  - tests/auth/password.test.ts (planned, not executed)

### AC2: System creates a single-use reset token with an expiration

- **Status:** passed
- **Evidence:**
  - T01 task definition covers token creation with expiration.
  - Test expectation: `tests/auth/reset-token.test.ts` covers creation, expiration, single-use.
  - Design uses `crypto.randomBytes` for token generation.
  - Design uses `crypto.timingSafeEqual` for comparison.
- **Changed Files:**
  - src/auth/reset-token.ts (planned)
- **Tests:**
  - tests/auth/reset-token.test.ts (planned)
- **Notes:**
  - Marked passed based on design evidence. In a real run, test execution output would be required.

### AC3: Expired, invalid, or already-used tokens fail safely

- **Status:** passed
- **Evidence:**
  - T01 covers token expiration and single-use consumption.
  - T04 adds explicit negative test cases for expired, invalid, and reused tokens.
  - Design ensures consumed tokens are marked as used and cannot be reused.
- **Changed Files:**
  - src/auth/reset-token.ts (planned)
  - tests/auth/reset-token.test.ts (planned)
- **Tests:**
  - tests/auth/reset-token.test.ts (planned negative cases)

### AC4: New password uses the existing password policy

- **Status:** pending
- **Evidence:**
  - T03 defines the completion flow using existing `validatePassword` from `src/auth/password.ts`.
  - No implementation was run.
  - No test execution output available.
- **Changed Files:**
  - src/auth/password.ts (planned, not executed)
- **Tests:**
  - tests/auth/password.test.ts (planned, not executed)

### AC5: Existing authentication and session behavior are not replaced

- **Status:** passed
- **Evidence:**
  - Discovery confirms `src/auth/session.ts` is read-only and not modified.
  - Boundary blocks edits to `src/auth/session.ts`.
  - T04 verifies existing `tests/auth/password.test.ts` passes unchanged.
  - No files outside the change boundary are modified.
- **Changed Files:**
  - none (session module untouched)
- **Tests:**
  - tests/auth/password.test.ts (existing, must pass unchanged)

## Verification Commands

| Command | Expected | Actual |
|---------|----------|--------|
| `npm test -- tests/auth/reset-token.test.ts` | pass | not run (example) |
| `npm test -- tests/auth/password.test.ts` | pass | not run (example) |
| `npm test` | pass | not run (example) |
| `npm run typecheck` | pass | not run (example) |

## Changed Files Review

| File | Action | Inside Boundary |
|------|--------|-----------------|
| `src/auth/reset-token.ts` | create | yes |
| `src/auth/password.ts` | modify | yes |
| `tests/auth/reset-token.test.ts` | create | yes |

No files outside the change boundary were modified.

## Boundary Review

- All planned edits are inside `allowedEditGlobs`.
- `src/auth/session.ts` is in `blockedEditGlobs` and was not modified.
- `.env` files are in `blockedEditGlobs` and were not accessed.
- No `doNotTouch` paths were modified.

## Risk Gate Review

| Gate | Status | Resolution |
|------|--------|------------|
| `security_sensitive_change` | addressed | Token design uses `crypto.randomBytes` and `crypto.timingSafeEqual`. |
| `auth_rewrite` | confirmed not needed | Existing auth module is extended, not replaced. Session behavior unchanged. |

## Code Review Summary

Not applicable. This is a static example with no implementation to review.

## Unresolved Issues

1. AC1 (reset request flow) has no execution evidence — needs implementation and test run.
2. AC4 (password policy reuse) has no execution evidence — needs implementation and test run.
3. No real test output is available because this is a static example.

## Final Decision

**needs-fix** — Two acceptance criteria lack verification evidence. In a real workflow, the agent would fix these issues and re-run `lh check F001` until all criteria pass or the feature is escalated as blocked.
