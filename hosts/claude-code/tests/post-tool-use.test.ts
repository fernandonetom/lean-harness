import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const hookPath = path.resolve(import.meta.dirname, "../hooks/post-tool-use.js");

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

describe("post-tool-use hook", () => {
  let root: string;
  const featureId = "F001-test";

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "lh-posttooluse-test-"));
    mkdirSync(path.join(root, ".lh", "features", featureId), { recursive: true });
    writeFileSync(path.join(root, ".lh", "state.json"), JSON.stringify({ active_feature: featureId }));
    writeFileSync(
      path.join(root, ".lh", "features", featureId, "boundary.json"),
      JSON.stringify({ touchFiles: [{ path: "src/allowed.ts" }] }),
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("logs a success event to the active feature's events.jsonl", () => {
    const result = runHook(root, {
      hook_event_name: "PostToolUse",
      tool_name: "Bash",
      tool_input: { command: "git status" },
    });
    expect(result.exitCode).toBe(0);

    const events = readEvents(root, featureId);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event: "PostToolUse", tool: "Bash", feature: featureId, result: "success" });
  });

  it("logs a failure event with an error note for PostToolUseFailure", () => {
    const result = runHook(root, {
      hook_event_name: "PostToolUseFailure",
      tool_name: "Bash",
      tool_input: { command: "npm test" },
      tool_response: { stderr: "1 test failed" },
    });
    expect(result.exitCode).toBe(0);

    const events = readEvents(root, featureId);
    expect(events[0]).toMatchObject({ event: "PostToolUseFailure", result: "failure" });
    expect((events[0]!["notes"] as string[])[0]).toContain("1 test failed");
  });

  it("emits a block decision when a completed edit lands outside the active boundary", () => {
    const result = runHook(root, {
      hook_event_name: "PostToolUse",
      tool_name: "Edit",
      tool_input: { file_path: "src/outside/file.ts" },
    });

    expect(result.stdout).toBeTruthy();
    const decision = JSON.parse(result.stdout);
    expect(decision.hookSpecificOutput.decision).toBe("block");
    expect(decision.hookSpecificOutput.reason).toContain("out-of-boundary");

    const events = readEvents(root, featureId);
    expect(events.some((e) => e["event"] === "boundary-violation")).toBe(true);
  });

  it("does not block an edit inside the active boundary", () => {
    const result = runHook(root, {
      hook_event_name: "PostToolUse",
      tool_name: "Edit",
      tool_input: { file_path: "src/allowed.ts" },
    });

    expect(result.stdout.trim()).toBe("");
  });
});
