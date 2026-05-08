# CaveBus Message Format

> Template for compressed agent-to-agent messages written to `cavebus.log`.
> CaveBus strips filler, keeps technical substance. Protected tokens are never compressed.

## Message Structure

```
[TIMESTAMP] [SENDER] -> [RECEIVER] | [TYPE]
[COMPRESSED_BODY]
---
```

## Field Reference

- **TIMESTAMP:** ISO 8601 UTC
- **SENDER:** Agent or skill identifier (e.g., `discover-agent`, `build-agent`)
- **RECEIVER:** Target agent or `*` for broadcast
- **TYPE:** One of: `handoff`, `status`, `escalation`, `context`, `result`

## Type Definitions

- **handoff** — Task boundary crossing. Includes compressed context for next agent.
- **status** — Progress update. Minimal: task ID + new status.
- **escalation** — Risk gate triggered or human input needed.
- **context** — Supplementary context pushed to another agent.
- **result** — Task or feature completion summary.

## Compression Rules

1. Drop articles, filler, pleasantries, hedging.
2. Use abbreviations from `memory/cave.md` abbreviation map.
3. Never compress protected tokens from `memory/cave.md`.
4. Technical terms stay exact.
5. Code references stay exact (paths, function names, line numbers).
6. One line per fact where possible.

## Example

```
2026-05-06T14:30:00Z discover-agent -> build-agent | handoff
F001 discovery done. boundary locked. 4 files modify, 2 create.
auth middleware touched — risk gate: auth_rewrite. approval needed.
patterns: repo uses express middleware chain, jest for unit tests.
next: T-01 add route handler in src/routes/reset.ts
---
```
