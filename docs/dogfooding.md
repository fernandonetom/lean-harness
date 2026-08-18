# Dogfooding LeanHarness

A practical guide for maintainers who want to test LeanHarness by using it on real work — including on LeanHarness itself.

## Purpose

Dogfooding validates that the workflow, artifacts, boundaries, risk gates, and verification actually work in practice. It surfaces friction, missing features, and incorrect assumptions before users encounter them.

## Recommended First Dogfood Project

Use LeanHarness on a small, real feature in an existing codebase. Good candidates:

- Add a small endpoint or utility function to an existing app.
- Fix a known bug with clear acceptance criteria.
- Add a missing test for existing behavior.

Avoid:

- Greenfield projects (too simple to test brownfield discovery).
- Large refactors (too many unknowns for a first dogfood).
- Anything touching production infrastructure.

You can also dogfood LeanHarness on LeanHarness itself — adding a small CLI feature, fixing a bug, or improving documentation. The password reset example in `examples/password-reset/` shows what the artifacts look like — but note that example is static: no agent was ever invoked, and its artifacts must never be copied into `.lh/features/`.

For a real, committed dogfood run, see `examples/reading-list/` — its `.lh/features/` directory is committed straight from actual `lh` command runs against real Claude Code and OpenCode agents (team mode, `features.commit: true`). Its F001 feature (scaffolding the app itself) is a **deliberate greenfield exception** to this doc's "avoid greenfield projects" guidance above — it exists only to bootstrap a real app for F002 to build on, not as a brownfield-discovery example. F002 (adding a status filter and search) is the normal brownfield case and is the one worth studying for what real discovery, planning, and check output look like. See [docs/examples/reading-list.md](examples/reading-list.md) for the full walkthrough.

## Before You Start

Verify the environment:

```bash
npm run build
npm run typecheck
npm test
```

If any of these fail, fix them before dogfooding. Do not dogfood on a broken build.

Check that the CLI is usable:

```bash
node dist/index.js doctor
node dist/index.js --help
```

## The Safe First Run

Start with a dry-run to understand the workflow without invoking any agent:

```bash
# Initialize in a scratch directory
TMPDIR="$(mktemp -d)"
node dist/index.js --cwd "$TMPDIR" init --host all

# Create a spec
node dist/index.js --cwd "$TMPDIR" spec "Add a hello world endpoint" --title "Hello world"

# Discover
node dist/index.js --cwd "$TMPDIR" discover F001 --depth D1

# Plan
node dist/index.js --cwd "$TMPDIR" plan F001

# Dry-run build (no agent invoked)
node dist/index.js --cwd "$TMPDIR" build F001 --host claude-code --dry-run

# Check without running commands
node dist/index.js --cwd "$TMPDIR" check F001 --no-run

# Inspect artifacts
find "$TMPDIR/.lh" -type f | sort
```

This produces artifacts without touching any real codebase or invoking any agent.

## Claude Code Dogfood Flow

In your target project:

```bash
lh init --host claude-code
lh spec "<your feature request>" --title "<short title>"
lh discover F001 --depth D2
lh plan F001

# Always dry-run first
lh build F001 --host claude-code --dry-run

# Review the plan and boundary
cat .lh/features/F001-*/plan.md
cat .lh/features/F001-*/boundary.json

# If satisfied, run the real build
lh build F001 --host claude-code

# Verify
lh check F001

# Compress
lh compress F001
lh cavebus F001 --validate
```

## OpenCode Dogfood Flow

```bash
lh init --host opencode
lh spec "<your feature request>" --title "<short title>"
lh discover F001 --depth D2
lh plan F001

# Always dry-run first
lh build F001 --host opencode --opencode-agent lh-builder --dry-run

# Review
cat .lh/features/F001-*/plan.md
cat .lh/features/F001-*/boundary.json

# Real build
lh build F001 --host opencode --opencode-agent lh-builder

# Verify
lh check F001

# Compress
lh compress F001
lh cavebus F001 --validate
```

## What To Inspect After Each Step

### After `lh spec`

- Does the spec capture the right acceptance criteria?
- Are constraints and non-goals clear?
- Are risk flags accurate?

### After `lh discover`

- Did discovery find the right files?
- Is the change boundary reasonable?
- Are read-only files correctly identified?
- Did any risk gates trigger that should not have?
- Did any risk gates fail to trigger that should have?

### After `lh plan`

- Does every acceptance criterion map to at least one task?
- Are task dependencies correct?
- Are expected files inside the boundary?
- Is the test strategy realistic?

### After `lh build`

- Did the agent stay inside the boundary?
- Did task summaries capture what happened?
- Did CaveBus entries preserve protected tokens?
- Are there any unexpected file changes?

### After `lh check`

- Does the verdict match reality?
- Are unresolved issues real or false positives?
- Did verification commands run successfully?
- Is boundary compliance confirmed?

### After `lh compress`

- Did CaveBus compression preserve protected tokens?
- Is the compressed block readable?
- Does `lh cavebus --validate` pass?

## Common Failure Modes

| Failure | What Happened | Fix |
|---------|--------------|-----|
| Discovery misses files | Depth too shallow or pattern mismatch | `lh discover F001 --depth D3` |
| Agent edits outside boundary | Boundary too narrow or agent ignores constraints | Update boundary, check guardrail hooks |
| Check false-passes | Verification commands not configured or skipped | Ensure `tasks.md` has verification commands |
| Check false-fails | Verification commands fail for environment reasons | Fix environment, re-run check |
| CaveBus drops tokens | Compression bug or token not in protected list | Report bug, check `boundary.json` protected tokens |
| Dry-run passes check | Bug — dry-run should never produce pass | Report bug |

## How To Improve the Framework While Dogfooding

When you hit friction:

1. **Record the issue.** Note what step failed, what you expected, and what happened.
2. **Check if it is a docs bug or a runtime bug.** If the docs are misleading, fix the docs. If the CLI behaves wrong, file a bug.
3. **Do not work around the framework.** If you need to bypass LeanHarness to get work done, that is a signal the framework needs improvement.
4. **Separate framework work from feature work.** Do not fix LeanHarness and implement a feature in the same session. Complete or abandon the feature first, then fix the framework.

## What Counts as Success

A successful dogfood run means:

- You completed the Specify -> Discover -> Plan -> Build -> Check flow end-to-end.
- The artifacts accurately reflect what happened.
- The verdict is honest (pass only with evidence, needs-fix when evidence is missing).
- No files outside the change boundary were modified.
- Risk gates triggered when they should have.
- You could hand the artifacts to another developer and they would understand what was done and why.

## What Not To Do

- **Do not skip `lh check`.** The check step is the completion gate. Skipping it defeats the purpose.
- **Do not mark pass without evidence.** If tests did not run, the verdict is `needs-fix`, not `pass`.
- **Do not bypass risk gates.** If a gate triggers, review it. If it is a false positive, fix the gate definition.
- **Do not use a real agent run without checking `--dry-run` first.** Dry-run validates the plan before spending agent tokens.
- **Do not let example artifacts become claims of real work.** The `examples/` directory contains static illustrations. Do not copy them into `.lh/features/` and claim an agent produced them.
- **Do not dogfood on a broken build.** Run `npm run build` and `npm test` first.
- **Do not dogfood on production data.** Use a test project or a branch.
