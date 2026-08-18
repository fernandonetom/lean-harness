import { describe, it, expect } from "vitest";
import {
  parseSpecForPlanning,
  extractAcceptanceCriteria,
  ensureAcceptanceCriteria,
} from "../../src/planning/acceptance.js";
import { SAMPLE_SPEC_MD } from "../helpers/fixture.js";

describe("parseSpecForPlanning", () => {
  it("extracts featureId from heading with Spec: prefix", () => {
    const parsed = parseSpecForPlanning(SAMPLE_SPEC_MD, {
      featureId: "FALLBACK",
      title: "Fallback",
    });

    expect(parsed.featureId).toBe("F001");
  });

  it("extracts title from heading", () => {
    const parsed = parseSpecForPlanning(SAMPLE_SPEC_MD, {
      featureId: "FALLBACK",
      title: "Fallback",
    });

    expect(parsed.title).toBe("Add password reset");
  });

  it("extracts status", () => {
    const parsed = parseSpecForPlanning(SAMPLE_SPEC_MD, {
      featureId: "F001",
      title: "Test",
    });

    expect(parsed.status).toBe("draft");
  });

  it("extracts originalRequest from Original Request section", () => {
    const parsed = parseSpecForPlanning(SAMPLE_SPEC_MD, {
      featureId: "F001",
      title: "Test",
    });

    expect(parsed.originalRequest).toContain("password reset");
  });

  it("extracts goal from Goal section", () => {
    const parsed = parseSpecForPlanning(SAMPLE_SPEC_MD, {
      featureId: "F001",
      title: "Test",
    });

    expect(parsed.goal).toContain("password reset");
  });

  it("extracts acceptance criteria from checkbox lines", () => {
    const parsed = parseSpecForPlanning(SAMPLE_SPEC_MD, {
      featureId: "F001",
      title: "Test",
    });

    expect(parsed.acceptanceCriteria.length).toBe(3);
    expect(parsed.acceptanceCriteria[0]!.id).toBe("AC1");
    expect(parsed.acceptanceCriteria[0]!.text).toContain(
      "Users can request a password reset email",
    );
    expect(parsed.acceptanceCriteria[0]!.checked).toBe(false);
  });

  it("extracts constraints from list items", () => {
    const parsed = parseSpecForPlanning(SAMPLE_SPEC_MD, {
      featureId: "F001",
      title: "Test",
    });

    expect(parsed.constraints.length).toBe(2);
    expect(parsed.constraints[0]).toContain("existing email service");
    expect(parsed.constraints[1]).toContain("existing login flow");
  });

  it("uses fallback when heading has no feature ID", () => {
    const md = `# Some random title

## Original Request

Do something
`;
    const parsed = parseSpecForPlanning(md, {
      featureId: "F099",
      title: "Fallback Title",
    });

    expect(parsed.featureId).toBe("F099");
  });

  it("preserves raw markdown", () => {
    const parsed = parseSpecForPlanning(SAMPLE_SPEC_MD, {
      featureId: "F001",
      title: "Test",
    });

    expect(parsed.raw).toBe(SAMPLE_SPEC_MD);
  });
});

describe("extractAcceptanceCriteria", () => {
  it("parses unchecked checkbox with AC label", () => {
    const section = "- [ ] AC1: Users can request reset\n";
    const criteria = extractAcceptanceCriteria(section);

    expect(criteria).toHaveLength(1);
    expect(criteria[0]!.id).toBe("AC1");
    expect(criteria[0]!.text).toBe("Users can request reset");
    expect(criteria[0]!.checked).toBe(false);
  });

  it("parses checked checkbox with AC label", () => {
    const section = "- [x] AC2: Tokens expire\n";
    const criteria = extractAcceptanceCriteria(section);

    expect(criteria).toHaveLength(1);
    expect(criteria[0]!.id).toBe("AC2");
    expect(criteria[0]!.text).toBe("Tokens expire");
    expect(criteria[0]!.checked).toBe(true);
  });

  it("skips placeholder text", () => {
    const section = "- [ ] AC1: Define the first observable outcome.\n";
    const criteria = extractAcceptanceCriteria(section);

    expect(criteria).toHaveLength(0);
  });

  it("auto-generates AC IDs for unlabeled bullets", () => {
    const section = `- [ ] Users can log in
- [ ] Users can log out
`;
    const criteria = extractAcceptanceCriteria(section);

    expect(criteria).toHaveLength(2);
    expect(criteria[0]!.id).toBe("AC1");
    expect(criteria[0]!.text).toBe("Users can log in");
    expect(criteria[1]!.id).toBe("AC2");
    expect(criteria[1]!.text).toBe("Users can log out");
  });

  it("parses mixed labeled and unlabeled criteria", () => {
    const section = `- [ ] AC1: First criterion
- [ ] Second criterion without label
- [x] AC3: Third criterion checked
`;
    const criteria = extractAcceptanceCriteria(section);

    expect(criteria).toHaveLength(3);
    expect(criteria[0]!.id).toBe("AC1");
    expect(criteria[1]!.id).toBe("AC2");
    expect(criteria[2]!.id).toBe("AC3");
    expect(criteria[2]!.checked).toBe(true);
  });

  it("handles empty section", () => {
    const criteria = extractAcceptanceCriteria("");
    expect(criteria).toHaveLength(0);
  });

  it("skips italic placeholder lines", () => {
    const section = "_Define the first observable outcome._\n";
    const criteria = extractAcceptanceCriteria(section);
    expect(criteria).toHaveLength(0);
  });
});

describe("ensureAcceptanceCriteria", () => {
  it("returns existing criteria when non-empty", () => {
    const parsed = parseSpecForPlanning(SAMPLE_SPEC_MD, {
      featureId: "F001",
      title: "Test",
    });

    const criteria = ensureAcceptanceCriteria(parsed);

    expect(criteria).toHaveLength(3);
    expect(criteria[0]!.id).toBe("AC1");
  });

  it("returns placeholder criteria when spec has none", () => {
    const md = `# F001 Empty spec

## Acceptance Criteria

_Define the first observable outcome._
`;
    const parsed = parseSpecForPlanning(md, {
      featureId: "F001",
      title: "Empty",
    });

    expect(parsed.acceptanceCriteria).toHaveLength(0);

    const criteria = ensureAcceptanceCriteria(parsed);

    expect(criteria.length).toBeGreaterThan(0);
    expect(criteria[0]!.id).toBe("AC1");
    expect(criteria[0]!.text).toContain("primary observable outcome");
  });
});
