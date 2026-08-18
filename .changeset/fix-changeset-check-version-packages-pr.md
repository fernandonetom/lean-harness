---
---

CI-only change, no package behavior affected: `changeset-check` no longer runs against the changesets action's own "Version Packages" PR (`changeset-release/main`), which always failed the check since it has already consumed its changesets by the time it opens.
