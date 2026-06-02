---
"@feneto/lh": patch
---

Fix lh-do skill invoking lh-spec via Skill tool, which fails because lh-spec has `disable-model-invocation: true`. The Specify step now delegates via the Agent tool (reading the skill file directly), consistent with how build/review/check steps are delegated.
