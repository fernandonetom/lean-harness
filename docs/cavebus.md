# CaveBus Protocol

CaveBus is LeanHarness's compact internal communication protocol. It reduces token usage in agent-to-agent handoffs, task summaries, discovery summaries, review results, verification results, blocker reports, and reusable memory notes while preserving meaning and protected tokens.

Version: 0.1

## Non-Goals

CaveBus is not:

- A replacement for canonical specs, plans, checks, or result reports.
- A binary protocol.
- A private hidden state system.
- A way to hide failures, blockers, or risk gates.
- A way to remove human review from the workflow.
- The only source of truth for any artifact.

Canonical human-readable artifacts (`spec.md`, `plan.md`, `checks.md`, `result.md`) must always exist alongside CaveBus summaries.

## Design Goals

- Reduce token usage in internal LeanHarness communication.
- Preserve meaning. Compressed messages must convey the same facts.
- Preserve protected tokens exactly. No renaming, abbreviating, or paraphrasing identifiers.
- Support bounded context. Each task or subagent receives only what it needs.
- Support subagent handoffs. Compact messages travel between lh-scout, lh-builder, lh-reviewer, lh-verifier, and lh-compressor.
- Support resumable file-based workflows. CaveBus logs persist in `.lh/features/<feature>/cavebus.log`.
- Keep messages readable enough for humans to inspect.

## Core Principle

**Compress prose, not identifiers.**

Remove filler words, hedging, and verbose explanations. Keep every file path, function name, command, error message, and ID exactly as it appears in the codebase.

## Where CaveBus Is Used

- `cavebus.log` in feature folders.
- Task summaries (compact sections in `task-summaries/T-XX.md`).
- Discovery summaries passed between lh-scout and the orchestrator.
- Review summaries from lh-reviewer.
- Verification summaries from lh-verifier.
- Subagent handoff messages.
- Memory compaction in `.lh/memory/`.
- Context compiler inputs (future CLI).

## Where CaveBus Is Not Used

- `spec.md` — must remain human-readable.
- `plan.md` — must remain human-readable.
- `checks.md` — must remain human-readable.
- `result.md` — must remain human-readable.
- Final user-facing reports, unless the user explicitly requests compact format.

## Protected Tokens

These categories must be preserved exactly in CaveBus messages. Never abbreviate, rename, paraphrase, or omit them:

- File paths
- Directory paths
- Commands
- Symbols
- Class names
- Function names
- Method names
- API routes
- Environment variables
- Error messages
- Test names
- URLs
- Migration names
- Database table names
- Database column names
- Configuration keys
- Feature IDs
- Task IDs
- Acceptance criteria IDs
- Risk gate names
- Package names
- Branch names
- Commit hashes

## Message Shape

CaveBus is line-oriented. Each message follows this structure:

```
TYPE FEATURE [TASK] key:value
key:
- item
- item
```

Rules:

1. First token is the message type.
2. Second token is usually the feature ID (e.g., `F001`).
3. Third token is optional, often a task ID (e.g., `T-01`).
4. Inline key-value pairs use `key:value` with no spaces around the colon.
5. Multiline sections use a key followed by colon, then indented list items.
6. Keep line lengths readable. No hard limit, but prefer under 120 characters.
7. Preserve protected tokens exactly.
8. Do not compress file paths, symbols, commands, errors, or IDs.
9. Do not hide failures, blockers, skipped checks, risk gates, or unknowns.
10. Prefer omission over vague filler. If something is unknown, say `unknown`, do not guess.
11. CaveBus is a compact handoff, not the only record. Canonical artifacts must still exist.

## Message Types

### REQ

Compact user requirement or feature intent.

**When to use:** At the start of a feature, to record the compressed request.

**Required fields:** feature ID, goal.

**Optional fields:** constraints, non-goals, risk flags.

**Example:**

```
REQ F003 goal:add password reset via email
constraints:
- reuse existing email service
- no new dependencies
risk:
- security_sensitive_change
```

### DISC

Discovery result summary.

**When to use:** After lh-scout completes discovery. Passed to the orchestrator and lh-builder.

**Required fields:** feature ID, confidence, depth.

**Optional fields:** touch, read, tests, cmd, risk, unknown, avoid, next.

**Example:**

