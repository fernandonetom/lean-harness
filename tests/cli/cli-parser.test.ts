import { describe, it, expect } from "vitest";
import { parseArgs } from "../../src/cli.js";

describe("parseArgs", () => {
  it("parses command and positional args", () => {
    const result = parseArgs(["spec", "Add", "feature"]);
    expect(result.command).toBe("spec");
    expect(result.positional).toEqual(["Add", "feature"]);
  });

  it("parses --help flag", () => {
    const result = parseArgs(["--help"]);
    expect(result.flags.help).toBe(true);
  });

  it("parses --version flag", () => {
    const result = parseArgs(["--version"]);
    expect(result.flags.version).toBe(true);
  });

  it("parses command with --json and --all flags", () => {
    const result = parseArgs(["list", "--json", "--all"]);
    expect(result.command).toBe("list");
    expect(result.flags.json).toBe(true);
    expect(result.flags.all).toBe(true);
  });

  it("parses command with --depth option", () => {
    const result = parseArgs(["discover", "F001", "--depth", "D3"]);
    expect(result.command).toBe("discover");
    expect(result.positional).toEqual(["F001"]);
    expect(result.options.depth).toBe("D3");
  });

  it("parses --hint as repeated flag", () => {
    const result = parseArgs(["--hint", "src/auth"]);
    expect(result.repeated.hint).toEqual(["src/auth"]);
  });

  it("parses multiple --hint flags", () => {
    const result = parseArgs(["--hint", "a", "--hint", "b"]);
    expect(result.repeated.hint).toEqual(["a", "b"]);
  });

  it("parses = syntax for string flags", () => {
    const result = parseArgs(["--title=My Feature"]);
    expect(result.options.title).toBe("My Feature");
  });

  it("throws on unknown flag", () => {
    expect(() => parseArgs(["--unknown"])).toThrow("Unknown flag");
  });

  it("throws on missing value for string flag", () => {
    expect(() => parseArgs(["--title"])).toThrow("requires a value");
  });

  it("parses --yes flag", () => {
    const result = parseArgs(["init", "--yes"]);
    expect(result.flags.yes).toBe(true);
  });

  it("parses -y shorthand", () => {
    const result = parseArgs(["init", "-y"]);
    expect(result.flags.yes).toBe(true);
  });

  it("defaults yes to false", () => {
    const result = parseArgs(["init"]);
    expect(result.flags.yes).toBe(false);
  });

  it("parses --fix flag", () => {
    const result = parseArgs(["doctor", "--fix"]);
    expect(result.flags.fix).toBe(true);
  });

  it("defaults fix to false", () => {
    const result = parseArgs(["doctor"]);
    expect(result.flags.fix).toBe(false);
  });
});
