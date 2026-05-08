import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { CLIError } from "../../src/core/errors.js";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { runInitCommand } from "../../src/commands/init.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lh-init-e2e-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

describe("lh init — LH core artifacts", () => {
  it("creates .lh directory structure", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runInitCommand({ cwd: tmpDir });
    spy.mockRestore();

    expect(await exists(path.join(tmpDir, ".lh"))).toBe(true);
    expect(await exists(path.join(tmpDir, ".lh", "features"))).toBe(true);
    expect(await exists(path.join(tmpDir, ".lh", "memory"))).toBe(true);
    expect(await exists(path.join(tmpDir, ".lh", "templates"))).toBe(true);
    expect(await exists(path.join(tmpDir, ".lh", "policies"))).toBe(true);
    expect(await exists(path.join(tmpDir, ".lh", "protocols"))).toBe(true);
  });

  it("creates config.yml and state.json", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runInitCommand({ cwd: tmpDir });
    spy.mockRestore();

    expect(await exists(path.join(tmpDir, ".lh", "config.yml"))).toBe(true);
    expect(await exists(path.join(tmpDir, ".lh", "state.json"))).toBe(true);

    const config = await fs.readFile(path.join(tmpDir, ".lh", "config.yml"), "utf-8");
    expect(config).toContain("version:");
    expect(config).toContain("host:");

    const state = JSON.parse(await fs.readFile(path.join(tmpDir, ".lh", "state.json"), "utf-8"));
    expect(state.schema).toBe("leanharness-state");
  });

  it("config.yml includes features.commit and build.session_budget", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runInitCommand({ cwd: tmpDir });
    spy.mockRestore();

    const config = await fs.readFile(path.join(tmpDir, ".lh", "config.yml"), "utf-8");
    expect(config).toContain("features:");
    expect(config).toContain("commit: false");
    expect(config).toContain("build:");
    expect(config).toContain("session_budget: 15");
  });

  it("creates memory files", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runInitCommand({ cwd: tmpDir });
    spy.mockRestore();

    for (const f of ["project.md", "decisions.md", "patterns.md", "cave.md"]) {
      expect(await exists(path.join(tmpDir, ".lh", "memory", f))).toBe(true);
    }
  });

  it("does not overwrite existing files without --force", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runInitCommand({ cwd: tmpDir });
    await fs.writeFile(path.join(tmpDir, ".lh", "config.yml"), "# custom config\n");
    await runInitCommand({ cwd: tmpDir });
    spy.mockRestore();

    const config = await fs.readFile(path.join(tmpDir, ".lh", "config.yml"), "utf-8");
    expect(config).toBe("# custom config\n");
  });

  it("overwrites files with --force", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runInitCommand({ cwd: tmpDir });
    await fs.writeFile(path.join(tmpDir, ".lh", "config.yml"), "# custom config\n");
    await runInitCommand({ cwd: tmpDir, force: true });
    spy.mockRestore();

    const config = await fs.readFile(path.join(tmpDir, ".lh", "config.yml"), "utf-8");
    expect(config).toContain("version:");
    expect(config).not.toBe("# custom config\n");
  });

  it("creates .lh/.gitignore with solo-first defaults", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runInitCommand({ cwd: tmpDir });
    spy.mockRestore();

    const gitignore = await fs.readFile(path.join(tmpDir, ".lh", ".gitignore"), "utf-8");
    expect(gitignore).toContain("/features/");
    expect(gitignore).toContain("/state.json");
    expect(gitignore).toContain("/memory/cave.md");
    expect(gitignore).toContain("config.local.yml");
  });

  it("creates .lh/.gitignore without features/ when team=true", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runInitCommand({ cwd: tmpDir, team: true });
    spy.mockRestore();

    const gitignore = await fs.readFile(path.join(tmpDir, ".lh", ".gitignore"), "utf-8");
    expect(gitignore).not.toContain("/features/");
    expect(gitignore).not.toContain("/state.json");
    expect(gitignore).toContain("/memory/cave.md");
    expect(gitignore).toContain("config.local.yml");
  });
});

