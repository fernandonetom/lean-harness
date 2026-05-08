import { describe, it, expect } from "vitest";
import { buildOpenCodeArgs, runOpenCode } from "../../src/adapters/opencode.js";
import type { AgentRunInput, AgentRunResult } from "../../src/adapters/types.js";

describe("buildOpenCodeArgs", () => {
  const base: AgentRunInput = {
    root: "/project",
    prompt: "do stuff",
    featureRef: "F001",
    taskId: "T01",
  };

  it("starts with 'run' and prompt is last positional arg", () => {
    const args = buildOpenCodeArgs(base);
    expect(args[0]).toBe("run");
    expect(args[args.length - 1]).toBe("do stuff");
  });

  it("adds --agent when opencodeAgent is provided", () => {
    const input: AgentRunInput = {
      ...base,
      opencodeAgent: "custom-agent",
    };
    const args = buildOpenCodeArgs(input);
    expect(args).toContain("--agent");
    expect(args).toContain("custom-agent");
  });

  it("defaults format to json", () => {
    const args = buildOpenCodeArgs(base);
    expect(args).toContain("--format");
    expect(args).toContain("json");
  });

  it("adds --model when provided", () => {
    const input: AgentRunInput = {
      ...base,
      model: "anthropic/claude-sonnet",
    };
    const args = buildOpenCodeArgs(input);
    expect(args).toContain("--model");
    expect(args).toContain("anthropic/claude-sonnet");
  });

  it("adds --title with LeanHarness featureRef taskId", () => {
    const args = buildOpenCodeArgs(base);
    expect(args).toContain("--title");
    expect(args).toContain("LeanHarness F001 T01");
  });
});

describe("runOpenCode dry-run includes new fields", () => {
  it("returns timedOut: false and aborted: false on dry run", async () => {
    const result: AgentRunResult = await runOpenCode({
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
    const result = await runOpenCode({
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
