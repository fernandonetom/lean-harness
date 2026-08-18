import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildProgram } from "../../src/cli/program.js";

describe("worktree command in CLI program", () => {
  let stdout = "";

  beforeEach(() => {
    stdout = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("program includes a worktree command", async () => {
    const program = buildProgram();
    try {
      await program.parseAsync(["--help"], { from: "user" });
    } catch {
      // commander.helpDisplayed
    }
    expect(stdout).toContain("worktree");
  });

  it("lh worktree --help lists link, list, unlink subcommands", async () => {
    const program = buildProgram();
    try {
      await program.parseAsync(["worktree", "--help"], { from: "user" });
    } catch {
      // commander.helpDisplayed
    }
    expect(stdout).toContain("link");
    expect(stdout).toContain("list");
    expect(stdout).toContain("unlink");
  });

  it("lh worktree link --help lists all options", async () => {
    const program = buildProgram();
    try {
      await program.parseAsync(["worktree", "link", "--help"], { from: "user" });
    } catch {
      // commander.helpDisplayed
    }

    expect(stdout).toContain("--path");
    expect(stdout).toContain("--branch");
    expect(stdout).toContain("-f, --force");
    expect(stdout).toContain("--json");
  });

  it("lh worktree link requires <feature> argument", async () => {
    const program = buildProgram();
    try {
      await program.parseAsync(["worktree", "link", "--help"], { from: "user" });
    } catch {
      // commander.helpDisplayed
    }
    expect(stdout).toContain("<feature>");
  });

  it("lh worktree list --help shows --json option", async () => {
    const program = buildProgram();
    try {
      await program.parseAsync(["worktree", "list", "--help"], { from: "user" });
    } catch {
      // commander.helpDisplayed
    }
    expect(stdout).toContain("--json");
  });

  it("lh worktree unlink --help shows --json option", async () => {
    const program = buildProgram();
    try {
      await program.parseAsync(["worktree", "unlink", "--help"], { from: "user" });
    } catch {
      // commander.helpDisplayed
    }
    expect(stdout).toContain("--json");
  });

  it("lh worktree unlink requires <feature> argument", async () => {
    const program = buildProgram();
    try {
      await program.parseAsync(["worktree", "unlink", "--help"], { from: "user" });
    } catch {
      // commander.helpDisplayed
    }
    expect(stdout).toContain("<feature>");
  });

  it("path option description is informative", async () => {
    const program = buildProgram();
    try {
      await program.parseAsync(["worktree", "link", "--help"], { from: "user" });
    } catch {
      // commander.helpDisplayed
    }
    expect(stdout).toMatch(/--path.*worktree/i);
  });
});
