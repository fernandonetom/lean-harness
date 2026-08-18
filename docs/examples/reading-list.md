# Reading List Walkthrough

A narrative walkthrough of the reading-list example that ships with LeanHarness. Unlike the [password reset example](password-reset.md), which is a **static, narrative-only illustration** where no agent was ever invoked, this example is **real**: every artifact under [`examples/reading-list/.lh/features/`](../../examples/reading-list/.lh/features/) was produced by actually running `lh` commands against real Claude Code and real OpenCode agent hosts, and `.lh/features/` is committed to git (team mode, `features.commit: true` in `.lh/config.yml`).

Two feature runs built this example:

- **F001 — Reading list app scaffold** (`.lh/features/F001-reading-list-app-scaffold/`): a deliberate **greenfield** exception. It scaffolds the Next.js app itself, so there is no existing code for discovery to find. This intentionally contradicts [`docs/dogfooding.md`](../dogfooding.md)'s "avoid greenfield projects" guidance — the exception is scoped narrowly to this one bootstrap step, because the app has to exist before F002 can be a real brownfield case. Its real build ran on **Claude Code**.
- **F002 — Status filter and search** (`.lh/features/F002-status-filter-and-search/`): a genuine **brownfield** feature added to the app F001 produced. Discovery found real existing files, dependencies, and risk-gate matches. Its real build ran on **OpenCode**.

Both features were also **dry-run** against the *other* host for documentation parity — see the "Build" sections below.

## Scenario

A small Next.js (App Router, TypeScript) reading list app: track articles and books with a status of `to-read`, `reading`, or `done`, backed by a JSON file on disk (no database). The example lives at `examples/reading-list/`, wired so Claude Code loads the `lh` plugin from this monorepo's own `hosts/claude-code/` source (a project-scoped local-path marketplace registered in `.claude/settings.json`) and OpenCode loads its plugin and templates via symlinks into `hosts/opencode/{dist,templates}`. Changes to the harness source are reflected here immediately, without a release.

## Step 1: Specify

**Commands:**
- `lh spec "Scaffold a Next.js reading list app (App Router, TypeScript) with a list page, an add-item form, and a JSON-file-backed store. Track each item's status as to-read, reading, or done." --title "Reading list app scaffold"` (F001)
- `lh spec "Add a status filter and text search to the reading list so users can narrow the list to a specific status (to-read/reading/done) or a keyword in the title." --title "Status filter and search"` (F002)

**Artifacts:** [`F001/spec.md`](../../examples/reading-list/.lh/features/F001-reading-list-app-scaffold/spec.md), [`F002/spec.md`](../../examples/reading-list/.lh/features/F002-status-filter-and-search/spec.md)

F001's spec has five acceptance criteria (AC-01 through AC-05) covering the list page, the add-item form, the status field's three-value constraint, JSON-file persistence, and a working `pnpm install`/`lint`/`build`. Its constraints call out a scaffolding wrinkle specific to this repo: `create-next-app` refuses to scaffold directly into `examples/reading-list/` because it already contains LeanHarness state (`.lh/`, `.claude/`, `.opencode/`), so the spec requires scaffolding into a throwaway `_scaffold_tmp/` directory first and moving it into place as `web/`.

F002's spec has six acceptance criteria (AC-01 through AC-06) covering the status filter, the text search, combining both as an AND, preserving the no-filter default view, implementing filtering via `searchParams` without touching the API route or JSON store, and a passing lint/build. Its constraints scope the change boundary to `web/app/page.tsx` plus an optional new `web/lib/filter.ts`, explicitly forbidding touches to `web/app/api/items/route.ts`, `web/app/add/page.tsx`, `web/app/layout.tsx`, or build config.

## Step 2: Discover

**Commands:** `lh discover F001 --depth D1`, `lh discover F002 --depth D2`

**Artifacts:** [`F001/discovery.md`](../../examples/reading-list/.lh/features/F001-reading-list-app-scaffold/discovery.md), [`F002/discovery.md`](../../examples/reading-list/.lh/features/F002-status-filter-and-search/discovery.md)

F001's discovery is the visible fingerprint of its greenfield exception: at depth D1 it scanned 3 files and found **zero** likely touch files, because the app being scaffolded doesn't exist yet for keyword-based discovery to find. `plan.md`'s "Unknowns" section documents this explicitly: touch files were seeded manually from the spec, not discovered.

F002's discovery is the normal brownfield case. At depth D2 it scanned 22 files, skipped 6, and found 10 likely touch files with high confidence — `web/app/page.tsx`, `web/lib/store.ts`, `web/lib/types.ts`, `web/app/add/page.tsx`, `web/app/layout.tsx`, `web/app/api/items/route.ts`, and others — plus 10 read-only reference files including `web/data/reading-list.json`. It also triggered the `public_api_break` risk gate (path contains "api"; path contains "routes") because `web/app/api/items/route.ts` matched the pattern, even though the spec explicitly keeps that file read-only. This is a useful lesson on its own — see "Lessons" below.

