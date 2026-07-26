# LeanHarness 1.5.0 — Cheap Build, Strong Review

> **For agentic workers:** Implement this plan task-by-task. Use checkbox (`- [ ]`) syntax for tracking. Do not skip the mandatory self-review, CI waits, or release pipeline at the end.

| Field | Value |
|-------|--------|
| **Version** | `1.5.0` (minor) |
| **Package** | `@feneto/lh` (current `1.4.0`) |
| **Branch** | `feature/v1.5.0-cheap-build-strong-review` |
| **Theme** | Spend tokens on plan/review/verify; cheap tokens on implement; never mark done without independent review + touched-file gates |
| **Status** | Ready to implement after user approval |

---

## 1. Problem statement

During LH development flows (`/lh-do`, `/lh-build`, CLI `lh build`):

1. **Critical code reviews are missed or weak** when execution uses cheap models.
2. **Review is prompt convention**, not a completion gate (`require_review: true` is unwired).
3. **CLI build never runs a reviewer**; skill self-review (OpenCode / current-agent) rubber-stamps.
4. **Builder and reviewer share one model choice** (CC Sonnet/Haiku); OpenCode has no role routing and models are not Sonnet/Haiku-only.
5. **TS errors survive in touched non-prod files** (especially tests) because Vitest does not typecheck and build does not run gates on the touch set.
6. **Config is hard to set** for models, gates, boundary, command enforcement — partial CLIs only (`lh boundary`, `lh command`).

---

## 2. Goals (1.5.0)

1. **Independent review every task** with structured artifacts; self-review alone cannot satisfy `require_review`.
2. **Host-agnostic role → model routing** (opaque `provider/model` ids; no hardcoded Sonnet/Haiku for OpenCode).
3. **Touched-file quality gates** (tsc filter, lint paths, related tests) after each task; fail task before review if dirty.
4. **`lh config` + `/lh-config`** for **every** `.lh/config.yml` surface, with reload hints when host files change.
5. **CLI multi-stage build**: build → gates → review → fix loop → compress.
6. **Ship 1.5.0** via changesets + automated CI release pipeline.

### Non-goals

- Formal multi-reviewer consensus / SARIF export
- Universal cross-vendor model “strength” ranking
- Full multi-agent runtime inside OpenCode command templates beyond host capabilities
- Major version / breaking removal of existing CLI commands

### Locked product decisions

| Decision | Choice |
|----------|--------|
| Scope | Full thesis (all WPs below) |
| Self-review | **Disallowed as sole evidence** when `require_review: true` |
| Review cadence | **Every task** |
| Models | Role map + opaque host ids + optional `by_host` / profiles |
| Config surface | Full `lh config` for all keys including boundary/command enforcement |

---

## 3. Target architecture

```
Specify / Discover / Plan     → models.planner (or auto / session)
Build task                    → models.builder (cheap OK)
Touched-file quality gates    → deterministic (tsc-filter, eslint, tests)
Independent review            → models.reviewer → reviews/T##.json (mode: independent|cli)
Fix loop ≤3                   → models.fix → re-gate → re-review
Compress                      → models.compressor
lh check                      → require_review + gates + AC + boundary enforced
```

```
.lh/config.yml          # source of truth for harness behavior
lh config …             # only supported mutator (plus specialized aliases)
/lh-config skill        # interview → lh config → reload instructions
opencode.json agents    # optional model pins from apply-host
.claude/agents          # CC aliases optional
```

---

## 4. Work packages overview

| WP | Name | Priority |
|----|------|----------|
| WP0 | Enforce verification flags | P0 |
| WP1 | Review artifacts schema | P0 |
| WP2 | Structured review analysis | P0 |
| WP3 | Role-based model routing (host-agnostic) | P0 |
| WP4 | Skills/agents + `lh review` + independent review every task | P0 |
| WP5 | CLI multi-stage build + fix loop | P1 |
| WP6 | Touched-file quality gates | P0 (with build) |
| WP7 | Reviewer quality pack | P1 |
| WP8 | Docs, doctor, migration, api-stability | P1 |
| WP9 | `lh config` + `/lh-config` (full config surface) | P0 |
| WP10 | Mandatory self-review of 1.5.0 changes | P0 |
| WP11 | Branch, CI, PR, release → npm 1.5.0 | P0 |