```
DISC F003 conf:high depth:D2
touch:
- src/auth/reset.ts reason:reset flow entry point conf:high
- src/auth/token.ts reason:token generation conf:med
read:
- src/auth/password.ts reason:reuse password policy
- src/email/sender.ts reason:email dispatch interface
tests:
- tests/auth/password-reset.test.ts
risk:
- security_sensitive_change
unknown:
- email test harness availability
next:
- plan T-01 through T-03
```

### PLAN

Plan summary.

**When to use:** After planning is complete. Compact version of `plan.md`.

**Required fields:** feature ID, task count.

**Optional fields:** tasks list, dependencies, risk gates, boundary notes.

**Example:**

```
PLAN F003 tasks:3
tasks:
- T-01 goal:create reset token model ac:AC-01
- T-02 goal:add reset endpoint ac:AC-02 dep:T-01
- T-03 goal:send reset email ac:AC-03 dep:T-02
risk:
- security_sensitive_change scope:T-01,T-02
boundary:
- 6 touch, 4 read-only
```

### TASK

Task packet or task assignment. Defines bounded context for a single task.

**When to use:** When dispatching a task to lh-builder or recording task scope.

**Required fields:** feature ID, task ID.

**Optional fields:** ac, goal, files, read, test, verify, risk, rules, next.

**Example:**

```
TASK F003 T-01
ac:
- AC-01
goal:
- create reset token model with expiry
files:
- src/auth/reset-token.ts action:create
- src/auth/index.ts action:edit
read:
- src/auth/token.ts reason:existing token patterns
test:
- tests/auth/reset-token.test.ts
verify:
- npm test -- --testPathPattern=reset-token
risk:
- security_sensitive_change reason:token generation
rules:
- stay inside boundary
- preserve protected tokens
next:
- T-02 after verification
```

### SUM

Task result summary. Records what a task changed and whether it succeeded.

**When to use:** After a task completes. Written to `task-summaries/T-XX.md` and `cavebus.log`.

**Required fields:** feature ID, task ID, status.

**Optional fields:** add, chg, test, pass, fail, risk, next.

**Example:**

```
SUM F003 T-01 status:done
add:
- src/auth/reset-token.ts
- tests/auth/reset-token.test.ts
chg:
- src/auth/index.ts
test:
- tests/auth/reset-token.test.ts
pass:
- npm test -- --testPathPattern=reset-token
risk:
- security_sensitive_change status:mitigated
next:
- T-02
```

### REV

Review result. Records findings from lh-reviewer.

**When to use:** After code review of a task or feature.

**Required fields:** feature ID, task ID or feature scope, verdict.

**Optional fields:** crit, major, minor, miss, boundary, risk, fix, next.

**Verdict values:** `pass`, `needs-fix`, `blocked`.

**Example:**

```
REV F003 T-01 verdict:needs-fix
major:
- token expiry not enforced at validation file:src/auth/reset-token.ts evidence:line 42 missing expiry check
minor:
- missing JSDoc on public method file:src/auth/reset-token.ts evidence:line 15
miss:
- no negative test for expired tokens
fix:
- add expiry validation in validateResetToken()
- add test for expired token rejection
next:
- fix findings then re-review
```

### VERIFY

Verification result. Records evidence-based verdict from lh-verifier.

**When to use:** After final verification of a feature.

**Required fields:** feature ID, verdict.

**Optional fields:** ac, cmd, chg, boundary, risk, review, miss, next.

**Verdict values:** `pass`, `needs-fix`, `blocked`.

**Example:**

```
VERIFY F003 verdict:pass
ac:
- AC-01 status:pass evidence:reset-token.test.ts passes, token created with 1h expiry
- AC-02 status:pass evidence:POST /auth/reset returns 200, token stored
- AC-03 status:pass evidence:email sent via sender.ts, confirmed in test
cmd:
- npm test result:pass evidence:14 tests passed, 0 failed
- npm run lint result:pass evidence:no errors
chg:
- src/auth/reset-token.ts type:created boundary:in
- src/auth/reset.ts type:modified boundary:in
- src/auth/index.ts type:modified boundary:in
boundary:
- status:pass note:all changes within boundary
risk:
- security_sensitive_change status:resolved
review:
- verdict:pass evidence:all findings addressed in T-01 rev2
```

### ERR

