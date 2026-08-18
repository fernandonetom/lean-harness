# @feneto/lh-claude-code-plugin

The [LeanHarness](https://github.com/fernandonetom/lean-harness) Claude Code plugin — skills, subagents, and guardrail hooks for the Specify → Discover → Build → Check workflow.

This package is never published to npm (`private: true`). It's distributed via git + Claude Code's plugin marketplace convention:

```
/plugin marketplace add fernandonetom/lean-harness
/plugin install lh@lean-harness
```

`lh init --host claude-code` (from the `@feneto/lh` CLI) only writes project-local settings (`.claude/settings.json`) and a reference policy doc — it does not generate skills, agents, or hooks; those all come from this plugin. See [docs/hosts/claude-code.md](https://github.com/fernandonetom/lean-harness/blob/main/docs/hosts/claude-code.md) in the main repo for the full integration guide.

## What's in here

| Path | Purpose |
|------|---------|
| `skills/` | `/lh-*` slash-command workflows (spec, discover, plan, build, check, status, worktree, do) |
| `agents/` | Subagents (`lh-scout`, `lh-builder`, `lh-builder-fix`, `lh-reviewer`, `lh-verifier`, `lh-compressor`) |
| `hooks/` | Lifecycle guardrail hooks (boundary enforcement, risk gate warnings, event logging) |
| `.claude-plugin/plugin.json` | Plugin manifest |

## License

MIT
