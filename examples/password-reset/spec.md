# F001 Password reset

> Example feature spec for the LeanHarness dogfooding walkthrough.
> This is a static illustrative artifact, not output from a real agent run.

## Status

specified

## Original Request

Add password reset without replacing existing auth.

## Goal

Allow users to reset their password through the existing login flow. The system should generate a single-use, time-limited reset token, deliver it through the existing email infrastructure, and apply the existing password policy when setting the new password.

## Non-Goals

- Do not replace or rewrite the existing authentication system.
- Do not add OAuth, SSO, or third-party identity providers.
- Do not change how existing sessions work.
- Do not build an admin-facing password reset.
- Do not add rate limiting in this feature (tracked separately).

## Users / Actors

- **End user:** Requests a password reset from the login page when they have forgotten their password.
- **System:** Creates tokens, sends emails, validates tokens, updates passwords.

## Acceptance Criteria

- [ ] AC1: User can request a password reset from the login flow.
- [ ] AC2: System creates a single-use reset token with an expiration.
- [ ] AC3: Expired, invalid, or already-used tokens fail safely.
- [ ] AC4: New password uses the existing password policy.
- [ ] AC5: Existing authentication and session behavior are not replaced.

## Constraints

- Must use the existing `src/email/send.ts` email sender. Do not introduce a new email provider.
- Must use the existing password validation in `src/auth/password.ts`. Do not duplicate or weaken the policy.
- Token storage mechanism should be consistent with the project's existing data layer.
- Reset tokens must expire within a reasonable window (e.g., 1 hour).

## Assumptions

- The existing app has a login page where the reset link can be placed.
- `src/email/send.ts` can send transactional emails with a link.
- The project uses a test runner compatible with `npm test`.
- No database migration framework is in place; token storage will use the existing data access pattern.

## Verification Expectations

- Unit tests for token creation, expiration, and single-use consumption.
- Integration-style tests for the reset request and completion flows.
- Manual or automated check that existing auth tests still pass.
- Boundary review confirming no files outside the change boundary were modified.

## Risk Notes

- **security_sensitive_change**: Password reset is a security-sensitive flow. Token generation must use cryptographically secure randomness. Token comparison must be timing-safe.
- **auth_rewrite (mitigated)**: The spec explicitly preserves existing auth. Discovery should confirm no auth rewrite is needed. If discovery finds that a rewrite is required, escalate before proceeding.

## Clarifying Questions

- Q: Should the reset link be sent as plain text or HTML email? A: Use whatever format `src/email/send.ts` already supports.
- Q: Is there a user lookup service, or does the reset endpoint accept an email directly? A: Assume the existing app can look up users by email.

## Notes

This spec was written as a LeanHarness example. It demonstrates the specify step of the Specify -> Discover -> Build -> Check workflow.
