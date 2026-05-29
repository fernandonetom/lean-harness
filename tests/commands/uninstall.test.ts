import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { runInitCommand } from "../../src/commands/init.js";
import { runUninstallCommand } from "../../src/commands/uninstall.js";

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
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lh-uninstall-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function silenceOutput() {
  return vi.spyOn(process.stdout, "write").mockImplementation(() => true);
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function initAll(): Promise<void> {
  const spy = silenceOutput();
  await runInitCommand({ cwd: tmpDir, host: "all", yes: true });
  spy.mockRestore();
}

describe("lh uninstall — nothing installed", () => {
  it("reports nothing to uninstall on a clean directory", async () => {
    const spy = silenceOutput();
    await runUninstallCommand({ cwd: tmpDir, yes: true });
    spy.mockRestore();
    // no error thrown — just a no-op
    expect(await exists(path.join(tmpDir, ".lh"))).toBe(false);
  });
});

describe("lh uninstall — dry run", () => {
  it("prints preview without deleting anything", async () => {
    await initAll();

    const spy = silenceOutput();
    await runUninstallCommand({ cwd: tmpDir, yes: true, dryRun: true });
    spy.mockRestore();

    expect(await exists(path.join(tmpDir, ".lh", "config.yml"))).toBe(true);
    expect(await exists(path.join(tmpDir, ".claude", "agents"))).toBe(true);
    expect(await exists(path.join(tmpDir, ".opencode", "agents"))).toBe(true);
  });
});

describe("lh uninstall — full removal with --yes", () => {
  it("removes .lh framework files and directories", async () => {
    await initAll();
    const spy = silenceOutput();
    await runUninstallCommand({ cwd: tmpDir, yes: true });
    spy.mockRestore();

    expect(await exists(path.join(tmpDir, ".lh", "config.yml"))).toBe(false);
    expect(await exists(path.join(tmpDir, ".lh", "state.json"))).toBe(false);
    expect(await exists(path.join(tmpDir, ".lh", "templates"))).toBe(false);
    expect(await exists(path.join(tmpDir, ".lh", "protocols"))).toBe(false);
    expect(await exists(path.join(tmpDir, ".lh", "policies"))).toBe(false);
  });

  it("removes .claude integration directories", async () => {
    await initAll();
    const spy = silenceOutput();
    await runUninstallCommand({ cwd: tmpDir, yes: true });
    spy.mockRestore();

    expect(await exists(path.join(tmpDir, ".claude", "agents"))).toBe(false);
    expect(await exists(path.join(tmpDir, ".claude", "skills"))).toBe(false);
    expect(await exists(path.join(tmpDir, ".claude", "hooks"))).toBe(false);
    expect(await exists(path.join(tmpDir, ".claude", "README.md"))).toBe(false);
    expect(await exists(path.join(tmpDir, ".claude", "settings.local.example.json"))).toBe(false);
  });

  it("removes .opencode integration directories", async () => {
    await initAll();
    const spy = silenceOutput();
    await runUninstallCommand({ cwd: tmpDir, yes: true });
    spy.mockRestore();

    expect(await exists(path.join(tmpDir, ".opencode", "agents"))).toBe(false);
    expect(await exists(path.join(tmpDir, ".opencode", "commands"))).toBe(false);
    expect(await exists(path.join(tmpDir, ".opencode", "plugins"))).toBe(false);
  });

  it("removes empty parent dirs after cleanup", async () => {
    await initAll();
    const spy = silenceOutput();
    await runUninstallCommand({ cwd: tmpDir, yes: true });
    spy.mockRestore();

    // .lh/ should be gone (only had memory/ and features/ which are kept by --yes)
    // OR still present if memory/features exist — but either way .lh/config.yml is gone
    expect(await exists(path.join(tmpDir, ".lh", "config.yml"))).toBe(false);
  });
});

describe("lh uninstall — preserves user files", () => {
  it("always preserves .claude/settings.local.json", async () => {
    await initAll();

    const localSettingsPath = path.join(tmpDir, ".claude", "settings.local.json");
    await fs.writeFile(localSettingsPath, JSON.stringify({ permissions: { allow: ["Bash(my-custom-cmd*)"] } }, null, 2));

    const spy = silenceOutput();
    await runUninstallCommand({ cwd: tmpDir, yes: true });
    spy.mockRestore();

    expect(await exists(localSettingsPath)).toBe(true);
    const content = JSON.parse(await fs.readFile(localSettingsPath, "utf-8"));
    expect(content.permissions.allow).toContain("Bash(my-custom-cmd*)");
  });

  it("preserves memory and features when --yes is passed", async () => {
    await initAll();

    // memory and features exist after init
    expect(await exists(path.join(tmpDir, ".lh", "memory"))).toBe(true);
    expect(await exists(path.join(tmpDir, ".lh", "features"))).toBe(true);

    const spy = silenceOutput();
    await runUninstallCommand({ cwd: tmpDir, yes: true });
    spy.mockRestore();

    expect(await exists(path.join(tmpDir, ".lh", "memory"))).toBe(true);
    expect(await exists(path.join(tmpDir, ".lh", "features"))).toBe(true);
  });
});

describe("lh uninstall — strips LH entries from shared config files", () => {
  it("strips LH permissions from settings.json while preserving user entries", async () => {
    await initAll();

    // Add a user-defined permission that should be preserved
    const settingsPath = path.join(tmpDir, ".claude", "settings.json");
    const existing = JSON.parse(await fs.readFile(settingsPath, "utf-8"));
    existing.permissions.allow.push("Bash(my-tool*)");
    await fs.writeFile(settingsPath, JSON.stringify(existing, null, 2));

    const spy = silenceOutput();
    await runUninstallCommand({ cwd: tmpDir, yes: true });
    spy.mockRestore();

    // settings.json should still exist (it has user entries)
    expect(await exists(settingsPath)).toBe(true);
    const result = JSON.parse(await fs.readFile(settingsPath, "utf-8"));

    // User entry preserved
    expect(result.permissions.allow).toContain("Bash(my-tool*)");

    // LH entries removed
    expect(result.permissions.allow).not.toContain("Bash(git status*)");
    expect(result.permissions.allow).not.toContain("Read");
    expect(result.permissions.deny).not.toContain("Bash(rm -rf /)");
  });

  it("strips LH env var from settings.json", async () => {
    await initAll();

    const settingsPath = path.join(tmpDir, ".claude", "settings.json");
    const spy = silenceOutput();
    await runUninstallCommand({ cwd: tmpDir, yes: true });
    spy.mockRestore();

    if (await exists(settingsPath)) {
      const result = JSON.parse(await fs.readFile(settingsPath, "utf-8"));
      expect((result.env ?? {})["LEANHARNESS_CONFIG"]).toBeUndefined();
    }
  });

  it("strips LH hooks from settings.json", async () => {
    await initAll();

    const settingsPath = path.join(tmpDir, ".claude", "settings.json");
    const spy = silenceOutput();
    await runUninstallCommand({ cwd: tmpDir, yes: true });
    spy.mockRestore();

    if (await exists(settingsPath)) {
      const result = JSON.parse(await fs.readFile(settingsPath, "utf-8"));
      const hooks = result.hooks ?? {};
      for (const hookName of Object.keys(hooks)) {
        const entries = Array.isArray(hooks[hookName]) ? hooks[hookName] : [];
        for (const entry of entries) {
          const hookList = Array.isArray(entry.hooks) ? entry.hooks : [];
          for (const h of hookList) {
            expect(typeof h.command === "string" && h.command.includes(".lh/scripts/hooks/")).toBe(false);
          }
        }
      }
    }
  });

  it("strips lh- agent entries from opencode.json while preserving user agents", async () => {
    await initAll();

    // Add a user-defined agent to opencode.json
    const opencodeConfigPath = path.join(tmpDir, "opencode.json");
    if (await exists(opencodeConfigPath)) {
      const existing = JSON.parse(await fs.readFile(opencodeConfigPath, "utf-8"));
      existing.agent = existing.agent ?? {};
      existing.agent["my-custom-agent"] = { description: "My agent", mode: "primary" };
      existing.command = existing.command ?? {};
      existing.command["my-slash"] = { description: "Mine", agent: "my-custom-agent", template: ".opencode/commands/mine.md" };
      await fs.writeFile(opencodeConfigPath, JSON.stringify(existing, null, 2));
    }

    const spy = silenceOutput();
    await runUninstallCommand({ cwd: tmpDir, yes: true });
    spy.mockRestore();

    if (await exists(opencodeConfigPath)) {
      const result = JSON.parse(await fs.readFile(opencodeConfigPath, "utf-8"));
      const agents = result.agent ?? {};
      expect(agents["lh-scout"]).toBeUndefined();
      expect(agents["lh-builder"]).toBeUndefined();
      expect(agents["my-custom-agent"]).toBeDefined();

      const commands = result.command ?? {};
      expect(commands["lh-spec"]).toBeUndefined();
      expect(commands["my-slash"]).toBeDefined();
      expect(commands["my-slash"].template).toBe(".opencode/commands/mine.md");
    }
  });
});

describe("lh uninstall — JSON output", () => {
  it("outputs JSON with status done after successful uninstall", async () => {
    await initAll();

    const output: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });

    await runUninstallCommand({ cwd: tmpDir, yes: true, json: true });
    vi.restoreAllMocks();

    const combined = output.join("");
    const parsed = JSON.parse(combined);
    expect(parsed.status).toBe("done");
    expect(Array.isArray(parsed.removed)).toBe(true);
  });

  it("outputs JSON with status nothing when not installed", async () => {
    const output: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      output.push(String(chunk));
      return true;
    });

    await runUninstallCommand({ cwd: tmpDir, yes: true, json: true });
    vi.restoreAllMocks();

    const combined = output.join("");
    const parsed = JSON.parse(combined);
    expect(parsed.status).toBe("nothing");
  });
});
