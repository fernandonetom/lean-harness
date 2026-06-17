---
"@feneto/lh": patch
---

Fix two guardrail issues that blocked lh-builder agent edits in certain configurations:

**Boundary field alias support (hooks, plugin, verification, templates):**
The guardrail hooks (Claude Code pre-tool-use hook and OpenCode plugin) and the verification pipeline now accept multiple boundary field name forms:
- `touch` (string array, matching the API-stability docs and earlier schemas)
- `touchFiles` (current canonical object-array form with `{ path, reason, confidence }`)
- `files` (older object form with `modify`/`create`/`delete` arrays)

Same tolerance applies to `readOnly` vs `readOnlyFiles`. This unblocks agents working with feature folders that predate the rename or were authored against the documented schema.

Also fixes `.lh/templates/boundary.json` to match the enforced `BoundaryJson` schema (`riskGates[]` with `name`/`reason`/`status`, no `command` required on `relevantTests[]`), so future discoveries round-trip cleanly through the guardrail chain.

**OpenCode `lh-do` / `lh-build` no longer surfacing Claude Code model questions:**
The OpenCode command bundles now explicitly delegate each phase to its `.opencode/commands/lh-*.md` file and include a warning not to read `.claude/skills/lh-*/SKILL.md`. The `lh-builder` agent already runs as a single primary agent with mandatory self-review per task; a new `OpenCode Notes` section in `lh-build.md` makes that explicit and documents that OpenCode uses the current session model with no per-task model selection or subagent-vs-current-agent choice.
