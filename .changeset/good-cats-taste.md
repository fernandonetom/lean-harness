---
"@feneto/lh": minor
---

Configurable boundary enforcement

- New `lh boundary` CLI command with allow/block/exempt/list/show subcommands
- Configurable enforcement modes: strict, warn, off
- Added always_allow glob patterns in config
- Enhanced pre-tool-use hooks with enforcement logic
- Removed obsolete state.json file
