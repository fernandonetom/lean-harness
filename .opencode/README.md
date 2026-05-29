# OpenCode Integration

LeanHarness OpenCode integration pack. Configures OpenCode to operate within the LeanHarness artifact-driven workflow.

## Purpose

This pack teaches OpenCode how to work with LeanHarness feature artifacts, change boundaries, verification evidence, risk gates, and CaveBus summaries.

## Relationship to `.lh/`

`.lh/` is the source of truth for all LeanHarness state. `opencode.json` and `.opencode/` configure how OpenCode agents interact with `.lh/` artifacts.

## Agents

| Agent | Mode | Purpose |
|-------|------|---------|
| lh-scout | subagent | On-demand discovery |
| lh-builder | primary | Bounded task implementation |
| lh-reviewer | subagent | Read-only review |
| lh-verifier | subagent | Final verification |
| lh-compressor | subagent | CaveBus compression |

## CLI Integration

```bash
lh init --host opencode         # Install or refresh
lh init --host opencode --force # Force refresh
lh status                       # Check integration
lh doctor                       # Health check
```

## Maintenance

Keep in sync with `lh init --host opencode --force`.