Error, failed command, exception, or unexpected output.

**When to use:** When a command fails, an exception occurs, or output is unexpected.

**Required fields:** feature ID, task ID or check ID.

**Optional fields:** cmd, err, cause, scope, next.

**Example:**

```
ERR F003 T-02
cmd:
- npm test -- --testPathPattern=reset-endpoint
err:
- Error: connect ECONNREFUSED 127.0.0.1:5432
cause:
- test database not running
scope:
- in-scope
next:
- start test database, re-run tests
```

### BLOCK

Blocker that prevents safe progress.

**When to use:** When a task or feature cannot proceed without external intervention.

**Required fields:** feature ID, reason.

**Optional fields:** need, risk, evidence, next.

**Example:**

```
BLOCK F003 reason:missing email service credentials
need:
- EMAIL_API_KEY environment variable
- access to email service test account
risk:
- security_sensitive_change
evidence:
- src/email/sender.ts requires EMAIL_API_KEY at line 8
next:
- request credentials from team, then resume T-03
```

### MEM

Reusable memory entry. Records a fact learned during a feature that applies beyond the feature.

**When to use:** When discovery or implementation reveals a reusable fact.

**Required fields:** scope, topic.

**Optional fields:** fact, src, use.

**Example:**

```
MEM project email-service
fact:
- email service uses SendGrid API v3
- rate limit: 100 emails/minute
- test mode: set EMAIL_TEST_MODE=true
src:
- F003 discovery D2
- src/email/sender.ts
use:
- any feature involving email dispatch
```

### NOTE

Non-blocking observation. Records something worth knowing but not blocking.

**When to use:** During discovery, build, or review when something is notable but not actionable now.

**Required fields:** feature ID, scope.

**Optional fields:** note, src, next.

**Example:**

```
NOTE F003 scope:code-quality
note:
- src/auth/password.ts has no tests, unrelated to this feature
src:
- discovery D2
next:
- consider adding tests in a separate feature
```

### RISK

Risk gate or risk note.

**When to use:** When a risk gate is triggered, approved, resolved, or remains unresolved.

**Required fields:** feature ID, gate, status.

**Optional fields:** reason, evidence, next.

**Status values:** `triggered`, `approved`, `resolved`, `unresolved`.

**Example:**

```
RISK F003 gate:security_sensitive_change status:approved
reason:
- reset token generation uses crypto.randomBytes
evidence:
- user approved in spec phase
- implementation reviewed by lh-reviewer
next:
- proceed with verification
```

### BOUNDARY

Change boundary update.

**When to use:** When discovery reveals files outside the current boundary, or when boundary needs adjustment.

**Required fields:** feature ID, status.

**Optional fields:** add, remove, avoid, next.

**Status values:** `expanded`, `reduced`, `unchanged`, `needs-update`.

**Example:**

```
BOUNDARY F003 status:expanded
add:
- src/email/templates/reset.html reason:email template needed for reset flow
remove:
- src/auth/oauth.ts reason:not relevant after D2
avoid:
- src/billing/ reason:out of scope
next:
- update boundary.json, re-plan if needed
```

### CMD

Command run and result.

**When to use:** To record a specific command execution and its outcome.

**Required fields:** feature ID, task ID or check ID, result.

**Optional fields:** cmd, evidence, next.

**Result values:** `pass`, `fail`, `skipped`, `not-run`.

**Example:**

```
CMD F003 T-01 result:pass
cmd:
- npm test -- --testPathPattern=reset-token
evidence:
- 6 tests passed, 0 failed, 0 skipped
next:
- proceed to T-02
```

## Common Keys

| Key | Meaning |
|-----|---------|
| `status` | Current state of a task, feature, or check |
| `verdict` | Final assessment: `pass`, `needs-fix`, `blocked` |
| `conf` | Confidence: `low`, `med`, `high`, `unknown` |
| `depth` | Discovery depth: `D0` through `D4` |
| `ac` | Acceptance criteria reference |
| `goal` | Task or feature goal |
| `ctx` | Context reference |
| `touch` | Files to modify |
| `read` | Files to read but not modify |
| `files` | Files involved (general) |
| `tests` | Test files or test commands |
| `cmd` | Command executed |
| `pass` | Items that passed |
| `fail` | Items that failed |
| `risk` | Risk gate or risk note |
| `unknown` | Items with unknown status or outcome |
| `avoid` | Files or areas to avoid |
| `block` | Blocker description |
| `miss` | Missing evidence or coverage |
| `fix` | Recommended fix |
| `next` | Next action |
| `src` | Source or origin of information |
| `evidence` | Verification evidence |
| `boundary` | Change boundary reference |
| `review` | Review reference |
| `notes` | Additional notes |

