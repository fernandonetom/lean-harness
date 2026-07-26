---
"@feneto/lh": minor
---

LeanHarness 1.5.0: cheap build, strong review. 

New features:
- `lh config` — full config surface (get/set/unset/list/validate) for all `.lh/config.yml` keys
- `lh review` — independent code review command producing structured `reviews/<taskId>.json` artifacts
- Role-based model routing — `models.planner/builder/reviewer/verifier/compressor/fix` with `by_host` and `profiles`
- Touched-file quality gates — TypeScript typecheck, ESLint, and test gates scoped to changed files
- `verification.allow_self_review` — self-review alone cannot satisfy `require_review` when false
- Structured review analysis — JSON review artifacts take priority over legacy text scrapes
- Reviewer quality pack — adversarial stance, AC coverage mapping, boundary comparison, 7 required flags
- Adversarial reviewer agent prompts — equal depth for Claude Code and OpenCode
- Claude Code adapter now passes `--model` flag (previously ignored)
- Doctor checks for reviewer model configuration, builder===reviewer warning, OC model format
- Gate infrastructure with `lh gate` command
- Review artifact templates and write helpers
</EOF>
echo "Changeset created"