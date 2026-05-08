import { describe, it, expect } from "vitest";
import {
  extractCaveBusProtectedTokens,
  checkProtectedTokensPreserved,
  containsSecretLikeValue,
  redactSecrets,
} from "../../src/cavebus/protected.js";

describe("extractCaveBusProtectedTokens", () => {
  it("finds feature IDs like F001", () => {
    const tokens = extractCaveBusProtectedTokens("REQ F001 status:draft", "test");
    expect(tokens.some((t) => t.value === "F001" && t.kind === "feature_id")).toBe(true);
  });

  it("finds task IDs like T01", () => {
    const tokens = extractCaveBusProtectedTokens("TASK F001 T01", "test");
    expect(tokens.some((t) => t.value === "T01" && t.kind === "task_id")).toBe(true);
  });

  it("finds acceptance criteria IDs like AC1", () => {
    const tokens = extractCaveBusProtectedTokens("ac:\n- AC1: user can login", "test");
    expect(tokens.some((t) => t.value === "AC1" && t.kind === "acceptance_criteria_id")).toBe(true);
  });

  it("finds file paths", () => {
    const tokens = extractCaveBusProtectedTokens("- src/auth/login.ts", "test");
    expect(tokens.some((t) => t.kind === "file_path")).toBe(true);
  });

  it("finds environment variables from ENV_LIKE_WORDS", () => {
    const tokens = extractCaveBusProtectedTokens("Set DATABASE_URL and API_KEY", "test");
    expect(tokens.some((t) => t.value === "DATABASE_URL" && t.kind === "environment_variable")).toBe(true);
    expect(tokens.some((t) => t.value === "API_KEY" && t.kind === "environment_variable")).toBe(true);
  });
});

describe("checkProtectedTokensPreserved", () => {
  it("returns ok when important tokens are preserved", () => {
    const source = "Feature F001 task T01 file src/auth.ts";
    const compressed = "F001 T01 src/auth.ts";
    const result = checkProtectedTokensPreserved(source, compressed, "test");
    expect(result.ok).toBe(true);
    expect(result.warnings.length).toBe(0);
  });

  it("warns when important tokens are missing from compressed output", () => {
    const source = "Feature F001 task T01 file src/auth.ts";
    const compressed = "F001 only";
    const result = checkProtectedTokensPreserved(source, compressed, "test");
    expect(result.ok).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("containsSecretLikeValue", () => {
  it("detects sk- prefixed secrets", () => {
    expect(containsSecretLikeValue("sk-abc123abc123")).toBe(true);
  });

  it("returns false for normal text", () => {
    expect(containsSecretLikeValue("hello world")).toBe(false);
  });

  it("detects ghp_ prefixed tokens", () => {
    expect(containsSecretLikeValue("ghp_abcdef1234")).toBe(true);
  });
});

describe("redactSecrets", () => {
  it("replaces secret patterns with [REDACTED]", () => {
    const result = redactSecrets("key is sk-abcdefghij1234567890");
    expect(result.hadSecrets).toBe(true);
    expect(result.redacted).toContain("[REDACTED]");
    expect(result.redacted).not.toContain("sk-abcdefghij1234567890");
  });

  it("returns unchanged text when no secrets", () => {
    const result = redactSecrets("just normal text here");
    expect(result.hadSecrets).toBe(false);
    expect(result.redacted).toBe("just normal text here");
  });
});
