# Release Checklist

## Scope

This checklist covers the steps to validate, package, and publish a LeanHarness release. Follow it in order.

## Pre-release checks

- [ ] All features planned for this release are complete
- [ ] No known blocking bugs
- [ ] A changeset file exists for each releasable change (`.changeset/*.md`)
- [ ] `src/core/version.ts` resolves the package version correctly
- [ ] `NPM_TOKEN` secret is configured in GitHub repository secrets

## Local validation

```bash
npm install
npm run build
npm run typecheck
npm test
```

All must pass with zero errors.

## Documentation validation

- [ ] `README.md` reflects current capabilities
- [ ] `docs/commands.md` documents all implemented commands
- [ ] `docs/configuration.md` covers all configuration surfaces
- [ ] `docs/installation.md` has accurate setup instructions
- [ ] No placeholder text (`TODO`, `TBD`, `fill this in`) in docs
- [ ] No claims of production maturity or npm publication if not yet published
- [ ] Doc links resolve to existing files

Quick check:

```bash
grep -RIn "TODO\|TBD\|fill this in" README.md docs CHANGELOG.md CONTRIBUTING.md || echo "No placeholders found"
```

## Package validation

```bash
npm run pack:dry-run
```

Verify the output includes:

- `dist/index.js` (compiled entry point)
- `README.md`
- `LICENSE`
- `CHANGELOG.md`
- `docs/` directory
- `.lh/templates/`
- `.lh/protocols/`
- `.lh/policies/`

Verify the output does NOT include:

- `node_modules/`
- `coverage/`
- `.env`
- `src/` (TypeScript source — only `dist/` ships)
- Temporary or generated test artifacts

Inspect:

```bash
npm pack --dry-run 2>&1 | grep -E "README|LICENSE|CHANGELOG|dist/index|docs/|\.lh/"
```

## Security and safety review

- [ ] No secrets, credentials, or API keys in committed files
- [ ] No `.env` files committed
- [ ] Hook scripts do not execute arbitrary user input
- [ ] Guardrail policies are conservative by default
- [ ] No runtime dependencies added

## Versioning

LeanHarness uses semantic versioning once releases begin:

- **0.x.y** — pre-stable releases for dogfooding
- **Major** — breaking changes to CLI commands, adapter interface, or artifact format
- **Minor** — new features, new commands, new adapters
- **Patch** — bug fixes, documentation improvements

## Changelog

`CHANGELOG.md` is managed automatically by Changesets during the release PR flow.

## Git checklist

Review the state before creating a release PR:

```bash
git status --short
git diff
git log --oneline -5
```

- [ ] Working directory clean
- [ ] All changes committed
- [ ] Changeset files are included in merged PRs

Do not use `git push --force`.

## npm publishing checklist

Run the full validation:

```bash
npm run release:check
```

This runs build, typecheck, test, and pack dry-run in sequence.

Publishing is automated by `.github/workflows/release.yml` through `changesets/action`:

1. Pushes to `main` create or update a "Version Packages" release PR.
2. Merging that release PR automatically:
   - bumps package version(s),
   - creates git tag(s),
   - creates GitHub Release entries,
   - publishes to npm using `NPM_TOKEN`.

## Post-release checks

After publishing:

- [ ] `npm info @feneto/lh` shows correct version
- [ ] `npx @feneto/lh --help` works
- [ ] `CHANGELOG.md` includes the generated release entry
- [ ] Git tag was created automatically on the release commit

## Rollback notes

If a published release has a critical issue:

1. Fix the issue in a new patch version
2. Publish the patch: `npm publish --access public`
3. Deprecate the broken version: `npm deprecate @feneto/lh@X.Y.Z "critical issue, use X.Y.Z+1"`

Do not unpublish unless absolutely necessary. npm unpublish has a 72-hour window and breaks downstream consumers.
