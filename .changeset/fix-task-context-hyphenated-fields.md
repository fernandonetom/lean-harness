---
"@feneto/lh": patch
---

Fixed the task-context compiler's field-header regex (`packages/cli/src/context/task-context.ts`) rejecting hyphenated field names like `Read-only context:`. Unrecognized headers silently fell through and got merged into the following field's value, which could cause read-only reference files to be misclassified as touch files — surfacing as spurious risk-gate triggers (e.g. `public_api_break`, `new_dependency`) on tasks that never actually touched those files.
