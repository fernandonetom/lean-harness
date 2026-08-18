import { describe, it, expect } from "vitest";
import { determineVerdict } from "../../src/verification/index.js";
import type { ReviewSummary } from "../../src/verification/review.js";

function emptyAcceptance() {
  return [{ id: "AC-01", text: "Test criterion", status: "pass" as const, evidence: ["test passes"], notes: [] }];
}

function emptyCommands() {
  return [];
}

function emptyChangedFiles() {
  return [{ path: "src/index.ts", changeType: "modified" as const, inBoundary: "yes" as const, notes: [] }];
}

function emptyBoundary() {
  return { status: "pass" as const, violations: [], notes: [] };
}

function emptyRiskGates() {
  return [];
}

function makeReview(overrides: Partial<ReviewSummary> = {}): ReviewSummary {
  return {
    verdict: "pass",
    findings: [],
    blockingFindings: [],
    notes: [],
    reviewsFound: true,
    reviewModes: ["independent"],
    ...overrides,
  };
}

describe("WP0: Enforce verification flags", () => {
  describe("requireReview", () => {
    it("blocks pass when requireReview is true and review verdict is unknown", () => {
      const result = determineVerdict({
        acceptance: emptyAcceptance(),
        commands: emptyCommands(),
        changedFiles: emptyChangedFiles(),
        boundary: emptyBoundary(),
        review: makeReview({ verdict: "unknown", reviewsFound: false }),
        riskGates: emptyRiskGates(),
        missingArtifacts: [],
        strict: false,
        requireReview: true,
      });

      expect(result.verdict).toBe("needs-fix");
      expect(result.unresolvedIssues.some((i) => i.includes("Review is required"))).toBe(true);
    });

    it("allows pass when requireReview is true and review has independent evidence", () => {
      const result = determineVerdict({
        acceptance: emptyAcceptance(),
        commands: emptyCommands(),
        changedFiles: emptyChangedFiles(),
        boundary: emptyBoundary(),
        review: makeReview({ verdict: "pass", reviewsFound: true, reviewModes: ["independent"] }),
        riskGates: emptyRiskGates(),
        missingArtifacts: [],
        strict: false,
        requireReview: true,
      });

      expect(result.verdict).toBe("pass");
    });

    it("allows pass when requireReview is undefined (legacy behavior)", () => {
      const result = determineVerdict({
        acceptance: emptyAcceptance(),
        commands: emptyCommands(),
        changedFiles: emptyChangedFiles(),
        boundary: emptyBoundary(),
        review: makeReview({ verdict: "unknown", reviewsFound: false }),
        riskGates: emptyRiskGates(),
        missingArtifacts: [],
        strict: false,
      });

      // Legacy: unknown review does not block
      expect(result.verdict).toBe("pass");
    });

    it("blocks on review with unresolved blocking findings", () => {
      const result = determineVerdict({
        acceptance: emptyAcceptance(),
        commands: emptyCommands(),
        changedFiles: emptyChangedFiles(),
        boundary: emptyBoundary(),
        review: makeReview({
          verdict: "needs-fix",
          findings: [{ severity: "major", source: "test", message: "Missing test" }],
          blockingFindings: [{ severity: "major", source: "test", message: "Missing test" }],
        }),
        riskGates: emptyRiskGates(),
        missingArtifacts: [],
        strict: false,
        requireReview: true,
      });

      expect(result.verdict).toBe("needs-fix");
    });
  });

  describe("allowSelfReview", () => {
    it("review verdict unaffected by self-review flag directly", () => {
      // allowSelfReview is handled in analyzeReviewEvidence, not determineVerdict.
      // This test ensures the verdict pipeline doesn't break with self-review mode.
      const result = determineVerdict({
        acceptance: emptyAcceptance(),
        commands: emptyCommands(),
        changedFiles: emptyChangedFiles(),
        boundary: emptyBoundary(),
        review: makeReview({ verdict: "pass", reviewModes: ["self"] }),
        riskGates: emptyRiskGates(),
        missingArtifacts: [],
        strict: false,
        requireReview: false,
      });

      expect(result.verdict).toBe("pass");
    });
  });

  describe("acceptance trace", () => {
    it("fails when acceptance criteria fail", () => {
      const result = determineVerdict({
        acceptance: [
          { id: "AC-01", text: "Broken", status: "fail", evidence: [], notes: [] },
          { id: "AC-02", text: "Skipped", status: "not checked", evidence: [], notes: [] },
        ],
        commands: emptyCommands(),
        changedFiles: emptyChangedFiles(),
        boundary: emptyBoundary(),
        review: makeReview({ verdict: "pass" }),
        riskGates: emptyRiskGates(),
        missingArtifacts: [],
        strict: false,
        requireReview: false,
      });

      expect(result.verdict).toBe("needs-fix");
      expect(result.unresolvedIssues.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("changed files", () => {
    it("blocks when no implementation files changed", () => {
      const result = determineVerdict({
        acceptance: emptyAcceptance(),
        commands: emptyCommands(),
        changedFiles: [],
        boundary: emptyBoundary(),
        review: makeReview({ verdict: "pass" }),
        riskGates: emptyRiskGates(),
        missingArtifacts: [],
        strict: false,
      });

      expect(result.verdict).toBe("blocked");
    });
  });
});
