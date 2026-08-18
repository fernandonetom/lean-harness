---
"@feneto/lh": patch
---

Fixed `lh build --host claude-code` unconditionally passing an unsupported `--cwd` flag to the `claude` CLI, causing every real (non-dry-run) Claude Code build to fail with `error: unknown option '--cwd'`. The working directory is already set via the child process's `cwd` spawn option, so the flag was redundant as well as unsupported — removed it.