Suggested implementation order: **WP0 → WP1 → WP2 → WP9 (core) → WP3 → WP6 → WP5 → WP4 → WP7 → WP8 → WP10 → WP11**.

---

## 5. WP0 — Enforce dead verification flags

### Intent

Wire config that already claims to gate completion.

### Files

- Modify: `src/verification/index.ts` (`determineVerdict`, `RunCheckOptions`)
- Modify: `src/commands/check.ts` (already passes flags — ensure consumed)
- Add tests: `tests/verification/require-flags.test.ts` (or extend existing)

### Behavior

When true:

| Flag | Fail pass if |
|------|----------------|
| `verification.require_review` | `review.verdict === "unknown"` OR no independent review evidence |
| `verification.require_acceptance_trace` | AC missing evidence (already partially heuristic — harden) |
| `verification.require_changed_files` | No implementation file changes when feature claims built |

Add:

```yaml
verification:
  allow_self_review: false   # default; mode:self never counts when require_review
```

### Acceptance

- [ ] Feature with zero review artifacts cannot `pass` when `require_review: true`
- [ ] Unit tests cover unknown-review → needs-fix

---

## 6. WP1 — First-class review artifacts

### Paths

```
.lh/features/<id>-<slug>/reviews/T01.json
.lh/features/<id>-<slug>/reviews/T01.md     # optional human view
.lh/templates/review.json
.lh/templates/review.md
```

### Schema `reviews/T##.json` (v1)

```json
{
  "schema": "v1",
  "featureId": "F001",
  "taskId": "T01",
  "verdict": "pass|needs-fix|blocked",
  "model": "provider/model-or-alias",
  "mode": "independent|cli|self",
  "reviewedAt": "ISO-8601",
  "iteration": 1,
  "filesReviewed": ["src/a.ts", "tests/a.test.ts"],
  "findings": [
    {
      "severity": "critical|major|minor|note",
      "file": "src/a.ts",
      "symbol": "optional",
      "evidence": "…",
      "fix": "…"
    }
  ],
  "checklist": {
    "acceptanceCriteria": "pass|fail|partial",
    "boundary": "pass|fail",
    "tests": "pass|fail|missing",
    "security": "pass|fail|n/a",
    "riskGates": "pass|fail|n/a"
  }
}
```

### Acceptance rules for check

- Counts as reviewed only if `mode ∈ {independent, cli}` when `allow_self_review: false`
- `verdict: pass` + empty findings = clean independent review
- Missing file = unknown

### Tasks

- [ ] Add templates under `.lh/templates/` and default scaffold in init
- [ ] Document in `docs/api-stability.md` (additive)
- [ ] Task summary template links to review path
- [ ] CaveBus `REV` generated **from** JSON (not free prose first)

---

## 7. WP2 — Structured review analysis

### Files

- Rewrite: `src/verification/review.ts`
- Tests: structured JSON + CaveBus multiline + legacy keyword fallback warning

### Priority order

1. Load `reviews/*.json`
2. Parse CaveBus multiline `REV` (`verdict:`, `crit:`, `major:`)
3. Legacy keyword scrape (warn in notes; deprecate)

### Acceptance

- [ ] Clean JSON pass → review verdict `pass` (not `unknown`)
- [ ] Keyword-only path still works with warning
- [ ] `mode: self` ignored when `allow_self_review: false`

---

## 8. WP3 — Role-based model routing (host-agnostic)

### Principle

**LH roles are semantic. Host model IDs are opaque strings.**  
Never hardcode Sonnet/Haiku for OpenCode. CC short aliases remain optional convenience.

### Config shape

