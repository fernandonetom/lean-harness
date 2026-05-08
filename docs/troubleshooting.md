# Troubleshooting

## CLI does not run

```bash
node dist/index.js --help
```

If this fails:

- Check Node.js version: `node --version` (must be 20+)
- Rebuild: `npm run build`
- Verify build output: `ls dist/index.js`
- Check TypeScript errors: `npm run typecheck`

If using `npm link` and `lh` is not found:

```bash
npm link
which lh
```

## Build fails

```bash
npm run build
```

Common causes:

- Missing `node_modules/`: run `npm install`
- TypeScript version mismatch: check `devDependencies` in `package.json`
- Import path errors: ensure `.js` extensions in imports (ESM requirement)

## Typecheck fails

```bash
npm run typecheck
```

Typecheck runs `tsc --noEmit`. It catches type errors without producing output files. Fix all errors before proceeding.

## Tests fail

```bash
npm test
```

- Check test output for specific failures
- Ensure `npm run build` succeeds first (some tests may depend on compiled output)
- Run individual test files: `npx vitest run tests/core/fs.test.ts`
- Run in watch mode for faster iteration: `npm run test:watch`

## `lh init` did not install host files

Verify which host was specified:

```bash
lh init --host all        # both hosts
lh init --host claude-code
lh init --host opencode
```

If files exist but need regeneration:

```bash
lh init --host all --force
```

Check the expected files:

```bash
ls .claude/settings.json .claude/skills/ .claude/agents/ .claude/hooks/
ls opencode.json .opencode/agents/ .opencode/plugins/
```

## Claude Code CLI not found

```bash
claude --version
```

If not found:

- Install Claude Code CLI separately (LeanHarness does not manage Claude Code installation)
- Ensure `claude` is in your PATH
- Use `--claude-command <path>` to specify a custom path

`lh doctor` will report Claude Code availability.

## OpenCode CLI not found

```bash
opencode --version
```

If not found:

- Install OpenCode CLI separately (LeanHarness does not manage OpenCode installation)
- Ensure `opencode` is in your PATH
- Use `--opencode-command <path>` to specify a custom path

`lh doctor` will report OpenCode availability.

## `lh discover` finds no files

- Check that `spec.md` exists: `lh show F001`
- Try a deeper discovery: `lh discover F001 --depth D3`
- Add hint paths: `lh discover F001 --hint src/auth --hint src/email`
- Increase max files: `lh discover F001 --max-files 50`
- Verify the project has source files in the expected locations

## `lh plan` says discovery is missing

Plan requires both `spec.md` and `discovery.md`:

```bash
lh discover F001 --depth D2
lh plan F001
```

To create a draft plan from spec only (without discovery):

```bash
lh plan F001 --from-spec
```

## `lh build` refuses to run

Common reasons:

- No plan exists: run `lh plan F001` first
- No host specified: use `--host claude-code` or `--host opencode`
- Host CLI not found: install the host CLI or use `--<host>-command <path>`
- All tasks already completed: use `--all` to re-run, or `--force`

Always try dry-run first:

```bash
lh build F001 --host claude-code --dry-run
```

## `lh check` does not pass

Read the check output:

```bash
lh show F001
```

Common reasons for `needs-fix`:

- Acceptance criteria lack evidence (no task summaries, no test results)
- Verification commands failed
- Boundary violations detected
- Build was dry-run only (no execution evidence)

Actions:

- Fix the issues and re-build: `lh build F001 --host claude-code`
- Re-run check: `lh check F001 --force`
- Run with explicit commands: `lh check F001 --command "npm test"`
- Use `--run` to execute safe verification commands: `lh check F001 --run`

## CaveBus validation warnings

```bash
lh cavebus F001 --validate
```

Common warnings:

- Protected tokens modified or missing
- Failures or blockers dropped during compression
- Unknown message types

Fix:

- Re-compress: `lh compress F001 --force`
- Use strict mode: `lh cavebus F001 --validate --strict`

## Boundary violations

Boundary violations occur when an agent edits files outside the approved change boundary.

- Check the boundary: `cat .lh/features/F001-*/boundary.json`
- Expand discovery: `lh discover F001 --depth D3`
- Add hint paths for missed files: `lh discover F001 --hint src/new-module`

## Risk gates

Risk gates trigger when changes touch security-sensitive, payment, auth, or other high-risk areas.

- Review the triggered gate in check output
- Approve by acknowledging the risk and proceeding
- Risk gate definitions are in `.lh/policies/risk-gates.yml`

## Permission or guardrail blocks

**Claude Code:** Review `.claude/settings.json`. Add safe read-only commands to the allow list.

**OpenCode:** Review `opencode.json` permissions. Check `.opencode/plugins/leanharness-guardrails.js` for boundary blocks.

Guardrails are best-effort. The final completion gate is `lh check`.

## Recovering from bad artifacts

If feature artifacts are inconsistent:

```bash
lh doctor                        # overall health check
lh show F001                     # inspect feature state
lh discover F001 --depth D2      # regenerate discovery and boundary
lh check F001 --force            # re-run verification
```

If `state.json` is corrupted, delete it and run `lh status` — the CLI rebuilds it from feature folders.

Do not delete `.lh/` unless you want to lose all feature artifacts, templates, and policies. If you must start over:

```bash
lh init --host all --force
```

This regenerates integration files but does not restore deleted feature artifacts.

## Watch mode not detecting changes

- Verify boundary.json exists: `lh show F001`
- Check that boundary lists files: `cat .lh/features/F001-*/boundary.json | grep touch`
- Ensure files are in watched directories (watch uses directory-level `fs.watch`)
- On macOS: `fs.watch` has per-process file descriptor limits. Large boundaries may hit limits.
- Try re-running discovery to refresh the boundary: `lh discover F001`

## Model override not working

- `--model` only overrides `models.agent` from config, not `models.subagent`
- Verify config: check `models` section in `.lh/config.yml`
- `auto` means use host default (no override sent to agent CLI)
- Model string passed directly to host CLI — verify the model name is valid for your host

## Plugin not loading

- Plugin must be in `.lh/plugins/<name>/`
- Must have `plugin.json` with `name`, `version`, `main` fields
- `main` defaults to `index.js` if omitted in manifest
- Plugin must export an object matching `LHPlugin` interface
- Check `lh doctor` for plugin loading errors

## `lh update` lost my changes

Update preserves user config by merging. If something was lost:

- Config keys you added are preserved; only new LH-managed keys are added
- Integration files (skills, hooks, agents) are fully regenerated
- If you customized a skill or hook, back it up before running `lh update`

## Reporting issues

When reporting a problem:

1. Include the command you ran and its full output
2. Include `lh doctor` output
3. Include Node.js version: `node --version`
4. Include OS: `uname -a` or equivalent
5. Do not include secrets, credentials, or `.env` contents
