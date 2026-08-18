import { describe, it, expect } from "vitest";
import {
  renderPlanMarkdown,
  renderTasksMarkdown,
  renderPlanCavebus,
  renderAcceptanceCoverageTable,
  type RenderPlanInput,
} from "../../src/planning/plan-renderer.js";
import { parseSpecForPlanning } from "../../src/planning/acceptance.js";
import { normalizeBoundary, generatePlan } from "../../src/planning/task-generator.js";
import { SAMPLE_SPEC_MD, SAMPLE_BOUNDARY_JSON } from "../helpers/fixture.js";

function buildRenderInput(): RenderPlanInput {
  const spec = parseSpecForPlanning(SAMPLE_SPEC_MD, {
    featureId: "F001",
    title: "Add password reset",
  });

  const boundary = normalizeBoundary(SAMPLE_BOUNDARY_JSON, {
    featureId: "F001",
    title: "Add password reset",
  });

  const plan = generatePlan({
    spec,
    boundary,
    featureFolderName: "F001-add-password-reset",
    taskSize: "medium",
    maxTasks: 8,
    fromSpecOnly: false,
  });

  return {
    featureId: "F001",
    featureTitle: "Add password reset",
    featureFolderName: "F001-add-password-reset",
    date: "2024-01-01",
    spec,
    boundary,
    plan,
  };
}

describe("renderPlanMarkdown", () => {
  it("contains expected headings and sections", () => {
    const input = buildRenderInput();
    const md = renderPlanMarkdown(input);

    expect(md).toContain("# F001 Plan");
    expect(md).toContain("## Status");
    expect(md).toContain("## Plan Summary");
    expect(md).toContain("## Slices");
    expect(md).toContain("## Risk Gates");
    expect(md).toContain("## Test Strategy");
    expect(md).toContain("## Plan Review Checklist");
  });

  it("includes acceptance criteria coverage section", () => {
    const input = buildRenderInput();
    const md = renderPlanMarkdown(input);

    expect(md).toContain("## Acceptance Criteria Coverage");
    expect(md).toContain("AC1");
  });

  it("includes plan status", () => {
    const input = buildRenderInput();
    const md = renderPlanMarkdown(input);

    // status should be one of draft, planned, or blocked
    expect(md).toMatch(/\n(draft|planned|blocked)\n/);
  });

  it("lists risk gates", () => {
    const input = buildRenderInput();
    const md = renderPlanMarkdown(input);

    expect(md).toContain("auth_rewrite");
  });

  it("includes slice table", () => {
    const input = buildRenderInput();
    const md = renderPlanMarkdown(input);

    expect(md).toContain("| Slice | Goal | Tasks | Notes |");
  });
});

describe("renderTasksMarkdown", () => {
  it("contains expected headings and task sections", () => {
    const input = buildRenderInput();
    const md = renderTasksMarkdown(input);

    expect(md).toContain("# F001 Tasks");
    expect(md).toContain("## Status");
    expect(md).toContain("## Tasks");
    expect(md).toContain("### T01:");
  });

  it("includes task rules section", () => {
    const input = buildRenderInput();
    const md = renderTasksMarkdown(input);

    expect(md).toContain("## Task Rules");
    expect(md).toContain("acceptance criteria");
  });

  it("renders task details", () => {
    const input = buildRenderInput();
    const md = renderTasksMarkdown(input);

    expect(md).toContain("- Status:");
    expect(md).toContain("- Goal:");
    expect(md).toContain("- Expected files:");
    expect(md).toContain("- Summary file:");
  });
});

describe("renderPlanCavebus", () => {
  it("starts with 'PLAN F001'", () => {
    const input = buildRenderInput();
    const cavebus = renderPlanCavebus(input);

    expect(cavebus.startsWith("PLAN F001")).toBe(true);
  });

  it("contains task IDs and risk info", () => {
    const input = buildRenderInput();
    const cavebus = renderPlanCavebus(input);

    expect(cavebus).toContain("tasks:");
    expect(cavebus).toContain("T01");
    expect(cavebus).toContain("risk:");
    expect(cavebus).toContain("verify:");
    expect(cavebus).toContain("next:");
  });

  it("contains AC mapping", () => {
    const input = buildRenderInput();
    const cavebus = renderPlanCavebus(input);

    expect(cavebus).toContain("ac:");
  });
});

describe("renderAcceptanceCoverageTable", () => {
  it("contains AC headers and coverage status", () => {
    const input = buildRenderInput();
    const table = renderAcceptanceCoverageTable(input);

    expect(table).toContain("## Acceptance Criteria Coverage");
    expect(table).toContain("| AC | Planned Coverage | Task IDs |");
    expect(table).toContain("AC1");
    expect(table).toContain("AC2");
    expect(table).toContain("AC3");
  });

  it("marks covered criteria", () => {
    const input = buildRenderInput();
    const table = renderAcceptanceCoverageTable(input);

    // At least some criteria should be covered since we have tasks
    expect(table).toContain("covered");
  });

  it("handles spec with no acceptance criteria (uses placeholders)", () => {
    const spec = parseSpecForPlanning(
      "# F001 Empty\n\n## Acceptance Criteria\n\n",
      { featureId: "F001", title: "Empty" },
    );

    const plan = generatePlan({
      spec,
      boundary: null,
      featureFolderName: "F001-empty",
      taskSize: "medium",
      maxTasks: 8,
      fromSpecOnly: true,
    });

    const input: RenderPlanInput = {
      featureId: "F001",
      featureTitle: "Empty",
      featureFolderName: "F001-empty",
      date: "2024-01-01",
      spec,
      boundary: null,
      plan,
    };

    const table = renderAcceptanceCoverageTable(input);

    expect(table).toContain("## Acceptance Criteria Coverage");
    // Placeholder AC should appear
    expect(table).toContain("AC1");
  });
});