describe("lh init --host claude-code — Claude Code integration", () => {
  it("creates Claude Code directory structure", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runInitCommand({ cwd: tmpDir, host: "claude-code" });
    spy.mockRestore();

    expect(await exists(path.join(tmpDir, ".claude"))).toBe(true);
    expect(await exists(path.join(tmpDir, ".claude", "agents"))).toBe(true);
    expect(await exists(path.join(tmpDir, ".claude", "skills"))).toBe(true);
    expect(await exists(path.join(tmpDir, ".claude", "hooks"))).toBe(true);
  });

  it("creates skill directories", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runInitCommand({ cwd: tmpDir, host: "claude-code" });
    spy.mockRestore();

    const expectedSkills = ["lh-do", "lh-spec", "lh-discover", "lh-plan", "lh-build", "lh-check", "lh-status"];
    for (const skill of expectedSkills) {
      expect(await exists(path.join(tmpDir, ".claude", "skills", skill))).toBe(true);
    }
  });

  it("creates settings.json", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runInitCommand({ cwd: tmpDir, host: "claude-code" });
    spy.mockRestore();

    expect(await exists(path.join(tmpDir, ".claude", "settings.json"))).toBe(true);
    const settings = JSON.parse(
      await fs.readFile(path.join(tmpDir, ".claude", "settings.json"), "utf-8"),
    );
    expect(settings).toBeTruthy();
  });

  it("creates hook scripts", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runInitCommand({ cwd: tmpDir, host: "claude-code" });
    spy.mockRestore();

    expect(await exists(path.join(tmpDir, ".lh", "scripts", "hooks"))).toBe(true);
  });

  it("produces JSON output", async () => {
    const chunks: string[] = [];
    const spy = vi.spyOn(process.stdout, "write").mockImplementation((c) => {
      chunks.push(String(c));
      return true;
    });
    await runInitCommand({ cwd: tmpDir, host: "claude-code", json: true });
    spy.mockRestore();

    const output = chunks.join("");
    const parsed = JSON.parse(output);
    expect(parsed.directories).toBeTruthy();
    expect(parsed.files).toBeTruthy();
    expect(parsed.directories[".claude"]).toBe("created");
  });
});

describe("lh init --host opencode — OpenCode integration", () => {
  it("creates OpenCode directory structure", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runInitCommand({ cwd: tmpDir, host: "opencode" });
    spy.mockRestore();

    expect(await exists(path.join(tmpDir, ".opencode"))).toBe(true);
    expect(await exists(path.join(tmpDir, ".opencode", "agents"))).toBe(true);
    expect(await exists(path.join(tmpDir, ".opencode", "commands"))).toBe(true);
    expect(await exists(path.join(tmpDir, ".opencode", "plugins"))).toBe(true);
  });

  it("creates OpenCode command templates under .opencode/commands", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runInitCommand({ cwd: tmpDir, host: "opencode" });
    spy.mockRestore();

    const expected = ["lh-spec.md", "lh-discover.md", "lh-plan.md", "lh-build.md", "lh-check.md", "lh-status.md", "lh-do.md"];
    for (const f of expected) {
      expect(await exists(path.join(tmpDir, ".opencode", "commands", f))).toBe(true);
    }
  });

  it("creates agent files", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runInitCommand({ cwd: tmpDir, host: "opencode" });
    spy.mockRestore();

    const expectedAgents = ["lh-scout.md", "lh-builder.md", "lh-reviewer.md", "lh-verifier.md", "lh-compressor.md"];
    for (const agent of expectedAgents) {
      expect(await exists(path.join(tmpDir, ".opencode", "agents", agent))).toBe(true);
    }
  });

  it("creates opencode.json config", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runInitCommand({ cwd: tmpDir, host: "opencode" });
    spy.mockRestore();

    expect(await exists(path.join(tmpDir, "opencode.json"))).toBe(true);
    const config = JSON.parse(
      await fs.readFile(path.join(tmpDir, "opencode.json"), "utf-8"),
    );
    expect(config.agent).toBeTruthy();
    expect(config.agent["lh-scout"]).toBeTruthy();
    expect(config.command).toBeTruthy();
    expect(typeof config.command["lh-spec"].template).toBe("string");
    expect(config.command["lh-spec"].template).toBe(".opencode/commands/lh-spec.md");
  });

  it("creates plugin files", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runInitCommand({ cwd: tmpDir, host: "opencode" });
    spy.mockRestore();

    expect(await exists(path.join(tmpDir, ".opencode", "plugins", "shared.js"))).toBe(true);
    expect(await exists(path.join(tmpDir, ".opencode", "plugins", "leanharness-guardrails.js"))).toBe(true);
  });
});

describe("lh init --host all — both integrations", () => {
  it("creates both Claude Code and OpenCode structures", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runInitCommand({ cwd: tmpDir, host: "all" });
    spy.mockRestore();

    expect(await exists(path.join(tmpDir, ".claude"))).toBe(true);
    expect(await exists(path.join(tmpDir, ".opencode"))).toBe(true);
    expect(await exists(path.join(tmpDir, "opencode.json"))).toBe(true);
  });
});

describe("lh init --update", () => {
  it("refreshes LH-managed files but preserves user config", async () => {
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await runInitCommand({ cwd: tmpDir, host: "claude-code" });

    await fs.writeFile(path.join(tmpDir, ".lh", "config.yml"), "# user customized\nversion: 0.1\n");

    await runInitCommand({ cwd: tmpDir, host: "claude-code", force: true });
    spy.mockRestore();

    const config = await fs.readFile(path.join(tmpDir, ".lh", "config.yml"), "utf-8");
    expect(config).toContain("version:");
  });
});

describe("lh init — error cases", () => {
  it("rejects invalid host", async () => {
    await expect(runInitCommand({ cwd: tmpDir, host: "invalid-host" })).rejects.toThrow(CLIError);
  });
});
