import { describe, it, expect } from "vitest";
import {
  checkRiskGates,
  enforceRiskGates,
} from "../../src/core/risk-gates.js";
import type { RiskGateMatch, RiskApproval } from "../../src/core/risk-gates.js";

describe("checkRiskGates", () => {
  it("returns empty when no gates configured", () => {
    const result = checkRiskGates([], ["src/auth.ts"], ["auth rewrite"], []);
    expect(result).toEqual([]);
  });

  it("matches file patterns against task files", () => {
    const result = checkRiskGates(
      ["auth_rewrite"],
      ["src/auth/login.ts", "src/utils/format.ts"],
      [],
      [],
    );
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((m) => m.gate === "auth_rewrite" && m.source === "file")).toBe(true);
  });

  it("matches note patterns against task notes", () => {
    const result = checkRiskGates(
      ["payment_logic"],
      [],
      ["Update payment processing flow"],
      [],
    );
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((m) => m.gate === "payment_logic" && m.source === "note")).toBe(true);
  });

  it("matches boundary risk gates", () => {
    const result = checkRiskGates(
      ["auth_rewrite"],
      [],
      [],
      ["auth_rewrite"],
    );
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((m) => m.gate === "auth_rewrite" && m.source === "boundary")).toBe(true);
  });

  it("detects new_dependency via package.json", () => {
    const result = checkRiskGates(
      ["new_dependency"],
      ["package.json"],
      [],
      [],
    );
    expect(result.some((m) => m.gate === "new_dependency")).toBe(true);
  });

  it("detects destructive_migration via migration files", () => {
    const result = checkRiskGates(
      ["destructive_migration"],
      ["db/migrations/001_drop_users.sql"],
      [],
      [],
    );
    expect(result.some((m) => m.gate === "destructive_migration")).toBe(true);
  });

  it("does not match unrelated files", () => {
    const result = checkRiskGates(
      ["auth_rewrite"],
      ["src/components/Button.tsx", "src/utils/format.ts"],
      [],
      [],
    );
    expect(result).toEqual([]);
  });

  it("deduplicates matches", () => {
    const result = checkRiskGates(
      ["auth_rewrite"],
      ["src/auth.ts", "src/auth.ts"],
      [],
      [],
    );
    const authFileMatches = result.filter((m) => m.detail === "src/auth.ts");
    expect(authFileMatches.length).toBe(1);
  });
});

describe("enforceRiskGates", () => {
  const makeMatch = (gate: string): RiskGateMatch => ({
    gate,
    source: "file",
    detail: "test-file.ts",
  });

  const makeApproval = (gate: string): RiskApproval => ({
    gate,
    approvedAt: "2024-01-01T00:00:00Z",
    approvedBy: "cli",
  });

  it("all clear when no matches", () => {
    const result = enforceRiskGates([], [], false);
    expect(result.allClear).toBe(true);
    expect(result.blocked).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("warns (not blocks) in non-strict mode for unapproved gates", () => {
    const result = enforceRiskGates(
      [makeMatch("auth_rewrite")],
      [],
      false,
    );
    expect(result.allClear).toBe(true);
    expect(result.blocked).toEqual([]);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain("--approve-risk");
  });

  it("blocks in strict mode for unapproved gates", () => {
    const result = enforceRiskGates(
      [makeMatch("auth_rewrite")],
      [],
      true,
    );
    expect(result.allClear).toBe(false);
    expect(result.blocked).toContain("auth_rewrite");
  });

  it("does not block approved gates even in strict mode", () => {
    const result = enforceRiskGates(
      [makeMatch("auth_rewrite")],
      [makeApproval("auth_rewrite")],
      true,
    );
    expect(result.allClear).toBe(true);
    expect(result.blocked).toEqual([]);
    expect(result.warnings.some((w) => w.includes("approved"))).toBe(true);
  });

  it("handles multiple gates with mixed approval", () => {
    const result = enforceRiskGates(
      [makeMatch("auth_rewrite"), makeMatch("payment_logic")],
      [makeApproval("auth_rewrite")],
      true,
    );
    expect(result.allClear).toBe(false);
    expect(result.blocked).toContain("payment_logic");
    expect(result.blocked).not.toContain("auth_rewrite");
  });

  it("results array tracks triggered and approved status", () => {
    const result = enforceRiskGates(
      [makeMatch("auth_rewrite")],
      [makeApproval("auth_rewrite")],
      false,
    );
    expect(result.results.length).toBe(1);
    expect(result.results[0]!.triggered).toBe(true);
    expect(result.results[0]!.approved).toBe(true);
  });
});
