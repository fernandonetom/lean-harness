# F001 Discovery

> Example discovery report for the LeanHarness dogfooding walkthrough.
> This is a static illustrative artifact, not output from a real agent run.

## Status

discovered

## Discovery Goal

Identify files, tests, commands, patterns, and risks relevant to adding password reset without replacing existing auth.

## Discovery Depth

D2 dependency boundary

## Summary

The existing app has a clear auth module (`src/auth/`) with password hashing and session management. The email module (`src/email/send.ts`) provides a `sendEmail` function that accepts a recipient, subject, and body. No existing reset token infrastructure exists, so a new `src/auth/reset-token.ts` module is needed. The password validation logic in `src/auth/password.ts` can be reused directly for the new password. Session behavior in `src/auth/session.ts` does not need modification.

## Relevant Project Facts

- The project uses TypeScript with a Node.js runtime.
- Tests use `npm test` (assumed Jest or Vitest-compatible runner).
- Password hashing uses `bcrypt` (or equivalent) in `src/auth/password.ts`.
- The email sender is a thin wrapper; it does not queue or retry.
- No ORM is present; data access uses direct queries or a lightweight helper.

## Likely Touch Files

| Path | Why | Confidence |
|---|---|---|
| `src/auth/reset-token.ts` | New file: token creation, validation, consumption | high |
| `src/auth/password.ts` | Read and reuse password policy; may add a reset entry point | medium |
| `src/email/send.ts` | Read-only use of existing email sender | high |
| `tests/auth/reset-token.test.ts` | New file: tests for reset token service | high |
| `tests/auth/password.test.ts` | Existing tests; verify they still pass | high |

## Read-Only Reference Files

| Path | Why |
|---|---|
| `src/auth/session.ts` | Confirm session behavior is not affected |
| `src/email/send.ts` | Understand email sender interface |
| `src/auth/password.ts` | Understand existing password policy |

## Relevant Tests

| Path or Command | Why |
|---|---|
| `tests/auth/password.test.ts` | Existing tests must not regress |
| `tests/auth/reset-token.test.ts` | New tests for token service |
| `npm test` | Full test suite as final check |

## Commands Discovered

| Command | Purpose | Status |
|---|---|---|
| `npm test` | Run full test suite | available |
| `npm run typecheck` | TypeScript type checking | available |
| `npm run lint` | Linting | assumed available |

## Change Boundary Summary

- **Create:** `src/auth/reset-token.ts`, `tests/auth/reset-token.test.ts`
- **Modify:** `src/auth/password.ts` (add reset entry point if needed)
- **Read-only:** `src/auth/session.ts`, `src/email/send.ts`
- **Do not touch:** `src/auth/session.ts` internals, any files outside `src/auth/` and `src/email/`

## Risks

- `security_sensitive_change`: Token generation and comparison require cryptographic safety.
- Token expiration logic must handle clock skew gracefully.
- If `src/auth/password.ts` exports are insufficient, a small refactor may be needed, but should not rewrite the module.

## Risk Gates Triggered

| Gate | Status | Notes |
|---|---|---|
| `security_sensitive_change` | triggered | Password reset tokens are security-sensitive. Requires timing-safe comparison and cryptographic randomness. |
| `auth_rewrite` | not triggered | Spec explicitly preserves existing auth. Discovery confirms no rewrite needed. |

## Unknowns

- Exact token storage mechanism (in-memory, database, file). Assumed to follow existing data access pattern.
- Whether the login page route file needs a new endpoint or uses an existing route pattern.

## Do Not Touch

- `src/auth/session.ts` internals — session behavior must not change.
- Any files outside `src/auth/` and `src/email/` unless boundary is updated.
- Database schema files (if any) — no migration in this feature scope.

## Discovery Log

```
D0: src/auth/password.ts — direct match, exports hashPassword, validatePassword
D0: src/email/send.ts — direct match, exports sendEmail
D1: src/auth/session.ts — imported by password.ts, manages sessions
D1: tests/auth/password.test.ts — tests password module
D2: no further dependencies found at D2 boundary
```

## Next Step Recommendation

Proceed to planning. Change boundary is clear. Risk gate `security_sensitive_change` is triggered but manageable with standard cryptographic practices. No auth rewrite required.
