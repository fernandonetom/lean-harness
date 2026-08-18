# F001 Check Report

## Verdict

needs-fix

## Summary

Feature F001 (Reading list app scaffold) needs fixes before completion.

## Acceptance Criteria Coverage

| AC | Status | Evidence | Notes |
|---|---|---|---|
| AC1: **AC-01:** A list page (`/`) renders all reading-list items  | pass | task summary task-summaries/T01.md mentions AC1; task summary task-summaries/T02.md mentions AC1; task summary task-summ |  |
| AC2: **AC-02:** An add-item form lets a user submit a new item (a | pass | task summary task-summaries/T01.md mentions AC2; task summary task-summaries/T02.md mentions AC2; task summary task-summ |  |
| AC3: **AC-03:** Each item has a `status` field constrained to one | pass | task summary task-summaries/T01.md mentions AC3; task summary task-summaries/T02.md mentions AC3; task summary task-summ |  |
| AC4: **AC-04:** The store reads from and writes to a JSON file on | pass | task summary task-summaries/T01.md mentions AC4; task summary task-summaries/T02.md mentions AC4; task summary task-summ |  |
| AC5: **AC-05:** The app is a valid Next.js App Router + TypeScrip | pass | task summary task-summaries/T01.md mentions AC5; task summary task-summaries/T02.md mentions AC5; task summary task-summ |  |

## Verification Commands

| Command | Result | Evidence | Notes |
|---|---|---|---|
| `pnpm install` | skipped | skipped: installs dependencies | Dangerous command skipped: installs dependencies |
| `pnpm run lint` | fail | command exited 1 in 181ms |  |
| `pnpm run build` | skipped | skipped: command not recognized as safe and not explicitly provided | Use --command to explicitly approve this command. |
| `pnpm --dir web run lint` | skipped | skipped: command not recognized as safe and not explicitly provided | Use --command to explicitly approve this command. |
| `Risk gate: new_dependency` | skipped | skipped: command not recognized as safe and not explicitly provided | Use --command to explicitly approve this command. |
| `pnpm --dir web run build` | skipped | skipped: command not recognized as safe and not explicitly provided | Use --command to explicitly approve this command. |
| `claude -p # LeanHarness Task Context` | skipped | skipped: command not recognized as safe and not explicitly provided | Use --command to explicitly approve this command. |
| `cd web && pnpm run lint` | pass | command exited 0 in 1196ms |  |
| `cd web && pnpm run build` | pass | command exited 0 in 3388ms |  |

## Changed Files

| Path | Change Type | In Boundary | Notes |
|---|---|---|---|
| ../../.changeset/config.json | modified | unknown |  |
| ../../.changeset/opencode-plugin-initial-release.md | created | unknown |  |
| ../../.changeset/pnpm-monorepo-and-real-opencode-plugin.md | created | unknown |  |
| ../../.claude-plugin/marketplace.json | modified | unknown |  |
| ../../.github/workflows/ci.yml | modified | unknown |  |
| ../../.github/workflows/release.yml | modified | unknown |  |
| ../../.gitignore | modified | unknown |  |
| ../../.npmignore | deleted | unknown |  |
| ../../CLAUDE.md | modified | unknown |  |
| ../../README.md | modified | unknown |  |
| ../../docs/configuration.md | modified | unknown |  |
| ../../docs/hosts/opencode.md | modified | unknown |  |
| ../../docs/migration.md | modified | unknown |  |
| ../../.claude-plugin/plugin.json -> ../../hosts/claude-code/.claude-plugin/plugin.json | renamed | unknown |  |
| ../../agents/lh-builder-fix.md -> ../../hosts/claude-code/agents/lh-builder-fix.md | renamed | unknown |  |
| ../../agents/lh-builder.md -> ../../hosts/claude-code/agents/lh-builder.md | renamed | unknown |  |
| ../../agents/lh-compressor.md -> ../../hosts/claude-code/agents/lh-compressor.md | renamed | unknown |  |
| ../../agents/lh-reviewer.md -> ../../hosts/claude-code/agents/lh-reviewer.md | renamed | unknown |  |
| ../../agents/lh-scout.md -> ../../hosts/claude-code/agents/lh-scout.md | renamed | unknown |  |
| ../../agents/lh-verifier.md -> ../../hosts/claude-code/agents/lh-verifier.md | renamed | unknown |  |
| ../../hooks/hooks.json -> ../../hosts/claude-code/hooks/hooks.json | renamed | unknown |  |
| ../../hooks/package.json -> ../../hosts/claude-code/hooks/package.json | renamed | unknown |  |
| ../../hooks/post-tool-use.js -> ../../hosts/claude-code/hooks/post-tool-use.js | renamed | unknown |  |
| ../../hooks/pre-tool-use.js -> ../../hosts/claude-code/hooks/pre-tool-use.js | renamed | unknown |  |
| ../../hooks/session-end.js -> ../../hosts/claude-code/hooks/session-end.js | renamed | unknown |  |
| ../../hooks/shared.js -> ../../hosts/claude-code/hooks/shared.js | renamed | unknown |  |
| ../../hosts/claude-code/package.json | created | out |  |
| ../../skills/lh-build/SKILL.md -> ../../hosts/claude-code/skills/lh-build/SKILL.md | renamed | unknown |  |
| ../../skills/lh-check/SKILL.md -> ../../hosts/claude-code/skills/lh-check/SKILL.md | renamed | unknown |  |
| ../../skills/lh-discover/SKILL.md -> ../../hosts/claude-code/skills/lh-discover/SKILL.md | renamed | unknown |  |
| ../../skills/lh-do/SKILL.md -> ../../hosts/claude-code/skills/lh-do/SKILL.md | renamed | unknown |  |
| ../../skills/lh-plan/SKILL.md -> ../../hosts/claude-code/skills/lh-plan/SKILL.md | renamed | unknown |  |
| ../../skills/lh-spec/SKILL.md -> ../../hosts/claude-code/skills/lh-spec/SKILL.md | renamed | unknown |  |
| ../../skills/lh-status/SKILL.md -> ../../hosts/claude-code/skills/lh-status/SKILL.md | renamed | unknown |  |
| ../../skills/lh-worktree/SKILL.md -> ../../hosts/claude-code/skills/lh-worktree/SKILL.md | renamed | unknown |  |
| ../../hosts/claude-code/tests/frontmatter.test.ts | created | out |  |
| ../../hosts/claude-code/tests/post-tool-use.test.ts | created | out |  |
| ../../hosts/claude-code/tests/session-end.test.ts | created | out |  |
| ../../hosts/claude-code/vitest.config.ts | created | out |  |
| ../../hosts/opencode/LICENSE | created | out |  |
| ../../hosts/opencode/README.md | created | out |  |
| ../../hosts/opencode/package.json | created | out |  |
| ../../hosts/opencode/scripts/opencode-smoke.mjs | created | out |  |
| ../../hosts/opencode/src/index.ts | created | out |  |
| ../../hosts/opencode/src/leanharness-guardrails.ts | created | out |  |
| ../../hosts/opencode/src/shared.ts | created | out |  |
| ../../src/commands/opencode-agent-bundles/lh-builder-fix.md -> ../../hosts/opencode/templates/agents/lh-builder-fix.md | renamed | unknown |  |
| ../../src/commands/opencode-agent-bundles/lh-builder.md -> ../../hosts/opencode/templates/agents/lh-builder.md | renamed | unknown |  |
| ../../src/commands/opencode-agent-bundles/lh-compressor.md -> ../../hosts/opencode/templates/agents/lh-compressor.md | renamed | unknown |  |
| ../../src/commands/opencode-agent-bundles/lh-reviewer.md -> ../../hosts/opencode/templates/agents/lh-reviewer.md | renamed | unknown |  |
| ../../src/commands/opencode-agent-bundles/lh-scout.md -> ../../hosts/opencode/templates/agents/lh-scout.md | renamed | unknown |  |
| ../../src/commands/opencode-agent-bundles/lh-verifier.md -> ../../hosts/opencode/templates/agents/lh-verifier.md | renamed | unknown |  |
| ../../src/commands/opencode-command-bundles/lh-build.md -> ../../hosts/opencode/templates/commands/lh-build.md | renamed | unknown |  |
| ../../src/commands/opencode-command-bundles/lh-check.md -> ../../hosts/opencode/templates/commands/lh-check.md | renamed | unknown |  |
| ../../src/commands/opencode-command-bundles/lh-discover.md -> ../../hosts/opencode/templates/commands/lh-discover.md | renamed | unknown |  |
| ../../src/commands/opencode-command-bundles/lh-do.md -> ../../hosts/opencode/templates/commands/lh-do.md | renamed | unknown |  |
| ../../src/commands/opencode-command-bundles/lh-plan.md -> ../../hosts/opencode/templates/commands/lh-plan.md | renamed | unknown |  |
| ../../src/commands/opencode-command-bundles/lh-spec.md -> ../../hosts/opencode/templates/commands/lh-spec.md | renamed | unknown |  |
| ../../src/commands/opencode-command-bundles/lh-status.md -> ../../hosts/opencode/templates/commands/lh-status.md | renamed | unknown |  |
| ../../hosts/opencode/tests/frontmatter.test.ts | created | out |  |
| ../../hosts/opencode/tests/guardrails-export.test.ts | created | out |  |
| ../../hosts/opencode/tests/permission-ask.test.ts | created | out |  |
| ../../hosts/opencode/tests/tool-execute-before.test.ts | created | out |  |
| ../../hosts/opencode/tsconfig.json | created | out |  |
| ../../hosts/opencode/vitest.config.ts | created | out |  |
| ../../package-lock.json | deleted | unknown |  |
| ../../package.json | modified | unknown |  |
| ../../.lh/policies/boundary.yml -> ../../packages/cli/.lh/policies/boundary.yml | renamed | unknown |  |
| ../../.lh/policies/commands.yml -> ../../packages/cli/.lh/policies/commands.yml | renamed | unknown |  |
| ../../.lh/policies/risk-gates.yml -> ../../packages/cli/.lh/policies/risk-gates.yml | renamed | unknown |  |
| ../../.lh/protocols/cavebus.yml -> ../../packages/cli/.lh/protocols/cavebus.yml | renamed | unknown |  |
| ../../.lh/templates/boundary.json -> ../../packages/cli/.lh/templates/boundary.json | renamed | unknown |  |
| ../../.lh/templates/cavebus-message.md -> ../../packages/cli/.lh/templates/cavebus-message.md | renamed | unknown |  |
| ../../.lh/templates/cavebus/discovery.cave -> ../../packages/cli/.lh/templates/cavebus/discovery.cave | renamed | unknown |  |
| ../../.lh/templates/cavebus/error.cave -> ../../packages/cli/.lh/templates/cavebus/error.cave | renamed | unknown |  |
| ../../.lh/templates/cavebus/review.cave -> ../../packages/cli/.lh/templates/cavebus/review.cave | renamed | unknown |  |
| ../../.lh/templates/cavebus/summary.cave -> ../../packages/cli/.lh/templates/cavebus/summary.cave | renamed | unknown |  |
| ../../.lh/templates/cavebus/task.cave -> ../../packages/cli/.lh/templates/cavebus/task.cave | renamed | unknown |  |
| ../../.lh/templates/cavebus/verify.cave -> ../../packages/cli/.lh/templates/cavebus/verify.cave | renamed | unknown |  |
| ../../.lh/templates/checks.md -> ../../packages/cli/.lh/templates/checks.md | renamed | unknown |  |
| ../../.lh/templates/discovery.md -> ../../packages/cli/.lh/templates/discovery.md | renamed | unknown |  |
| ../../.lh/templates/plan.md -> ../../packages/cli/.lh/templates/plan.md | renamed | unknown |  |
| ../../.lh/templates/result.md -> ../../packages/cli/.lh/templates/result.md | renamed | unknown |  |
| ../../.lh/templates/review.json -> ../../packages/cli/.lh/templates/review.json | renamed | unknown |  |
| ../../.lh/templates/review.md -> ../../packages/cli/.lh/templates/review.md | renamed | unknown |  |
| ../../.lh/templates/spec.md -> ../../packages/cli/.lh/templates/spec.md | renamed | unknown |  |
| ../../.lh/templates/task-summary.md -> ../../packages/cli/.lh/templates/task-summary.md | renamed | unknown |  |
| ../../.lh/templates/tasks.md -> ../../packages/cli/.lh/templates/tasks.md | renamed | unknown |  |
| ../../CHANGELOG.md -> ../../packages/cli/CHANGELOG.md | renamed | unknown |  |
| ../../packages/cli/LICENSE | created | out |  |
| ../../packages/cli/README.md | created | out |  |
| ../../packages/cli/package.json | created | out |  |
| ../../packages/cli/scripts/copy-opencode-vendor.mjs | created | out |  |
| ../../src/adapters/claude-code.ts -> ../../packages/cli/src/adapters/claude-code.ts | modified | unknown |  |
| ../../src/adapters/opencode.ts -> ../../packages/cli/src/adapters/opencode.ts | renamed | unknown |  |
| ../../src/adapters/registry.ts -> ../../packages/cli/src/adapters/registry.ts | renamed | unknown |  |
| ../../src/adapters/types.ts -> ../../packages/cli/src/adapters/types.ts | renamed | unknown |  |
| ../../src/build/index.ts -> ../../packages/cli/src/build/index.ts | renamed | unknown |  |
| ../../src/build/task-runner.ts -> ../../packages/cli/src/build/task-runner.ts | renamed | unknown |  |
| ../../src/build/task-status.ts -> ../../packages/cli/src/build/task-status.ts | renamed | unknown |  |
| ../../src/build/task-summary.ts -> ../../packages/cli/src/build/task-summary.ts | renamed | unknown |  |
| ../../src/cavebus/compress.ts -> ../../packages/cli/src/cavebus/compress.ts | renamed | unknown |  |
| ../../src/cavebus/index.ts -> ../../packages/cli/src/cavebus/index.ts | renamed | unknown |  |
| ../../src/cavebus/protected.ts -> ../../packages/cli/src/cavebus/protected.ts | renamed | unknown |  |
| ../../src/cavebus/schema.ts -> ../../packages/cli/src/cavebus/schema.ts | renamed | unknown |  |
| ../../src/cavebus/validate.ts -> ../../packages/cli/src/cavebus/validate.ts | renamed | unknown |  |
| ../../src/cli.ts -> ../../packages/cli/src/cli.ts | renamed | unknown |  |
| ../../src/cli/banner.ts -> ../../packages/cli/src/cli/banner.ts | renamed | unknown |  |
| ../../src/cli/init-hosts.ts -> ../../packages/cli/src/cli/init-hosts.ts | renamed | unknown |  |
| ../../src/cli/options.ts -> ../../packages/cli/src/cli/options.ts | renamed | unknown |  |
| ../../src/cli/program.ts -> ../../packages/cli/src/cli/program.ts | renamed | unknown |  |
| ../../src/commands/archive.ts -> ../../packages/cli/src/commands/archive.ts | renamed | unknown |  |
| ../../src/commands/boundary.ts -> ../../packages/cli/src/commands/boundary.ts | renamed | unknown |  |
| ../../src/commands/build.ts -> ../../packages/cli/src/commands/build.ts | renamed | unknown |  |
| ../../src/commands/cavebus.ts -> ../../packages/cli/src/commands/cavebus.ts | renamed | unknown |  |
| ../../src/commands/check.ts -> ../../packages/cli/src/commands/check.ts | renamed | unknown |  |
| ../../src/commands/command-enforcement.ts -> ../../packages/cli/src/commands/command-enforcement.ts | renamed | unknown |  |
| ../../src/commands/compile-task.ts -> ../../packages/cli/src/commands/compile-task.ts | renamed | unknown |  |
| ../../src/commands/completion.ts -> ../../packages/cli/src/commands/completion.ts | renamed | unknown |  |
| ../../src/commands/compress.ts -> ../../packages/cli/src/commands/compress.ts | renamed | unknown |  |
| ../../src/commands/config.ts -> ../../packages/cli/src/commands/config.ts | renamed | unknown |  |
| ../../src/commands/detect-install.ts -> ../../packages/cli/src/commands/detect-install.ts | renamed | unknown |  |
| ../../src/commands/discover.ts -> ../../packages/cli/src/commands/discover.ts | renamed | unknown |  |
| ../../src/commands/doctor.ts -> ../../packages/cli/src/commands/doctor.ts | renamed | unknown |  |
| ../../src/commands/init-claude-code.ts -> ../../packages/cli/src/commands/init-claude-code.ts | renamed | unknown |  |
| ../../src/commands/init.ts -> ../../packages/cli/src/commands/init.ts | renamed | unknown |  |
| ../../src/commands/legacy-footprint.ts -> ../../packages/cli/src/commands/legacy-footprint.ts | renamed | unknown |  |
| ../../src/commands/list.ts -> ../../packages/cli/src/commands/list.ts | renamed | unknown |  |
| ../../src/commands/load-opencode-agents.ts -> ../../packages/cli/src/commands/load-opencode-agents.ts | renamed | unknown |  |
| ../../src/commands/load-opencode-commands.ts -> ../../packages/cli/src/commands/load-opencode-commands.ts | renamed | unknown |  |
| ../../packages/cli/src/commands/load-opencode-plugins.ts | created | out |  |
| ../../src/commands/memory.ts -> ../../packages/cli/src/commands/memory.ts | renamed | unknown |  |
| ../../src/commands/migrate.ts -> ../../packages/cli/src/commands/migrate.ts | renamed | unknown |  |
| ../../src/commands/new.ts -> ../../packages/cli/src/commands/new.ts | renamed | unknown |  |
| ../../packages/cli/src/commands/opencode-vendor-resolve.ts | created | out |  |
| ../../src/commands/plan.ts -> ../../packages/cli/src/commands/plan.ts | renamed | unknown |  |
| ../../src/commands/review.ts -> ../../packages/cli/src/commands/review.ts | renamed | unknown |  |
| ../../src/commands/run-task.ts -> ../../packages/cli/src/commands/run-task.ts | renamed | unknown |  |
| ../../src/commands/show.ts -> ../../packages/cli/src/commands/show.ts | renamed | unknown |  |
| ../../src/commands/spec.ts -> ../../packages/cli/src/commands/spec.ts | renamed | unknown |  |
| ../../src/commands/status.ts -> ../../packages/cli/src/commands/status.ts | renamed | unknown |  |
| ../../src/commands/uninstall.ts -> ../../packages/cli/src/commands/uninstall.ts | renamed | unknown |  |
| ../../src/commands/update.ts -> ../../packages/cli/src/commands/update.ts | renamed | unknown |  |
| ../../src/commands/watch.ts -> ../../packages/cli/src/commands/watch.ts | renamed | unknown |  |
| ../../src/commands/worktree.ts -> ../../packages/cli/src/commands/worktree.ts | renamed | unknown |  |
| ../../src/context/compiler.ts -> ../../packages/cli/src/context/compiler.ts | renamed | unknown |  |
| ../../src/context/protected-tokens.ts -> ../../packages/cli/src/context/protected-tokens.ts | renamed | unknown |  |
| ../../src/context/task-context.ts -> ../../packages/cli/src/context/task-context.ts | renamed | unknown |  |
| ../../src/core/bundled-scaffold.ts -> ../../packages/cli/src/core/bundled-scaffold.ts | renamed | unknown |  |
| ../../src/core/colors.ts -> ../../packages/cli/src/core/colors.ts | renamed | unknown |  |
| ../../src/core/config-mutate.ts -> ../../packages/cli/src/core/config-mutate.ts | renamed | unknown |  |
| ../../src/core/config.ts -> ../../packages/cli/src/core/config.ts | renamed | unknown |  |
| ../../src/core/errors.ts -> ../../packages/cli/src/core/errors.ts | renamed | unknown |  |
| ../../src/core/features.ts -> ../../packages/cli/src/core/features.ts | renamed | unknown |  |
| ../../src/core/fs.ts -> ../../packages/cli/src/core/fs.ts | renamed | unknown |  |
| ../../src/core/git.ts -> ../../packages/cli/src/core/git.ts | renamed | unknown |  |
| ../../src/core/harness-root.ts -> ../../packages/cli/src/core/harness-root.ts | renamed | unknown |  |
| ../../src/core/logger.ts -> ../../packages/cli/src/core/logger.ts | renamed | unknown |  |
| ../../src/core/paths.ts -> ../../packages/cli/src/core/paths.ts | renamed | unknown |  |
| ../../src/core/prompt.ts -> ../../packages/cli/src/core/prompt.ts | renamed | unknown |  |
| ../../src/core/resolved-config.ts -> ../../packages/cli/src/core/resolved-config.ts | renamed | unknown |  |
| ../../src/core/risk-gates.ts -> ../../packages/cli/src/core/risk-gates.ts | renamed | unknown |  |
| ../../src/core/spinner.ts -> ../../packages/cli/src/core/spinner.ts | renamed | unknown |  |
| ../../src/core/state.ts -> ../../packages/cli/src/core/state.ts | renamed | unknown |  |
| ../../src/core/templates.ts -> ../../packages/cli/src/core/templates.ts | renamed | unknown |  |
| ../../src/core/types.ts -> ../../packages/cli/src/core/types.ts | renamed | unknown |  |
| ../../src/core/version.ts -> ../../packages/cli/src/core/version.ts | renamed | unknown |  |
| ../../src/core/worktree.ts -> ../../packages/cli/src/core/worktree.ts | renamed | unknown |  |
| ../../src/discovery/boundary.ts -> ../../packages/cli/src/discovery/boundary.ts | renamed | unknown |  |
| ../../src/discovery/import-resolver.ts -> ../../packages/cli/src/discovery/import-resolver.ts | renamed | unknown |  |
| ../../src/discovery/index.ts -> ../../packages/cli/src/discovery/index.ts | renamed | unknown |  |
| ../../src/discovery/package-detector.ts -> ../../packages/cli/src/discovery/package-detector.ts | renamed | unknown |  |
| ../../src/discovery/project-detector.ts -> ../../packages/cli/src/discovery/project-detector.ts | renamed | unknown |  |
| ../../src/discovery/search.ts -> ../../packages/cli/src/discovery/search.ts | renamed | unknown |  |
| ../../src/discovery/test-detector.ts -> ../../packages/cli/src/discovery/test-detector.ts | renamed | unknown |  |
| ../../src/gates/index.ts -> ../../packages/cli/src/gates/index.ts | renamed | unknown |  |
| ../../src/gates/run-gates.ts -> ../../packages/cli/src/gates/run-gates.ts | renamed | unknown |  |
| ../../src/gates/types.ts -> ../../packages/cli/src/gates/types.ts | renamed | unknown |  |
| ../../src/index.ts -> ../../packages/cli/src/index.ts | renamed | unknown |  |
| ../../src/memory/index.ts -> ../../packages/cli/src/memory/index.ts | renamed | unknown |  |
| ../../src/planning/acceptance.ts -> ../../packages/cli/src/planning/acceptance.ts | renamed | unknown |  |
| ../../src/planning/index.ts -> ../../packages/cli/src/planning/index.ts | renamed | unknown |  |
| ../../src/planning/plan-renderer.ts -> ../../packages/cli/src/planning/plan-renderer.ts | renamed | unknown |  |
| ../../src/planning/task-generator.ts -> ../../packages/cli/src/planning/task-generator.ts | renamed | unknown |  |
| ../../src/plugins/loader.ts -> ../../packages/cli/src/plugins/loader.ts | renamed | unknown |  |
| ../../src/plugins/registry.ts -> ../../packages/cli/src/plugins/registry.ts | renamed | unknown |  |
| ../../src/plugins/types.ts -> ../../packages/cli/src/plugins/types.ts | renamed | unknown |  |
| ../../src/verification/acceptance.ts -> ../../packages/cli/src/verification/acceptance.ts | renamed | unknown |  |
| ../../src/verification/changed-files.ts -> ../../packages/cli/src/verification/changed-files.ts | renamed | unknown |  |
| ../../src/verification/commands.ts -> ../../packages/cli/src/verification/commands.ts | renamed | unknown |  |
| ../../src/verification/index.ts -> ../../packages/cli/src/verification/index.ts | renamed | unknown |  |
| ../../src/verification/review-artifact.ts -> ../../packages/cli/src/verification/review-artifact.ts | renamed | unknown |  |
| ../../src/verification/review.ts -> ../../packages/cli/src/verification/review.ts | renamed | unknown |  |
| ../../tests/adapters/claude-code.test.ts -> ../../packages/cli/tests/adapters/claude-code.test.ts | modified | unknown |  |
| ../../tests/adapters/opencode.test.ts -> ../../packages/cli/tests/adapters/opencode.test.ts | renamed | unknown |  |
| ../../tests/adapters/registry.test.ts -> ../../packages/cli/tests/adapters/registry.test.ts | renamed | unknown |  |
| ../../tests/adapters/working-dir.test.ts -> ../../packages/cli/tests/adapters/working-dir.test.ts | renamed | unknown |  |
| ../../tests/build/build-flow.test.ts -> ../../packages/cli/tests/build/build-flow.test.ts | renamed | unknown |  |
| ../../tests/build/require-worktree.test.ts -> ../../packages/cli/tests/build/require-worktree.test.ts | renamed | unknown |  |
| ../../tests/build/task-status.test.ts -> ../../packages/cli/tests/build/task-status.test.ts | renamed | unknown |  |
| ../../tests/cavebus/compress.test.ts -> ../../packages/cli/tests/cavebus/compress.test.ts | renamed | unknown |  |
| ../../tests/cavebus/protected.test.ts -> ../../packages/cli/tests/cavebus/protected.test.ts | renamed | unknown |  |
| ../../tests/cavebus/schema.test.ts -> ../../packages/cli/tests/cavebus/schema.test.ts | renamed | unknown |  |
| ../../tests/cavebus/validate.test.ts -> ../../packages/cli/tests/cavebus/validate.test.ts | renamed | unknown |  |
| ../../tests/cli/banner.test.ts -> ../../packages/cli/tests/cli/banner.test.ts | renamed | unknown |  |
| ../../tests/cli/program.test.ts -> ../../packages/cli/tests/cli/program.test.ts | renamed | unknown |  |
| ../../tests/cli/worktree-program.test.ts -> ../../packages/cli/tests/cli/worktree-program.test.ts | renamed | unknown |  |
| ../../tests/commands/completion.test.ts -> ../../packages/cli/tests/commands/completion.test.ts | renamed | unknown |  |
| ../../tests/commands/doctor.test.ts -> ../../packages/cli/tests/commands/doctor.test.ts | renamed | unknown |  |
| ../../tests/commands/init-e2e.test.ts -> ../../packages/cli/tests/commands/init-e2e.test.ts | renamed | unknown |  |
| ../../tests/commands/init-global.test.ts -> ../../packages/cli/tests/commands/init-global.test.ts | renamed | unknown |  |
| ../../tests/commands/init-graphify.test.ts -> ../../packages/cli/tests/commands/init-graphify.test.ts | renamed | unknown |  |
| ../../tests/commands/legacy-footprint.test.ts -> ../../packages/cli/tests/commands/legacy-footprint.test.ts | renamed | unknown |  |
| ../../tests/commands/memory.test.ts -> ../../packages/cli/tests/commands/memory.test.ts | renamed | unknown |  |
| ../../tests/commands/migrate.test.ts -> ../../packages/cli/tests/commands/migrate.test.ts | renamed | unknown |  |
| ../../tests/commands/uninstall.test.ts -> ../../packages/cli/tests/commands/uninstall.test.ts | renamed | unknown |  |
| ../../tests/commands/update.test.ts -> ../../packages/cli/tests/commands/update.test.ts | renamed | unknown |  |
| ../../tests/commands/watch.test.ts -> ../../packages/cli/tests/commands/watch.test.ts | renamed | unknown |  |
| ../../tests/commands/worktree-list-remove.test.ts -> ../../packages/cli/tests/commands/worktree-list-remove.test.ts | renamed | unknown |  |
| ../../tests/context/compiler.test.ts -> ../../packages/cli/tests/context/compiler.test.ts | renamed | unknown |  |
| ../../tests/context/protected-tokens.test.ts -> ../../packages/cli/tests/context/protected-tokens.test.ts | renamed | unknown |  |
| ../../tests/core/bundled-scaffold.test.ts -> ../../packages/cli/tests/core/bundled-scaffold.test.ts | renamed | unknown |  |
| ../../tests/core/colors.test.ts -> ../../packages/cli/tests/core/colors.test.ts | renamed | unknown |  |
| ../../tests/core/config.test.ts -> ../../packages/cli/tests/core/config.test.ts | renamed | unknown |  |
| ../../tests/core/errors.test.ts -> ../../packages/cli/tests/core/errors.test.ts | renamed | unknown |  |
| ../../tests/core/features.test.ts -> ../../packages/cli/tests/core/features.test.ts | renamed | unknown |  |
| ../../tests/core/fs.test.ts -> ../../packages/cli/tests/core/fs.test.ts | renamed | unknown |  |
| ../../tests/core/git.test.ts -> ../../packages/cli/tests/core/git.test.ts | renamed | unknown |  |
| ../../tests/core/harness-root.test.ts -> ../../packages/cli/tests/core/harness-root.test.ts | renamed | unknown |  |
| ../../tests/core/logger.test.ts -> ../../packages/cli/tests/core/logger.test.ts | renamed | unknown |  |
| ../../tests/core/paths.test.ts -> ../../packages/cli/tests/core/paths.test.ts | renamed | unknown |  |
| ../../tests/core/prompt.test.ts -> ../../packages/cli/tests/core/prompt.test.ts | renamed | unknown |  |
| ../../tests/core/resolved-config.test.ts -> ../../packages/cli/tests/core/resolved-config.test.ts | renamed | unknown |  |
| ../../tests/core/risk-gates.test.ts -> ../../packages/cli/tests/core/risk-gates.test.ts | renamed | unknown |  |
| ../../tests/core/spinner.test.ts -> ../../packages/cli/tests/core/spinner.test.ts | renamed | unknown |  |
| ../../tests/core/state-worktree.test.ts -> ../../packages/cli/tests/core/state-worktree.test.ts | renamed | unknown |  |
| ../../tests/core/state.test.ts -> ../../packages/cli/tests/core/state.test.ts | renamed | unknown |  |
| ../../tests/core/templates.test.ts -> ../../packages/cli/tests/core/templates.test.ts | renamed | unknown |  |
| ../../tests/core/worktree-paths.test.ts -> ../../packages/cli/tests/core/worktree-paths.test.ts | renamed | unknown |  |
| ../../tests/discovery/boundary.test.ts -> ../../packages/cli/tests/discovery/boundary.test.ts | renamed | unknown |  |
| ../../tests/discovery/discovery-flow.test.ts -> ../../packages/cli/tests/discovery/discovery-flow.test.ts | renamed | unknown |  |
| ../../tests/discovery/import-resolver.test.ts -> ../../packages/cli/tests/discovery/import-resolver.test.ts | renamed | unknown |  |
| ../../tests/discovery/project-detector.test.ts -> ../../packages/cli/tests/discovery/project-detector.test.ts | renamed | unknown |  |
| ../../tests/discovery/search.test.ts -> ../../packages/cli/tests/discovery/search.test.ts | renamed | unknown |  |
| ../../tests/e2e/helpers.ts -> ../../packages/cli/tests/e2e/helpers.ts | renamed | unknown |  |
| ../../tests/e2e/workflow.test.ts -> ../../packages/cli/tests/e2e/workflow.test.ts | renamed | unknown |  |
| ../../tests/fixtures/graph-projects/simple-imports/src/a.ts -> ../../packages/cli/tests/fixtures/graph-projects/simple-imports/src/a.ts | renamed | unknown |  |
| ../../tests/fixtures/graph-projects/simple-imports/src/b.ts -> ../../packages/cli/tests/fixtures/graph-projects/simple-imports/src/b.ts | renamed | unknown |  |
| ../../tests/fixtures/graph-projects/simple-imports/src/c.ts -> ../../packages/cli/tests/fixtures/graph-projects/simple-imports/src/c.ts | renamed | unknown |  |
| ../../tests/fixtures/graph-projects/symbols/src/types.ts -> ../../packages/cli/tests/fixtures/graph-projects/symbols/src/types.ts | renamed | unknown |  |
| ../../tests/fixtures/sample-project/package.json -> ../../packages/cli/tests/fixtures/sample-project/package.json | renamed | unknown |  |
| ../../tests/fixtures/sample-project/src/auth/password.ts -> ../../packages/cli/tests/fixtures/sample-project/src/auth/password.ts | renamed | unknown |  |
| ../../tests/fixtures/sample-project/src/auth/session.ts -> ../../packages/cli/tests/fixtures/sample-project/src/auth/session.ts | renamed | unknown |  |
| ../../tests/fixtures/sample-project/src/email/send.ts -> ../../packages/cli/tests/fixtures/sample-project/src/email/send.ts | renamed | unknown |  |
| ../../tests/fixtures/sample-project/tests/auth/password.test.ts -> ../../packages/cli/tests/fixtures/sample-project/tests/auth/password.test.ts | renamed | unknown |  |
| ../../tests/gates/run-gates.test.ts -> ../../packages/cli/tests/gates/run-gates.test.ts | renamed | unknown |  |
| ../../tests/helpers/assertions.ts -> ../../packages/cli/tests/helpers/assertions.ts | renamed | unknown |  |
| ../../tests/helpers/cli.ts -> ../../packages/cli/tests/helpers/cli.ts | renamed | unknown |  |
| ../../tests/helpers/fixture.ts -> ../../packages/cli/tests/helpers/fixture.ts | renamed | unknown |  |
| ../../tests/helpers/git.ts -> ../../packages/cli/tests/helpers/git.ts | renamed | unknown |  |
| ../../tests/helpers/workspace.ts -> ../../packages/cli/tests/helpers/workspace.ts | renamed | unknown |  |
| ../../packages/cli/tests/hooks/boundary-aliases.test.ts | created | out |  |
| ../../tests/hooks/root-resolution.test.ts -> ../../packages/cli/tests/hooks/root-resolution.test.ts | renamed | unknown |  |
| ../../tests/memory/memory.test.ts -> ../../packages/cli/tests/memory/memory.test.ts | renamed | unknown |  |
| ../../tests/planning/acceptance.test.ts -> ../../packages/cli/tests/planning/acceptance.test.ts | renamed | unknown |  |
| ../../tests/planning/plan-renderer.test.ts -> ../../packages/cli/tests/planning/plan-renderer.test.ts | renamed | unknown |  |
| ../../tests/planning/planning-flow.test.ts -> ../../packages/cli/tests/planning/planning-flow.test.ts | renamed | unknown |  |
| ../../tests/planning/task-generator.test.ts -> ../../packages/cli/tests/planning/task-generator.test.ts | renamed | unknown |  |
| ../../tests/plugins/loader.test.ts -> ../../packages/cli/tests/plugins/loader.test.ts | renamed | unknown |  |
| ../../tests/plugins/registry.test.ts -> ../../packages/cli/tests/plugins/registry.test.ts | renamed | unknown |  |
| ../../tests/stress/concurrency.test.ts -> ../../packages/cli/tests/stress/concurrency.test.ts | renamed | unknown |  |
| ../../tests/stress/corruption.test.ts -> ../../packages/cli/tests/stress/corruption.test.ts | renamed | unknown |  |
| ../../tests/stress/scale.test.ts -> ../../packages/cli/tests/stress/scale.test.ts | renamed | unknown |  |
| ../../tests/stress/workflow.test.ts -> ../../packages/cli/tests/stress/workflow.test.ts | renamed | unknown |  |
| ../../tests/verification/boundary-aliases.test.ts -> ../../packages/cli/tests/verification/boundary-aliases.test.ts | renamed | unknown |  |
| ../../tests/verification/check-flow.test.ts -> ../../packages/cli/tests/verification/check-flow.test.ts | renamed | unknown |  |
| ../../tests/verification/commands.test.ts -> ../../packages/cli/tests/verification/commands.test.ts | renamed | unknown |  |
| ../../tests/verification/require-flags.test.ts -> ../../packages/cli/tests/verification/require-flags.test.ts | renamed | unknown |  |
| ../../packages/cli/tsconfig.json | created | out |  |
| ../../vitest.config.ts -> ../../packages/cli/vitest.config.ts | renamed | unknown |  |
| ../../pnpm-lock.yaml | created | unknown |  |
| ../../pnpm-workspace.yaml | created | unknown |  |
| ../../scripts/extract-changelog-entry.mjs | modified | unknown |  |
| ../../scripts/plugin-smoke.mjs | modified | unknown |  |
| ../../scripts/sync-plugin-version.mjs | modified | unknown |  |
| ../../scripts/sync-readme-version.mjs | modified | unknown |  |
| ../../src/commands/load-opencode-plugins.ts | deleted | unknown |  |
| ../../src/commands/opencode-command-bundles/lh-builder-fix.md | deleted | unknown |  |
| ../../src/commands/opencode-plugin-bundles/leanharness-guardrails.js | deleted | unknown |  |
| ../../src/commands/opencode-plugin-bundles/shared.js | deleted | unknown |  |
| ../../tests/hooks/boundary-aliases.test.ts | deleted | unknown |  |
| ../../tests/plugins/opencode-guardrails-export.test.ts | deleted | unknown |  |
| ../../tsconfig.json -> ../../tsconfig.base.json | renamed | unknown |  |
| ./ | created | unknown |  |
| ../../scripts/sync-example-hosts.mjs | created | unknown |  |

## Boundary Review

Status: partial

Violations:
- ../../hosts/claude-code/package.json (created)
- ../../hosts/claude-code/tests/frontmatter.test.ts (created)
- ../../hosts/claude-code/tests/post-tool-use.test.ts (created)
- ../../hosts/claude-code/tests/session-end.test.ts (created)
- ../../hosts/claude-code/vitest.config.ts (created)
- ../../hosts/opencode/LICENSE (created)
- ../../hosts/opencode/README.md (created)
- ../../hosts/opencode/package.json (created)
- ../../hosts/opencode/scripts/opencode-smoke.mjs (created)
- ../../hosts/opencode/src/index.ts (created)
- ../../hosts/opencode/src/leanharness-guardrails.ts (created)
- ../../hosts/opencode/src/shared.ts (created)
- ../../hosts/opencode/tests/frontmatter.test.ts (created)
- ../../hosts/opencode/tests/guardrails-export.test.ts (created)
- ../../hosts/opencode/tests/permission-ask.test.ts (created)
- ../../hosts/opencode/tests/tool-execute-before.test.ts (created)
- ../../hosts/opencode/tsconfig.json (created)
- ../../hosts/opencode/vitest.config.ts (created)
- ../../packages/cli/LICENSE (created)
- ../../packages/cli/README.md (created)
- ../../packages/cli/package.json (created)
- ../../packages/cli/scripts/copy-opencode-vendor.mjs (created)
- ../../packages/cli/src/commands/load-opencode-plugins.ts (created)
- ../../packages/cli/src/commands/opencode-vendor-resolve.ts (created)
- ../../packages/cli/tests/hooks/boundary-aliases.test.ts (created)
- ../../packages/cli/tsconfig.json (created)
- 26 file(s) changed outside the boundary.

## Risk Gate Review

- **new_dependency**: Scaffold adds a new package.json under web/ with Next.js/React dependencies; pre-approved by the task owner for this dogfooding demo (status: approved)

## Code Review Summary

Review verdict: unknown
- Review is required but no review evidence was found. Add review JSON files under reviews/ or include CaveBus REV entries.

## Unresolved Issues

- 1 verification command(s) failed: pnpm run lint
- 26 file(s) changed outside boundary.
- Review is required but no independent review evidence was found.

## Regression Risks

Not assessed by deterministic check. Review task summaries and test results.

## Final Decision

Verdict: **needs-fix**

Recovery path:
- fix failing checks; rerun lh check F001 --force
