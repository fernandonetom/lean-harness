# Changelog

## 2.0.1

### Patch Changes

- 5341545: Fixed `lh init --host claude-code` (the normal, non-`--global` flow) writing `.claude/settings.local.json`'s `statusLine` to reference `~/.claude/statusline.sh` without ever creating that script. Previously the script was only written by the separate `lh init --global` flow, so a fresh install following the documented `/plugin install` + `lh init --host claude-code` steps ended up with a statusline command pointing at a nonexistent file. The project-local install now also ensures the shared script exists (creating it if missing, never overwriting a script you may have customized).

## 2.0.0

### Major Changes

- b5b055f: Restructured the repo into a pnpm monorepo (`packages/cli`, `hosts/opencode`, `hosts/claude-code`) and replaced the experimental OpenCode plugin export with a real, spec-compliant one published as its own package.

  **Monorepo layout:** `@feneto/lh` now lives in `packages/cli/`. The Claude Code plugin (skills, agents, hooks, `.claude-plugin/plugin.json`) moved from the repo root into `hosts/claude-code/` — a private, unpublished workspace package, still distributed via git + `/plugin marketplace add` with no behavior change for consumers (the root `.claude-plugin/marketplace.json` stays at the repo root, its `source` now points at `./hosts/claude-code`).

  **Real OpenCode plugin:** `hosts/opencode/` is a new package, published as [`@feneto/lh-opencode`](https://www.npmjs.com/package/@feneto/lh-opencode) — a real [OpenCode plugin](https://opencode.ai/docs/plugins/) (typed against `@opencode-ai/plugin`), replacing the previous `@feneto/lh` `"./opencode"` subpath export that was documented as "experimental, unverified." **Breaking:** that subpath export is removed.

  **`lh init --host opencode` default behavior change:** now registers `@feneto/lh-opencode` (version-pinned) in the target project's `opencode.json` `"plugin"` array by default, instead of copying the guardrail plugin's raw JS into `.opencode/plugins/`. OpenCode installs the npm package automatically via Bun at startup — no manual install step. Pass `--local-plugin` to restore the previous copy-files behavior for offline/air-gapped/restricted environments.

  **Additive guardrail enforcement layer:** the OpenCode plugin now also implements `permission.ask` (returning `status: "deny"`), a spec-documented deny mechanism, alongside the existing throw-based blocking in `tool.execute.before` (kept as the enforcement backbone — `lh init`'s generated `opencode.json` sets `permission.edit: "allow"` for the primary builder agent, so `permission.ask` alone would under-enforce for that agent).

  **Bug fixes found during the restructure:**

  - `lh-do`'s Claude Code skill (`hosts/claude-code/skills/lh-do/SKILL.md`) had a YAML frontmatter parse error (an unquoted colon-space sequence in its `description`) that made `claude plugin validate --strict` fail and would have loaded the skill with all frontmatter silently dropped at runtime.
  - A stray, agent-shaped file (`lh-builder-fix.md`, with `mode`/`permission` fields instead of `agent`) had been mis-copied into the OpenCode command-templates bundle; it was dead weight, never wired into `opencode.json`'s `command` map. Removed.

  **Testing:** added real coverage that was previously missing — OpenCode plugin blocking behavior (`tool.execute.before` and `permission.ask`), OpenCode agent/command template frontmatter validation cross-checked against the CLI's loader wiring, Claude Code skill/agent frontmatter validation, and `hooks/post-tool-use.js` / `hooks/session-end.js` (previously untested). Added `hosts/opencode/scripts/opencode-smoke.mjs`, an empirical check (gated on a real `opencode` binary being present) that the built plugin loads cleanly with no double-registration.

  **CI/release:** `ci.yml` and `release.yml` are now pnpm-workspace-aware (`pnpm -r run build/typecheck/test`, `pnpm -r publish --dry-run` for pack hygiene). The release job publishes through `pnpm exec changeset publish` instead of a bare `npm publish`, since a bare `npm publish` does not understand pnpm's `workspace:*` protocol.

- 8c649d2: LeanHarness v2.0.0 — plugin-based distribution, git worktree support, and a fixed release pipeline.

  **Distribution:** `lh` no longer writes generated skills, agents, and hooks into `.claude/`/`.opencode/` on every `lh init`. This repo now ships as a self-hosted Claude Code plugin (`/plugin marketplace add fernandonetom/lean-harness`, `/plugin install lh@lean-harness`) plus the standalone `@feneto/lh` CLI. `.lh/` (config, policies, templates, feature artifacts) stays project-local and untouched. `lh init --host opencode` now writes from real source files instead of embedded template strings.

  **Migration:** `lh migrate` (new) detects a v1.x repo's generated files, confirms the plugin is installed, then deletes the legacy `.claude/skills/lh-*`, `.claude/agents/lh-*.md`, and `.lh/scripts/hooks/` files — never deleting until the plugin install is confirmed. `lh update` now delegates to `lh migrate` automatically when it detects a v1.x layout, instead of force-reinitializing (its previous, more destructive behavior).

  **Git worktrees:** worktree creation is agent-driven via the new `lh-worktree` skill (ask Claude Code to run it, or `/lh-worktree <feature-id>`) instead of a CLI command — it creates the isolated worktree, symlinks `.lh/features` and `.lh/state.json` in from the main repo (they're gitignored, so a bare worktree checkout wouldn't otherwise see them), and runs install/baseline tests. The CLI's role shrinks to tracking the result: `lh worktree link|list|unlink <feature>` only reads/writes `.lh/state.json`'s worktree record — it does no git work itself. `lh build` can still require an active, linked worktree via `.lh/config.yml`'s `workflow.require_worktree`. This also fixes two related hook bugs: an absolute file path inside a worktree was incorrectly denied as outside the change boundary, and boundary lookups from inside a worktree could silently fail open (stop enforcing) instead of resolving against the main repo's `.lh/features/`.

  **OpenCode plugin fix:** the guardrail plugin bundle (`.opencode/plugins/shared.js`) imported `getVersion` from a path (`../core/version.js`) that only exists inside the `lh` package's own source tree, not wherever the bundle gets copied to (`.opencode/plugins/` in a consumer project) — this made the plugin fail to load entirely for every OpenCode user. Fixed by inlining a self-contained fallback instead of importing across the bundle boundary. Also removed a stale, unreferenced `scripts/extract-opencode-plugin-assets.mjs` and corrected doc claims (`lh update --host opencode` does not refresh OpenCode plugin/agent/command files in v2 — re-run `lh init --host opencode --force` instead).

  **Release pipeline:** Every release from 1.0.0 through 1.5.2 published to npm successfully but created no git tag and no GitHub Release — `changesets/action`'s tag/release creation only fires on a code path this repo's workflow never took. `.github/workflows/release.yml` now creates `v{version}` and `lh--v{version}` tags and a GitHub Release itself, gated on the action's own `published` output.

  **Diagnostics fixes:** `lh doctor` and `lh status` previously checked for the old generated `.claude/skills/`, `.claude/agents/`, and `.claude/hooks/leanharness-hooks.json` paths, so a healthy plugin-based v2.0.0 install was misreported as missing hooks/skills/agents. Both commands now check plugin-enabled state (`enabledPlugins["lh@lean-harness"]`) and only flag legacy v1.x project-local files as such. `lh init --host claude-code`'s `.lh/policies/claude-code.yml` reference doc and `docs/hosts/claude-code.md` are updated to describe the plugin architecture instead of the old generated-file layout. `lh uninstall` now also removes the plugin's `enabledPlugins`/`extraKnownMarketplaces` registration from `.claude/settings.json`.

### Patch Changes

- 13b76c9: Fixed `lh build --host claude-code` unconditionally passing an unsupported `--cwd` flag to the `claude` CLI, causing every real (non-dry-run) Claude Code build to fail with `error: unknown option '--cwd'`. The working directory is already set via the child process's `cwd` spawn option, so the flag was redundant as well as unsupported — removed it.
- 0656c44: Fixed `lh doctor` unconditionally warning `.opencode/plugins/shared.js` and `.opencode/plugins/leanharness-guardrails.js` as "missing" for every v2 default-mode OpenCode install — those files are only written with `--local-plugin`; the default registers the npm-published `@feneto/lh-opencode` package in `opencode.json` instead, so their absence there is expected, not an error. `lh doctor` now also detects and `fail`s when both distribution modes are active at once (the npm plugin registered in `opencode.json` _and_ local files present in `.opencode/plugins/`), since OpenCode auto-loads every `.js` file dropped into that directory regardless of `opencode.json`, causing the guardrail hooks to double-register.

  Fixed the underlying cause: `lh init --host opencode` (default, non-`--local-plugin` mode) previously never cleaned up `.opencode/plugins/shared.js` / `leanharness-guardrails.js` left over from a v1.x install or a prior `--local-plugin` run — every v1.x-to-v2 OpenCode migration would silently end up in the double-registration state above. `lh init --host opencode --force` now removes those stale, LeanHarness-managed local files when defaulting to the npm-registered plugin; without `--force` it warns instead of deleting.

- 72a2b58: Fixed the task-context compiler's field-header regex (`packages/cli/src/context/task-context.ts`) rejecting hyphenated field names like `Read-only context:`. Unrecognized headers silently fell through and got merged into the following field's value, which could cause read-only reference files to be misclassified as touch files — surfacing as spurious risk-gate triggers (e.g. `public_api_break`, `new_dependency`) on tasks that never actually touched those files.
- 361f411: Fixed `lh worktree list` reporting a worktree as `linked` instead of `stale` when its directory was deleted without running `git worktree remove`/`prune` first. `git worktree list --porcelain` can keep listing such a worktree until it's explicitly pruned, and that behavior was observed to vary across git versions/platforms (surfaced as a CI-only test failure on Linux/git 2.54.0 that didn't reproduce locally). Staleness is now determined by whether the worktree's directory actually still exists on disk, not solely by whether git's own bookkeeping still lists it.

## 1.5.2

### Patch Changes

- 04da6e6: Fix `lh update` silently overwriting user customizations in `.lh/policies/*.yml` and `.lh/state.json` (active feature tracking). The existing config.yml backup/restore mechanism is now generalized to also cover `policies/risk-gates.yml`, `policies/boundary.yml`, `policies/commands.yml`, `policies/claude-code.yml`, `policies/opencode.yml`, and `state.json`. Also fix the bundled `commands.yml` template itself, which shipped with a corrupted/duplicated deny-list tail since v1.4.0.

## 1.5.1

### Patch Changes

- d6ac53c: Fix README.md version sync during release. Add `scripts/sync-readme-version.mjs` that reads `version` from `package.json` and updates the `## Status` line in `README.md`. Wire it into the `version-packages` release script so every changeset-driven Version Packages PR includes the README bump. Add a CI shield (`readme-version-check`) that validates the versions match on every PR. Fix the current stale README version (`v1.3.0` → `v1.5.0`).

## 1.5.0

### Minor Changes

- 266c7fa: LeanHarness 1.5.0: cheap build, strong review.

  New features:

  - `lh config` — full config surface (get/set/unset/list/validate) for all `.lh/config.yml` keys
  - `lh review` — independent code review command producing structured `reviews/<taskId>.json` artifacts
  - Role-based model routing — `models.planner/builder/reviewer/verifier/compressor/fix` with `by_host` and `profiles`
  - Touched-file quality gates — TypeScript typecheck, ESLint, and test gates scoped to changed files
  - `verification.allow_self_review` — self-review alone cannot satisfy `require_review` when false
  - Structured review analysis — JSON review artifacts take priority over legacy text scrapes
  - Reviewer quality pack — adversarial stance, AC coverage mapping, boundary comparison, 7 required flags
  - Adversarial reviewer agent prompts — equal depth for Claude Code and OpenCode
  - Claude Code adapter now passes `--model` flag (previously ignored)
  - Doctor checks for reviewer model configuration, builder===reviewer warning, OC model format
  - Gate infrastructure with `lh gate` command
  - Review artifact templates and write helpers

## 1.4.0

### Minor Changes

- 46af628: Make `git push --force` configurable via `command_enforcement.force_push` in `.lh/config.yml`. Default: `warn` (instead of hardcoded deny). Add `lh command status` and `lh command set-force-push` CLI commands. Remove force push from hardcoded deny lists in both Claude Code and OpenCode adapters — the hooks/plugins now enforce the configured mode at runtime.

## 1.3.3

### Patch Changes

- c383043: Fix two Claude Code agent-related issues in the LeanHarness integration:

  - **Remove `disable-model-invocation: true` from all 7 lh-\* Claude Code skills.** This fixes the `Skill lh-discover cannot be used with Skill tool due to disable-model-invocation` error that blocked generic-purpose agents and the lh-do orchestrator from loading these skills. All lh-\* skills are now usable via the Skill tool, slash commands, or Agent-based subagent delegation.

  - **Fix `lh-discover` OpenCode command `agent: none` → `lh-scout`** in the command bundle frontmatter, matching the `opencode.json` command config. Update Claude Code skill body text to remove contradictory "no scout subagent" language.

  - **Update internal release procedures:** Enhance `.opencode/commands/lh-release.md` with the full changesets/action CI pipeline (wait CI, rebase-merge, wait version PR) and add a matching project-local Claude Code release skill at `.claude/skills/lh-release/SKILL.md`.

  - **Update skill instruction:** Replace the outdated `Never Call Skill(lh-spec)` warning in `lh-do` with positive guidance that Skill tool delegation is now supported for all lh-\* skills.

## 1.3.2

### Patch Changes

- cb08253: Fix `lh-discover` `agent: none` → `lh-scout` in OpenCode command bundle frontmatter, matching the `opencode.json` command config. Update Claude Code skill body text to remove contradictory "no scout subagent" language.

## 1.3.1

### Patch Changes

- 84c4647: Fix two guardrail issues that blocked lh-builder agent edits in certain configurations:

  **Boundary field alias support (hooks, plugin, verification, templates):**
  The guardrail hooks (Claude Code pre-tool-use hook and OpenCode plugin) and the verification pipeline now accept multiple boundary field name forms:

  - `touch` (string array, matching the API-stability docs and earlier schemas)
  - `touchFiles` (current canonical object-array form with `{ path, reason, confidence }`)
  - `files` (older object form with `modify`/`create`/`delete` arrays)

  Same tolerance applies to `readOnly` vs `readOnlyFiles`. This unblocks agents working with feature folders that predate the rename or were authored against the documented schema.

  Also fixes `.lh/templates/boundary.json` to match the enforced `BoundaryJson` schema (`riskGates[]` with `name`/`reason`/`status`, no `command` required on `relevantTests[]`), so future discoveries round-trip cleanly through the guardrail chain.

  **OpenCode `lh-do` / `lh-build` no longer surfacing Claude Code model questions:**
  The OpenCode command bundles now explicitly delegate each phase to its `.opencode/commands/lh-*.md` file and include a warning not to read `.claude/skills/lh-*/SKILL.md`. The `lh-builder` agent already runs as a single primary agent with mandatory self-review per task; a new `OpenCode Notes` section in `lh-build.md` makes that explicit and documents that OpenCode uses the current session model with no per-task model selection or subagent-vs-current-agent choice.

## 1.3.0

### Minor Changes

- 9e8fa10: Configurable boundary enforcement

  - New `lh boundary` CLI command with allow/block/exempt/list/show subcommands
  - Configurable enforcement modes: strict, warn, off
  - Added always_allow glob patterns in config
  - Enhanced pre-tool-use hooks with enforcement logic
  - Removed obsolete state.json file

## 1.2.1

### Patch Changes

- 368c0b3: Fix lh-do skill invoking lh-spec via Skill tool, which fails because lh-spec has `disable-model-invocation: true`. The Specify step now delegates via the Agent tool (reading the skill file directly), consistent with how build/review/check steps are delegated.

## 1.2.0

### Minor Changes

- abb92f3: feat: introduce lh-builder-fix agent for targeted fixes based on lh-reviewer feedback; enhance lh-scout and lh-discover skills with graphify integration for improved discovery; update CLAUDE.md and AGENTS.md with development guidelines and file ownership details

## 1.1.1

### Patch Changes

- 20da8f9: enhance LeanHarness agent and skill functionalities:
  - add task tooling to all LH skills (lh-spec, lh-discover, lh-plan, lh-build, lh-check, lh-status)
  - add lh-release command for publishing releases
  - add execution mode choice to lh-build skill
  - add Branch Setup section to lh-build and lh-do skills
  - enforce mandatory self-review in lh-build OpenCode bundle
  - update lh-discover skill documentation to utilize graphify for discovery steps D1-D4

## 1.1.0

### Minor Changes

- 411babc: enhance LeanHarness agent and skill functionalities
  standardize question format across skills and commands

All notable changes to LeanHarness will be documented in this file.

The format is inspired by [Keep a Changelog](https://keepachangelog.com/), and this project uses semantic versioning once releases begin.

## [Unreleased]

### Added

- Branded CLI header on every `lh --help` and `lh <command> --help` (plain text when piped; color when TTY allows)
- Interactive multi-select for agent hosts during `lh init` (@clack/prompts)
- Repeatable `lh init --host` flags (e.g. `--host claude-code --host opencode`)

### Changed

- CLI parsing uses Commander.js with per-command `--help` (e.g. `lh init --help` shows only init options)
- Replaced single "Both" init prompt with multi-select for Claude Code and OpenCode

### Fixed

- `lh init` now installs bundled harness scaffold files (templates, `protocols/cavebus.yml`, and host-neutral policies) instead of only creating empty directories
- `lh doctor --fix` installs missing scaffold files; doctor now checks for `.lh/templates/spec.md`

### Security

## [1.0.0] - 2026-05-08

### Changed

- First stable release published as npm package `@feneto/lh`
- Release CI now validates tag/version alignment before publish
- Release CI now runs `npm run release:check` as the publish gate

## [0.1.0] - 2026-05-07

### Added

- `.lh/` artifact store with feature folder structure and state index
- Feature artifact templates: spec, discovery, boundary, plan, tasks, checks, result
- CaveBus protocol specification and message templates
- Policy definitions: boundary enforcement, risk gates, command classification, OpenCode guardrails
- Configuration surface: `.lh/config.yml`
- Deterministic CLI (`lh`) with commands: init, status, spec, new, list, show, archive, discover, plan, compile-task, run-task, build, check, compress, cavebus, doctor
- Feature artifact engine: create, resolve, list, show, archive features
- Discovery engine: on-demand file discovery with depth levels D0-D4, boundary generation
- Planning engine: plan and task generation from spec and discovery artifacts
- Context compiler: bounded context compilation per task with protected token preservation
- Build orchestrator: sequential task execution through agent adapters with dry-run support
- Verification and check engine: acceptance criteria tracing, command execution, evidence-based verdicts
- CaveBus compressor: deterministic compression with protected token preservation
- CaveBus inspector: log viewing, filtering, and validation
- Claude Code adapter: detection, argument building, subprocess invocation
- OpenCode adapter: detection, argument building, subprocess invocation
- Adapter registry with host detection and normalization
- Claude Code integration pack: skills, subagents, hooks, settings, README
- OpenCode integration pack: agents, guardrail plugin, shared utilities, configuration
- OpenCode guardrail plugin: boundary enforcement, risk gate detection, dangerous command blocking, secret protection, event logging
- Claude Code hook scripts: boundary enforcement, risk gate detection, command classification
- Test suite: 30 test files covering CLI parsing, core modules, discovery, planning, context compilation, adapters, CaveBus, verification, and build orchestration
- Test helpers and workspace utilities
- Password reset example with complete artifact set (spec, discovery, boundary, plan, tasks, checks, result, CaveBus log)
- Dogfooding guide for maintainers
- Password reset walkthrough documentation
- Agent host documentation: overview, Claude Code host, OpenCode host
- CaveBus protocol documentation
- Design documentation: vision, workflow, architecture, principles, glossary
