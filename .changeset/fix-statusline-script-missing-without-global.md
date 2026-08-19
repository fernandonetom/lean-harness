---
"@feneto/lh": patch
---

Fixed `lh init --host claude-code` (the normal, non-`--global` flow) writing `.claude/settings.local.json`'s `statusLine` to reference `~/.claude/statusline.sh` without ever creating that script. Previously the script was only written by the separate `lh init --global` flow, so a fresh install following the documented `/plugin install` + `lh init --host claude-code` steps ended up with a statusline command pointing at a nonexistent file. The project-local install now also ensures the shared script exists (creating it if missing, never overwriting a script you may have customized).
