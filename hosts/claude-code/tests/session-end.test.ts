import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, appendFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const hookPath = path.resolve(import.meta.dirname, "../hooks/session-end.js");

function runHook(root: string, payload: unknown): { stdout: string; exitCode: number } {
  try {
    const stdout = execFileSync("node", [hookPath], {
      cwd: root,
      input: JSON.stringify(payload),
      env: { ...process.env, CLAUDE_PROJECT_DIR: root },
      encoding: "utf8",
    });
    return { stdout, exitCode: 0 };
  } catch (err) {
    const e = err as { stdout?: string; status?: number };
    return { stdout: e.stdout ?? "", exitCode: e.status ?? 1 };
  }
}

function readEvents(root: string, featureId: string): Array<Record<string, unknown>> {
  const eventsFile = path.join(root, ".lh", "features", featureId, "events.jsonl");
  return readFileSync(eventsFile, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

function appendEvent(root: string, featureId: string, event: Record<string, unknown>): void {
  const eventsFile = path.join(root, ".lh", "features", featureId, "events.jsonl");
  appendFileSync(eventsFile, JSON.stringify(event) + "\n");
}

describe("session-end hook", () => {
  let root: string;
  const featureId = "F001-test";
  let featureDir: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "lh-sessionend-test-"));
    featureDir = path.join(root, ".lh", "features", featureId);
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(path.join(root, ".lh", "state.json"), JSON.stringify({ active_feature: featureId }));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("SessionEnd logs an event and never blocks", () => {
    const result = runHook(root, { hook_event_name: "SessionEnd" });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("");

    const events = readEvents(root, featureId);
    expect(events[0]).toMatchObject({ event: "SessionEnd", feature: featureId, result: "session-end" });
  });

  it("Stop blocks when the feature is mid-build with implementation edits but no task summary", () => {
    writeFileSync(path.join(featureDir, "tasks.md"), "# Tasks\n- [ ] T01\n");
    appendEvent(root, featureId, {
      timestamp: new Date(0).toISOString(),
      event: "PostToolUse",
      tool: "Edit",
      feature: featureId,
      paths: ["src/feature.ts"],
      result: "success",
    });

    const result = runHook(root, { hook_event_name: "Stop" });
    expect(result.stdout).toBeTruthy();
    const decision = JSON.parse(result.stdout);
    expect(decision.decision).toBe("block");
    expect(decision.reason).toContain("task summary");
  });

  it("Stop does not block once checks.md shows a pass verdict", () => {
    writeFileSync(path.join(featureDir, "tasks.md"), "# Tasks\n- [x] T01\n");
    writeFileSync(path.join(featureDir, "checks.md"), "# Checks\n\nVerdict: pass\n");
    appendEvent(root, featureId, {
      timestamp: new Date(0).toISOString(),
      event: "PostToolUse",
      tool: "Edit",
      feature: featureId,
      paths: ["src/feature.ts"],
      result: "success",
    });

    const result = runHook(root, { hook_event_name: "Stop" });
    expect(result.stdout.trim()).toBe("");
  });

  it("Stop does not block when only bootstrap/doc paths were edited", () => {
    writeFileSync(path.join(featureDir, "tasks.md"), "# Tasks\n- [ ] T01\n");
    appendEvent(root, featureId, {
      timestamp: new Date(0).toISOString(),
      event: "PostToolUse",
      tool: "Edit",
      feature: featureId,
      paths: [".lh/features/F001-test/spec.md"],
      result: "success",
    });

    const result = runHook(root, { hook_event_name: "Stop" });
    expect(result.stdout.trim()).toBe("");
  });

  it("Stop does not block when there is no active feature", () => {
    writeFileSync(path.join(root, ".lh", "state.json"), JSON.stringify({ active_feature: null }));
    const result = runHook(root, { hook_event_name: "Stop" });
    expect(result.stdout.trim()).toBe("");
  });
});
