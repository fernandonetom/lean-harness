import { describe, it, expect } from "vitest";
import { parseTasksMarkdown } from "../../src/context/task-context.js";

describe("parseTasksMarkdown", () => {
  it("keeps hyphenated field headers like 'Read-only context:' from merging into the previous field", () => {
    const markdown = `
### T01: Add password reset flow

- Status: pending
- Acceptance criteria:
  - AC1
- Slice: backend
- Goal: allow users to reset their password
- Expected files:
  - src/auth/reset.ts
- Read-only context:
  - src/auth/session.ts
- Test expectation: unit tests pass
- Verification commands:
  - npm test
- Risk notes:
  - none
- Dependencies: none
`;

    const [task] = parseTasksMarkdown(markdown);

    expect(task).toBeDefined();
    expect(task!.expectedFiles).toEqual(["src/auth/reset.ts"]);
    expect(task!.readOnlyContext).toEqual(["src/auth/session.ts"]);
  });
});
