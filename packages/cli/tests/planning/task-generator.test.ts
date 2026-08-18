import { describe, it, expect } from "vitest";
import {
  normalizeBoundary,
  generatePlan,
  chooseVerificationCommands,
  groupFilesForTasks,
  taskId,
} from "../../src/planning/task-generator.js";
import type { PlanningBoundary, GenerateTasksOptions } from "../../src/planning/task-generator.js";
import { parseSpecForPlanning } from "../../src/planning/acceptance.js";
import { SAMPLE_SPEC_MD, SAMPLE_BOUNDARY_JSON } from "../helpers/fixture.js";

function makeBoundary(overrides?: Partial<PlanningBoundary>): PlanningBoundary {
  return {
    featureId: "F001",
    featureTitle: "Test Feature",
    status: "discovered",
    confidence: "medium",
    discoveryDepth: "D2",
    touchFiles: [
      { path: "src/auth/password.ts", reason: "matches: password", confidence: "high" },
      { path: "src/auth/session.ts", reason: "matches: auth", confidence: "medium" },
    ],
    readOnlyFiles: [
      { path: "package.json", reason: "important", confidence: "low" },
    ],
    relevantTests: [
      { path: "tests/auth/password.test.ts", reason: "test file", confidence: "medium" },
    ],
    commands: [
      { command: "npm test", purpose: "run tests", confidence: "high", source: "package.json" },
      { command: "npm run typecheck", purpose: "typecheck", confidence: "high", source: "package.json" },
      { command: "npm run lint", purpose: "lint code", confidence: "medium", source: "package.json" },
    ],
    riskGates: [
      { name: "auth_rewrite", reason: 'path contains "auth"', status: "triggered" },
    ],
    unknowns: [],
    doNotTouch: ["node_modules/", "dist/"],
    allowedEditGlobs: ["src/auth/password.ts", "src/auth/session.ts"],
    blockedEditGlobs: ["node_modules/**", "dist/**"],
    protectedTokens: ["F001", "src/auth/password.ts"],
    ...overrides,
  };
}

describe("normalizeBoundary", () => {
  it("returns null for null input", () => {
    const result = normalizeBoundary(null, { featureId: "F001", title: "Test" });
    expect(result).toBeNull();
  });

  it("returns null for undefined input", () => {
    const result = normalizeBoundary(undefined, { featureId: "F001", title: "Test" });
    expect(result).toBeNull();
  });

  it("returns null for non-object input", () => {
    const result = normalizeBoundary("string", { featureId: "F001", title: "Test" });
    expect(result).toBeNull();
  });

  it("normalizes a valid boundary object", () => {
    const result = normalizeBoundary(SAMPLE_BOUNDARY_JSON, {
      featureId: "FALLBACK",
      title: "Fallback",
    });

    expect(result).not.toBeNull();
    expect(result!.featureId).toBe("F001");
    expect(result!.featureTitle).toBe("Add password reset");
    expect(result!.touchFiles.length).toBeGreaterThan(0);
    expect(result!.commands.length).toBeGreaterThan(0);
  });

  it("uses fallback for missing featureId and title", () => {
    const result = normalizeBoundary({}, {
      featureId: "F099",
      title: "Fallback Title",
    });

    expect(result).not.toBeNull();
    expect(result!.featureId).toBe("F099");
    expect(result!.featureTitle).toBe("Fallback Title");
  });
});

describe("generatePlan", () => {
  it("generates tasks from boundary file groups", () => {
    const spec = parseSpecForPlanning(SAMPLE_SPEC_MD, {
      featureId: "F001",
      title: "Add password reset",
    });

    const boundary = makeBoundary();

    const plan = generatePlan({
      spec,
      boundary,
      featureFolderName: "F001-add-password-reset",
      taskSize: "medium",
      maxTasks: 8,
      fromSpecOnly: false,
    });

    expect(plan.status).toBe("planned");
    expect(plan.tasks.length).toBeGreaterThan(0);
    expect(plan.slices.length).toBeGreaterThan(0);
    expect(plan.riskGates).toContain("auth_rewrite");

    // Each task should have required fields
    for (const task of plan.tasks) {
      expect(task.id).toMatch(/^T\d{2}$/);
      expect(task.title).toBeTruthy();
      expect(task.status).toBeTruthy();
      expect(task.verificationCommands).toBeInstanceOf(Array);
    }
  });

  it("creates T01/T02/T03 preparation tasks when fromSpecOnly", () => {
    const spec = parseSpecForPlanning(SAMPLE_SPEC_MD, {
      featureId: "F001",
      title: "Add password reset",
    });

    const plan = generatePlan({
      spec,
      boundary: null,
      featureFolderName: "F001-add-password-reset",
      taskSize: "medium",
      maxTasks: 8,
      fromSpecOnly: true,
    });

    expect(plan.status).toBe("draft");
    expect(plan.tasks).toHaveLength(3);
    expect(plan.tasks[0]!.id).toBe("T01");
    expect(plan.tasks[1]!.id).toBe("T02");
    expect(plan.tasks[2]!.id).toBe("T03");

    // T02 and T03 should be blocked
    expect(plan.tasks[1]!.status).toBe("blocked");
    expect(plan.tasks[2]!.status).toBe("blocked");

    // T02 depends on T01
    expect(plan.tasks[1]!.dependencies).toContain("T01");

    expect(plan.warnings.some((w) => w.includes("spec only"))).toBe(true);
  });

  it("propagates risk gates to tasks", () => {
    const spec = parseSpecForPlanning(SAMPLE_SPEC_MD, {
      featureId: "F001",
      title: "Test",
    });

    const boundary = makeBoundary({
      riskGates: [
        { name: "auth_rewrite", reason: "path auth", status: "triggered" },
        { name: "payment_logic", reason: "keyword payment", status: "triggered" },
      ],
    });

    const plan = generatePlan({
      spec,
      boundary,
      featureFolderName: "F001-test",
      taskSize: "medium",
      maxTasks: 8,
      fromSpecOnly: false,
    });

    expect(plan.riskGates).toContain("auth_rewrite");
    expect(plan.riskGates).toContain("payment_logic");
  });

  it("generates from spec only when boundary is null", () => {
    const spec = parseSpecForPlanning(SAMPLE_SPEC_MD, {
      featureId: "F001",
      title: "Test",
    });

    const plan = generatePlan({
      spec,
      boundary: null,
      featureFolderName: "F001-test",
      taskSize: "medium",
      maxTasks: 8,
      fromSpecOnly: false,
    });

    // null boundary should produce spec-only plan
    expect(plan.status).toBe("draft");
    expect(plan.tasks).toHaveLength(3);
  });
});