## Status Values

| Status | Meaning |
|--------|---------|
| `draft` | Incomplete, blocking questions remain |
| `specified` | Spec ready for discovery |
| `discovered` | Discovery complete, boundary locked |
| `planned` | Plan and tasks ready |
| `building` | Tasks in progress |
| `done` | Task or feature complete |
| `needs-fix` | Issues found, action required |
| `blocked` | Cannot proceed without intervention |
| `verified` | Verification complete |
| `archived` | No longer active |
| `pass` | Passed verification or check |
| `fail` | Failed verification or check |
| `partial` | Partially passed |
| `not-checked` | Not yet checked |
| `skipped` | Intentionally skipped |
| `unknown` | Status cannot be determined |

## Confidence Values

| Value | Meaning |
|-------|---------|
| `low` | Limited evidence, may need deeper discovery |
| `med` | Reasonable evidence, some uncertainty remains |
| `high` | Strong evidence, high certainty |
| `unknown` | Cannot assess confidence |

Use `med`, not `medium`, in CaveBus messages.

## Discovery Depth Values

| Depth | Meaning |
|-------|---------|
| `D0` | Repo shape: package manager, major folders, test commands |
| `D1` | Candidate surfaces: relevant files, routes, components, services |
| `D2` | Dependency boundary: imports, callers, callees, neighboring tests |
| `D3` | Risk probes: focused test runs, security checks, auth/payment inspection |
| `D4` | Deep dive: broader architecture when D0-D3 insufficient |

## Compression Rules

1. Remove filler words (just, really, basically, actually, simply, essentially).
2. Keep causal meaning. If A causes B, the compressed message must still show that.
3. Preserve commands exactly. Never abbreviate or paraphrase a command.
4. Preserve error text exactly. Never reword error messages.
5. Preserve file paths exactly. Never shorten or glob a specific path.
6. Preserve IDs exactly. Feature IDs, task IDs, AC IDs, commit hashes.
7. Keep unknowns visible. If something is unknown, say `unknown`.
8. Keep blockers visible. Never compress away a `BLOCK` message.
9. Keep failures visible. Never compress away a `fail` or `ERR` message.
10. Never turn uncertainty into certainty. `conf:low` must not become `conf:high`.
11. Never turn `needs-fix` into `pass`. Verdict downgrades are prohibited.
12. Never drop security or data-loss risks. Risk gates must always appear.
13. Prefer omission over vague filler. Leave a key out rather than writing "various" or "several."

## Examples

### Compact user request

```
REQ F005 goal:add rate limiting to public API endpoints
constraints:
- use existing Redis instance
- 100 req/min per API key
risk:
- public_api_break
```

### Discovery summary

```
DISC F005 conf:high depth:D2
touch:
- src/middleware/rate-limit.ts reason:new middleware conf:high
- src/routes/api.ts reason:apply middleware conf:high
read:
- src/config/redis.ts reason:connection reuse
- src/middleware/auth.ts reason:middleware ordering
tests:
- tests/middleware/rate-limit.test.ts
risk:
- public_api_break
unknown:
- current Redis connection pool size
next:
- plan 2 tasks
```

### Task packet

```
TASK F005 T-01
ac:
- AC-01
goal:
- create rate-limit middleware using Redis
files:
- src/middleware/rate-limit.ts action:create
read:
- src/config/redis.ts reason:connection pattern
test:
- tests/middleware/rate-limit.test.ts
verify:
- npm test -- --testPathPattern=rate-limit
```

### Task result summary

```
SUM F005 T-01 status:done
add:
- src/middleware/rate-limit.ts
- tests/middleware/rate-limit.test.ts
pass:
- npm test -- --testPathPattern=rate-limit
next:
- T-02
```

### Review result

```
REV F005 T-01 verdict:pass
minor:
- consider logging rate limit hits file:src/middleware/rate-limit.ts evidence:no logging at line 28
```

