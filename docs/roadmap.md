# Roadmap

## Current status

LeanHarness v0.1 is intended for local dogfooding and careful brownfield feature work. The core workflow (Specify, Discover, Build, Check) is implemented with deterministic CLI commands, two agent host adapters, and guardrail layers.

## v0.1 (current)

- `.lh/` artifact store with templates, policies, and protocols
- Deterministic CLI (`lh`) with full command set
- Feature artifact engine (create, resolve, list, show, archive)
- On-demand discovery engine with depth levels D0-D4
- Planning engine with task generation
- Bounded context compiler with protected token preservation
- Build orchestrator with sequential task execution
- Verification and check engine with evidence-based verdicts
- CaveBus compressor and inspector
- Claude Code adapter and integration pack (skills, subagents, hooks)
- OpenCode adapter and integration pack (agents, guardrail plugin)
- Test suite and example artifacts
- Dogfooding documentation

## v0.2

- Richer planning: better task dependency modeling, plan revision support
- Stronger check evidence: deeper acceptance criteria tracing
- Better host configuration: per-host settings in `config.yml`
- Improved OpenCode plugin payload support for broader tool coverage
- Better template customization: per-feature template overrides
- More language and framework discovery patterns (Python, Go, Rust, Java)
- Improved error messages and diagnostics

## v0.3

- Additional agent host adapters (community-contributed)
- CI integration support (run `lh check` in CI pipelines)
- Stronger worktree support: per-feature git worktrees
- Richer review workflows: structured review artifacts
- Benchmark tooling for token usage measurement
- Plan diffing: compare plans across runs

## Later

- Host marketplace or packs for easy adapter distribution
- Deeper IDE integrations
- Richer memory and indexing for cross-feature knowledge
- Team policy packs: shared guardrail configurations
- Multi-feature orchestration
- Parallel task execution within a build

## Non-goals

LeanHarness is a harness framework. It does not aim to:

- **Replace CI.** `lh check` is a local completion gate, not a CI pipeline. Use CI for deployment gates.
- **Replace human review.** Verification provides evidence. Humans make the final judgment.
- **Be a complete security sandbox.** Guardrails are best-effort. Agent hosts can execute code if users approve actions.
- **Guarantee correctness.** `lh check` is evidence-based but not a formal proof. Use dry-runs before real agent execution.
- **Map entire codebases by default.** On-demand discovery finds only what each feature needs.
- **Be a full project management tool.** Feature tracking is scoped to the Specify-Discover-Build-Check lifecycle.

## How to influence the roadmap

Open an issue or pull request. Describe the use case, not just the feature. The most useful feedback comes from real dogfooding sessions where the framework fell short.
