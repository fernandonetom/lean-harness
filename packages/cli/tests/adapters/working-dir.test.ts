import { EventEmitter } from "node:events";
import { describe, it, expect, vi } from "vitest";

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: spawnMock,
  };
});

import { buildClaudeCodeArgs, runClaudeCode } from "../../src/adapters/claude-code.js";
import { buildOpenCodeArgs, runOpenCode } from "../../src/adapters/opencode.js";
import type { AgentRunInput } from "../../src/adapters/types.js";

void buildOpenCodeArgs; // kept imported for parity with the original test file

function createFakeProc() {
  const proc = new EventEmitter() as EventEmitter & {
    pid: number;
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: (signal?: NodeJS.Signals) => boolean;
  };
  proc.pid = 12345;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn(() => true);
  return proc;
}

describe("workingDir support in adapters", () => {
  const base: AgentRunInput = {
    root: "/repo",
    prompt: "test prompt",
    featureRef: "F001",
    taskId: "T01",
  };

  describe("Claude Code adapter", () => {
    it("does not put --cwd in the built args when workingDir is provided", () => {
      const input: AgentRunInput = {
        ...base,
        workingDir: "/repo/.worktrees/feature-x",
      };
      const args = buildClaudeCodeArgs(input);
      expect(args).not.toContain("--cwd");
    });

    it("does not put --cwd in the built args when workingDir is not provided", () => {
      const args = buildClaudeCodeArgs(base);
      expect(args).not.toContain("--cwd");
    });

    it("does not include --cwd in the dry-run command array with workingDir", async () => {
      const input: AgentRunInput = {
        ...base,
        workingDir: "/repo/.worktrees/feature-x",
        dryRun: true,
      };
      const result = await runClaudeCode(input);
      expect(result.dryRun).toBe(true);
      expect(result.command).not.toContain("--cwd");
    });

    it("does not include --cwd in the dry-run command array without workingDir", async () => {
      const input: AgentRunInput = {
        ...base,
        dryRun: true,
      };
      const result = await runClaudeCode(input);
      expect(result.dryRun).toBe(true);
      expect(result.command).not.toContain("--cwd");
    });

    it("passes workingDir as the spawn `cwd` option when provided", async () => {
      spawnMock.mockReset();
      const proc = createFakeProc();
      spawnMock.mockReturnValue(proc);

      const input: AgentRunInput = {
        ...base,
        workingDir: "/repo/.worktrees/feature-x",
      };
      const resultPromise = runClaudeCode(input);
      proc.emit("close", 0, null);
      await resultPromise;

      expect(spawnMock).toHaveBeenCalledTimes(1);
      const [, , options] = spawnMock.mock.calls[0];
      expect(options.cwd).toBe("/repo/.worktrees/feature-x");
    });

    it("falls back to root as the spawn `cwd` option when workingDir is not provided", async () => {
      spawnMock.mockReset();
      const proc = createFakeProc();
      spawnMock.mockReturnValue(proc);

      const resultPromise = runClaudeCode(base);
      proc.emit("close", 0, null);
      await resultPromise;

      expect(spawnMock).toHaveBeenCalledTimes(1);
      const [, , options] = spawnMock.mock.calls[0];
      expect(options.cwd).toBe("/repo");
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
