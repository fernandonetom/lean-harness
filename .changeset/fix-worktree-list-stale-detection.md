---
"@feneto/lh": patch
---

Fixed `lh worktree list` reporting a worktree as `linked` instead of `stale` when its directory was deleted without running `git worktree remove`/`prune` first. `git worktree list --porcelain` can keep listing such a worktree until it's explicitly pruned, and that behavior was observed to vary across git versions/platforms (surfaced as a CI-only test failure on Linux/git 2.54.0 that didn't reproduce locally). Staleness is now determined by whether the worktree's directory actually still exists on disk, not solely by whether git's own bookkeeping still lists it.
