import { describe, it, expect } from "vitest";
import {
  extractProtectedTokens,
  mergeProtectedTokens,
  looksLikePath,
  looksLikeCommand,
} from "../../src/context/protected-tokens.js";

describe("extractProtectedTokens", () => {
  it("finds feature IDs like F001", () => {
    const tokens = extractProtectedTokens("Feature F001 is ready", "test");
    expect(tokens.some((t) => t.value === "F001" && t.kind === "feature_id")).toBe(true);
  });

  it("finds task IDs like T01", () => {
    const tokens = extractProtectedTokens("Task T01 and T02 are planned", "test");
    expect(tokens.some((t) => t.value === "T01" && t.kind === "task_id")).toBe(true);
    expect(tokens.some((t) => t.value === "T02" && t.kind === "task_id")).toBe(true);
  });

  it("finds acceptance criteria IDs like AC1", () => {
    const tokens = extractProtectedTokens("Check AC1 and AC2", "test");
    expect(tokens.some((t) => t.value === "AC1" && t.kind === "acceptance_criteria_id")).toBe(true);
    expect(tokens.some((t) => t.value === "AC2" && t.kind === "acceptance_criteria_id")).toBe(true);
  });

  it("finds file paths like src/auth/password.ts", () => {
    const tokens = extractProtectedTokens("- src/auth/password.ts", "test");
    expect(tokens.some((t) => t.value === "src/auth/password.ts" && t.kind === "file_path")).toBe(true);
  });

  it("finds URLs", () => {
    const tokens = extractProtectedTokens("Visit https://example.com/docs", "test");
    expect(tokens.some((t) => t.value === "https://example.com/docs" && t.kind === "url")).toBe(true);
  });

  it("finds commit hashes (7+ hex chars, not all digits)", () => {
    const tokens = extractProtectedTokens("commit abc1234def", "test");
    expect(tokens.some((t) => t.kind === "commit_hash")).toBe(true);
  });

  it("does not treat all-digit sequences as commit hashes", () => {
    const tokens = extractProtectedTokens("number 1234567", "test");
    expect(tokens.every((t) => t.kind !== "commit_hash")).toBe(true);
  });

  it("finds environment variables from ENV_LIKE_WORDS set", () => {
    const tokens = extractProtectedTokens("Set DATABASE_URL and API_KEY", "test");
    expect(tokens.some((t) => t.value === "DATABASE_URL" && t.kind === "environment_variable")).toBe(true);
    expect(tokens.some((t) => t.value === "API_KEY" && t.kind === "environment_variable")).toBe(true);
  });
});

describe("mergeProtectedTokens", () => {
  it("deduplicates by kind:value", () => {
    const group1 = [
      { value: "F001", kind: "feature_id" as const, source: "a" },
      { value: "T01", kind: "task_id" as const, source: "a" },
    ];
    const group2 = [
      { value: "F001", kind: "feature_id" as const, source: "b" },
      { value: "T02", kind: "task_id" as const, source: "b" },
    ];
    const merged = mergeProtectedTokens([group1, group2]);
    expect(merged.length).toBe(3);
    expect(merged.filter((t) => t.value === "F001").length).toBe(1);
  });

  it("returns empty for empty input", () => {
    expect(mergeProtectedTokens([])).toEqual([]);
    expect(mergeProtectedTokens([[]])).toEqual([]);
  });
});

describe("looksLikePath", () => {
  it("returns true for paths with /", () => {
    expect(looksLikePath("src/auth/password.ts")).toBe(true);
    expect(looksLikePath("lib/index.js")).toBe(true);
  });

  it("returns true for files with known extensions", () => {
    expect(looksLikePath("config.json")).toBe(true);
    expect(looksLikePath("main.py")).toBe(true);
  });

  it("returns false for plain words", () => {
    expect(looksLikePath("hello")).toBe(false);
    expect(looksLikePath("world")).toBe(false);
  });

  it("returns false for http URLs (handled separately)", () => {
    expect(looksLikePath("https://example.com")).toBe(false);
  });
});

describe("looksLikeCommand", () => {
  it("returns true for npm/pnpm/yarn/node prefixed commands", () => {
    expect(looksLikeCommand("npm test")).toBe(true);
    expect(looksLikeCommand("pnpm run lint")).toBe(true);
    expect(looksLikeCommand("yarn build")).toBe(true);
    expect(looksLikeCommand("node index.js")).toBe(true);
  });

  it("returns false for non-command text", () => {
    expect(looksLikeCommand("hello world")).toBe(false);
    expect(looksLikeCommand("")).toBe(false);
  });

  it("returns true for other known prefixes", () => {
    expect(looksLikeCommand("vitest run")).toBe(true);
    expect(looksLikeCommand("eslint src/")).toBe(true);
    expect(looksLikeCommand("pytest tests/")).toBe(true);
  });
});
