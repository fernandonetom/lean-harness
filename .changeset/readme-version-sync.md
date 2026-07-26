---
"@feneto/lh": patch
---

Fix README.md version sync during release. Add `scripts/sync-readme-version.mjs` that reads `version` from `package.json` and updates the `## Status` line in `README.md`. Wire it into the `version-packages` release script so every changeset-driven Version Packages PR includes the README bump. Add a CI shield (`readme-version-check`) that validates the versions match on every PR. Fix the current stale README version (`v1.3.0` → `v1.5.0`).
