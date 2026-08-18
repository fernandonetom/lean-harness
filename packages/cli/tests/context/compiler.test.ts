import { describe, it, expect } from "vitest";
import { compileTaskContext, renderTaskPrompt } from "../../src/context/compiler.js";
import type { CompileTaskContextOptions, RenderTaskPromptInput } from "../../src/context/compiler.js";
import type { ParsedTask } from "../../src/context/task-context.js";

describe("compileTaskContext", () => {
  it("is exported as a function", () => {
    expect(typeof compileTaskContext).toBe("function");
  });

  it("throws on missing tasks.md (no feature workspace)", async () => {
    const options: CompileTaskContextOptions = {
      root: "/tmp/nonexistent-workspace",
      featureRef: "F001",
      taskId: "T01",
    };
    await expect(compileTaskContext(options)).rejects.toThrow();
  });
});

describe("renderTaskPrompt", () => {
  const task: ParsedTask = {
    id: "T01",
    title: "Implement auth module",
    status: "planned",
    acceptanceCriteria: ["AC1: Users can log in"],
    goal: "Build the auth module",
    expectedFiles: ["src/auth/login.ts"],
    readOnlyContext: ["src/config.ts"],
    testExpectation: "Unit tests pass",
    verificationCommands: ["npm test"],
    riskNotes: [],
    dependencies: [],
    raw: "## T01: Implement auth module\n- Status: planned",
  };

  it("returns content with expected sections", () => {
    const input: RenderTaskPromptInput = {
      featureId: "F001",
      featureTitle: "Auth Feature",
      featureDir: ".lh/features/F001-auth",
      task,
      spec: "## Goal\n\nBuild auth",
      discovery: null,
      boundary: { touchFiles: [{ path: "src/auth/login.ts" }], readOnlyFiles: [] },
      plan: null,
      cavebus: null,
      memory: {},
      priorTaskSummaries: [],
      fileExcerpts: [],
      missingFiles: ["src/auth/login.ts"],
      protectedTokens: [],
      maxBytes: 60000,
    };

    const content = renderTaskPrompt(input);
    expect(content).toContain("# LeanHarness Task Context");
    expect(content).toContain("## Feature");
    expect(content).toContain("F001");
    expect(content).toContain("## Task");
    expect(content).toContain("T01");
    expect(content).toContain("## Change Boundary");
  });

  it("includes boundary info when boundary object is provided", () => {
    const input: RenderTaskPromptInput = {
      featureId: "F001",
      featureTitle: "Auth Feature",
      featureDir: ".lh/features/F001-auth",
      task,
      spec: null,
      discovery: null,
      boundary: {
        touchFiles: [{ path: "src/auth/login.ts" }],
        readOnlyFiles: [{ path: "src/config.ts" }],
      },
      plan: null,
      cavebus: null,
      memory: {},
      priorTaskSummaries: [],
      fileExcerpts: [],
      missingFiles: [],
      protectedTokens: [],
      maxBytes: 60000,
    };

    const content = renderTaskPrompt(input);
    expect(content).toContain("Touch files:");
    expect(content).toContain("src/auth/login.ts");
  });

  it("shows missing boundary message when boundary is null", () => {
    const input: RenderTaskPromptInput = {
      featureId: "F001",
      featureTitle: "Auth Feature",
      featureDir: ".lh/features/F001-auth",
      task,
      spec: null,
      discovery: null,
      boundary: null,
      plan: null,
      cavebus: null,
      memory: {},
      priorTaskSummaries: [],
      fileExcerpts: [],
      missingFiles: [],
      protectedTokens: [],
      maxBytes: 60000,
    };

    const content = renderTaskPrompt(input);
    expect(content).toContain("No boundary.json found");
  });
});