```yaml
models:
  # Semantic roles — host-native ids or "auto"
  planner: auto
  builder: auto
  reviewer: auto
  verifier: auto
  compressor: auto
  fix: auto

  # Legacy (map into builder / fallbacks)
  agent: auto
  subagent: auto

  by_host:
    opencode:
      builder: "google/gemini-2.5-flash"
      reviewer: "anthropic/claude-sonnet-4-20250514"
    claude-code:
      builder: haiku
      reviewer: sonnet

  profiles:
    cheap:
      builder: "google/gemini-2.5-flash"
      reviewer: "openai/gpt-5"
    strong:
      builder: "anthropic/claude-sonnet-4-20250514"
      reviewer: "anthropic/claude-opus-4-20250514"

build:
  model_profile: null   # or cheap|strong|<name>
```

### Resolution order (highest wins)

1. CLI stage flag (`--model` → builder; `--review-model` → reviewer)
2. `models.by_host.<host>.<role>`
3. Active profile role
4. `models.<role>`
5. Legacy `models.agent` (builder) / `models.subagent` (other)
6. `auto` → omit host override (session / agent default / last-used)

### Runtime

- [ ] Extend `HarnessConfigModels` + `ResolvedConfig` in `src/core/types.ts`, `resolved-config.ts`
- [ ] `resolveModelForRole(config, role, { host, cliOverride })`
- [ ] Fix **Claude Code adapter** to pass model (`src/adapters/claude-code.ts` currently drops it)
- [ ] OpenCode adapter already supports `--model` — only pass when ≠ auto
- [ ] No cross-vendor strength ranking; doctor warns if `builder === reviewer` (both non-auto) and `require_review`
- [ ] Review artifacts store **exact** model string used

### Interactive UX

| Host | UX |
|------|-----|
| OpenCode | **No** Sonnet/Haiku question. Use config / profiles / optional `opencode models` pick via `/lh-config` |
| Claude Code | Optional fast/standard/strong **mapped through config aliases**; reviewer never downgraded below config floor when builder is cheap |

### OpenCode agent pins

`lh config apply-host` (WP9) may set:

```json
"lh-builder": { "model": "<resolved builder>" },
"lh-reviewer": { "model": "<resolved reviewer>" }
```

so Task/@ dispatch does not inherit a cheap primary session model.

---

## 9. WP4 — Skills, agents, `lh review`

### Generators (source of truth)

- `src/commands/init-claude-code.ts` — CC skills/agents
- `src/commands/opencode-command-bundles/*.md` + `src/commands/init.ts` — OC
- Dev copies under `.claude/skills/`, `.opencode/` must match after `npm run build` + init/update

### Behavior changes

1. Per task: implement → **gates** → **MUST independent reviewer** with `models.reviewer`
2. Reviewer writes `reviews/T##.json` (+ CaveBus REV)
3. Current-agent mode still **dispatches** reviewer (or `lh review`); self-only insufficient
4. OpenCode: prefer Task/`lh-reviewer` agent or CLI `lh review`; equalize reviewer prompt with CC
5. `build.exec_mode`: `subagents | current | ask` (default prefer subagents where host allows)
6. `/lh-do` does not re-interview models every phase — defers to config

### New command

```bash
lh review <feature> [task] [--host] [--model] [--dry-run] [--json]
```

- Skill/command: `/lh-review`
- Used by build pipeline and manual re-review after human edits

### Acceptance

- [ ] Every `done` task has independent `reviews/T##.json` when `require_review: true`
- [ ] OpenCode bundles do not mention Sonnet/Haiku selection
- [ ] CC skill uses role models, not single shared chosen-model for reviewer

---

## 10. WP5 — CLI multi-stage build

### Files

- `src/build/index.ts`, `task-runner.ts`, **new** `review-runner.ts`, **new** gate integration
- `src/commands/build.ts`, `run-task.ts`, `cli/program.ts`

### Flags / config

```bash
lh build F001 --host opencode
lh build F001 --no-review
lh build F001 --no-gate
lh build F001 --review-only
lh build F001 --review-model <id>
```

```yaml
build:
  with_review: true
  max_fix_iterations: 3
  gates: …   # see WP6
```

### Pipeline per task

