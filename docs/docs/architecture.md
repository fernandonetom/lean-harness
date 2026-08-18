# Architecture

LeanHarness is a coordination and policy layer for AI coding agents. It does not write code or make implementation decisions. It orchestrates agents through a structured workflow and enforces boundaries, compression, and verification.

---

## System overview

```
LeanHarness
├── CLI orchestrator (packages/cli/src/cli.ts, packages/cli/src/index.ts)
├── Host integrations
│   ├── Claude Code (skills, subagents, hooks, settings)
│   └── OpenCode (agents, plugins, config)
├── Artifact store (.lh/)
├── Discovery engine (packages/cli/src/discovery/)
├── Context compiler (packages/cli/src/context/)
├── CaveBus compression layer (packages/cli/src/cavebus/)
├── Verification engine (packages/cli/src/verification/)
├── Agent adapter layer (packages/cli/src/adapters/)
├── Plugin system (packages/cli/src/plugins/)
└── Memory system (packages/cli/src/memory/)
```

---

## Components

### CLI orchestrator

Entry point. Parses commands, manages feature lifecycle, coordinates components.

**Source:** `packages/cli/src/cli.ts` (arg parsing, command dispatch), `packages/cli/src/index.ts` (entry point)

Responsibilities:
- Parse user commands (`lh spec`, `lh discover`, `lh build`, `lh check`, etc.)
- Create and manage feature artifact folders
- Drive the Specify → Discover → Plan → Build → Check workflow
- Load resolved config from `.lh/config.yml` with CLI override merging
- Coordinate between discovery, context compiler, verification, and compression

20 commands implemented. See [commands.md](../commands.md) for full reference.

### Host integrations

LeanHarness supports two agent hosts via adapters:

**Claude Code** — Primary host. Integration via `.claude/` directory:
- `settings.json` — project-level permissions
- `skills/` — workflow skills (slash commands)
- `agents/` — subagent definitions
- `hooks/` — lifecycle hooks for boundary enforcement

**OpenCode** — Secondary host. Integration via `.opencode/` directory:
- `agents/` — agent definitions
- `plugins/` — guardrail plugin
- `opencode.json` — project configuration

Both hosts are installed by `lh init --host <name>`. Use `--host all` for both.

### Artifact store

The `.lh/` directory. Source of truth for all feature work.

```
.lh/
├── config.yml                 # Project configuration
├── state.json                 # Feature index and active feature
├── templates/                 # Artifact shape definitions
├── policies/                  # Guardrail definitions
├── protocols/                 # Protocol definitions (CaveBus)
├── plugins/                   # Plugin directory
├── memory/                    # Project memory files
└── features/
    └── F001-password-reset/
        ├── spec.md            # Feature specification
        ├── discovery.md       # Discovery results
        ├── boundary.json      # Machine-readable change boundary
        ├── plan.md            # Build plan
        ├── tasks.md           # Task definitions
        ├── checks.md          # Verification checklist
        ├── result.md          # Verification result + verdict
        ├── risk-approvals.json # Approved risk gates
        ├── cavebus.log        # CaveBus message log
        └── tasks/             # Per-task artifacts
            └── T1/
                ├── context.md     # Compiled bounded context
                ├── run-result.json # Agent run metadata
                └── summary.md     # Task completion summary
```

Feature folders are self-contained — each documents what was requested, discovered, planned, built, and whether it passed verification.

### Discovery engine

**Source:** `packages/cli/src/discovery/`

Finds relevant codebase files for a feature spec. Produces change boundary (`boundary.json`) and discovery report (`discovery.md`).

