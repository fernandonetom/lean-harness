---
"@feneto/lh": patch
---

Fix two Claude Code agent-related issues in the LeanHarness integration:

- **Remove `disable-model-invocation: true` from all 7 lh-* Claude Code skills.** This fixes the `Skill lh-discover cannot be used with Skill tool due to disable-model-invocation` error that blocked generic-purpose agents and the lh-do orchestrator from loading these skills. All lh-* skills are now usable via the Skill tool, slash commands, or Agent-based subagent delegation.

- **Fix `lh-discover` OpenCode command `agent: none` → `lh-scout`** in the command bundle frontmatter, matching the `opencode.json` command config. Update Claude Code skill body text to remove contradictory "no scout subagent" language.

- **Update internal release procedures:** Enhance `.opencode/commands/lh-release.md` with the full changesets/action CI pipeline (wait CI, rebase-merge, wait version PR) and add a matching project-local Claude Code release skill at `.claude/skills/lh-release/SKILL.md`.

- **Update skill instruction:** Replace the outdated `Never Call Skill(lh-spec)` warning in `lh-do` with positive guidance that Skill tool delegation is now supported for all lh-* skills.
