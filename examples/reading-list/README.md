# Reading List Example

> **Never run `lh init --force` inside this directory.**
> `.lh/config.yml` and `.lh/.gitignore` are only written once by `lh init` (skipped if already present) unless `--force` is passed, so the manual edits described below are safe from a plain re-run of `lh init`. But `--force` would silently reset `features.commit` back to `false` and restore the solo-mode `.gitignore` (re-adding `/state.json`). If that ever happens by accident, redo the two manual edits (see "Manual Setup" below).

## Live, real example — not a static one

Unlike [`examples/password-reset/`](../password-reset/), which is a static, narrative-only illustration where no agent was ever invoked and its artifacts must never be copied into `.lh/features/`, **this example is the opposite**: it is a small Next.js app whose `.lh/features/` directory is committed straight from real `lh` command runs against real Claude Code and OpenCode agents. Everything under this directory's `.lh/features/` — specs, discovery reports, boundaries, plans, tasks, checks, CaveBus logs — was produced by actually running LeanHarness, not hand-written to look like a run.

## What this is

A small Next.js reading-list app: track articles and books with a status of `to-read`, `reading`, or `done`. It exists to serve as LeanHarness's live testing and demo project for both supported agent hosts — Claude Code and OpenCode — running the same `Specify -> Discover -> Build -> Check` workflow against a real, evolving codebase.

See [`web/`](web/) for the app itself, and [`.lh/features/`](.lh/features/) for the real LeanHarness artifacts from the F001 (scaffold) and F002 (status filter/search) feature runs that built it.

## Prerequisites

Run the following at the monorepo root **at least once** before opening this directory in Claude Code or OpenCode:

```bash
pnpm install && pnpm run build
```

The OpenCode plugin wired into this example (under `.opencode/plugins/`) is symlinked to `hosts/opencode/dist/*.js`, which only exists after a build. Skipping this step means OpenCode will fail to load the plugin.

## Hosts wired for live local-source loading

This example wires up both hosts to load LeanHarness directly from this monorepo's source, rather than from a published release, so that changes to `hosts/claude-code/` or `hosts/opencode/` are immediately reflected here:

- **Claude Code** — a local-path plugin marketplace registered at `--scope project`, pointing at `hosts/claude-code/` in this monorepo.
- **OpenCode** — symlinks into `hosts/opencode/{dist,templates}`, so the plugin and templates reflect the current build output.

See [`docs/examples/reading-list.md`](../../docs/examples/reading-list.md) for the full walkthrough of how this example was set up and how to reproduce or extend it.

## Manual Setup

Two manual edits are applied on top of `lh init --team` output, and are expected to persist across the lifetime of this example (they are not re-applied automatically):

1. `.lh/config.yml` — `features.commit` set to `true` (team mode defaults this to `false`; this example commits real feature artifacts, so it must be `true`).
2. `.lh/.gitignore` — the `/state.json` line removed, so `state.json` is tracked in git along with `/features/`.
