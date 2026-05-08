import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CLIError } from "../../src/core/errors.js";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { runUpdateCommand } from "../../src/commands/update.js";
import { runInitCommand } from "../../src/commands/init.js";

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

  it("preserves user config.yml", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runInitCommand({ cwd: tmpDir });
    const customConfig = "# my custom config\nversion: 0.1\nproject:\n  name: myproject\n";
    await fs.writeFile(path.join(tmpDir, ".lh", "config.yml"), customConfig);
    await runUpdateCommand({ cwd: tmpDir });
    spy.mockRestore();

    const config = await fs.readFile(path.join(tmpDir, ".lh", "config.yml"), "utf-8");
    expect(config).toBe(customConfig);
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
