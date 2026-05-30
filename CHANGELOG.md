# Changelog

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
