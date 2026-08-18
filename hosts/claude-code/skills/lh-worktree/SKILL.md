---
name: lh-worktree
description: Set up or tear down an isolated git worktree for a LeanHarness feature, following the feature/<id>-<slug> branch and .worktrees/ directory conventions, and record/clear the result in .lh/state.json via `lh worktree link`/`unlink`. Use when lh-build's Worktree Setup step needs a worktree, or when the user asks to create/remove/clean up a worktree for a feature.
---

# lh-worktree

## Purpose

Create (or remove) an isolated git worktree for a single LeanHarness feature, and record the outcome in `.lh/state.json` so `lh build` can find it. All git operations, install/test setup, and `.lh/` visibility live here — the CLI only ever writes the final `worktreePath`/`worktreeBranch` record via `lh worktree link`/`unlink`.

**Announce at start:** "Using the lh-worktree skill to set up an isolated workspace for `<feature-id>`."

## Inputs

A feature ID or slug (e.g. `F001`), resolved the same way `lh` resolves feature refs. Optionally `--remove` (or a natural-language request to remove/clean up) to run in removal mode instead — see Step 6.

## Step 0: Detect Existing Isolation

Run from the harness root:

```bash
lh worktree list --json
```

If this feature already has an entry with `status: "linked"`, report its `worktreePath`/branch and stop — nothing to create.

Then check whether the current session is *already* inside a linked worktree (and it's for this feature):

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
git rev-parse --show-superproject-working-tree 2>/dev/null  # non-empty output = submodule, not a worktree
```

If `GIT_DIR != GIT_COMMON` and it's not a submodule, you're already isolated — skip to Step 4 (Install + Baseline Test) if setup hasn't run yet, otherwise stop.

## Step 1: Resolve Branch and Path

1. Look up the feature's id/slug (e.g. from `.lh/features/<id>-<slug>/` or `lh status <id> --json` if available) — do not guess the slug.
2. `branch = feature/<id>-<slug>` (do not deviate from this convention unless the user explicitly asked for a different branch name).
3. Directory priority — explicit user preference first, then existing convention, then default:
   ```bash
   ls -d .worktrees 2>/dev/null   # preferred if present
   ls -d worktrees 2>/dev/null    # alternative if present
   ```
   If neither exists, default to `.worktrees/`. If both exist, `.worktrees` wins.
4. `dirName` = branch with every `/` replaced by `-` (e.g. `feature/F001-x` → `feature-F001-x`).
5. `target = <worktrees-dir>/<dirName>`.

## Step 2: Verify `.gitignore`

```bash
git check-ignore -q <worktrees-dir>
```

If not ignored: append a `# LeanHarness worktrees\n<worktrees-dir>/\n` block to `.gitignore`, then `git add .gitignore && git commit -m "chore: ignore <worktrees-dir>/ (leanharness worktrees)"`. If the commit fails (detached HEAD, no permissions, whatever), warn and continue anyway — never let this block worktree creation.

## Step 3: Create the Worktree

```bash
git show-ref --verify --quiet refs/heads/<branch>   # decide -b vs plain checkout
git worktree add <target> [-b <branch>] [<branch> if it already exists]
```

**Sandbox fallback:** if this fails with a permission error, tell the user the sandbox blocked worktree creation and ask (via `AskUserQuestion`) whether to build in the main tree instead.

**Do not use a native `EnterWorktree(name:)`-style tool to create this worktree.** That mode hardcodes its own directory (typically under `.claude/worktrees/`) and mints its own branch name — it silently breaks both the `feature/<id>-<slug>` and `.worktrees/` conventions this skill and the rest of LeanHarness depend on. Raw `git worktree add` is correct here.

Once the worktree exists, you may optionally call `EnterWorktree({ path: <absolute target> })` purely to switch the session's cwd there for convenience. Skip this silently if the tool errors or isn't available — OpenCode has no equivalent, and this skill must work on both hosts.

## Step 4: Link `.lh/` Shared State

`.lh/features` and `.lh/state.json` are gitignored, so a fresh worktree checkout won't have them. Make them visible:

```bash
mkdir -p <target>/.lh
ln -s <harness-root>/.lh/features <target>/.lh/features
ln -s <harness-root>/.lh/state.json <target>/.lh/state.json
```

Symlinks require elevated privileges on Windows — if this fails (any platform), warn the user and tell them to pass `--cwd <harness-root>` to any `lh` command they run from inside the worktree instead. Do not treat a symlink failure as fatal.

## Step 5: Install + Baseline Test

Detect and run, in `<target>`, based on file presence (first match wins):

| File present | Install | Test |
|---|---|---|
| `package-lock.json` | `npm ci` | `npm test` (or the `scripts.test` runner) |
| `pnpm-lock.yaml` | `pnpm install` | `pnpm test` |
| `yarn.lock` | `yarn install` | `yarn test` |
| `bun.lockb` | `bun install` | `bun test` |
| `Cargo.toml` | `cargo fetch` | `cargo test` |
| `go.mod` | `go mod download` | `go test ./...` |
| `pyproject.toml` + `poetry.lock` | `poetry install` | `poetry run pytest` |

If no baseline test command is detected, skip and note it. If the baseline test **fails**, report the failure to the user before any task work starts and ask whether to continue — a red baseline makes later failures ambiguous.

## Step 6: Record State

The only CLI call in this whole flow that touches `.lh/state.json`:

```bash
lh worktree link <feature-id> --path <target> --branch <branch> --json
```

## Step 7: Report

```
Worktree ready at <target>
Branch: <branch>
Tests passing (<N> tests, 0 failures)   [or: baseline test skipped/failed — see above]
Harness root: <harness-root>
```

Match `lh-build`'s existing convention of "Work root" (`<target>`) vs "Harness root" (main repo) so the caller can keep them distinct for the rest of the session.

## Removal Mode

When asked to remove/clean up a feature's worktree:

1. Resolve the path via `lh worktree list --json`.
2. If you entered this worktree with `EnterWorktree(path:)` in Step 3, call `ExitWorktree({ action: "keep" })` first — `ExitWorktree`'s `remove` action only works for worktrees it created via `name:`, not ones you entered by `path:`.
3. `git worktree remove [--force] <path>`
4. `git worktree prune`
5. Optionally `git branch -d/-D <branch>` if the user asked to delete the branch too.
6. `lh worktree unlink <feature-id> --json` — always run this after step 3, even if the branch delete is skipped, so the state record doesn't go stale.

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "There's a native `EnterWorktree` tool, just use it for creation" | Its `name:` mode owns its own directory/branch naming, breaking the `.worktrees/`/`feature/<id>-<slug>` conventions this skill (and `lh build`'s gate) depend on. Use raw `git worktree add`, and `EnterWorktree(path:)` only afterward, for cwd convenience. |
| "`lh worktree create` still exists" | It doesn't — this skill replaces it. Only `lh worktree link`/`list`/`unlink` remain, and they do no git work themselves. |
| "Skip `.lh/` symlinking, the agent can just `--cwd` everywhere" | True as a fallback, but always attempt the symlinks first — most tasks are much smoother when `.lh/features`/`state.json` are visible directly inside the worktree. |
| "The worktree directory is surely ignored already" | Run `git check-ignore` anyway. An unignored worktrees directory risks committing the whole nested checkout. |
| "Skip the baseline test, we're in a hurry" | A dirty baseline makes every later test failure ambiguous — run it and report, then let the user decide whether to proceed past a red baseline. |
