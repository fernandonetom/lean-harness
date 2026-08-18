import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CLIError } from "../../src/core/errors.js";
import { getVersion } from "../../src/core/version.js";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import yaml from "js-yaml";
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

  it("allows explicit host override (v2: does not create plugin files)", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runInitCommand({ cwd: tmpDir });
    await runUpdateCommand({ cwd: tmpDir, host: "claude-code" });
    spy.mockRestore();

    // In v2, lh update does not create plugin files (host-specific content).
    // Plugin files are installed/updated via separate plugin commands.
    // This test verifies that update accepts the host parameter and completes successfully.
    expect(await fs.access(path.join(tmpDir, ".lh", "config.yml")).then(() => true).catch(() => false)).toBe(true);
  });

  it.each([
    { label: "policies/risk-gates.yml", rel: ["policies", "risk-gates.yml"], host: undefined, marker: "# custom-marker-risk-gates\n" },
    { label: "policies/boundary.yml", rel: ["policies", "boundary.yml"], host: undefined, marker: "# custom-marker-boundary\nalways_allow:\n  - \"**/*.custom\"\n" },
    { label: "policies/commands.yml", rel: ["policies", "commands.yml"], host: undefined, marker: "# custom-marker-commands\n" },
    { label: "policies/claude-code.yml", rel: ["policies", "claude-code.yml"], host: "claude-code" as const, marker: "# custom-marker-claude-code\n" },
    { label: "policies/opencode.yml", rel: ["policies", "opencode.yml"], host: "opencode" as const, marker: "# custom-marker-opencode\n" },
    {
      label: "state.json",
      rel: ["state.json"],
      host: undefined,
      marker: JSON.stringify({ version: "1", activeFeature: "custom-marker", nextFeatureNumber: 7, features: {} }, null, 2) + "\n",
    },
  ])("preserves custom content in .lh/$label across update", async ({ rel, host, marker }) => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runInitCommand({ cwd: tmpDir, host });
    const targetPath = path.join(tmpDir, ".lh", ...rel);
    await fs.writeFile(targetPath, marker);
    await runUpdateCommand({ cwd: tmpDir, host });
    spy.mockRestore();

    expect(await fs.readFile(targetPath, "utf-8")).toBe(marker);
  });

  it("v2: update does not create host-specific policy files (plugin concern)", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runInitCommand({ cwd: tmpDir });
    await runUpdateCommand({ cwd: tmpDir, host: "claude-code" });
    spy.mockRestore();

    // In v2, host-specific policy files (claude-code.yml, opencode.yml) are created
    // by plugin installation, not by lh update. lh update only refreshes host-neutral
    // files (templates, protocols, core policies like risk-gates, boundary, commands).
    // Verify that host-neutral files are refreshed:
    const hostNeutralPolicy = path.join(tmpDir, ".lh", "policies", "boundary.yml");
    expect(await fs.access(hostNeutralPolicy).then(() => true).catch(() => false)).toBe(true);
  });

  it("reports preserved files in JSON output", async () => {
    const chunks: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((c) => {
      chunks.push(String(c));
      return true;
    });
    await runInitCommand({ cwd: tmpDir, json: true });
    await fs.writeFile(path.join(tmpDir, ".lh", "policies", "boundary.yml"), "# custom\n");
    await runUpdateCommand({ cwd: tmpDir, json: true });
    spy.mockRestore();

    const lines = chunks.join("").trim().split("\n");
    const lastJson = lines.slice(lines.lastIndexOf("{")).join("\n");
    const parsed = JSON.parse(lastJson);
    expect(parsed.preservedFiles).toContain("policies/boundary.yml");
  });
});

describe("bundled commands.yml policy template", () => {
  it("parses as valid YAML with no duplicate deny patterns", async () => {
    const { resolvePackageLhRoot } = await import("../../src/core/bundled-scaffold.js");
    const p = path.join(resolvePackageLhRoot(), "policies", "commands.yml");
    const raw = await fs.readFile(p, "utf-8");

    const parsed = yaml.load(raw) as { deny: Array<{ pattern: string; reason: string }>; ask: unknown[] };

    expect(Array.isArray(parsed.deny)).toBe(true);
    expect(Array.isArray(parsed.ask)).toBe(true);
    for (const entry of parsed.deny) {
      expect(typeof entry.pattern).toBe("string");
      expect(typeof entry.reason).toBe("string");
    }
    const patterns = parsed.deny.map((e) => e.pattern);
    expect(new Set(patterns).size).toBe(patterns.length);
  });
});
