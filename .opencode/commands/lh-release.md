---
description: Prepare and publish a LeanHarness release. Check diff against main, run changeset, ask for version, commit, push, and open a PR with the release notes.
agent: lh-builder
---

# lh-release

## Purpose

Prepare and publish a LeanHarness release end-to-end:

1. Check diff between main branch and current branch
2. Run `npm run changeset` to generate release notes from commits
3. Ask user which version to release (major, minor, patch) with a recommendation
4. Commit, push, and open a pull request using the PR template

## Prerequisites

- Git repository with a `main` branch
- `changesets` configured in the project
- `gh` CLI authenticated and available
- Clean working tree (no uncommitted changes)

## Workflow

### Step 1: Validate Environment

Check the following before proceeding:

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

Run:

```bash
git log origin/main..HEAD --oneline
git diff --stat origin/main
```

Read `CHANGELOG.md` to understand the current state and last release version.

### Step 4: Determine Recommended Version

Based on commit analysis, recommend a version bump:

- **patch** (recommended) — bug fixes, patches, documentation improvements, internal refactors
- **minor** — new features, backward-compatible changes, minor breaking changes with clear migration path
- **major** — breaking changes, significant architectural changes, removed features

Look for:
- `BREAKING CHANGE:` in commit messages or PR bodies → major
- New feature commits or `feat:` prefixed commits → minor
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
git commit -m "chore: version bump"
git push origin HEAD
```

### Step 8: Create Pull Request

```bash
gh pr create --base main --title "Release v<VERSION>" --body-file <(generate_pr_body)
```

Generate the PR body from the changeset files and changelog entries.

### Step 9: Open the PR

Ensure the PR is created and provide the URL to the user.

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
- **Git conflicts:** Report and suggest resolving before proceeding.
- **PR creation fails:** Report the error and provide the PR link manually.
- **gh CLI not authenticated:** Prompt the user to run `gh auth login`.

## Rules

- Do not proceed if the working tree is not clean.
- Do not force-push during release.
- Preserve all changeset content exactly as generated.
- Do not skip the PR description — it must include release notes.
- If the PR template already exists, respect its structure and append release content.