describe("chooseVerificationCommands", () => {
  it("picks commands with test/check/lint purposes", () => {
    const boundary = makeBoundary();
    const commands = chooseVerificationCommands(boundary);

    expect(commands).toContain("npm test");
    expect(commands).toContain("npm run typecheck");
    expect(commands).toContain("npm run lint");
  });

  it("returns empty array for null boundary", () => {
    const commands = chooseVerificationCommands(null);
    expect(commands).toHaveLength(0);
  });

  it("falls back to any commands if none match test/check/lint", () => {
    const boundary = makeBoundary({
      commands: [
        { command: "npm start", purpose: "start server", confidence: "high", source: "pkg" },
        { command: "npm run build", purpose: "build project", confidence: "high", source: "pkg" },
      ],
    });

    const commands = chooseVerificationCommands(boundary);
    expect(commands.length).toBeGreaterThan(0);
  });

  it("includes test commands from relevantTests", () => {
    const boundary = makeBoundary({
      commands: [],
      relevantTests: [
        { command: "vitest run tests/auth", reason: "test command", confidence: "high" },
      ],
    });

    const commands = chooseVerificationCommands(boundary);
    expect(commands).toContain("vitest run tests/auth");
  });
});

describe("groupFilesForTasks", () => {
  it("groups files with small size (2 per task)", () => {
    const boundary = makeBoundary({
      touchFiles: [
        { path: "src/a.ts", reason: "r", confidence: "high" },
        { path: "src/b.ts", reason: "r", confidence: "high" },
        { path: "src/c.ts", reason: "r", confidence: "high" },
        { path: "src/d.ts", reason: "r", confidence: "high" },
      ],
    });

    const groups = groupFilesForTasks(boundary, "small");

    // 4 files / 2 per task = 2 groups
    expect(groups).toHaveLength(2);
    expect(groups[0]!.files).toHaveLength(2);
    expect(groups[1]!.files).toHaveLength(2);
  });

  it("groups files with medium size (4 per task)", () => {
    const boundary = makeBoundary({
      touchFiles: Array.from({ length: 8 }, (_, i) => ({
        path: `src/file${i}.ts`,
        reason: "r",
        confidence: "high" as const,
      })),
    });

    const groups = groupFilesForTasks(boundary, "medium");

    expect(groups).toHaveLength(2);
    expect(groups[0]!.files).toHaveLength(4);
    expect(groups[1]!.files).toHaveLength(4);
  });

  it("groups files with large size (7 per task)", () => {
    const boundary = makeBoundary({
      touchFiles: Array.from({ length: 7 }, (_, i) => ({
        path: `src/file${i}.ts`,
        reason: "r",
        confidence: "high" as const,
      })),
    });

    const groups = groupFilesForTasks(boundary, "large");

    expect(groups).toHaveLength(1);
    expect(groups[0]!.files).toHaveLength(7);
  });

  it("returns empty array for null boundary", () => {
    const groups = groupFilesForTasks(null, "medium");
    expect(groups).toHaveLength(0);
  });

  it("returns empty array when boundary has no touch files", () => {
    const boundary = makeBoundary({ touchFiles: [] });
    const groups = groupFilesForTasks(boundary, "medium");
    expect(groups).toHaveLength(0);
  });

  it("groups files by directory", () => {
    const boundary = makeBoundary({
      touchFiles: [
        { path: "src/auth/login.ts", reason: "r", confidence: "high" },
        { path: "src/auth/password.ts", reason: "r", confidence: "high" },
        { path: "src/billing/checkout.ts", reason: "r", confidence: "high" },
      ],
    });

    const groups = groupFilesForTasks(boundary, "small");

    // auth files grouped together, billing separate
    expect(groups.length).toBeGreaterThanOrEqual(2);
  });
});

describe("taskId", () => {
  it("formats single digit with zero padding", () => {
    expect(taskId(1)).toBe("T01");
    expect(taskId(9)).toBe("T09");
  });

  it("formats double digit without extra padding", () => {
    expect(taskId(10)).toBe("T10");
    expect(taskId(99)).toBe("T99");
  });
});
