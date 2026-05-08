# F001 Tasks — Password reset

> Example task list for the LeanHarness dogfooding walkthrough.
> This is a static illustrative artifact, not output from a real agent run.
> Task format is compatible with `lh compile-task`.

## Status Key

- `planned` — not started
- `active` — in progress
- `done` — completed and verified
- `blocked` — waiting on dependency or decision
- `skipped` — intentionally not done

## Tasks

### T01: Add reset token service

- Status: planned
- Acceptance criteria:
  - AC2
  - AC3
- Slice: Password reset foundation
- Goal: Add reset token creation and consumption without changing session behavior.
- Expected files:
  - src/auth/reset-token.ts
  - tests/auth/reset-token.test.ts
- Read-only context:
  - src/auth/password.ts
  - src/auth/session.ts
- Test expectation: Add focused tests for token creation, expiration, and single-use consumption.
- Verification commands:
  - npm test -- tests/auth/reset-token.test.ts
- Risk notes:
  - security_sensitive_change
- Dependencies:
  - none
- Summary file:
  - .lh/features/F001-password-reset/task-summaries/T01.md

### T02: Add reset request flow using existing email sender

- Status: planned
- Acceptance criteria:
  - AC1
- Slice: Reset request flow
- Goal: Add endpoint or function that accepts an email, creates a reset token, and sends the reset link using the existing email sender.
- Expected files:
  - src/auth/password.ts
- Read-only context:
  - src/email/send.ts
  - src/auth/reset-token.ts
- Test expectation: Test that a reset request for a valid email creates a token and invokes sendEmail.
- Verification commands:
  - npm test -- tests/auth/password.test.ts
- Risk notes:
  - none
- Dependencies:
  - T01
- Summary file:
  - .lh/features/F001-password-reset/task-summaries/T02.md

### T03: Add reset completion flow using existing password policy

- Status: planned
- Acceptance criteria:
  - AC4
- Slice: Reset completion flow
- Goal: Add endpoint or function that accepts a token and new password, validates the token, applies the existing password policy, and updates the password.
- Expected files:
  - src/auth/password.ts
- Read-only context:
  - src/auth/reset-token.ts
  - src/auth/session.ts
- Test expectation: Test that completion validates token, applies password policy, and updates the password.
- Verification commands:
  - npm test -- tests/auth/password.test.ts
- Risk notes:
  - security_sensitive_change
- Dependencies:
  - T01
- Summary file:
  - .lh/features/F001-password-reset/task-summaries/T03.md

### T04: Add focused tests and safe failure cases

- Status: planned
- Acceptance criteria:
  - AC3
  - AC5
- Slice: Testing and verification
- Goal: Add negative tests for expired, invalid, and reused tokens. Confirm existing auth tests still pass unchanged.
- Expected files:
  - tests/auth/reset-token.test.ts
- Read-only context:
  - src/auth/reset-token.ts
  - src/auth/password.ts
  - src/auth/session.ts
  - tests/auth/password.test.ts
- Test expectation: Negative test cases pass. Existing tests in tests/auth/password.test.ts pass without modification.
- Verification commands:
  - npm test
- Risk notes:
  - none
- Dependencies:
  - T01
  - T02
  - T03
- Summary file:
  - .lh/features/F001-password-reset/task-summaries/T04.md

### T05: Update final verification evidence

- Status: planned
- Acceptance criteria:
  - AC1
  - AC2
  - AC3
  - AC4
  - AC5
- Slice: Testing and verification
- Goal: Run full verification. Confirm all acceptance criteria have evidence. Produce check report.
- Expected files:
  - none (verification only)
- Read-only context:
  - src/auth/reset-token.ts
  - src/auth/password.ts
  - src/auth/session.ts
  - src/email/send.ts
  - tests/auth/reset-token.test.ts
  - tests/auth/password.test.ts
- Test expectation: Full test suite passes. All acceptance criteria have traceability evidence.
- Verification commands:
  - npm test
  - npm run typecheck
- Risk notes:
  - none
- Dependencies:
  - T04
- Summary file:
  - .lh/features/F001-password-reset/task-summaries/T05.md
