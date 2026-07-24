---
description: Prepare and publish a LeanHarness release. Check diff against main, run changeset, ask for version, commit, push, open a PR, wait for CI, and guide through the automated changesets/action release pipeline.
agent: lh-builder
---

# lh-release

## Purpose

Prepare and publish a LeanHarness release end-to-end through the changesets/action pipeline.

## Release Pipeline Overview

The release pipeline uses [Changesets](https://github.com/changesets/changesets) with the `changesets/action@v1` GitHub Action:

```
Feature branch (with .changeset/*.md)
  → Push → CI runs
  → Create PR → CI on PR + changeset check
  → Merge PR (rebase) → CI on main
  → changesets/action creates "Version Packages" PR
  → CI on version PR
  → Merge version PR → auto-publish to npm + GitHub Release
```

## Prerequisites

- Git repository with a `main` branch
- `changesets` configured in the project
- `gh` CLI authenticated and available
- Clean working tree (no uncommitted changes)
- `NPM_TOKEN` configured in GitHub repository secrets (for auto-publish)

## Steps

### Step 1: Validate Environment

```bash
npm run build && npm run typecheck && npm test
```

Then check:

- Working tree is clean: `git status` should show no changes
- `main` branch exists locally: `git branch --list main`
- `npm run changeset` is available in `package.json`
- `gh` CLI is installed and authenticated: `gh auth status`

If any check fails, report the issue and do not proceed.

### Step 2: Fetch Latest Main

```bash
git fetch origin main
```

### Step 3: Analyze Commits Since Main

```bash
git log origin/main..HEAD --oneline
git diff --stat origin/main
```

Read `CHANGELOG.md` to understand the current state and last release version.

### Step 4: Determine Recommended Version

Based on commit analysis, recommend a version bump:

- **patch** (recommended) — bug fixes, patches, documentation improvements, internal refactors
- **minor** — new features, backward-compatible changes
- **major** — breaking changes, significant architectural changes, removed features

Look for:
- `BREAKING CHANGE:` in commit messages or PR bodies → major
- `feat:` prefixed commits → minor
- `fix:`, `chore:`, `docs:`, `refactor:` prefixes → patch

### Step 5: Ask User for Version

Present the analysis and recommend a version. Ask the user to confirm or choose a different version.

### Step 6: Run Changeset

```bash
npm run changeset
```

Follow the changeset CLI prompts:
- Select packages/modules affected
- Choose version bump type
- Write a concise summary for each changed package

If no changesets exist and none are needed, inform the user and abort.

### Step 7: Commit and Push

```bash
git add .changeset/
git commit -m "chore: add changeset"
git push origin HEAD
```

### Step 8: Create Pull Request

```bash
gh pr create --base main --title "Release v<VERSION>" --body "$(generate_pr_body)"
```

Generate the PR body from the changeset files and changelog entries.

**If a `.github/PULL_REQUEST_TEMPLATE.md` exists, use it and append release notes.**

### Step 9: Wait for CI on PR

Monitor the PR checks:

```bash
gh pr checks --watch
```

Required checks (from `.github/workflows/ci.yml`):
- Build & Test (Node 22 and 24)
- Changeset Check (verifies `.changeset/*.md` files exist)

If CI fails, fix the issues, amend, and force-push. Do NOT proceed with failing checks.

### Step 10: Merge PR (Rebase)

```bash
gh pr merge --rebase --delete-branch
```

**Always use `--rebase`** to preserve the changeset files in the commit history. Do NOT squash or create a merge commit.

### Step 11: Wait for CI on Main

```bash
gh run list --branch main --limit 5
gh run watch <run-id>
```

Wait for the CI workflow on main to complete successfully.

### Step 12: Monitor for Version Packages PR

After CI on main passes, the `changesets/action@v1` (`.github/workflows/release.yml`) will automatically:

1. Consume all `.changeset/*.md` files
2. Update `CHANGELOG.md` and bump version in `package.json`
3. Delete consumed changeset files
4. Create or update a **"Version Packages" PR**

Monitor for this PR:

```bash
gh pr list --search "Version Packages" --state open
```

### Step 13: Check Version Packages PR

Inspect the version PR:

```bash
gh pr view <version-pr-number>
```

Verify:
- `package.json` version is bumped correctly
- `CHANGELOG.md` entry is accurate
- Changeset files are consumed (deleted)

### Step 14: Wait for CI on Version PR

```bash
gh pr checks <version-pr-number> --watch
```

### Step 15: Merge Version PR

```bash
gh pr merge <version-pr-number> --rebase --delete-branch
```

After merging, the `changesets/action` workflow runs on main and automatically:

- Creates a git tag
- Creates a GitHub Release with release notes
- Publishes to npm via `NPM_TOKEN`

### Step 16: Verify Release

```bash
npm info @feneto/lh version
```

```bash
gh release list --limit 3
```

Confirm the version matches and the npm package and GitHub Release are live.

If publishing fails (e.g., missing `NPM_TOKEN`), fix the secret and re-run the release workflow manually.

## PR Template

Create a PR description using this template:

```
## Release Summary

[Generated from changeset]

## Changes

[Bullet list of changes from changeset]

## Checklist

- [ ] Tests pass
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Documentation updated (if applicable)
- [ ] CHANGELOG updated
```

If a `.github/PULL_REQUEST_TEMPLATE.md` exists, use it and append release notes.

## Error Handling

- **No changesets generated:** Inform the user that no version bump is needed.
- **Git conflicts:** Report and suggest resolving before proceeding. Re-run `git fetch origin main` and rebase.
- **PR creation fails:** Report the error and provide the PR link manually.
- **gh CLI not authenticated:** Prompt the user to run `gh auth login`.
- **CI fails:** Do NOT proceed. Fix the issues, amend the commit, and re-push.
- **Version Packages PR not created:** The `changesets/action` workflow may not have triggered. Check `.github/workflows/release.yml` for `NPM_TOKEN` and GitHub Action permissions (`contents: write`, `pull-requests: write`).

## Rules

- Do not proceed if the working tree is not clean.
- Always run `npm run build && npm run typecheck && npm test` before creating a changeset.
- Do not force-push during release.
- Preserve all changeset content exactly as generated.
- Do not skip the PR description — it must include release notes.
- If the PR template already exists, respect its structure and append release content.
- **Never skip CI waiting steps** — a release with failing CI is not valid.
- **Use `--rebase` for all merges** to preserve changeset files in the commit graph.
