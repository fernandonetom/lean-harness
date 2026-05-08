# Glossary

Consistent terminology used throughout LeanHarness documentation and code.

---

**acceptance criteria**
Observable behaviors listed in a feature spec that prove the feature works. Each criterion is individually verifiable during the Check phase.

**adapter**
A component in the agent adapter layer that translates LeanHarness operations into commands for a specific agent host. The Claude Code adapter is the only one planned for v0.1.

**artifact store**
The `.lh/` directory in a project. Contains all feature artifacts, project-level configuration, and cached context. The source of truth for feature work.

**bounded context**
The subset of spec, discovery, and file contents that a single build task receives. Bounded context is the primary mechanism for reducing token usage during the Build phase.

**brownfield-first**
A design stance meaning LeanHarness is built for existing codebases as the primary case. No full-repo scan or special setup required.

**CaveBus**
An internal protocol for compact, structured communication between LeanHarness components and subagents. Not a message bus — a data format and compression strategy for minimizing token cost in inter-component communication.

**change boundary**
The explicit set of files that may be created or modified during the Build phase for a given feature. Defined during the Discover phase. Expanding the boundary requires explicit approval.

**Check**
The fourth workflow phase. Verifies the implementation against the spec's acceptance criteria. Produces a verdict: pass, needs-fix, or blocked.

**Claude Code-first**
A design stance meaning LeanHarness targets Claude Code as the primary agent host. Other hosts may be supported through adapters, but Claude Code gets full integration depth.

**CLI orchestrator**
The entry point for developers. Parses commands, manages feature lifecycle, and coordinates between LeanHarness components.

**compact summary**
A compressed description of a completed task's results, produced in CaveBus format. Fed into subsequent tasks instead of full transcripts.

**context compiler**
The component that assembles bounded context envelopes for build tasks. Takes full spec, discovery, and file contents as input; produces task-specific slices as output.

**context envelope**
A CaveBus-formatted package containing the bounded context for a single build task. Includes relevant spec sections, discovery sections, and file contents.

**Discover**
The second workflow phase. Inspects the relevant parts of the codebase to produce a change boundary. Uses escalating search.

**discovery engine**
The component that performs on-demand discovery. Searches for relevant files, traces dependencies, identifies tests, and evaluates risks.

**escalating discovery (escalation)**
The discovery engine's strategy of starting with narrow searches and widening only when the narrow boundary is insufficient. Four levels: keyword search, dependency tracing, directory exploration, user escalation.

**feature artifact**
The complete set of files in `.lh/features/<feature-id>/` that document a feature's lifecycle: spec, discovery, plan, check, and cached context.

**feature ID**
A unique identifier for a feature (e.g., F001, F002). Used as the folder name in the artifact store.

**harness**
The complete LeanHarness system — the workflow, artifacts, boundaries, compression, verification, and guardrails that wrap around an AI coding agent.

**hook**
A Claude Code lifecycle event handler. LeanHarness uses hooks for boundary enforcement, progress tracking, and other reactive behaviors.

**on-demand discovery**
Finding relevant codebase information when a feature needs it, rather than pre-indexing the entire project.

**read-only file**
A file included in the change boundary as context (the agent may read it) but not as a touch file (the agent should not modify it).

**risk gate**
A pause point during discovery or build where the harness asks the user for a decision before proceeding. Triggered by unexpected complexity, contradicted assumptions, missing tests, or boundary concerns.

**skill**
A Claude Code skill that implements phase-specific behavior. Skills are loaded on demand when their phase is active.

**source of truth**
The authoritative location for information. For feature work, the source of truth is the `.lh/features/<feature-id>/` folder. For project-level knowledge, it is `.lh/project.yaml`.

**Specify**
The first workflow phase. Turns a user request into a structured feature specification with goal, non-goals, acceptance criteria, constraints, assumptions, and verification expectations.

**Build**
The third workflow phase. Converts the spec and discovery into a plan and executes small, bounded tasks to implement the feature.

**subagent**
An isolated Claude Code agent instance used during the Build phase. Receives a bounded context envelope and returns a compressed result. Used for parallel task execution and context isolation.

**touch file**
A file identified during discovery that will likely be created or modified during the Build phase.

**verification engine**
The component that runs the Check phase. Compares implementation against acceptance criteria, runs tests, checks boundary compliance, and produces the verdict.

**verification evidence**
Specific proof, recorded in `check.md`, that an acceptance criterion has been met. Includes file paths, line numbers, test results, or other observable artifacts.

**verdict**
The outcome of the Check phase. One of: **pass** (all criteria met), **needs-fix** (specific issues identified), or **blocked** (verification cannot complete).