1. Compile context  
2. Run builder agent  
3. Quality gates (WP6)  
4. Independent review (`lh-reviewer` / adapter)  
5. On needs-fix → builder-fix loop ≤3 with re-gate + re-review  
6. Compress + task summary  
7. Status `done` only if gates pass + review pass (when required)

### Acceptance

- [ ] Dry-run shows build + gate + review stages
- [ ] CLI path produces review JSON without skills

---

## 11. WP6 — Touched-file quality gates

### Intent

Prevent TS/lint failures left in **touched** files including tests (Vitest does not typecheck).

### Touched set

```
unique(
  git paths changed during task,
  task-summary changed files,
  boundary.touchFiles ∩ dirty paths
)
```

Include `*.test.ts` / `*.spec.ts`. No “main code only” exception.

### Built-in gates

| id | kind | Behavior |
|----|------|----------|
| typecheck | `tsc-filter-touched` | Run project `tsc --noEmit`; **fail only on diagnostics in touched files** |
| lint | `eslint-paths` | ESLint only touched paths if eslint present |
| unit | `related-tests` | Vitest/Jest on touched test files; skip_if_no_files |

Why filter full tsc: accurate project types without failing on pre-existing debt outside the feature.

### Config

```yaml
build:
  gates:
    enabled: true
    when: after_task          # after_task | before_review | both
    fail_task_on: error
    include_globs:
      - "**/*.{ts,tsx,js,jsx,mts,cts}"
      - "**/*.{test,spec}.{ts,tsx,js}"
    exclude_globs:
      - "dist/**"
      - "node_modules/**"
    typecheck: touched        # touched | project | off
    lint: touched
    test: related             # related | off
```

### CLI

```bash
lh gate F001
lh gate F001 --task T02
lh gate F001 --files a.ts,b.test.ts
```

### Artifacts

```
.lh/features/.../task-context/T02-gates.json
```

### Module

- New: `src/gates/` (`collect-touched.ts`, `tsc-filter.ts`, `run-gates.ts`, types)
- Safe command allowlist: extend `src/verification/commands.ts` if needed for gate runners
- Integrate before review in build; re-run in `lh check` on feature-wide changes

### Acceptance

- [ ] Broken types in touched `*.test.ts` → task `needs-fix`, gate artifact lists file
- [ ] Pre-existing error outside touch set does not fail task
- [ ] Non-TS repos skip typecheck cleanly

---

## 12. WP7 — Reviewer quality pack

### Both hosts `lh-reviewer`

- Adversarial stance: find why change fails AC/boundary/risk — not LGTM
- Must map each AC → covered | missing | untested
- Must compare changed files vs boundary
- Flag: missing tests on behavior change, risk-gate touches, API breaks, secrets
- Cannot `pass` without reading every changed file
- Cannot `pass` if required gates failed
- Output: JSON artifact + compact CaveBus REV
- Equalize OpenCode thin prompt (~52 lines) with CC depth

### `lh-builder-fix`

- Consumes structured findings from JSON
- Stays inside boundary

---

## 13. WP8 — Docs, doctor, migration

### Docs to update

- [ ] `README.md` — 1.5.0 capabilities (review gate, config, gates, models)
- [ ] `docs/commands.md` — `config`, `review`, `gate`, build flags
- [ ] `docs/configuration.md` — full key reference + examples
- [ ] `docs/migration.md` — 1.4 → 1.5 (behavior: check may needs-fix without review)
- [ ] `docs/api-stability.md` — review schema, config keys, new commands
- [ ] `docs/security.md` / `docs/cookbook.md` — cheap-build strong-review pattern
- [ ] `docs/troubleshooting.md` — model routing, gate failures, reload after config
- [ ] `docs/host-adapters.md` / hosts docs — model passthrough
- [ ] Default `.lh/config.yml` comments / `createDefaultConfigYaml()`

### Doctor

- [ ] Warn missing independent review tooling when `require_review`
- [ ] Warn unset reviewer model when require_review (recommend `lh config init`)
- [ ] Warn builder === reviewer (both non-auto)
- [ ] OpenCode ids should look like `provider/model` when set
- [ ] Suggest reload when host agent files drift

