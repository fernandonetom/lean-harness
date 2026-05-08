import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CLIError } from "../../src/core/errors.js";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { runMemoryCommand } from "../../src/commands/memory.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lh-memcmd-"));
  await fs.mkdir(path.join(tmpDir, ".lh", "memory"), { recursive: true });
  await fs.writeFile(
    path.join(tmpDir, ".lh", "memory", "project.md"),
    "# Project Memory\n\n## Tech Stack\n\n- TypeScript\n",
  );
  await fs.writeFile(
    path.join(tmpDir, ".lh", "memory", "decisions.md"),
    "# Decision Log\n\nSome decisions.\n",
  );
  await fs.writeFile(
    path.join(tmpDir, ".lh", "memory", "patterns.md"),
    "# Patterns\n\nSome patterns.\n",
  );
  await fs.writeFile(
    path.join(tmpDir, ".lh", "memory", "cave.md"),
    "# Cave Memory\n\nCave data.\n",
  );
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("runMemoryCommand", () => {
  it("rejects unknown subcommand", async () => {
    await expect(runMemoryCommand({ cwd: tmpDir, subcommand: "nope" })).rejects.toThrow(CLIError);
  });

  it("rejects unknown memory kind", async () => {
    await expect(runMemoryCommand({ cwd: tmpDir, subcommand: "show", kind: "bogus" })).rejects.toThrow(CLIError);
  });

  it("show displays all memory files", async () => {
    const chunks: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((c) => {
      chunks.push(String(c));
      return true;
    });
    await runMemoryCommand({ cwd: tmpDir, subcommand: "show" });
    const output = chunks.join("");
    expect(output).toContain("--- project ---");
    expect(output).toContain("TypeScript");
    expect(output).toContain("--- decisions ---");
    spy.mockRestore();
  });

  it("show displays single memory file", async () => {
    const chunks: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((c) => {
      chunks.push(String(c));
      return true;
    });
    await runMemoryCommand({ cwd: tmpDir, subcommand: "show", kind: "project" });
    const output = chunks.join("");
    expect(output).toContain("TypeScript");
    expect(output).not.toContain("--- project ---");
    spy.mockRestore();
  });

  it("clear resets memory file", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runMemoryCommand({ cwd: tmpDir, subcommand: "clear", kind: "project" });
    const content = await fs.readFile(
      path.join(tmpDir, ".lh", "memory", "project.md"),
      "utf-8",
    );
    expect(content).toContain("# Project Memory");
    expect(content).not.toContain("TypeScript");
    spy.mockRestore();
  });

  it("status reports file info", async () => {
    const chunks: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((c) => {
      chunks.push(String(c));
      return true;
    });
    await runMemoryCommand({ cwd: tmpDir, subcommand: "status" });
    const output = chunks.join("");
    expect(output).toContain("Memory directory:");
    expect(output).toContain("project:");
    expect(output).toContain("lines");
    spy.mockRestore();
  });

  it("show --json outputs JSON", async () => {
    const chunks: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((c) => {
      chunks.push(String(c));
      return true;
    });
    await runMemoryCommand({ cwd: tmpDir, subcommand: "show", kind: "project", json: true });
    const output = chunks.join("");
    const parsed = JSON.parse(output);
    expect(parsed.project).toContain("TypeScript");
    spy.mockRestore();
  });

  it("status --json outputs JSON", async () => {
    const chunks: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((c) => {
      chunks.push(String(c));
      return true;
    });
    await runMemoryCommand({ cwd: tmpDir, subcommand: "status", json: true });
    const output = chunks.join("");
    const parsed = JSON.parse(output);
    expect(parsed.dir).toBeTruthy();
    expect(parsed.files).toHaveLength(4);
    expect(parsed.files[0].kind).toBe("project");
    spy.mockRestore();
  });
});