Key modules:
- `project-detector.ts` — detects project type (Node, Python, Go, Rust, Java, C#, Ruby, PHP)
- `test-detector.ts` — identifies test frameworks and commands
- `import-resolver.ts` — traces imports and dependencies
- `discovery-engine.ts` — orchestrates escalating search

Discovery uses five depth levels (D0–D4), from spec-only analysis to full directory scanning.

### Context compiler

**Source:** `packages/cli/src/context/`

Assembles bounded context for each task during Build. Produces minimal context envelopes containing only what a specific task needs.

Responsibilities:
- Select relevant spec sections per task
- Include only files the task needs to read or modify
- Respect `max_bytes` limits from config
- Format output for agent consumption

### CaveBus compression layer

**Source:** `packages/cli/src/cavebus/`

Internal protocol for compact, structured communication between phases and tasks.

CaveBus is a data format and compression strategy, not an infrastructure bus. Three compression modes:

| Mode | Use case | Token savings |
|------|----------|---------------|
| `lite` | Quick summaries, minimal compression | ~30% |
| `full` | Standard compression, default | ~60% |
| `ultra` | Maximum compression, agent-to-agent only | ~80% |

CaveBus message types: discovery, summary, task, review, error, verify. Templates in `.lh/templates/cavebus/`.

Protected tokens (file paths, function names, code references) are preserved exactly during compression.

### Verification engine

**Source:** `packages/cli/src/verification/`

Runs the Check phase. Compares implementation against spec acceptance criteria.

Responsibilities:
- Parse acceptance criteria from spec
- Run verification commands (test suites, type checks, linters)
- Diff changed files against change boundary
- Detect boundary violations
- Produce evidence per acceptance criterion
- Generate verdict: `pass`, `needs-fix`, or `blocked`

Verification checks what was asked (the spec), not just what was built (the code).

### Agent adapter layer

**Source:** `packages/cli/src/adapters/`

Abstraction for working with different agent hosts.

```typescript
interface AgentAdapter {
  host: AgentHost;
  run(input: AgentRunInput): Promise<AgentRunResult>;
  detect(root: string, commandOverride?: string): Promise<AgentDetection>;
}
```

Both adapters support: timeout enforcement, AbortSignal, stdout/stderr streaming callbacks, subprocess signal forwarding, dry-run mode.

See [host-adapters.md](../host-adapters.md) for implementation details and the adapter checklist.

### Plugin system

**Source:** `packages/cli/src/plugins/`

Extensibility via `.lh/plugins/` directory. Each plugin is a directory with a `plugin.json` manifest.

```typescript
interface LHPlugin {
  name: string;
  version: string;
  hooks?: PluginHooks;     // beforeDiscover, afterDiscover, beforeBuild, etc.
  adapters?: AgentAdapter[];
}
```

Plugins discovered from `.lh/plugins/`, loaded at CLI startup, hooks dispatched in registration order.

### Memory system

**Primary source:** Skills during normal workflow (`lh-discover`, `lh-check`, `lh-compressor`)

Persistent project knowledge in `.lh/memory/`. Four memory files:
- `project.md` — tech stack, structure, conventions (seeded by lh-discover, one-time)
- `decisions.md` — architectural decisions across features (appended by lh-check, deduplicated)
- `patterns.md` — recurring patterns and idioms (appended by lh-check, deduplicated)
- `cave.md` — CaveBus abbreviation map (appended by lh-compressor, capped at 60 lines)

In normal Claude Code / OpenCode usage, memory files are written directly by skills via Read/Write. Specifically:
- `lh-discover` appends a `## Tech Stack` section to `project.md` on first discovery (once per project).
- `lh-check` appends deduplicated entries from `result.md`'s "Decisions Made" and "Patterns Discovered" sections to `decisions.md` and `patterns.md` respectively (capped at 120 lines each).
- `lh-compressor` appends new abbreviations to `cave.md` during CaveBus compression (capped at 60 lines).

A secondary TypeScript module (`packages/cli/src/memory/`) exists for CLI-direct execution when users run `lh discover`/`lh check` from the command line manually, but skill-driven writes are the primary mechanism in typical Claude Code and OpenCode usage.

### Config resolution

**Source:** `packages/cli/src/core/resolved-config.ts`

Merges `.lh/config.yml` with CLI overrides. CLI flags take precedence over config file values.

```
config.yml → resolveConfig(config, cliOverrides) → ResolvedConfig
```

Resolved config threaded through all workflow commands: discover, build, check, compress.

### Risk gates

**Source:** `packages/cli/src/core/risk-gates.ts`

Seven default risk gate categories enforced during build:
- `destructive_migration`, `auth_rewrite`, `payment_logic`
- `new_dependency`, `public_api_break`, `broad_refactor`
- `security_sensitive_change`

Gates detected from discovery artifacts. Approval via `--approve-risk` flag or `risk-approvals.json` per feature.

### Error handling

**Source:** `packages/cli/src/core/errors.ts`

Structured error types: `CLIError`, `ConfigError`, `FeatureNotFoundError`. Commands never call `process.exit()` — set exit code and return. Top-level catch formats user-facing messages.

---

## Data flow

```
User request
    │
    ▼
CLI orchestrator
    │
    ├──► Specify ──► spec.md ──────────────────────────────┐
    │                                                       │
    ├──► Discover ──► discovery.md + boundary.json ────────┤
    │                                                       │
    ├──► Plan ──► plan.md + tasks.md ─────────────────────┤
    │                                                       │
    ├──► Context compiler ──► task context envelopes ──┐   │
    │                                                   │   │
    ├──► Build (via agent adapter) ◄────────────────────┘   │
    │         │                                             │
    │         ├──► task summaries ──► tasks/T1/summary.md   │
    │         └──► code changes                             │
    │                                                       │
    ├──► Compress ──► cavebus.log                           │
    │                                                       │
    └──► Check ──► checks.md + result.md (verdict) ◄───────┘
```

---

## Key design decisions

### Files on disk, not in-memory state

- Survive session crashes and context window limits
- Inspectable by developer at any time
- Version-controllable alongside the project
- Resume in new session without reconstructing state

### One folder per feature

- Features are independent; parallel features do not interfere
- Completed features serve as documentation and audit trail
- Feature folders can be cleaned up individually

### CaveBus compression

- Agent outputs are verbose; passing full outputs between phases wastes tokens
- Structured format allows context compiler to select relevant parts
- Protocol-level compression benefits every component

### Escalating discovery

- Full-repo indexing is expensive in tokens and time
- Most features touch a small portion of the codebase
- Developer sees exactly how boundary was determined and can intervene early

### Zero production dependencies

- Entire runtime is self-contained TypeScript
- YAML parser, colors, spinner, prompt — all built-in
- Minimizes supply chain risk and install size

---

## Module map

```
packages/cli/src/
├── index.ts                    # Entry point
├── cli.ts                      # Arg parsing, command dispatch
├── core/
│   ├── types.ts                # Core type definitions (frozen API)
│   ├── config.ts               # Config loading, YAML parsing
│   ├── resolved-config.ts      # Config + CLI override merging
│   ├── risk-gates.ts           # Risk gate checking and enforcement
│   ├── errors.ts               # Error types
│   ├── version.ts              # Version from package.json
│   ├── fs.ts                   # File system utilities
│   ├── colors.ts               # ANSI color output
│   ├── spinner.ts              # Progress spinner
│   └── prompt.ts               # Interactive readline prompts
├── adapters/
│   ├── types.ts                # Adapter interfaces (frozen API)
│   ├── registry.ts             # Host → adapter mapping
│   ├── claude-code.ts          # Claude Code adapter
│   └── opencode.ts             # OpenCode adapter
├── discovery/
│   ├── index.ts                # Discovery orchestration
│   ├── project-detector.ts     # Project type detection
│   ├── test-detector.ts        # Test framework detection
│   ├── import-resolver.ts      # Import tracing
│   ├── boundary.ts             # Boundary management
│   ├── search.ts               # File search
│   ├── graph-scorer.ts         # Graph-based candidate scoring
│   └── package-detector.ts     # Package manager detection
├── context/
│   ├── compiler.ts             # Bounded context compilation
│   ├── task-context.ts         # Task context assembly
│   └── protected-tokens.ts     # Protected token preservation
├── planning/
│   ├── index.ts                # Plan and task orchestration
│   ├── task-generator.ts       # Task generation
│   ├── plan-renderer.ts        # Plan formatting
│   └── acceptance.ts           # Acceptance criteria parsing
├── build/
│   ├── index.ts                # Build orchestration
│   ├── task-runner.ts          # Single task execution
│   ├── task-status.ts          # Task status tracking
│   └── task-summary.ts         # Task summary generation
├── verification/
│   ├── index.ts                # Check orchestration
│   ├── commands.ts             # Command execution with timeout
│   ├── acceptance.ts           # Acceptance criteria tracing
│   ├── changed-files.ts        # Changed file diffing
│   └── review.ts               # Review finding integration
├── cavebus/
│   ├── index.ts                # Public API
│   ├── compress.ts             # CaveBus compression
│   ├── validate.ts             # CaveBus log validation
│   ├── schema.ts               # Schema definitions
│   └── protected.ts            # Protected token handling
├── memory/
│   └── index.ts                # Memory read/write
├── plugins/
│   ├── types.ts                # Plugin interfaces (frozen API)
│   ├── loader.ts               # Plugin discovery and loading
│   └── registry.ts             # Plugin registry and hook dispatch
└── commands/
    ├── init.ts                 # lh init
    ├── init-claude-code.ts     # Claude Code integration setup
    ├── init-opencode.ts        # OpenCode integration setup
    ├── status.ts               # lh status
    ├── spec.ts                 # lh spec
    ├── new.ts                  # lh new
    ├── list.ts                 # lh list
    ├── show.ts                 # lh show
    ├── archive.ts              # lh archive
    ├── discover.ts             # lh discover
    ├── plan.ts                 # lh plan
    ├── compile-task.ts         # lh compile-task
    ├── run-task.ts             # lh run-task
    ├── build.ts                # lh build
    ├── check.ts                # lh check
    ├── compress.ts             # lh compress
    ├── cavebus.ts              # lh cavebus
    ├── memory.ts               # lh memory
    ├── update.ts               # lh update
    ├── watch.ts                # lh watch
    ├── doctor.ts               # lh doctor
    └── completion.ts           # lh completion
```

## Related docs

- [API stability](../api-stability.md)
- [Host adapters](../host-adapters.md)
- [Claude Code host](../hosts/claude-code.md)
- [OpenCode host](../hosts/opencode.md)
- [Configuration](../configuration.md)
- [Troubleshooting](../troubleshooting.md)
