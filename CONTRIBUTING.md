# Contributing to LeanHarness

## Project status

LeanHarness v1.0.0 is the first stable release. Contributions are welcome, especially bug reports, documentation improvements, and adapter contributions.

## Development setup

```bash
git clone <repository-url>
cd LeanHarness
npm install
npm run build
npm run typecheck
npm test
```

Requires Node.js 20 or later.

## Useful commands

```bash
npm run build          # Compile TypeScript to dist/
npm run typecheck      # Type-check without emitting
npm test               # Run test suite
npm run test:watch     # Run tests in watch mode
npm run test:coverage  # Run tests with coverage (requires v8 provider)
node dist/index.js doctor   # Check local setup health
node dist/index.js --help   # Show CLI help
```

If you link the CLI locally:

```bash
npm link
lh --help
lh doctor
```

## Repository structure

```
LeanHarness/
├── src/                          # TypeScript source
│   ├── cli.ts                    # CLI argument parser and dispatcher
│   ├── index.ts                  # Entry point
│   ├── commands/                 # Command implementations
│   ├── adapters/                 # Agent host adapters
│   ├── core/                     # Core utilities (fs, paths, config, state)
│   ├── context/                  # Bounded context compiler
│   ├── discovery/                # On-demand discovery engine
│   ├── planning/                 # Planning and task engine
│   ├── verification/             # Check and verification engine
│   ├── cavebus/                  # CaveBus compression and validation
│   └── build/                    # Build orchestrator
├── tests/                        # Test suite (vitest)
├── docs/                         # Documentation
├── examples/                     # Example artifacts
├── .lh/                     # LeanHarness artifact store, templates, policies
│   ├── config.yml                # Project configuration
│   ├── templates/                # Feature artifact templates
│   ├── policies/                 # Guardrail policies
│   └── protocols/                # Protocol definitions (CaveBus)
├── .claude/                      # Claude Code integration surface
├── .opencode/                    # OpenCode integration surface
├── scripts/hooks/                # Claude Code hook scripts
└── package.json
```

## Working on features with LeanHarness

LeanHarness is designed to be used on itself. When working on a feature:

```bash
lh init --host all
lh spec "Describe the feature" --title "Feature title"
lh discover F001 --depth D2
lh plan F001
lh build F001 --host claude-code --dry-run
lh check F001
```

Always use `--dry-run` before invoking a real agent host. Dry-run validates the plan and boundary without spending agent tokens.

## Testing expectations

- All new functionality should have tests in `tests/`.
- Tests use vitest. Run with `npm test`.
- Test files follow the pattern `tests/<module>/<name>.test.ts`.
- Tests should be deterministic and not require external services.
- Use the workspace helpers in `tests/helpers/workspace.ts` for temporary directories.
- Run `npm run typecheck` before submitting. Type errors block merges.

## Documentation expectations

- Document new commands in `docs/commands.md`.
- Document new configuration in `docs/configuration.md`.
- Keep the glossary (`docs/docs/glossary.md`) updated when introducing new terms.
- Use relative Markdown links between docs.
- Do not duplicate content across docs. Link instead.
- Keep documentation accurate. Do not claim features that are not implemented.

## Adapter contribution guidelines

To add a new agent host adapter:

1. Create `src/adapters/<host-name>.ts` implementing `AgentAdapter` from `src/adapters/types.ts`.
2. Register it in `src/adapters/registry.ts`.
3. Add host-specific integration files (configuration, agents, guardrails).
4. Update `lh init` to support `--host <host-name>`.
5. Add tests in `tests/adapters/<host-name>.test.ts`.
6. Document in `docs/hosts/<host-name>.md` and update `docs/host-adapters.md`.
7. Support `--dry-run`. Every adapter must support dry-run mode.

See `docs/host-adapters.md` for the full adapter contract.

## Guardrail contribution guidelines

Guardrails enforce safety during agent execution:

- Claude Code guardrails live in `.claude/hooks/` and `scripts/hooks/`.
- OpenCode guardrails live in `.opencode/plugins/`.
- Policy definitions live in `.lh/policies/`.
- Guardrails are best-effort. The final completion gate is always `lh check`.
- Do not add runtime dependencies for guardrail scripts.
- Test guardrail behavior when possible.

## Release process

LeanHarness uses [Changesets](https://github.com/changesets/changesets) for automated releases:

1. Add a changeset for your change:
   ```bash
   npm run changeset
   ```
2. Merge your PR to `main`.
3. GitHub Actions will open or update a "Version Packages" release PR.
4. Merging that release PR automatically bumps versions, creates a git tag, generates GitHub Release notes, and publishes to npm.

Do not publish manually. See `docs/release-checklist.md` for the full pre-release validation checklist.

## Pull request checklist

Before submitting a pull request:

- [ ] `npm run build` succeeds
- [ ] `npm run typecheck` succeeds
- [ ] `npm test` passes
- [ ] No runtime dependencies added
- [ ] New commands documented in `docs/commands.md`
- [ ] New configuration documented in `docs/configuration.md`
- [ ] CHANGELOG.md updated under `[Unreleased]`
- [ ] No secrets, credentials, or `.env` files committed
- [ ] No `TODO` or `TBD` placeholders left in committed code

## Code of conduct

Be respectful, constructive, and collaborative. Focus feedback on the work, not the person. Assume good intent. Welcome newcomers. If someone is struggling, help them.
