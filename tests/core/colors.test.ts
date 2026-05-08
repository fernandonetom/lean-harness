import { describe, it, expect } from "vitest";
import { createColors, stripAnsi } from "../../src/core/colors.js";

describe("createColors", () => {
  it("returns identity functions when noColor is true", () => {
    const c = createColors({ noColor: true });
    expect(c.enabled).toBe(false);
    expect(c.green("hello")).toBe("hello");
    expect(c.red("error")).toBe("error");
    expect(c.yellow("warn")).toBe("warn");
    expect(c.cyan("info")).toBe("info");
    expect(c.bold("title")).toBe("title");
    expect(c.dim("meta")).toBe("meta");
    expect(c.magenta("mag")).toBe("mag");
    expect(c.reset("text")).toBe("text");
  });

  it("returns ANSI-wrapped strings when forceColor is true", () => {
    const c = createColors({ forceColor: true });
    expect(c.enabled).toBe(true);

    const green = c.green("ok");
    expect(green).toContain("\x1b[32m");
    expect(green).toContain("ok");
    expect(green).toContain("\x1b[39m");
  });

  it("noColor takes precedence over forceColor", () => {
    const c = createColors({ forceColor: true, noColor: true });
    expect(c.enabled).toBe(false);
    expect(c.green("ok")).toBe("ok");
  });

  it("bold wraps with code 1", () => {
    const c = createColors({ forceColor: true });
    expect(c.bold("title")).toContain("\x1b[1m");
    expect(c.bold("title")).toContain("\x1b[22m");
  });

  it("dim wraps with code 2", () => {
    const c = createColors({ forceColor: true });
    expect(c.dim("meta")).toContain("\x1b[2m");
    expect(c.dim("meta")).toContain("\x1b[22m");
  });

  it("red wraps with code 31", () => {
    const c = createColors({ forceColor: true });
    expect(c.red("err")).toContain("\x1b[31m");
  });

  it("yellow wraps with code 33", () => {
    const c = createColors({ forceColor: true });
    expect(c.yellow("w")).toContain("\x1b[33m");
  });

  it("cyan wraps with code 36", () => {
    const c = createColors({ forceColor: true });
    expect(c.cyan("i")).toContain("\x1b[36m");
  });

  it("magenta wraps with code 35", () => {
    const c = createColors({ forceColor: true });
    expect(c.magenta("m")).toContain("\x1b[35m");
  });
});

describe("stripAnsi", () => {
  it("removes ANSI escape codes", () => {
    const c = createColors({ forceColor: true });
    const colored = c.green("hello") + " " + c.bold("world");
    expect(stripAnsi(colored)).toBe("hello world");
  });

  it("returns plain text unchanged", () => {
    expect(stripAnsi("hello world")).toBe("hello world");
  });

  it("handles empty string", () => {
    expect(stripAnsi("")).toBe("");
  });
});
