# Changelog

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
    </EOF>
    echo "Changeset created"

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
