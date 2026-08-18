---
"@feneto/lh": patch
---

Fixed `lh doctor` unconditionally warning `.opencode/plugins/shared.js` and `.opencode/plugins/leanharness-guardrails.js` as "missing" for every v2 default-mode OpenCode install — those files are only written with `--local-plugin`; the default registers the npm-published `@feneto/lh-opencode` package in `opencode.json` instead, so their absence there is expected, not an error. `lh doctor` now also detects and `fail`s when both distribution modes are active at once (the npm plugin registered in `opencode.json` *and* local files present in `.opencode/plugins/`), since OpenCode auto-loads every `.js` file dropped into that directory regardless of `opencode.json`, causing the guardrail hooks to double-register.

Fixed the underlying cause: `lh init --host opencode` (default, non-`--local-plugin` mode) previously never cleaned up `.opencode/plugins/shared.js` / `leanharness-guardrails.js` left over from a v1.x install or a prior `--local-plugin` run — every v1.x-to-v2 OpenCode migration would silently end up in the double-registration state above. `lh init --host opencode --force` now removes those stale, LeanHarness-managed local files when defaulting to the npm-registered plugin; without `--force` it warns instead of deleting.
