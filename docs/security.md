# Security and Safety

## Scope

LeanHarness v0.1 provides guardrails for AI coding agent sessions. These guardrails are best-effort safety measures, not a security sandbox. This document describes what LeanHarness protects against, what it does not, and how to use it safely.

## What LeanHarness protects against

**Scope creep.** Change boundaries limit which files an agent can modify. Edits outside the boundary are blocked by hooks (Claude Code) or plugins (OpenCode).

**Destructive commands.** Command classification policies block known-dangerous commands: `rm -rf /`, `git push --force`, `DROP DATABASE`, fork bombs, raw disk writes. See `.lh/policies/commands.yml`.

**Secret exposure.** Hooks and plugins block reads of `.env` files, credential files, and environment variable dumps (`printenv`, `env`).

**Risk gate bypass.** High-risk changes (auth rewrites, payment logic, destructive migrations, new dependencies, security-sensitive changes) trigger approval gates before proceeding.

**Unchecked completion.** `lh check` requires evidence before a feature can pass. No check, no pass.

## What LeanHarness does not protect against

**Malicious agents.** If an agent host is compromised or behaves maliciously, LeanHarness guardrails cannot prevent all damage. Guardrails are best-effort hooks and plugins, not kernel-level sandboxing.

**Approved destructive actions.** If a user approves a risky action (e.g., allows a file edit outside the boundary), LeanHarness does not prevent it. Users have final authority.

**Code correctness.** `lh check` verifies evidence against acceptance criteria. It does not prove code is correct, secure, or free of vulnerabilities. Use tests, linting, security scanning, and human review.

**Network access.** LeanHarness does not restrict agent network access. Agents can make HTTP requests, install packages, or access external services if the user allows it.

**Token exfiltration.** LeanHarness does not prevent agents from reading API keys or tokens from files outside the deny list. Keep secrets out of the repository.

## Guardrails

LeanHarness guardrails operate at three levels:

**1. Policy files** (`.lh/policies/`)
- `boundary.yml` — boundary enforcement rules
- `risk-gates.yml` — high-risk change categories
- `commands.yml` — command classification (deny, ask, safe)
- `opencode.yml` — OpenCode-specific guardrail configuration

**2. Claude Code hooks** (`.claude/hooks/`, `scripts/hooks/`)
- Pre-edit hooks enforce boundary compliance
- Post-edit hooks detect boundary violations
- Pre-command hooks classify commands against policy

**3. OpenCode guardrail plugin** (`.opencode/plugins/`)
- Boundary enforcement when `boundary.json` exists
- Dangerous command blocking
- Secret file access blocking
- Risk gate detection
- Event logging to `events.jsonl` and `cavebus.log`

All guardrails are best-effort. The final completion gate is `lh check`.

## Risk gates

Risk gates require deliberate approval before proceeding with high-risk changes:

| Gate | Triggers on |
|------|------------|
| `auth_rewrite` | Changes to authentication or session behavior |
| `payment_logic` | Changes to payment, billing, or checkout |
| `destructive_migration` | Destructive schema or data migrations |
| `new_dependency` | Adding, removing, or upgrading dependencies |
| `public_api_break` | Changes to public API routes or contracts |
| `broad_refactor` | Large refactors across many files |
| `security_sensitive_change` | Security, permissions, encryption, or token behavior |

Risk gates cause an approval prompt, not an automatic block. The behavior and path patterns are defined in `.lh/policies/risk-gates.yml`.

## Secrets

- Do not store secrets in `.lh/` artifacts, CaveBus logs, or feature files.
- Do not commit `.env` files or credential files.
- CaveBus compression preserves protected tokens but does not detect or redact secrets.
- Hooks and plugins block reads of `.env` and `printenv` but cannot prevent all secret access patterns.
- Keep secrets in environment variables or external secret managers, not in the repository.

## Agent hosts

Agent hosts (Claude Code, OpenCode) are external processes invoked by LeanHarness adapters. LeanHarness does not:

- Manage agent host credentials or authentication
- Control agent host model selection beyond parameter passing
- Sandbox agent host execution
- Prevent agent hosts from executing code if the user approves

Use dry-runs before invoking real agent hosts:

```bash
lh build F001 --host claude-code --dry-run
```

Dry-run validates the plan and boundary without spending agent tokens or executing code.

## Boundary enforcement

Change boundaries (`boundary.json`) define which files an agent can modify:

- `touchFiles` — files allowed for editing
- `allowedEditGlobs` — glob patterns for allowed edits
- `blockedEditGlobs` — glob patterns always blocked
- `doNotTouch` — files that must never be modified

Boundary enforcement is implemented by hooks (Claude Code) and plugins (OpenCode). Enforcement is best-effort — it depends on the host correctly reporting file operations to the guardrail layer.

## Verification

`lh check` produces evidence-based verdicts:

- **pass** — all acceptance criteria have evidence, all checks passed
- **needs-fix** — issues found, action required
- **blocked** — cannot verify without intervention

`lh check` is not a formal proof. It traces acceptance criteria to evidence (test results, command output, file changes) but does not guarantee correctness.

Use `--strict` for stronger evidence requirements:

```bash
lh check F001 --strict
```

## Reporting security issues

If you discover a security vulnerability in LeanHarness, report it responsibly:

- Open a minimal issue without including secrets, credentials, or exploit details.
- Once a security reporting channel is available for the repository, use that channel instead.
- Do not include reproduction steps that could be directly exploited.