### Update pipeline

- [ ] `lh update` regenerates skills/agents/templates; preserves user config via merge
- [ ] New config keys added without wiping user values

---

## 14. WP9 — `lh config` + `/lh-config` (full surface)

### Intent

Single control plane for **every** harness config key. Specialized commands remain as aliases.

### CLI

```bash
lh config                         # effective resolved summary
lh config get <dot.path>
lh config set <dot.path> <value>
lh config unset <dot.path>
lh config list                    # all keys with values + sources
lh config validate
lh config init                    # interactive wizard (TTY)
lh config init --yes              # defaults
lh config init --host opencode
lh config profile list|use|set
lh config apply-host              # sync role models → opencode.json agent models (merge-safe)
lh config --json
```

### Must cover all sections

| Section | Examples |
|---------|----------|
| `project` | name, mode |
| `host` | primary, adapter |
| `workflow` | visible_steps, require_worktree, require_review, require_verification |
| `artifacts` | paths |
| `discovery` | strategy, default_depth, max_initial_files |
| `context` | bounded_context, compile_per_task, … |
| `compression` | enabled, protocol, mode |
| `models` | roles, by_host, profiles, legacy agent/subagent |
| `verification` | require_*, allow_self_review |
| `risk_gates` | require_approval list |
| `memory` | store, paths |
| `logging` | event_format, levels |
| `features` | commit |
| `build` | session_budget, with_review, max_fix_iterations, gates, model_profile, exec_mode |
| `boundary_enforcement` | mode, always_allow, session_overrides |
| `command_enforcement` | force_push |
| `adapters` | host adapter blocks |

### Compatibility aliases (keep working)

```bash
lh boundary set-mode strict     # → config set boundary_enforcement.mode
lh boundary status
lh boundary allow|exempt
lh command set-force-push …
```

Implement shared `src/core/config-mutate.ts` used by `config`, `boundary`, `command`.

### Value parsing

- booleans, numbers, strings, YAML/JSON for arrays/objects
- `lh config set risk_gates.require_approval --json '["auth_rewrite"]'`
- Validate enums (`boundary_enforcement.mode`: strict|warn|off)

### Wizard (`lh config init`)

1. Primary host  
2. Profile: session-default / cheap-build+strong-review / custom  
3. Builder + reviewer model ids (host-aware prompts; OC free text or models list)  
4. require_review + allow_self_review  
5. gates on/off + typecheck touched  
6. boundary mode  
7. session_budget  
8. Optional `apply-host`  

### Reload hints (mandatory in output)

Return structured:

```json
{
  "changed": ["models.builder", "boundary_enforcement.mode"],
  "hostFilesUpdated": ["opencode.json"],
  "reloadRequired": true,
  "reloadInstructions": [
    "Start a new OpenCode session so lh-reviewer model pins apply",
    "Verify with: lh config"
  ]
}
```

| Change | Reload? |
|--------|---------|
| `.lh/config.yml` only + CLI usage | No (CLI re-reads) |
| Long-lived agent session assumptions | Soft yes |
| `opencode.json` / `.opencode/agents` | **Yes** new session |
| `.claude/agents` / skills via update | **Yes** new session |

### Skill `/lh-config`

- Thin: interview → **only** `lh config …` → print reload instructions  
- Do **not** freestyle-edit YAML  
- Generators: CC skill + OC command bundle  
- Point `/lh-build` at “run `/lh-config` once” instead of duplicate model interviews when models unset

### Files

- New: `src/commands/config.ts`, `src/core/config-mutate.ts`, `src/core/config-paths.ts` (dot-path schema)
- Modify: `src/cli/program.ts`, `boundary.ts`, `command-enforcement.ts`
- Modify: init generators for skill/command
- Tests: get/set/validate/enums/arrays/reload hints

### Acceptance

- [ ] Every key in `HarnessConfig` settable/gettable via `lh config`
- [ ] Invalid enum rejected
- [ ] `apply-host` merge does not wipe unrelated opencode.json keys
- [ ] Skill never writes config except via CLI

