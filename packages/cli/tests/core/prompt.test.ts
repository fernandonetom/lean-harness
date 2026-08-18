import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable, Writable } from "node:stream";

const { mockMultiselect, mockIntro, mockOutro, mockCancel, mockIsCancel } = vi.hoisted(() => ({
  mockMultiselect: vi.fn(),
  mockIntro: vi.fn(),
  mockOutro: vi.fn(),
  mockCancel: vi.fn(),
  mockIsCancel: vi.fn((value: unknown) => value === Symbol.for("cancel")),
}));

vi.mock("@clack/prompts", () => ({
  multiselect: mockMultiselect,
  intro: mockIntro,
  outro: mockOutro,
  cancel: mockCancel,
  isCancel: mockIsCancel,
}));

import { promptConfirm, promptMultiSelect, promptText } from "../../src/core/prompt.js";

function mockInput(answer: string): NodeJS.ReadableStream {
  const stream = new Readable({
    read() {
      this.push(answer + "\n");
      this.push(null);
    },
  });
  return stream as unknown as NodeJS.ReadableStream;
}

function nullOutput(): NodeJS.WritableStream {
  return new Writable({
    write(_chunk, _encoding, callback) { callback(); },
  }) as unknown as NodeJS.WritableStream;
}

const opts = (answer: string) => ({
  input: mockInput(answer),
  output: nullOutput(),
  noColor: true,
});

describe("promptConfirm", () => {
  it("returns true for 'y'", async () => {
    expect(await promptConfirm("Continue?", true, opts("y"))).toBe(true);
  });

  it("returns true for 'yes'", async () => {
    expect(await promptConfirm("Continue?", true, opts("yes"))).toBe(true);
  });

  it("returns false for 'n'", async () => {
    expect(await promptConfirm("Continue?", true, opts("n"))).toBe(false);
  });

  it("returns default true for empty input", async () => {
    expect(await promptConfirm("Continue?", true, opts(""))).toBe(true);
  });

  it("returns default false for empty input when default is false", async () => {
    expect(await promptConfirm("Continue?", false, opts(""))).toBe(false);
  });

  it("is case-insensitive", async () => {
    expect(await promptConfirm("Continue?", false, opts("Y"))).toBe(true);
    expect(await promptConfirm("Continue?", true, opts("YES"))).toBe(true);
  });
});

describe("promptMultiSelect", () => {
  const choices = [
    { label: "Claude Code", value: "claude-code" as const },
    { label: "OpenCode", value: "opencode" as const },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockMultiselect.mockResolvedValue(["claude-code", "opencode"]);
  });

  it("returns selected values from clack multiselect", async () => {
    const result = await promptMultiSelect("Hosts?", choices, { noColor: true });
    expect(result).toEqual(["claude-code", "opencode"]);
    expect(mockMultiselect).toHaveBeenCalled();
    expect(mockIntro).toHaveBeenCalledWith("Hosts?");
  });
});

describe("promptText", () => {
  it("returns user input", async () => {
    expect(await promptText("Name?", undefined, opts("Fernando"))).toBe("Fernando");
  });

  it("returns default for empty input", async () => {
    expect(await promptText("Name?", "default-val", opts(""))).toBe("default-val");
  });

  it("returns empty string when no default and empty input", async () => {
    expect(await promptText("Name?", undefined, opts(""))).toBe("");
  });

  it("trims whitespace", async () => {
    expect(await promptText("Name?", undefined, opts("  hello  "))).toBe("hello");
  });
});
