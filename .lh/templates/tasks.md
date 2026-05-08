# Tasks: {{FEATURE_ID}} — {{FEATURE_TITLE}}

> Task tracker for the **build** step. Updated as tasks progress.

## Status Key

- `pending` — not started
- `active` — in progress
- `done` — completed and verified
- `blocked` — waiting on dependency or decision
- `skipped` — intentionally not done

## Weight Key

| Weight | Meaning |
|--------|---------|
| 1 | Read-only or trivial config change |
| 2 | Small isolated change, 1–3 files |
| 3 | Mid-size change, cross-file wiring |
| 5 | Complex logic, new module, or risky area |

## Tasks

| ID | Description | Weight | Status | Depends On | AC |
|----|-------------|--------|--------|------------|----|
| T-01 | _description_ | 2 | pending | — | AC-01 |
| T-02 | _description_ | 3 | pending | T-01 | AC-01 |
| T-03 | _description_ | 5 | pending | — | AC-02 |

## Notes

_Task-level context that doesn't belong in individual task summaries._
