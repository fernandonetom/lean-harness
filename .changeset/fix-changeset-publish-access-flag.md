---
---

CI-only change, no package behavior affected: fixed `pnpm run release` passing `--access public` to `changeset publish`, which doesn't accept that flag (its valid flags are `--tag`, `--otp`, `--no-git-tag`) and made every real publish attempt fail with "Unknown flag for publish: --access" before it ever reached npm. Publish access for scoped packages is already configured correctly via `"access": "public"` in `.changeset/config.json`, which `changeset publish` reads on its own — the CLI flag was redundant as well as invalid.
