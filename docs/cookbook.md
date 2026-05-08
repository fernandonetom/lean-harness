# Cookbook

Real-world usage patterns for LeanHarness.

---

## Add an API endpoint

```bash
lh spec "Add POST /api/users/deactivate endpoint that soft-deletes a user by setting active=false"
lh discover F001 --hint src/routes --hint src/models/user
lh plan F001
lh build F001 --host claude-code --dry-run
lh build F001 --host claude-code
lh check F001 --run --command "npm test -- --grep deactivate"
```

Key flags:
- `--hint` narrows discovery to relevant directories
- `--dry-run` previews the agent invocation without running it
- `--command` adds explicit verification commands beyond what discovery found

---

## Fix a bug with evidence

```bash
lh spec "Fix: login returns 500 when email contains '+' character" --title "plus-sign-login-bug"
lh discover F001 --depth D1 --hint src/auth
lh plan F001 --task-size small
lh build F001 --host claude-code
lh check F001 --run --strict
```

Key patterns:
- `--depth D1` for targeted bugs — shallow discovery is faster
- `--task-size small` generates focused tasks
- `--strict` requires strong verification evidence

---

## Refactor with risk gates

```bash
lh spec "Refactor auth middleware to use JWT instead of session cookies"
lh discover F001 --depth D3
lh plan F001
```

Discovery will flag `auth_rewrite` risk gate. Approve explicitly:

```bash
lh build F001 --host claude-code --approve-risk auth_rewrite
```

Or approve interactively — build will prompt before proceeding.

---

## Multi-task feature with bounded context

```bash
lh spec "Add user notification preferences: email, push, SMS toggles per notification type"
lh discover F001 --depth D2
lh plan F001 --max-tasks 6 --task-size medium
```

Each task gets its own bounded context:

```bash
lh compile-task F001 T1 --print    # preview what the agent sees
lh build F001                       # runs all tasks in sequence
```

After build:

```bash
lh compress F001                    # generate CaveBus summaries
lh check F001 --run                 # verify all acceptance criteria
```

---

## Discovery-first exploration

When unsure what a feature touches:

```bash
lh spec "Improve search performance for large result sets"
lh discover F001 --depth D3 --max-files 50
lh show F001                       # review what was found
```

If discovery missed something:

```bash
lh discover F001 --depth D4 --hint src/search --hint src/db/queries
```

Discovery reruns merge — deeper depth expands the boundary.

---

## Dry-run workflow

Always dry-run first for unfamiliar codebases:

```bash
lh spec "Add rate limiting to public API endpoints"
lh discover F001
lh plan F001
lh build F001 --dry-run            # see what would execute
lh build F001 --host claude-code   # execute for real
```

Dry-run output shows: compiled prompt, CLI arguments, target files. No agent tokens spent.

---

## Watch mode for iterative development

During active development, watch boundary files and re-verify on change:

```bash
lh build F001 --host claude-code
lh watch F001 --run                # re-runs check on file change
```

Watch monitors all files in `boundary.json` (touch, read-only, tests). 1-second debounce prevents rapid re-runs.

Stop with Ctrl+C.

---

## CaveBus inspection

After a build, inspect compressed summaries:

```bash
lh cavebus F001                    # show all messages
lh cavebus F001 --type summary     # filter by type
lh cavebus F001 --tail 5           # last 5 entries
lh cavebus F001 --validate         # check protected tokens
lh cavebus F001 --validate --strict # strict validation
```

If validation warns about dropped tokens:

```bash
lh compress F001 --force           # regenerate summaries
```

---

## Using with OpenCode

```bash
lh init --host opencode
lh build F001 --host opencode --opencode-agent builder
```

OpenCode-specific flags:
- `--opencode-agent` selects the agent (default: builder)
- `--opencode-command` overrides CLI path
- `--format json` for structured output
- `--session` / `--attach` for session management

---

## Memory across features

After completing features, memory accumulates project knowledge:

```bash
lh memory show              # see all memory
lh memory show patterns     # see learned patterns
lh memory show decisions    # see architectural decisions
lh memory clear cave        # clear CaveBus memory
```

Memory reduces rediscovery cost. Subsequent features benefit from patterns and conventions learned from earlier work.

---

## Model override

Use a specific model for a build:

```bash
lh build F001 --host claude-code --model claude-opus-4-20250514
```

Or set in config for all builds:

```yaml
# .lh/config.yml
models:
  agent: claude-opus-4-20250514
  subagent: claude-sonnet-4-20250514
```

CLI `--model` overrides `models.agent` from config.

---

## Shell completion

Generate and install tab completion:

```bash
# Bash
lh completion bash >> ~/.bashrc

# Zsh
lh completion zsh >> ~/.zshrc

# Fish
lh completion fish > ~/.config/fish/completions/lh.fish
```

Completes: commands, flags, feature IDs from `state.json`.

---

## Plugin: custom discovery strategy

```javascript
// .lh/plugins/graphql-discovery/index.js
module.exports = {
  name: "graphql-discovery",
  version: "1.0.0",
  hooks: {
    afterDiscover: async (ctx) => {
      // scan for .graphql files related to the feature
      // append to boundary.json
    }
  }
};
```

```json
// .lh/plugins/graphql-discovery/plugin.json
{ "name": "graphql-discovery", "version": "1.0.0", "main": "index.js" }
```

Plugins run hooks in registration order. See [API stability](api-stability.md) for the `LHPlugin` interface.

---

## Doctor auto-fix

When setup issues are detected:

```bash
lh doctor              # diagnose
lh doctor --fix        # auto-fix what's possible
```

Auto-fix handles: missing directories, missing templates, invalid state.json, missing config keys.
