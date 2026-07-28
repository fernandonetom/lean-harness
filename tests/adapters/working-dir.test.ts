import { describe, it, expect } from "vitest";
import { buildClaudeCodeArgs, runClaudeCode } from "../../src/adapters/claude-code.js";
import { buildOpenCodeArgs, runOpenCode } from "../../src/adapters/opencode.js";
import type { AgentRunInput } from "../../src/adapters/types.js";

describe("workingDir support in adapters", () => {
  const base: AgentRunInput = {
    root: "/repo",
    prompt: "test prompt",
    featureRef: "F001",
    taskId: "T01",
  };

  describe("Claude Code adapter", () => {
    it("uses workingDir for --cwd when provided", () => {
      const input: AgentRunInput = {
        ...base,
        workingDir: "/repo/.worktrees/feature-x",
      };
      const args = buildClaudeCodeArgs(input);
      const cwdIndex = args.indexOf("--cwd");
      expect(cwdIndex).not.toBe(-1);
      expect(args[cwdIndex + 1]).toBe("/repo/.worktrees/feature-x");
    });

    it("defaults to root for --cwd when workingDir is not provided", () => {
      const args = buildClaudeCodeArgs(base);
      const cwdIndex = args.indexOf("--cwd");
      expect(cwdIndex).not.toBe(-1);
      expect(args[cwdIndex + 1]).toBe("/repo");
    });

    it("includes correct --cwd in command array on dry run with workingDir", async () => {
      const input: AgentRunInput = {
        ...base,
        workingDir: "/repo/.worktrees/feature-x",
        dryRun: true,
      };
      const result = await runClaudeCode(input);
      expect(result.dryRun).toBe(true);
      const cwdIndex = result.command.indexOf("--cwd");
      expect(cwdIndex).not.toBe(-1);
      expect(result.command[cwdIndex + 1]).toBe("/repo/.worktrees/feature-x");
    });

    it("includes correct --cwd in command array on dry run without workingDir", async () => {
      const input: AgentRunInput = {
        ...base,
        dryRun: true,
      };
      const result = await runClaudeCode(input);
      expect(result.dryRun).toBe(true);
      const cwdIndex = result.command.indexOf("--cwd");
      expect(cwdIndex).not.toBe(-1);
      expect(result.command[cwdIndex + 1]).toBe("/repo");
    });
  });

  describe("OpenCode adapter", () => {
    it("accepts workingDir and completes dry run without error", async () => {
      const input: AgentRunInput = {
        ...base,
        workingDir: "/repo/.worktrees/feature-x",
        dryRun: true,
      };
      const result = await runOpenCode(input);
      expect(result.dryRun).toBe(true);
      expect(result.ok).toBe(true);
    });

    it("completes dry run without workingDir", async () => {
      const input: AgentRunInput = {
        ...base,
        dryRun: true,
      };
      const result = await runOpenCode(input);
      expect(result.dryRun).toBe(true);
      expect(result.ok).toBe(true);
    });
  });
});
