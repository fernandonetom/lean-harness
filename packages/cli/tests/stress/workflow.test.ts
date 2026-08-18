import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawnSync: vi.fn((cmd: string, args: string[]) => {
      if (cmd === "python3" && args[0] === "--version") {
        return { status: 0, stdout: "Python 3.11.0\n", stderr: "", error: undefined };
      }
      if (cmd === "graphify" && args[0] === "--version") {
        return { status: 1, stdout: "", stderr: "", error: new Error("not found") };
      }
      return { status: 0, stdout: "", stderr: "", error: undefined };
    }),
    execSync: vi.fn(),
  };
});
import fs from "node:fs/promises";
import { createTempWorkspace, cleanupWorkspace, lhPath, featurePath, readJson, fileExists, readFile } from "../e2e/helpers.js";
import { runInitCommand } from "../../src/commands/init.js";
import { runSpecCommand } from "../../src/commands/spec.js";
import { runDiscoverCommand } from "../../src/commands/discover.js";
import { runPlanCommand } from "../../src/commands/plan.js";
import { runBuildCommand } from "../../src/commands/build.js";
import { runCheckCommand } from "../../src/commands/check.js";
import { CLIError } from "../../src/core/errors.js";
import { runClaudeCode } from "../../src/adapters/claude-code.js";
import type { AgentRunInput } from "../../src/adapters/types.js";

let tmpDir: string;
const suppress = { write: () => true } as any;

function silenceOutput() {
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = suppress.write;
  process.stderr.write = suppress.write;
  return () => {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  };
}

beforeEach(async () => {
  tmpDir = await createTempWorkspace();
});

afterEach(async () => {
  await cleanupWorkspace(tmpDir);
});

describe("stress: partial workflow", () => {
  it("check before build produces blocked verdict", async () => {
    const restore = silenceOutput();
    try {
      await runInitCommand({ cwd: tmpDir });
      await runSpecCommand({ cwd: tmpDir, request: "Add user dashboard" });
      await runDiscoverCommand({ cwd: tmpDir, ref: "F001" });
      await runPlanCommand({ cwd: tmpDir, ref: "F001" });

      await runCheckCommand({ cwd: tmpDir, ref: "F001", noRun: true });

      const state = await readJson<any>(lhPath(tmpDir, "state.json"));
      expect(["blocked", "needs-fix"]).toContain(state.features[0].status);

      const fDir = state.features[0].path;
      const result = await readFile(featurePath(tmpDir, fDir, "result.md"));
      expect(result).toContain("blocked");
    } finally {
      restore();
    }
  });

  it("build without tasks.md throws CLIError", async () => {
    const restore = silenceOutput();
    try {
      await runInitCommand({ cwd: tmpDir });
      await runSpecCommand({ cwd: tmpDir, request: "Add feature Q" });
      await runDiscoverCommand({ cwd: tmpDir, ref: "F001" });

      await expect(
        runBuildCommand({ cwd: tmpDir, ref: "F001", dryRun: true }),
      ).rejects.toThrow(/tasks\.md is missing/);
    } finally {
      restore();
    }
  });

  it("build archived feature throws CLIError", async () => {
    const restore = silenceOutput();
    try {
      await runInitCommand({ cwd: tmpDir });
      await runSpecCommand({ cwd: tmpDir, request: "Add temp feature" });
      await runDiscoverCommand({ cwd: tmpDir, ref: "F001" });
      await runPlanCommand({ cwd: tmpDir, ref: "F001" });

      const { runArchiveCommand } = await import("../../src/commands/archive.js");
      await runArchiveCommand({ cwd: tmpDir, ref: "F001" });

      await expect(
        runBuildCommand({ cwd: tmpDir, ref: "F001", dryRun: true }),
      ).rejects.toThrow(/archived/);
    } finally {
      restore();
    }
  });

  it("double check without --force throws CLIError", async () => {
    const restore = silenceOutput();
    try {
      await runInitCommand({ cwd: tmpDir });
      await runSpecCommand({ cwd: tmpDir, request: "Add feature W" });
      await runDiscoverCommand({ cwd: tmpDir, ref: "F001" });

      await runCheckCommand({ cwd: tmpDir, ref: "F001", noRun: true });

      await expect(
        runCheckCommand({ cwd: tmpDir, ref: "F001", noRun: true }),
      ).rejects.toThrow(/already exists/);
    } finally {
      restore();
    }
  });

  it("check --force overwrites previous check", async () => {
    const restore = silenceOutput();
    try {
      await runInitCommand({ cwd: tmpDir });
      await runSpecCommand({ cwd: tmpDir, request: "Add feature R" });
      await runDiscoverCommand({ cwd: tmpDir, ref: "F001" });

      await runCheckCommand({ cwd: tmpDir, ref: "F001", noRun: true });
      await runCheckCommand({ cwd: tmpDir, ref: "F001", noRun: true, force: true });

      const state = await readJson<any>(lhPath(tmpDir, "state.json"));
      expect(state.features[0]).toBeDefined();
    } finally {
      restore();
    }
  });
});

describe("stress: agent timeout behavior", () => {
  it("abort signal prevents agent from starting", async () => {
    const controller = new AbortController();
    controller.abort();

    const input: AgentRunInput = {
      root: tmpDir,
      prompt: "test prompt",
      featureRef: "F001",
      taskId: "T001",
      signal: controller.signal,
    };

    const result = await runClaudeCode(input);
    expect(result.aborted).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.dryRun).toBe(false);
  });

  it("dry run completes instantly without spawning process", async () => {
    const input: AgentRunInput = {
      root: tmpDir,
      prompt: "test prompt",
      featureRef: "F001",
      taskId: "T001",
      dryRun: true,
    };

    const result = await runClaudeCode(input);
    expect(result.dryRun).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.durationMs).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.aborted).toBe(false);
    expect(result.command.length).toBeGreaterThan(0);
  });

  it("timeout with short value kills process", async () => {
    const scriptPath = path.join(tmpDir, "hang.sh");
    await fs.writeFile(scriptPath, '#!/bin/bash\nsleep 60\n', { mode: 0o755 });

    const input: AgentRunInput = {
      root: tmpDir,
      prompt: "unused",
      featureRef: "F001",
      taskId: "T001",
      timeout: 200,
      claudeCommand: scriptPath,
    };

    const result = await runClaudeCode(input);
    expect(result.timedOut).toBe(true);
    expect(result.ok).toBe(false);
  }, 15000);

  it("streaming callbacks receive data", async () => {
    const chunks: string[] = [];
    const errChunks: string[] = [];

    const input: AgentRunInput = {
      root: tmpDir,
      prompt: "hello",
      featureRef: "F001",
      taskId: "T001",
      claudeCommand: "echo",
      onStdout: (chunk) => chunks.push(chunk),
      onStderr: (chunk) => errChunks.push(chunk),
    };

    const result = await runClaudeCode(input);
    expect(result.ok).toBe(true);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join("")).toContain("-p");
  });
});