---

## 15. Implementation task checklist (code)

### Phase A — Verification honesty

- [ ] WP0 enforce flags + `allow_self_review`
- [ ] WP1 templates + write helpers for review JSON
- [ ] WP2 rewrite `analyzeReviewEvidence`
- [ ] Tests green

### Phase B — Config plane

- [ ] WP9 schema of all dot-paths from `HarnessConfig`
- [ ] `lh config get/set/unset/list/validate`
- [ ] Wire boundary/command to shared mutator
- [ ] `lh config init` + profiles + `apply-host`
- [ ] `/lh-config` skill + OC command
- [ ] Tests green

### Phase C — Models + gates + build

- [ ] WP3 model resolution + CC adapter model flag
- [ ] WP6 `src/gates/*` + `lh gate`
- [ ] WP5 multi-stage build + review-runner + fix loop
- [ ] WP4 `lh review` + skill/agent prompt updates (CC + OC)
- [ ] WP7 reviewer quality pack
- [ ] Tests green: build dry-run stages, gate filter, model resolve

### Phase D — Docs + polish

- [ ] WP8 all docs + doctor + default config + migration
- [ ] `npm run build && npm run typecheck && npm test`
- [ ] `npm run pack:dry-run`
- [ ] Changeset file prepared (minor 1.5.0) — commit with feature

---

## 16. WP10 — Mandatory self-review of all 1.5.0 changes

Before opening/merging the feature PR, perform a **full adversarial review** of the branch (not optional).

### Review checklist

- [ ] **AC of this plan**: each WP acceptance criterion met or explicitly deferred with reason
- [ ] **No Sonnet/Haiku hardcoding** in OpenCode paths
- [ ] **`require_review` actually blocks pass** without independent artifact
- [ ] **Self-review alone cannot pass** check
- [ ] **Touched TS test errors fail gates**
- [ ] **`lh config` covers** boundary_enforcement, command_enforcement, models, build.gates, verification
- [ ] **CC adapter passes model**
- [ ] **Secrets**: no tokens in artifacts/docs
- [ ] **API stability**: additive only; migration notes behavior change for check
- [ ] **Generators vs installed files**: edit sources (`init-claude-code.ts`, opencode bundles), rebuild
- [ ] **Tests** for review, gates, config, models
- [ ] **Docs** match implementation (no vapor claims)
- [ ] **Dogfood smoke** (local):
  ```bash
  npm run build && npm run typecheck && npm test
  node dist/index.js doctor
  node dist/index.js config validate
  # optional: temp dir init + config init --yes + gate dry paths
  ```

### Review output

Write branch review notes into the PR body (Critical/Major/Minor). Fix all Critical/Major before merge.

Prefer dispatching `lh-reviewer`-style pass on the diff, plus human checklist above.

---

## 17. WP11 — Branch, CI, release to 1.5.0

Follow `.claude/skills/lh-release/SKILL.md` and `docs/release-checklist.md`.

### 17.1 Feature branch

```bash
git fetch origin main
git checkout -b feature/v1.5.0-cheap-build-strong-review origin/main
```

Implement all WPs on this branch. Keep commits focused (feat/fix/docs/test).

### 17.2 Changeset (minor)

```bash
npm run build && npm run typecheck && npm test
npx changeset
# select @feneto/lh → minor
# summary: 1.5.0 cheap build / strong review, config CLI, gates, independent review
git add .changeset/
git commit -m "chore: add changeset for 1.5.0"
```

### 17.3 Push + PR

```bash
git push -u origin HEAD
gh pr create --base main --title "feat: LeanHarness 1.5.0 cheap build, strong review" --body "..."
```

PR body must include: summary of WPs, migration notes, WP10 review checklist results, test plan.

### 17.4 Wait for CI on feature PR (mandatory)

```bash
gh pr checks --watch
```

Required (`.github/workflows/ci.yml`):

- Build & Test (Node 22)
- Build & Test (Node 24)
- Changeset Check

