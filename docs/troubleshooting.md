# Troubleshooting

## CLI does not run

```bash
node packages/cli/dist/index.js --help
```

If this fails:

- Check Node.js version: `node --version` (must be 20+)
- Rebuild: `pnpm -r run build` (builds `hosts/opencode` before `packages/cli`, since the CLI vendors OpenCode's built output — a stale `hosts/opencode/dist/` means stale vendored content)
- Verify build output: `ls packages/cli/dist/index.js`
- Check TypeScript errors: `pnpm -r run typecheck`

If using `npm link` and `lh` is not found:

```bash
pnpm --filter @feneto/lh exec npm link
which lh
```

## Build fails

```bash
pnpm -r run build
```

Common causes:

- Missing `node_modules/`: run `pnpm install` from the repo root (this is a pnpm workspace — `npm install` will not set up cross-package symlinks correctly)
- TypeScript version mismatch: check `devDependencies` in the relevant package's `package.json` (`packages/cli/`, `hosts/opencode/`, `hosts/claude-code/`)
- Import path errors: ensure `.js` extensions in imports (ESM requirement)
- `hosts/opencode` not built yet: `packages/cli`'s build vendors its *built* `dist/`, so build it first — `pnpm -r run build` handles ordering automatically, but `pnpm --filter @feneto/lh run build` alone will fail if `hosts/opencode/dist/` doesn't exist

## Typecheck fails

```bash
pnpm -r run typecheck
```

Typecheck runs `tsc --noEmit` per package. It catches type errors without producing output files. Fix all errors before proceeding. Scope to one package with `pnpm --filter @feneto/lh run typecheck`.

## Tests fail

```bash
pnpm -r run test
```

- Check test output for specific failures
- Ensure `pnpm -r run build` succeeds first (some tests may depend on compiled output)
- Run individual test files: `pnpm --filter @feneto/lh exec vitest run tests/core/fs.test.ts`
- Run in watch mode for faster iteration: `pnpm --filter @feneto/lh run test:watch`

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

Check the expected files. For Claude Code, `lh init` only writes `.claude/settings.json` (skills, agents, and hooks come from the plugin, not from `lh init` — see [docs/hosts/claude-code.md](hosts/claude-code.md)):

```bash
ls .claude/settings.json
lh doctor    # reports whether the Claude Code plugin is enabled
ls opencode.json .opencode/agents/
```

`.opencode/plugins/` only exists if you passed `--local-plugin`; by default the guardrail plugin is the npm-published `@feneto/lh-opencode` package registered in `opencode.json`'s `"plugin"` array (see [docs/hosts/opencode.md](hosts/opencode.md)).

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

**OpenCode:** Review `opencode.json` permissions. The guardrail plugin enforcing boundary blocks is `@feneto/lh-opencode` (npm-installed by default) or, with `--local-plugin`, `.opencode/plugins/leanharness-guardrails.js`.

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

This regenerates `.lh/` scaffold files and host-neutral project settings, but does not restore deleted feature artifacts, and does not reinstall the Claude Code plugin — reinstall that separately with `/plugin install lh@lean-harness` if needed.

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
- `.lh/` policy YAML and `state.json` are preserved across update, not overwritten
- Claude Code skills, subagents, and hooks come from the installed plugin, not from `lh update` — `lh update` only touches `.claude/settings.json` for that host
- OpenCode's `.opencode/{agents,commands,plugins}/` files are **not** refreshed by `lh update` — re-run `lh init --host opencode --force` to pick up new agent/command templates
- If you're on a v1.x layout with skills/agents/hooks generated directly into `.claude/`, `lh update` delegates to `lh migrate` instead of regenerating them — see [docs/migration.md](migration.md)

## Reporting issues

When reporting a problem:

1. Include the command you ran and its full output
2. Include `lh doctor` output
3. Include Node.js version: `node --version`
4. Include OS: `uname -a` or equivalent
5. Do not include secrets, credentials, or `.env` contents
