import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildProgram } from "../../src/cli/program.js";
import { normalizeInitHosts } from "../../src/cli/init-hosts.js";

describe("normalizeInitHosts", () => {
  it("maps all to both hosts", () => {
    expect(normalizeInitHosts(["all"])).toEqual({ claudeCode: true, openCode: true });
  });

  it("maps multiple flags to selection", () => {
    expect(normalizeInitHosts(["claude-code", "opencode"])).toEqual({
      claudeCode: true,
      openCode: true,
    });
  });

  it("maps single host", () => {
    expect(normalizeInitHosts(["claude-code"])).toEqual({
      claudeCode: true,
      openCode: false,
    });
  });

  it("throws on invalid host", () => {
    expect(() => normalizeInitHosts(["invalid-host"])).toThrow("Invalid --host");
  });
});

describe("buildProgram help", () => {
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

  it("init --help does not list discover-only flags", async () => {
    const program = buildProgram();
    try {
      await program.parseAsync(["init", "--help"], { from: "user" });
    } catch {
      // commander.helpDisplayed
    }
    expect(stdout).toContain("init");
    expect(stdout).not.toContain("--depth");
    expect(stdout).not.toMatch(/discover\s+<feature>/);
  });

  it("root help lists init subcommand", async () => {
    const program = buildProgram();
    try {
      await program.parseAsync(["--help"], { from: "user" });
    } catch {
      // help displayed
    }
    expect(stdout).toMatch(/init/i);
    expect(stdout).toContain("Run 'lh <command> --help'");
  });

  it("root and subcommand help include branded header", async () => {
    const program = buildProgram();
    for (const args of [["--help"], ["init", "--help"]] as const) {
      stdout = "";
      try {
        await program.parseAsync([...args], { from: "user" });
      } catch {
        // commander.helpDisplayed
      }
      expect(stdout).toContain("LeanHarness");
      expect(stdout).toContain("Specify → Discover → Build → Check");
    }
  });
});