**Do not merge on red CI.** Fix, push, re-watch.

### 17.5 Merge feature PR (rebase only)

```bash
gh pr merge --rebase --delete-branch
```

Never squash/merge-commit (preserves changesets).

### 17.6 Wait for CI on main

```bash
gh run list --branch main --limit 5
gh run watch <run-id>
```

### 17.7 Version Packages PR (automated)

`.github/workflows/release.yml` + `changesets/action@v1` opens/updates **Version Packages** PR (bumps to 1.5.0, CHANGELOG, consumes changesets).

```bash
gh pr list --search "Version Packages" --state open
gh pr view <n>
# verify package.json → 1.5.0, CHANGELOG entry accurate
gh pr checks <n> --watch
gh pr merge <n> --rebase --delete-branch
```

### 17.8 Publish (automated on main)

Merging Version Packages PR triggers publish:

- git tag
- GitHub Release
- npm publish `@feneto/lh@1.5.0` (needs `NPM_TOKEN`)

### 17.9 Verify release

```bash
npm info @feneto/lh version    # expect 1.5.0
gh release list --limit 3
```

### Release rules

- [ ] Never skip CI waits  
- [ ] Never force-push to main  
- [ ] Never proceed with failing checks  
- [ ] Confirm `NPM_TOKEN` present if publish fails  
- [ ] Use `/lh-release` skill if orchestrating end-to-end  

---

## 18. Key file index

| Area | Paths |
|------|--------|
| Config types | `src/core/types.ts`, `config.ts`, `resolved-config.ts` |
| Config CLI | **new** `src/commands/config.ts`, `src/core/config-mutate.ts` |
| Verification | `src/verification/review.ts`, `index.ts`, `commands.ts` |
| Gates | **new** `src/gates/*` |
| Build | `src/build/*`, **new** `review-runner.ts` |
| Review cmd | **new** `src/commands/review.ts`, `gate.ts` |
| Adapters | `src/adapters/claude-code.ts`, `opencode.ts`, `types.ts` |
| CLI | `src/cli/program.ts` |
| CC gen | `src/commands/init-claude-code.ts` |
| OC gen | `src/commands/init.ts`, `opencode-command-bundles/*` |
| Templates | `.lh/templates/review.*`, task-summary, default config |
| Docs | `docs/*`, `README.md` |
| Release | `.changeset/*`, `.github/workflows/*`, `lh-release` skill |

---

## 19. Risk register

| Risk | Mitigation |
|------|------------|
| Check becomes stricter → user features needs-fix | Migration doc; clear messages; `lh review` + rebuild path |
| Full tsc slow on large monorepos | Touched filter; optional later project cache |
| OpenCode cannot dispatch subagent from command | CLI `lh review` / `lh build` stages; agent model pins |
| `apply-host` overwrites user opencode.json | Merge-only; never delete unknown keys; `--dry-run` |
| Scope creep | Stick to WP list; defer dual-pass review / SARIF |
| Release blocked on NPM_TOKEN | Verify secret before Version PR merge |

---

## 20. Success metrics

1. Haiku/cheap builder + strong reviewer config works on **both** hosts without Sonnet/Haiku assumptions on OpenCode  
2. Injected TS error in touched test file fails `lh gate` / task before review  
3. `lh check` refuses pass without independent `reviews/T##.json`  
4. `lh config set/get` works for boundary, models, gates, verification  
5. `/lh-config` ends with correct reload instructions when host files change  
6. `@feneto/lh@1.5.0` on npm via automated pipeline  

---

## 21. Out of order / do not

- Do not edit generated `.claude/skills/lh-*` as source of truth — edit generators then rebuild/init  
- Do not mark feature pass without WP10 review  
- Do not merge with failing CI  
- Do not squash the release PR  
- Do not publish manually unless automation is broken (prefer fix CI)  

---

## 22. Approval gate

Implementation starts only after user approval of this plan.

**Post-approval first commands:**

```bash
git fetch origin main
git checkout -b feature/v1.5.0-cheap-build-strong-review origin/main
# begin Phase A (WP0)
```
