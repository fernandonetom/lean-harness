# Patterns

<!-- LeanHarness memory file. Add entries as the project evolves. -->

## OpenCode vs Claude Code skill isolation

The lean-harness repo has both `.claude/skills/lh-*/SKILL.md` and `.opencode/commands/lh-*.md` installed (dogfood mode). When the model is running on the OpenCode host, it must NOT read Claude Code skills — those contain Claude-specific prompts (e.g., Sonnet vs Haiku model selection, AskUserQuestion for exec mode) that do not apply to OpenCode, which uses the current session model and runs builds as a single `lh-builder` agent with self-review.

Concrete pattern that broke: the OpenCode `lh-do` "Operating Rules" only said "use subagents when helpful" without explicitly delegating to `.opencode/commands/lh-build.md`. The model then picked up the Claude Code `lh-build` skill and surfaced its exec-mode + model questions in OpenCode's "Reply with the number of your choice" format.

Fix applied: OpenCode `lh-do.md` now explicitly delegates each phase to its `.opencode/commands/lh-*.md` file, plus a `## Model and Execution Mode` section stating OpenCode uses the current session model with no per-task model or exec-mode choice. The OpenCode `lh-build.md` got an `## OpenCode Notes` section reinforcing the same. Files regenerated via `npm run build` and reinstalled via `lh init --host opencode --force`.

