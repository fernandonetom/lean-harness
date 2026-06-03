---
name: lh-release
description: Prepare and publish a LeanHarness release. Validate environment, check tests and docs, run changeset, ask for version, commit, push, and open a PR with release notes.
disable-model-invocation: true
---

# lh-release

## Purpose

Prepare and publish a LeanHarness release end-to-end:

1. Validate environment (git, changeset, gh CLI)
2. Fetch and analyze commits since main
3. Recommend version bump based on commit types
4. Run typecheck and tests to ensure codebase is green
5. Check documentation updates for new features
6. Run `npm run changeset` to generate release notes
7. Commit, push, and open a pull request

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

Present the analysis and recommend a version. Ask the user to confirm or choose a different version using the AskUserQuestion tool.

### Step 6: Validate Codebase

Before proceeding with the release, run validation checks:

```bash
npm run build
npm run typecheck
npm test
```

**If any check fails:** Report the failures and do not proceed with the release. Fix issues first.

**Check for hardcoded versions in tests:** Look for patterns like `version: "1.x.x"` in test files that should use `getVersion()`:

```bash
grep -r 'version: "1\.[0-9]' tests/
```

If tests have hardcoded versions, report them and suggest using `getVersion()` from `src/core/version.js`.

### Step 7: Check Documentation Updates

When commits include new features or behavior changes, verify documentation was updated:

**Check README:**
- Version number matches current version in `package.json`
- New features are mentioned in Status section
- Removed features are no longer claimed

```bash
grep '"version"' package.json
head -10 README.md
```

**Check relevant docs:**
- New CLI commands documented in `docs/commands.md`
- New config options documented in `docs/configuration.md`
- New safety features documented in `docs/security.md`

If documentation is missing, report it as a required fix before release.

### Step 8: Run Changeset

```bash
npm run changeset
```

Follow the changeset CLI prompts:
- Select packages/modules affected
- Choose version bump type
- Write a concise summary for each changed package

If no changesets exist and none are needed, inform the user and abort.

**Note:** If the changeset CLI hangs on interactive prompts, create the changeset file manually:

```bash
# Create .changeset/<name>.md with content like:
# ---
# "@feneto/lh": minor
# ---
# Description of changes
```

### Step 9: Commit and Push

Create a feature branch for the release (repository requires PRs):

```bash
# Get current version for branch name
VERSION=$(grep '"version"' package.json | cut -d'"' -f4)

# Create release branch
git checkout -b release/v$VERSION

# Add and commit changeset
git add .changeset/
git commit -m "chore: version bump"

# Push to remote
git push -u origin HEAD
```

### Step 10: Create Pull Request

```bash
gh pr create --base main --title "Release v<VERSION>" --body-file <(generate_pr_body)
```

Generate the PR body from the changeset files and changelog entries.

### Step 11: Open the PR

Ensure the PR is created and provide the URL to the user.

## PR Template

Create a PR description using this template:

```
## Release Summary

[Generated from changeset]

## Changes

[Bullet list of changes from changeset]

## Validation

- [ ] `npm run build` passes
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes (all tests, no hardcoded versions)
- [ ] Documentation updated for new features
- [ ] README version and features are current
- [ ] CHANGELOG updated (via changesets)

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
- **Typecheck fails:** Report the errors and do not proceed.
- **Tests fail:** Report the failures and do not proceed.
- **Hardcoded versions in tests:** Report the files and suggest using `getVersion()`.
- **Documentation missing:** Report the missing docs and do not proceed with release.

## Rules

- Do not proceed if the working tree is not clean.
- Do not force-push during release.
- Preserve all changeset content exactly as generated.
- Do not skip the PR description — it must include release notes.
- If the PR template already exists, respect its structure and append release content.
- **Always create a feature branch** — repository requires PRs, never push directly to main.
- **Run typecheck and tests** — codebase must be green before release.
- **Check documentation** — new features must be documented.
- **No hardcoded versions in tests** — use `getVersion()` for dynamic version checking.

## Testing Release Changes

Before releasing, verify the test fixes work:

```bash
npm test  # Should pass without hardcoded version failures
```

If tests fail due to hardcoded versions:
1. Find files with hardcoded versions: `grep -r 'version: "1\.' tests/`
2. Replace with `getVersion()`: `import { getVersion } from "../../src/core/version.js";`
3. Change assertions from `version: "1.2.1"` to `version: "' + getVersion() + '"`

## Claude Code vs OpenCode

This workflow works for both Claude Code and OpenCode agent hosts:

- **Claude Code:** Use `/lh-release` skill
- **OpenCode:** Use `/lh-release` command

Both invoke the same workflow. The agent handles the git operations and CLI commands.