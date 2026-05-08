import { describe, it, expect } from "vitest";
import { buildClaudeCodeArgs, runClaudeCode } from "../../src/adapters/claude-code.js";
import type { AgentRunInput, AgentRunResult } from "../../src/adapters/types.js";

describe("buildClaudeCodeArgs", () => {
  const base: AgentRunInput = {
    root: "/project",
    prompt: "do stuff",
    featureRef: "F001",
    taskId: "T01",
  };

  it("produces basic args with -p and --cwd", () => {
    const args = buildClaudeCodeArgs(base);
    expect(args).toContain("-p");
    expect(args).toContain("do stuff");
    expect(args).toContain("--cwd");
    expect(args).toContain("/project");
    expect(args).toEqual(["-p", "do stuff", "--cwd", "/project"]);
  });

  it("adds --allowedTools with comma-joined values", () => {
    const input: AgentRunInput = {
      ...base,
      allowedTools: ["Read", "Write", "Bash"],
    };
    const args = buildClaudeCodeArgs(input);
    expect(args).toContain("--allowedTools");
    expect(args).toContain("Read,Write,Bash");
  });

  it("adds --permission-mode when provided", () => {
    const input: AgentRunInput = {
      ...base,
      permissionMode: "plan",
    };
    const args = buildClaudeCodeArgs(input);
    expect(args).toContain("--permission-mode");
    expect(args).toContain("plan");
  });

  it("adds --output-format when provided", () => {
    const input: AgentRunInput = {
      ...base,
      outputFormat: "json",
    };
    const args = buildClaudeCodeArgs(input);
    expect(args).toContain("--output-format");
    expect(args).toContain("json");
  });

  it("does not add optional flags when not provided", () => {
    const args = buildClaudeCodeArgs(base);
    expect(args).not.toContain("--allowedTools");
    expect(args).not.toContain("--permission-mode");
    expect(args).not.toContain("--output-format");
  });
});

describe("AgentRunInput subprocess control fields", () => {
  it("accepts timeout, signal, onStdout, onStderr as optional fields", () => {
    const controller = new AbortController();
    const input: AgentRunInput = {
      root: "/project",
      prompt: "do stuff",
      featureRef: "F001",
      taskId: "T01",
      timeout: 60_000,
      signal: controller.signal,
      onStdout: (_chunk: string) => {},
      onStderr: (_chunk: string) => {},
    };
    // Compile-time check: if this builds, the types are correct
    expect(input.timeout).toBe(60_000);
    expect(input.signal).toBe(controller.signal);
    expect(typeof input.onStdout).toBe("function");
    expect(typeof input.onStderr).toBe("function");
  });
});

describe("runClaudeCode dry-run includes new fields", () => {
  it("returns timedOut: false and aborted: false on dry run", async () => {
    const result: AgentRunResult = await runClaudeCode({
      root: "/project",
      prompt: "do stuff",
      featureRef: "F001",
      taskId: "T01",
      dryRun: true,
    });
    expect(result.timedOut).toBe(false);
    expect(result.aborted).toBe(false);
    expect(result.ok).toBe(true);
    expect(result.dryRun).toBe(true);
  });

  it("returns aborted: true when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await runClaudeCode({
      root: "/project",
      prompt: "do stuff",
      featureRef: "F001",
      taskId: "T01",
      signal: controller.signal,
    });
    expect(result.aborted).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.timedOut).toBe(false);
  });
});
