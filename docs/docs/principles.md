# Principles

These principles guide every design and implementation decision in LeanHarness. They are ordered by priority — when principles conflict, earlier ones win.

---

## 1. Harness, not agent

LeanHarness does not write code. It does not make implementation decisions. It provides the structure, boundaries, and verification that an AI coding agent needs to deliver reliable results.

The agent is powerful. The harness is disciplined. Together they are useful.

**Implication:** LeanHarness never generates application code directly. It generates specs, discovery results, plans, and verification reports. The agent does the coding.

## 2. Brownfield-first

LeanHarness assumes an existing codebase with existing conventions, existing tests, and existing complexity. It does not require a blank slate. It does not require a full-repo scan before starting work.

**Implication:** Every feature in LeanHarness works on a project that already has code. Greenfield support falls out naturally — it is just the simpler case.

## 3. Bounded context per task

Each task in the Build phase receives only the context it needs. The full spec, full discovery, and all project files are never dumped into a single context window.

**Implication:** The context compiler must be able to slice the spec, discovery, and file contents into task-sized pieces. Tasks that need "everything" are too large and should be decomposed.

## 4. On-demand discovery

LeanHarness discovers the relevant parts of the codebase when a feature needs them, not upfront. Discovery starts narrow and escalates only when the narrow boundary is insufficient.

**Implication:** There is no "index the whole project" step. No codebase map is required. The discovery engine must be effective with targeted searches.

## 5. Artifacts as source of truth

The `.lh/features/<feature-id>/` folder is the authoritative record of what was requested, discovered, planned, built, and verified. If it is not in an artifact, it did not happen.

**Implication:** Every phase produces a file. Files are human-readable Markdown (except structured data like context caches, which use JSON or YAML). Files are inspectable at any time.

## 6. Token-aware by default

Every design decision considers the token cost. Tokens are not free — they cost money, add latency, and consume finite context windows.

**Implication:** CaveBus compression, bounded context, compact summaries, reusable project knowledge, and lazy skill loading are not optimizations to add later. They are core requirements.

## 7. Verify against the spec, not the code

The Check phase compares the implementation against the spec's acceptance criteria. It does not ask "does the code work?" It asks "does the code do what was requested?"

**Implication:** The verification engine reads the spec first, then checks the code. A passing test suite is necessary but not sufficient — the tests must cover the acceptance criteria.

## 8. Explicit boundaries

The change boundary from the Discover phase is a contract. Files outside the boundary should not be modified. If a task needs to go outside the boundary, it pauses and requests expansion.

**Implication:** Boundary enforcement is active, not advisory. The harness detects boundary violations during Build and Check.

## 9. Escalate, do not guess

When information is missing, ambiguous, or contradictory, LeanHarness asks the user. It does not fill in gaps with assumptions.

**Implication:** Spec clarification, discovery escalation, boundary expansion, and blocked verdicts all involve the user. The harness is a tool, not an autonomous system.

## 10. Resumable work

Features can be paused and resumed across sessions. The artifact store contains everything needed to continue where work left off.

**Implication:** The workflow state is fully captured in files, not in memory or context windows. A new session can read the artifact folder and understand the current state.

## 11. Minimal footprint

LeanHarness adds a `.lh/` folder and a `.claude/` integration to the user's project. It does not restructure the project, add dependencies to the application, or modify build pipelines.

**Implication:** `lh init` creates configuration files. It does not modify `package.json`, install packages, or change the project's build process.

## 12. Observable process

Every decision the harness makes is recorded and visible. The developer can inspect why a file was included in the change boundary, why a risk gate was triggered, or why a check failed.

**Implication:** Discovery logs its search strategy. Build logs its task decomposition. Check logs its evidence. Nothing happens silently.

---

## Decision framework

When making a design or implementation decision, apply these questions in order:

1. Does this keep the harness out of the agent's job? (Principle 1)
2. Does this work on an existing codebase without preprocessing? (Principle 2)
3. Does this minimize the context each task receives? (Principle 3)
4. Does this avoid upfront scanning? (Principle 4)
5. Does this produce an inspectable artifact? (Principle 5)
6. Does this reduce or at least not increase token usage? (Principle 6)
7. Does this verify against what was asked? (Principle 7)
8. Does this respect boundaries? (Principle 8)
9. Does this ask the user when uncertain? (Principle 9)
10. Can this survive a session restart? (Principle 10)

If a decision satisfies the first few principles but violates a later one, it is probably acceptable. If it violates an early principle, reconsider.
