import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CLIError } from "../../src/core/errors.js";
import { getVersion } from "../../src/core/version.js";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { runUpdateCommand } from "../../src/commands/update.js";
import { runInitCommand } from "../../src/commands/init.js";

vi.mock("node:child_process", () => ({
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
}));

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lh-update-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("runUpdateCommand", () => {
  it("fails when not initialized", async () => {
    await expect(runUpdateCommand({ cwd: tmpDir })).rejects.toThrow(CLIError);
  });

  it("updates after init", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runInitCommand({ cwd: tmpDir });
    await runUpdateCommand({ cwd: tmpDir });
    spy.mockRestore();

    expect(await fs.access(path.join(tmpDir, ".lh", "config.yml")).then(() => true).catch(() => false)).toBe(true);
    expect(await fs.access(path.join(tmpDir, ".lh", "state.json")).then(() => true).catch(() => false)).toBe(true);
  });

  it("updates version in user config.yml", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runInitCommand({ cwd: tmpDir });
    const customConfig = "# my custom config\nversion: 0.1\nproject:\n  name: myproject\n";
    await fs.writeFile(path.join(tmpDir, ".lh", "config.yml"), customConfig);
    await runUpdateCommand({ cwd: tmpDir });
    spy.mockRestore();

    const config = await fs.readFile(path.join(tmpDir, ".lh", "config.yml"), "utf-8");
    // Version should be updated to current version, rest preserved
    expect(config).toContain('version: "' + getVersion() + '"');
    expect(config).toContain("# my custom config");
    expect(config).toContain("name: myproject");
  });

  it("restores user config with updated version", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runInitCommand({ cwd: tmpDir });
    // Write custom config with old version
    const customConfig = "# my custom config\nversion: \"0.9\"\nproject:\n  name: myproject\n";
    await fs.writeFile(path.join(tmpDir, ".lh", "config.yml"), customConfig);
    await runUpdateCommand({ cwd: tmpDir });
    spy.mockRestore();

    const config = await fs.readFile(path.join(tmpDir, ".lh", "config.yml"), "utf-8");
    // User content should be preserved with version updated
    expect(config).toContain("# my custom config");
    expect(config).toContain('version: "' + getVersion() + '"');
    expect(config).toContain("name: myproject");
  });

  it("detects claude-code host", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runInitCommand({ cwd: tmpDir, host: "claude-code" });
    await runUpdateCommand({ cwd: tmpDir });
    spy.mockRestore();

    expect(await fs.access(path.join(tmpDir, ".claude", "settings.json")).then(() => true).catch(() => false)).toBe(true);
  });

  it("detects opencode host", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runInitCommand({ cwd: tmpDir, host: "opencode" });
    await runUpdateCommand({ cwd: tmpDir });
    spy.mockRestore();

    expect(await fs.access(path.join(tmpDir, "opencode.json")).then(() => true).catch(() => false)).toBe(true);
  });

  it("outputs JSON", async () => {
    const chunks: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((c) => {
      chunks.push(String(c));
      return true;
    });
    await runInitCommand({ cwd: tmpDir, json: true });
    await runUpdateCommand({ cwd: tmpDir, json: true });
    spy.mockRestore();

    const lines = chunks.join("").trim().split("\n");
    const lastJson = lines.slice(lines.lastIndexOf("{")).join("\n");
    const parsed = JSON.parse(lastJson);
    expect(parsed.updated).toBe(true);
    expect(parsed.configPreserved).toBe(true);
  });

  it("allows explicit host override", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runInitCommand({ cwd: tmpDir });
    await runUpdateCommand({ cwd: tmpDir, host: "claude-code" });
    spy.mockRestore();

    expect(await fs.access(path.join(tmpDir, ".claude")).then(() => true).catch(() => false)).toBe(true);
  });
});
