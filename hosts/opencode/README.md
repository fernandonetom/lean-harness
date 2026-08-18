# @feneto/lh-opencode

The real, spec-compliant [OpenCode plugin](https://opencode.ai/docs/plugins/) for [LeanHarness](https://github.com/fernandonetom/lean-harness) — boundary enforcement, dangerous-command blocking, and secret-path protection for OpenCode agent sessions.

This package is normally installed for you by `lh init --host opencode` (from the `@feneto/lh` CLI), which registers it in your project's `opencode.json`:

```json
{
  "plugin": ["@feneto/lh-opencode"]
}
```

OpenCode installs it automatically via Bun at startup (cached under `~/.cache/opencode/node_modules/`) — no manual `npm install` step required. See [docs/hosts/opencode.md](https://github.com/fernandonetom/lean-harness/blob/main/docs/hosts/opencode.md) in the main repo for the full integration guide, including the `--local-plugin` fallback for offline/restricted environments.

## What it enforces

- **Secret-path protection** — blocks any tool call that touches `.env`, `**/secrets/**`, etc.
- **Dangerous-command blocking** — blocks destructive shell commands (`rm -rf /`, `git reset --hard`, `DROP DATABASE`, force-push, ...).
- **Change-boundary enforcement** — blocks edits outside the active LeanHarness feature's `touchFiles`/`allowedEditGlobs`, or inside `blockedEditGlobs`/`doNotTouch`.

Enforcement happens on two layers:

1. **`tool.execute.before`** (primary, throw-based) — the enforcement backbone. Undocumented-but-relied-upon OpenCode behavior: this plugin throws an `Error` named `LeanHarnessGuardrailBlock` to abort the tool call.
2. **`permission.ask`** (additive, spec-documented) — sets `output.status = "deny"` for the same violations, for calls OpenCode's static permission config routes through this hook. This does **not** replace layer 1 — OpenCode's generated config sets `permission.edit: "allow"` for the primary builder agent, so relying on `permission.ask` alone would silently under-enforce.

All decisions are logged to the active feature's `.lh/features/<id>/events.jsonl` and `.lh/features/<id>/cavebus.log`.

## Self-contained by design

This package cannot import from `@feneto/lh`'s internal modules — OpenCode's npm-plugin installer fetches it standalone into its own cache, independent of any monorepo context. Everything it needs ships in `src/shared.ts`.

## License

MIT
