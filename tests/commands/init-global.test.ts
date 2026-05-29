import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";

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
import fsp from "node:fs/promises";
import os from "node:os";
import { runInitCommand } from "../../src/commands/init.js";
import { createTempWorkspace, type TestWorkspace } from "../helpers/workspace.js";

let ws: TestWorkspace;
let savedHome: string;
let fakeHome: string;
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
  ws = await createTempWorkspace();
  fakeHome = await fsp.mkdtemp(path.join(os.tmpdir(), "lh-home-"));
  savedHome = process.env["HOME"] ?? "";
  process.env["HOME"] = fakeHome;
  (os as any)._realHomedir = os.homedir;
  (os as any).homedir = () => fakeHome;
});

afterEach(async () => {
  process.env["HOME"] = savedHome;
  (os as any).homedir = (os as any)._realHomedir;
  delete (os as any)._realHomedir;
  await ws.cleanup();
  await fsp.rm(fakeHome, { recursive: true, force: true });
});

describe("lh init --global", () => {
  it("creates ~/.lh/config.yml", async () => {
    const restore = silenceOutput();
    try {
      await runInitCommand({ cwd: ws.root, global: true, host: "claude-code", yes: true });
    } finally {
      restore();
    }

    const configPath = path.join(fakeHome, ".lh", "config.yml");
    const exists = await fileExistsSafe(configPath);
    expect(exists).toBe(true);
    const content = await fsp.readFile(configPath, "utf8");
    expect(content).toContain("version:");
    expect(content).toContain("global");
  });

  it("creates ~/.claude/skills/leanharness.md for claude-code host", async () => {
    const restore = silenceOutput();
    try {
      await runInitCommand({ cwd: ws.root, global: true, host: "claude-code", yes: true });
    } finally {
      restore();
    }

    const skillPath = path.join(fakeHome, ".claude", "skills", "leanharness.md");
    expect(await fileExistsSafe(skillPath)).toBe(true);
  });

  it("creates ~/.opencode/agents/leanharness.md for opencode host", async () => {
    const restore = silenceOutput();
    try {
      await runInitCommand({ cwd: ws.root, global: true, host: "opencode", yes: true });
    } finally {
      restore();
    }

    const agentPath = path.join(fakeHome, ".opencode", "agents", "leanharness.md");
    expect(await fileExistsSafe(agentPath)).toBe(true);
  });

  it("creates both for --host all", async () => {
    const restore = silenceOutput();
    try {
      await runInitCommand({ cwd: ws.root, global: true, host: "all", yes: true });
    } finally {
      restore();
    }

    expect(await fileExistsSafe(path.join(fakeHome, ".claude", "skills", "leanharness.md"))).toBe(true);
    expect(await fileExistsSafe(path.join(fakeHome, ".opencode", "agents", "leanharness.md"))).toBe(true);
  });

  it("does not create global files without --global", async () => {
    const restore = silenceOutput();
    try {
      await runInitCommand({ cwd: ws.root, host: "claude-code", yes: true });
    } finally {
      restore();
    }

    expect(await fileExistsSafe(path.join(fakeHome, ".lh", "config.yml"))).toBe(false);
    expect(await fileExistsSafe(path.join(fakeHome, ".claude", "skills", "leanharness.md"))).toBe(false);
  });

  it("reports global files in JSON output", async () => {
    let output = "";
    const origWrite = process.stdout.write.bind(process.stdout);
    const origErr = process.stderr.write.bind(process.stderr);
    process.stdout.write = ((chunk: any) => { output += String(chunk); return true; }) as any;
    process.stderr.write = suppress.write;

    try {
      await runInitCommand({ cwd: ws.root, global: true, host: "claude-code", json: true, yes: true });
    } finally {
      process.stdout.write = origWrite;
      process.stderr.write = origErr;
    }

    const result = JSON.parse(output);
    expect(result.files["~/.lh/config.yml"]).toBe("created");
    expect(result.files["~/.claude/skills/leanharness.md"]).toBe("created");
  });
});

async function fileExistsSafe(p: string): Promise<boolean> {
  try {
    const stat = await fsp.stat(p);
    return stat.isFile();
  } catch {
    return false;
  }
}
