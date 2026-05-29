# Vision

## The gap

AI coding agents can write code, run tests, navigate codebases, and iterate on feedback. They are increasingly powerful.

But power without discipline creates problems:

- An agent asked to "add a logout button" reads 200 files, modifies 12, and breaks two unrelated features.
- An agent asked to "fix the date bug" rewrites the date library wrapper, adds a new dependency, and refactors three calling modules.
- An agent produces working code but no one can verify whether it actually satisfies the original request.

The gap is not in capability. The gap is in structure.

## What LeanHarness is

LeanHarness is a harness framework for AI coding agents. It provides:

- **Workflow** — a four-phase process (Specify → Discover → Build → Check) that turns a vague request into a verified delivery.
- **Artifacts** — on-disk files that capture the spec, discovery results, build plan, and verification evidence for each feature.
- **Boundaries** — explicit limits on which files can be changed, what context is loaded, and when to escalate.
- **Compression** — a protocol (CaveBus) and strategies for reducing token usage without losing essential information.
- **Verification** — structured checks that compare the implementation against the original acceptance criteria, not just whether the code compiles.
- **Guardrails** — risk gates that pause work when discovery reveals unexpected complexity or when changes drift outside the approved boundary.

## What LeanHarness is not

LeanHarness is not an AI coding agent. It does not write code, run commands, or make decisions about implementation.

LeanHarness is the discipline layer that wraps around an agent, giving it structure, boundaries, and a way to prove it did the right thing.

Think of it as the difference between a skilled carpenter and a construction project with blueprints, inspections, and permits. The carpenter does the work. The project management ensures the work is correct, scoped, and verified.

## Design stance

### Brownfield-first

Most software work happens in existing codebases with existing conventions, existing tests, existing deployment pipelines, and existing bugs. LeanHarness is designed for this environment.

This means:

- No requirement to scan or index the entire codebase before starting work.
- On-demand discovery that finds only what matters for the current feature.
- Respect for existing project structure — LeanHarness does not impose its own conventions on application code.
- Awareness that modifying existing code carries more risk than writing new code.

### Claude Code-first

Claude Code is the first target execution host. LeanHarness integrates deeply with Claude Code's capabilities:

- Skills for phase-specific workflows
- Subagents for context isolation
- Hooks for lifecycle events
- Settings for project-level configuration

The architecture includes an adapter layer for multiple agent hosts. Claude Code and OpenCode are both supported. Additional hosts can be added via the adapter interface.

### Token-aware

Every design decision in LeanHarness considers token cost. Tokens are the primary runtime resource for AI coding agents, and wasting them has direct cost and latency consequences.

Token reduction strategies in LeanHarness:

- **Bounded context per task.** Each build task receives only the files and information it needs, not the full discovery or spec.
- **Compact agent-to-agent summaries.** When one subagent completes work, it produces a compressed summary for the next, not a full transcript.
- **Reusable project knowledge on disk.** Project conventions, test commands, and structural patterns are cached in `.lh/project.yaml` so they are not rediscovered every session.
- **CaveBus compression.** An internal protocol for structured, compact communication between harness components.
- **Lazy skill loading.** Skills are loaded only when their phase is active.
- **Escalating discovery.** Start narrow. Widen only when the narrow boundary proves insufficient.

These are design goals. Actual token savings will depend on the project, the feature, and the agent. LeanHarness does not make specific reduction claims.

## Where this is going

The long-term vision for LeanHarness:

1. A developer types a feature request in natural language.
2. The harness produces a clear spec and confirms it with the developer.
3. The harness discovers only the relevant parts of the codebase.
4. The agent builds the feature in small, bounded, verifiable tasks.
5. The harness checks the result against the original spec.
6. The developer reviews a clean diff, a passing check report, and a feature artifact folder that documents the entire process.

Every step produces an artifact. Every artifact is inspectable. The developer stays in control without needing to micromanage the agent.

This vision is not implemented yet. This document describes the target. The current state is documented in the [README](../README.md).