### Verification result

```
VERIFY F005 verdict:pass
ac:
- AC-01 status:pass evidence:rate-limit.test.ts 8/8 pass
cmd:
- npm test result:pass evidence:42 pass 0 fail
boundary:
- status:pass
risk:
- public_api_break status:resolved
```

### Failed command

```
ERR F005 T-01
cmd:
- npm test -- --testPathPattern=rate-limit
err:
- Error: Redis connection refused at 127.0.0.1:6379
cause:
- Redis not running in test environment
next:
- start Redis, re-run
```

### Blocker

```
BLOCK F005 reason:Redis not available in CI
need:
- Redis service in CI pipeline
evidence:
- CI config at .github/workflows/test.yml has no Redis service
next:
- add Redis service to CI, or mock Redis in tests
```

### Reusable memory note

```
MEM project redis
fact:
- Redis runs on port 6379 in dev, 6380 in test
- connection config in src/config/redis.ts
src:
- F005 discovery
use:
- any feature using Redis
```

### Boundary update

```
BOUNDARY F005 status:expanded
add:
- .github/workflows/test.yml reason:needs Redis service for CI
next:
- update boundary.json
```

## Anti-Patterns

Avoid these CaveBus mistakes:

1. **Replacing `spec.md` with CaveBus only.** CaveBus summaries supplement canonical artifacts, never replace them.
2. **Compressing error messages.** `Error: ENOENT: no such file or directory, open '/app/config.json'` must appear exactly as output. Never rewrite as "file not found."
3. **Hiding failed commands.** Every failed command must appear in an `ERR` or `CMD` message with `result:fail`.
4. **Removing file paths.** `src/auth/reset-token.ts` must appear exactly. Never abbreviate to "auth file" or "reset module."
5. **Changing function names.** `validateResetToken()` must appear exactly. Never rewrite as "the validation function."
6. **Flattening uncertainty.** `conf:low` or `unknown` must remain. Never upgrade to `conf:high` without new evidence.
7. **Mixing unrelated tasks.** Each CaveBus message should address one task or one coherent scope. Do not combine T-01 and T-03 findings in one message.
8. **Using CaveBus as a substitute for verification.** A `SUM` with `status:done` is not verification. Verification requires a `VERIFY` message with evidence.

## Validation Checklist

Before accepting a CaveBus message as valid, check:

- [ ] Protected tokens preserved exactly (paths, commands, errors, IDs, symbols).
- [ ] Failures retained. No `fail` or `ERR` dropped.
- [ ] Blockers retained. No `BLOCK` dropped.
- [ ] Risk gates retained. No risk gate omitted.
- [ ] Next action clear. `next:` section present when applicable.
- [ ] Message type correct for the content.
- [ ] Feature ID correct and matches the active feature.
- [ ] Task ID correct when present and matches the active task.
- [ ] Canonical artifact still exists. CaveBus does not replace `spec.md`, `plan.md`, `checks.md`, or `result.md`.

## Relationship to LeanHarness Workflow

CaveBus supports each phase of the LeanHarness workflow:

**Specify:** `REQ` messages capture compact feature intent. The canonical `spec.md` remains the source of truth.

**Discover:** `DISC` messages carry discovery results between lh-scout and the orchestrator. `BOUNDARY` messages record boundary changes. `RISK` messages flag risk gates. The canonical `discovery.md` and `boundary.json` remain sources of truth.

**Build:** `TASK` messages define bounded context for each task. `SUM` messages record task results. `ERR` messages capture failures. `BLOCK` messages halt progress when needed. `CMD` messages record command executions. `REV` messages carry review findings. The canonical `tasks.md` and task summaries remain sources of truth.

**Check:** `VERIFY` messages carry final verification results. `CMD` messages record verification command runs. The canonical `checks.md` and `result.md` remain sources of truth.

## Future Implementation Notes

Future LeanHarness CLI versions may:

- Parse and validate CaveBus messages against the protocol definition in `.lh/protocols/cavebus.yml`.
- Automatically preserve protected tokens during compression.
- Compile bounded context from `cavebus.log` entries.
- Index CaveBus messages for feature status dashboards.
- Lint CaveBus messages for anti-patterns.

This prompt does not implement any of that code. The protocol specification and templates are design artifacts for v0.1.
