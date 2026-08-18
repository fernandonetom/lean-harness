---
"@feneto/lh": major
---

Restructured the repo into a pnpm monorepo (`packages/cli`, `hosts/opencode`, `hosts/claude-code`) and replaced the experimental OpenCode plugin export with a real, spec-compliant one published as its own package.

**Monorepo layout:** `@feneto/lh` now lives in `packages/cli/`. The Claude Code plugin (skills, agents, hooks, `.claude-plugin/plugin.json`) moved from the repo root into `hosts/claude-code/` — a private, unpublished workspace package, still distributed via git + `/plugin marketplace add` with no behavior change for consumers (the root `.claude-plugin/marketplace.json` stays at the repo root, its `source` now points at `./hosts/claude-code`).

**Real OpenCode plugin:** `hosts/opencode/` is a new package, published as [`@feneto/lh-opencode`](https://www.npmjs.com/package/@feneto/lh-opencode) — a real [OpenCode plugin](https://opencode.ai/docs/plugins/) (typed against `@opencode-ai/plugin`), replacing the previous `@feneto/lh` `"./opencode"` subpath export that was documented as "experimental, unverified." **Breaking:** that subpath export is removed.

**`lh init --host opencode` default behavior change:** now registers `@feneto/lh-opencode` (version-pinned) in the target project's `opencode.json` `"plugin"` array by default, instead of copying the guardrail plugin's raw JS into `.opencode/plugins/`. OpenCode installs the npm package automatically via Bun at startup — no manual install step. Pass `--local-plugin` to restore the previous copy-files behavior for offline/air-gapped/restricted environments.

**Additive guardrail enforcement layer:** the OpenCode plugin now also implements `permission.ask` (returning `status: "deny"`), a spec-documented deny mechanism, alongside the existing throw-based blocking in `tool.execute.before` (kept as the enforcement backbone — `lh init`'s generated `opencode.json` sets `permission.edit: "allow"` for the primary builder agent, so `permission.ask` alone would under-enforce for that agent).

**Bug fixes found during the restructure:**
- `lh-do`'s Claude Code skill (`hosts/claude-code/skills/lh-do/SKILL.md`) had a YAML frontmatter parse error (an unquoted colon-space sequence in its `description`) that made `claude plugin validate --strict` fail and would have loaded the skill with all frontmatter silently dropped at runtime.
- A stray, agent-shaped file (`lh-builder-fix.md`, with `mode`/`permission` fields instead of `agent`) had been mis-copied into the OpenCode command-templates bundle; it was dead weight, never wired into `opencode.json`'s `command` map. Removed.

**Testing:** added real coverage that was previously missing — OpenCode plugin blocking behavior (`tool.execute.before` and `permission.ask`), OpenCode agent/command template frontmatter validation cross-checked against the CLI's loader wiring, Claude Code skill/agent frontmatter validation, and `hooks/post-tool-use.js` / `hooks/session-end.js` (previously untested). Added `hosts/opencode/scripts/opencode-smoke.mjs`, an empirical check (gated on a real `opencode` binary being present) that the built plugin loads cleanly with no double-registration.

**CI/release:** `ci.yml` and `release.yml` are now pnpm-workspace-aware (`pnpm -r run build/typecheck/test`, `pnpm -r publish --dry-run` for pack hygiene). The release job publishes through `pnpm exec changeset publish` instead of a bare `npm publish`, since a bare `npm publish` does not understand pnpm's `workspace:*` protocol.