## Step 3: Plan

**Commands:** `lh plan F001`, `lh plan F002`

**Artifacts:** [`F001/plan.md`](../../examples/reading-list/.lh/features/F001-reading-list-app-scaffold/plan.md) + [`tasks.md`](../../examples/reading-list/.lh/features/F001-reading-list-app-scaffold/tasks.md), [`F002/plan.md`](../../examples/reading-list/.lh/features/F002-status-filter-and-search/plan.md) + [`tasks.md`](../../examples/reading-list/.lh/features/F002-status-filter-and-search/tasks.md)

F001's plan breaks the scaffold into three tasks in one slice: **T01** scaffolds the Next.js project and updates `web/package.json`, `web/tsconfig.json`, `web/next.config.ts`, `web/app/layout.tsx` (covers AC-01, AC-02); **T02** updates `web/app/page.tsx`, `web/app/add/page.tsx`, `web/app/api/items/route.ts`, `web/data/reading-list.json` (covers AC-03, AC-04); **T03** updates `web/lib/store.ts`, `web/lib/types.ts` (covers AC-05). The `new_dependency` risk gate is flagged since a `web/package.json` with Next.js/React dependencies is new.

F002's plan is a single task, **T01**, covering all six acceptance criteria at once: change `web/app/page.tsx` and add `web/lib/filter.ts`, with `web/lib/store.ts`, `web/lib/types.ts`, and `web/data/reading-list.json` listed as read-only reference context (not touch files) — consistent with the spec's constraint against touching persistence.

## Step 4: Build with Claude Code

**Commands:** `lh build F001 --host claude-code --dry-run` (first), then `lh build F001 --host claude-code --permission-mode bypassPermissions`

This is F001's real build. The `--permission-mode bypassPermissions` flag is required for headless (non-interactive) `lh build --host claude-code` runs — Claude Code otherwise waits on an interactive permission prompt that never arrives.

The CaveBus log (`F001/cavebus.log`) shows the real run history for T01: an initial invocation failed (`SUM F001 T01 status:needs-fix ... fail: host exit 1`), caused by the `--cwd` CLI bug described in "Lessons" below; after that bug was fixed, a rerun of the same task succeeded (`SUM F001 T01 status:done ... pass: host exit 0`). T02 and T03 each completed on the first real invocation. Task summaries live under `F001/task-summaries/T01.md`–`T03.md`, with raw host transcripts in `F001/task-context/T01.claude-result.json`–`T03.claude-result.json`.

F002 was also **dry-run** against Claude Code (`lh build F002 --host claude-code --dry-run`) for documentation parity, but its real build ran on OpenCode — see Step 5.

## Step 5: Build with OpenCode

**Commands:** `lh build F002 --host opencode --opencode-agent lh-builder --dry-run` (first), then `lh build F002 --host opencode --opencode-agent lh-builder`

This is F002's real build. `F002/cavebus.log` shows T01 dry-run against `opencode` (`next: dry run (no host invocation)`) before the real invocation, which completed cleanly on the first attempt (`SUM F002 T01 status:done ... pass: host exit 0`). The task summary (`F002/task-summaries/T01.md`) records the actual change: `web/app/page.tsx` gained status filter links and a GET search form reading `searchParams`, and a new `web/lib/filter.ts` was added with a pure `filterItems(items, {status, query})` helper — no changes to the API route or JSON store, matching the spec's constraint.

F001 was also **dry-run** against OpenCode (`lh build F001 --host opencode --opencode-agent lh-builder --dry-run`) for documentation parity, but its real build ran on Claude Code — see Step 4.

## Step 6: Check

**Commands:** `lh check F001`, `lh check F002`

**Artifacts:** [`F001/checks.md`](../../examples/reading-list/.lh/features/F001-reading-list-app-scaffold/checks.md) / [`result.md`](../../examples/reading-list/.lh/features/F001-reading-list-app-scaffold/result.md), [`F002/checks.md`](../../examples/reading-list/.lh/features/F002-status-filter-and-search/checks.md) / [`result.md`](../../examples/reading-list/.lh/features/F002-status-filter-and-search/result.md)

Both features got a **`needs-fix`** verdict, and both are honestly explained rather than hidden:

