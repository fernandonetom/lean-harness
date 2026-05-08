import { describe, it, expect } from "vitest";
import { collectWatchPaths } from "../../src/commands/watch.js";
import type { BoundaryJson } from "../../src/discovery/boundary.js";

function makeBoundary(overrides: Partial<BoundaryJson> = {}): BoundaryJson {
  return {
    featureId: "F001",
    featureTitle: "Test",
    status: "discovered",
    confidence: "medium",
    discoveryDepth: "D2",
    touchFiles: [],
    readOnlyFiles: [],
    relevantTests: [],
    commands: [],
    allowedEditGlobs: [],
    blockedEditGlobs: [],
    riskGates: [],
    unknowns: [],
    doNotTouch: [],
    protectedTokens: [],
    lastUpdated: new Date().toISOString(),
    ...overrides,
  };
}

describe("collectWatchPaths", () => {
  it("collects touch files", () => {
    const boundary = makeBoundary({
      touchFiles: [
        { path: "src/auth.ts", reason: "auth module", confidence: "high" },
        { path: "src/login.ts", reason: "login", confidence: "medium" },
      ],
    });
    const paths = collectWatchPaths("/project", boundary);
    expect(paths).toHaveLength(2);
    expect(paths.some((p) => p.endsWith("src/auth.ts"))).toBe(true);
    expect(paths.some((p) => p.endsWith("src/login.ts"))).toBe(true);
  });

  it("collects read-only files", () => {
    const boundary = makeBoundary({
      readOnlyFiles: [
        { path: "package.json", reason: "config", confidence: "high" },
      ],
    });
    const paths = collectWatchPaths("/project", boundary);
    expect(paths).toHaveLength(1);
    expect(paths[0]!.endsWith("package.json")).toBe(true);
  });

  it("collects test file paths", () => {
    const boundary = makeBoundary({
      relevantTests: [
        { path: "tests/auth.test.ts", reason: "auth tests", confidence: "high" },
        { command: "npm test", reason: "test cmd", confidence: "medium" },
      ],
    });
    const paths = collectWatchPaths("/project", boundary);
    expect(paths).toHaveLength(1);
    expect(paths[0]!.endsWith("tests/auth.test.ts")).toBe(true);
  });

  it("deduplicates paths", () => {
    const boundary = makeBoundary({
      touchFiles: [
        { path: "src/auth.ts", reason: "touch", confidence: "high" },
      ],
      readOnlyFiles: [
        { path: "src/auth.ts", reason: "read-only duplicate", confidence: "high" },
      ],
    });
    const paths = collectWatchPaths("/project", boundary);
    expect(paths).toHaveLength(1);
  });

  it("returns empty for empty boundary", () => {
    const boundary = makeBoundary();
    const paths = collectWatchPaths("/project", boundary);
    expect(paths).toEqual([]);
  });
});
