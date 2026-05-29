import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn((cmd: string, args: string[]) => {
    if (cmd === "python3" && args[0] === "--version") {
      return { status: 0, stdout: "Python 3.11.0\n", stderr: "", error: undefined };
    }
    if (cmd === "graphify" && args[0] === "--version") {
      return { status: 1, stdout: "", stderr: "", error: new Error("not found") };
    }
    return { status: 0, stdout: "", stderr: "", error: undefined };
  }),
  execSync: vi.fn(),
}));
import fs from "node:fs/promises";
import { createTempWorkspace, cleanupWorkspace, lhPath, featurePath, readJson, fileExists, readFile } from "../e2e/helpers.js";
import { runInitCommand } from "../../src/commands/init.js";
import { runSpecCommand } from "../../src/commands/spec.js";
import { runDiscoverCommand } from "../../src/commands/discover.js";
import { runCheckCommand } from "../../src/commands/check.js";
import { loadState, normalizeState, saveState } from "../../src/core/state.js";
import { reviewBoundaryCompliance, type ChangedFile, type BoundaryReview } from "../../src/verification/changed-files.js";
import { determineVerdict } from "../../src/verification/index.js";

let tmpDir: string;
const suppress = { write: () => true } as any;

function silenceOutput() {
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = suppress.write;
  process.stderr.write = suppress.write;
  return () => {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  };
}

beforeEach(async () => {
  tmpDir = await createTempWorkspace();
});

afterEach(async () => {
  await cleanupWorkspace(tmpDir);
});

describe("stress: corrupted state.json", () => {
  it("empty state.json falls back to defaults", async () => {
    const restore = silenceOutput();
    try {
      await runInitCommand({ cwd: tmpDir });

      await fs.writeFile(lhPath(tmpDir, "state.json"), "{}");

      const state = await loadState(tmpDir);
      expect(state.version).toBe("0.1");
      expect(state.schema).toBe("leanharness-state");
      expect(state.features).toEqual([]);
      expect(state.nextFeatureNumber).toBe(1);
    } finally {
      restore();
    }
  });

  it("malformed JSON state.json throws readable error", async () => {
    const restore = silenceOutput();
    try {
      await runInitCommand({ cwd: tmpDir });

      await fs.writeFile(lhPath(tmpDir, "state.json"), "{ broken json !!!");

      await expect(loadState(tmpDir)).rejects.toThrow();
    } finally {
      restore();
    }
  });

  it("state.json with wrong types recovers", async () => {
    const state = normalizeState({
      version: 123,
      features: "not-an-array",
      nextFeatureNumber: -5,
      activeFeature: true,
    });

    expect(state.version).toBe("0.1");
    expect(state.features).toEqual([]);
    expect(state.nextFeatureNumber).toBe(1);
    expect(state.activeFeature).toBeNull();
  });

  it("state.json with features as object (legacy) normalizes to array", async () => {
    const state = normalizeState({
      features: {
        F001: { id: "F001", slug: "test", title: "Test", path: "F001-test", status: "draft" },
        F002: { id: "F002", slug: "other", title: "Other", path: "F002-other", status: "draft" },
      },
    });

    expect(state.features.length).toBe(2);
    expect(state.features.some((f) => f.id === "F001")).toBe(true);
    expect(state.features.some((f) => f.id === "F002")).toBe(true);
  });

  it("non-object state.json throws with init hint", async () => {
    expect(() => normalizeState("just a string")).toThrow(/expected a JSON object/i);
    expect(() => normalizeState(null)).toThrow(/expected a JSON object/i);
    expect(() => normalizeState(42)).toThrow(/expected a JSON object/i);
  });

  it("spec still works after state recovery", async () => {
    const restore = silenceOutput();
    try {
      await runInitCommand({ cwd: tmpDir });

      await fs.writeFile(
        lhPath(tmpDir, "state.json"),
        JSON.stringify({ version: "0.1", features: [], nextFeatureNumber: 1 }),
      );

      await runSpecCommand({ cwd: tmpDir, request: "Add feature after recovery" });

      const state = await readJson<any>(lhPath(tmpDir, "state.json"));
      expect(state.features.length).toBe(1);
      expect(state.features[0].id).toBe("F001");
    } finally {
      restore();
    }
  });
});

describe("stress: boundary violations", () => {
  it("detects files changed outside boundary via blockedEditGlobs", () => {
    const boundary = {
      touchFiles: [{ path: "src/auth/login.ts" }, { path: "src/auth/types.ts" }],
      doNotTouch: ["src/database/"],
      blockedEditGlobs: ["package.json"],
      relevantTests: ["tests/auth.test.ts"],
    };

    const changedFiles: ChangedFile[] = [
      { path: "src/auth/login.ts", changeType: "modified", source: "test", inBoundary: "unknown", notes: [] },
      { path: "src/database/schema.ts", changeType: "modified", source: "test", inBoundary: "unknown", notes: [] },
      { path: "package.json", changeType: "modified", source: "test", inBoundary: "unknown", notes: [] },
    ];

    const review = reviewBoundaryCompliance(changedFiles, boundary);
    expect(review.violations.length).toBe(2);
    expect(review.violations.some((v) => v.path === "src/database/schema.ts")).toBe(true);
    expect(review.violations.some((v) => v.path === "package.json")).toBe(true);
  });

  it("doNotTouch files modified count as violations", () => {
    const boundary = {
      touchFiles: [{ path: "src/feature.ts" }],
      doNotTouch: ["src/core/"],
      relevantTests: [],
    };

    const changedFiles: ChangedFile[] = [
      { path: "src/feature.ts", changeType: "modified", source: "test", inBoundary: "unknown", notes: [] },
      { path: "src/core/config.ts", changeType: "modified", source: "test", inBoundary: "unknown", notes: [] },
    ];

    const review = reviewBoundaryCompliance(changedFiles, boundary);
    expect(review.violations.length).toBe(1);
    expect(review.violations[0]!.path).toBe("src/core/config.ts");
  });

  it("boundary violations cause needs-fix verdict", () => {
    const violationFile: ChangedFile = {
      path: "src/unrelated.ts", changeType: "modified", source: "test", inBoundary: "out", notes: [],
    };
    const { verdict, unresolvedIssues } = determineVerdict({
      acceptance: [{ id: "AC1", text: "works", status: "pass", evidence: ["done"], notes: [] }],
      commands: [],
      changedFiles: [
        { path: "src/feature.ts", changeType: "modified", source: "test", inBoundary: "in", notes: [] },
        violationFile,
      ],
      boundary: {
        status: "partial",
        changedFiles: [],
        violations: [violationFile],
        notes: [],
      },
      review: { verdict: "pass", findings: [], notes: [], blockingFindings: [] },
      riskGates: [],
      missingArtifacts: [],
      strict: false,
    });

    expect(verdict).toBe("needs-fix");
    expect(unresolvedIssues.some((i) => i.includes("outside boundary"))).toBe(true);
  });

  it("no changed files results in blocked verdict", () => {
    const { verdict } = determineVerdict({
      acceptance: [],
      commands: [],
      changedFiles: [],
      boundary: { status: "unknown", changedFiles: [], violations: [], notes: [] },
      review: { verdict: "pass", findings: [], notes: [], blockingFindings: [] },
      riskGates: [],
      missingArtifacts: [],
      strict: false,
    });

    expect(verdict).toBe("blocked");
  });
});
