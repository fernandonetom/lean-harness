---
"@feneto/lh": minor
---

Make `git push --force` configurable via `command_enforcement.force_push` in `.lh/config.yml`. Default: `warn` (instead of hardcoded deny). Add `lh command status` and `lh command set-force-push` CLI commands. Remove force push from hardcoded deny lists in both Claude Code and OpenCode adapters — the hooks/plugins now enforce the configured mode at runtime.