**F001** — all 5 acceptance criteria passed via task-summary evidence (5/5). Two things kept the verdict at `needs-fix`:
1. `lh check` diffs the whole monorepo working tree, not just `examples/reading-list/`. At the time F001 was checked, this repo's own in-flight pnpm-monorepo restructuring branch was in progress, so the check flagged 26 files outside the boundary (`hosts/claude-code/package.json`, `hosts/opencode/src/index.ts`, etc.) that have nothing to do with F001's actual work.
2. A stale, bare `pnpm run lint` verification command (recorded from before task context knew to `cd web` first) failed in 181ms because it ran from the wrong working directory. The explicitly-approved `cd web && pnpm run lint` and `cd web && pnpm run build` commands **both passed** (exit 0 in 1196ms and 3388ms respectively) — proving the scaffolded app itself lints and builds cleanly.

**F002** — all 6 acceptance criteria passed via task-summary evidence (6/6), and the boundary review status was `pass` (no violations, unlike F001). The verdict stayed at `needs-fix` for the same known artifact class: verification commands (`pnpm --dir web run lint`, `pnpm --dir web run build`, `opencode run --agent lh-builder ...`) were all skipped by `lh check` because they weren't explicitly approved via `--command`, not because they failed. Independently running `pnpm --dir web run lint` and `pnpm --dir web run build` confirms both pass.

In both cases, per this repo's own `CLAUDE.md` rule against marking work done without verification evidence, the honest verdict is `needs-fix` — not a false `pass` dressed up to look clean.

## Step 7: Compress and Inspect CaveBus

**Commands:** `lh compress F001`, `lh cavebus F001 --validate`, `lh compress F002`, `lh cavebus F002 --validate`

**Artifacts:** [`F001/cavebus.log`](../../examples/reading-list/.lh/features/F001-reading-list-app-scaffold/cavebus.log), [`F002/cavebus.log`](../../examples/reading-list/.lh/features/F002-status-filter-and-search/cavebus.log)

Both logs contain the real, non-synthetic sequence of REQ, DISC, PLAN, TASK, SUM, and VERIFY entries generated as each command actually ran — including duplicate DISC/PLAN entries from real iteration (re-running discovery and planning as the spec was refined), and the T01 fail-then-succeed pair in F001 caused by the `--cwd` bug. This is messier than a hand-written static log, and that messiness is itself evidence the log is real.

## Reading the Example Artifacts

Start with each feature's `spec.md` to see what was requested, then `discovery.md` to see what discovery actually found (or, for F001, why it found nothing). Read `plan.md` and `tasks.md` for the task breakdown, then `task-summaries/` and `task-context/*.claude-result.json` / `*.opencode-result.json` for what the agent actually did. Finish with `checks.md` and `result.md` for the verdict and its evidence — read these critically, since both verdicts are `needs-fix` and the artifacts explain exactly why.

The event logs (`events.jsonl` in each feature directory) provide a machine-readable timeline.

## Lessons

1. **A dedicated greenfield exception can still produce a real feature run.** F001 has no discovery hits and manually-seeded touch files, but every downstream artifact — plan, build, check — is still real. Greenfield and "real" are orthogonal; the `docs/dogfooding.md` "avoid greenfield" guidance is about learning value for brownfield discovery, not about whether a run is genuine.
2. **`lh check`'s whole-repo diff is a known sharp edge in a monorepo.** Both features' `needs-fix` verdicts are dominated by files changed by unrelated, concurrent monorepo-restructuring work, not by anything F001 or F002 did. Read `checks.md`'s "Changed Files" and "Boundary Review" sections critically before trusting the verdict at face value.
3. **Skipped verification commands are not failures.** `lh check` skips any command not pre-approved via `--command`, by design (a safety default, not a bug). F002's checks.md shows this clearly: every verification command reads `skipped`, yet the acceptance criteria all passed on task-summary evidence, and independently running the same commands with explicit `--command` flags confirms they pass.
4. **Risk gates can pattern-match on paths that are never touched.** F002's discovery triggered `public_api_break` because `web/app/api/items/route.ts` matched `path contains "api"` — even though that file was correctly kept read-only per the spec's own constraint. The final check found no risk gates triggered once `web/app/api/items/route.ts` was confirmed untouched, showing the gate's discovery-time signal was a conservative early warning, not a violation.
5. **Two real CLI bugs surfaced from just two feature runs, and dogfooding caught them.** The Claude Code adapter was passing an unsupported `--cwd` flag (visible in F001's cavebus.log as a first-attempt `host exit 1`, fixed, then rerun to `host exit 0`), and the task-context field-header regex didn't allow hyphens in labels like "Read-only context:". Both are fixed and changesetted — exactly the kind of friction `docs/dogfooding.md` says dogfooding should surface.
6. **Honest verdicts matter more than clean-looking ones.** Both features could have been marked `pass` by only reporting acceptance-criteria evidence. Recording `needs-fix` alongside the explicit lint/build evidence that proves the app works is the correct, and more useful, artifact.
