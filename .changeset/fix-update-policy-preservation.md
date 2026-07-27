---
"@feneto/lh": patch
---

Fix `lh update` silently overwriting user customizations in `.lh/policies/*.yml` and `.lh/state.json` (active feature tracking). The existing config.yml backup/restore mechanism is now generalized to also cover `policies/risk-gates.yml`, `policies/boundary.yml`, `policies/commands.yml`, `policies/claude-code.yml`, `policies/opencode.yml`, and `state.json`. Also fix the bundled `commands.yml` template itself, which shipped with a corrupted/duplicated deny-list tail since v1.4.0.
