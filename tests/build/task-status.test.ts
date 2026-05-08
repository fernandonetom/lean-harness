import { describe, it, expect } from "vitest";
import {
  normalizeTaskStatus,
  isRunnableTaskStatus,
  findNextRunnableTask,
  selectTasks,
  updateTaskStatusInMarkdown,
} from "../../src/build/task-status.js";
import type { ParsedTask } from "../../src/context/task-context.js";

function makeTask(overrides: Partial<ParsedTask> & { id: string }): ParsedTask {
  return {
    title: `Task ${overrides.id}`,
    status: "planned",
    acceptanceCriteria: [],
    expectedFiles: [],
    readOnlyContext: [],
    verificationCommands: [],
    riskNotes: [],
    dependencies: [],
    raw: "",
    ...overrides,
  };
}

describe("normalizeTaskStatus", () => {
  it("normalizes 'planned' to 'planned'", () => {
    expect(normalizeTaskStatus("planned")).toBe("planned");
  });

  it("normalizes 'PLANNED' to 'planned'", () => {
    expect(normalizeTaskStatus("PLANNED")).toBe("planned");
  });

  it("defaults undefined to 'planned'", () => {
    expect(normalizeTaskStatus(undefined)).toBe("planned");
  });

  it("defaults garbage to 'planned'", () => {
    expect(normalizeTaskStatus("garbage")).toBe("planned");
  });
});

describe("isRunnableTaskStatus", () => {
  it("returns true for 'planned'", () => {
    expect(isRunnableTaskStatus("planned")).toBe(true);
  });

  it("returns true for 'needs-fix'", () => {
    expect(isRunnableTaskStatus("needs-fix")).toBe(true);
  });

  it("returns false for 'done'", () => {
    expect(isRunnableTaskStatus("done")).toBe(false);
  });

  it("returns false for 'blocked'", () => {
    expect(isRunnableTaskStatus("blocked")).toBe(false);
  });

  it("returns false for 'verified'", () => {
    expect(isRunnableTaskStatus("verified")).toBe(false);
  });

  it("returns false for 'building'", () => {
    expect(isRunnableTaskStatus("building")).toBe(false);
  });
});

describe("findNextRunnableTask", () => {
  it("returns first task with runnable status", () => {
    const tasks = [
      makeTask({ id: "T01", status: "done" }),
      makeTask({ id: "T02", status: "planned" }),
      makeTask({ id: "T03", status: "planned" }),
    ];
    const result = findNextRunnableTask(tasks);
    expect(result?.id).toBe("T02");
  });

  it("returns null if none are runnable", () => {
    const tasks = [
      makeTask({ id: "T01", status: "done" }),
      makeTask({ id: "T02", status: "blocked" }),
    ];
    expect(findNextRunnableTask(tasks)).toBeNull();
  });
});

describe("selectTasks", () => {
  const tasks = [
    makeTask({ id: "T01", status: "done" }),
    makeTask({ id: "T02", status: "planned" }),
    makeTask({ id: "T03", status: "needs-fix" }),
    makeTask({ id: "T04", status: "blocked" }),
  ];

  it("with taskId: finds specific task", () => {
    const result = selectTasks(tasks, { taskId: "T02" });
    expect(result.tasks.length).toBe(1);
    expect(result.tasks[0]!.id).toBe("T02");
  });

  it("with taskId: throws if not found", () => {
    expect(() => selectTasks(tasks, { taskId: "T99" })).toThrow("Could not find task T99");
  });

  it("with taskId: throws if blocked", () => {
    expect(() => selectTasks(tasks, { taskId: "T04" })).toThrow("blocked");
  });

  it("with taskId: returns empty for done/verified", () => {
    const result = selectTasks(tasks, { taskId: "T01" });
    expect(result.tasks.length).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("with all: returns all runnable tasks", () => {
    const result = selectTasks(tasks, { all: true });
    expect(result.tasks.length).toBe(2);
    expect(result.tasks.map((t) => t.id)).toEqual(["T02", "T03"]);
  });

  it("with maxTasks: limits results", () => {
    const result = selectTasks(tasks, { maxTasks: 1 });
    expect(result.tasks.length).toBe(1);
    expect(result.tasks[0]!.id).toBe("T02");
  });

  it("default: returns single next runnable", () => {
    const result = selectTasks(tasks, {});
    expect(result.tasks.length).toBe(1);
    expect(result.tasks[0]!.id).toBe("T02");
  });
});

describe("updateTaskStatusInMarkdown", () => {
  it("replaces status line under matching task heading", () => {
    const md = [
      "## T01: Setup",
      "- Status: planned",
      "- Goal: do stuff",
      "",
      "## T02: Build",
      "- Status: planned",
    ].join("\n");

    const result = updateTaskStatusInMarkdown(md, "T01", "done");
    expect(result).toContain("- Status: done");
    expect(result).toContain("## T02: Build\n- Status: planned");
  });

  it("inserts status line if not present under task heading", () => {
    const md = [
      "## T01: Setup",
      "- Goal: do stuff",
    ].join("\n");

    const result = updateTaskStatusInMarkdown(md, "T01", "building");
    expect(result).toContain("- Status: building");
  });
});
