# Review: {{featureId}} / {{taskId}}

- **Verdict:** {{verdict}}
- **Mode:** {{mode}}
- **Model:** {{model}}
- **Reviewed at:** {{reviewedAt}}
- **Iteration:** {{iteration}}

## Files Reviewed

{{#filesReviewed}}
- {{.}}
{{/filesReviewed}}

## Findings

{{#findings}}
### [{{severity}}] {{file}}{{#symbol}} — `{{symbol}}`{{/symbol}}

**Evidence:** {{evidence}}

**Fix:** {{fix}}

{{/findings}}

## Checklist

| Gate | Result |
|------|--------|
| Acceptance Criteria | {{checklist.acceptanceCriteria}} |
| Boundary | {{checklist.boundary}} |
| Tests | {{checklist.tests}} |
| Security | {{checklist.security}} |
| Risk Gates | {{checklist.riskGates}} |
