import { describe, it, expect } from "vitest";
import { generateCompletion, runCompletionCommand } from "../../src/commands/completion.js";
import { CLIError } from "../../src/core/errors.js";

describe("generateCompletion", () => {
  it("generates bash completion with commands and flags", () => {
    const script = generateCompletion("bash");
    expect(script).toContain("_lh_completions");
    expect(script).toContain("complete -F _lh_completions lh");
    expect(script).toContain("init");
    expect(script).toContain("doctor");
    expect(script).toContain("--json");
    expect(script).toContain("--host");
    expect(script).toContain("claude-code opencode all");
  });

  it("generates zsh completion with command descriptions", () => {
    const script = generateCompletion("zsh");
    expect(script).toContain("#compdef lh");
    expect(script).toContain("_lh");
    expect(script).toContain("init");
    expect(script).toContain("Initialize LeanHarness");
    expect(script).toContain("completion");
  });

  it("generates fish completion with per-command entries", () => {
    const script = generateCompletion("fish");
    expect(script).toContain("complete -c lh");
    expect(script).toContain("__fish_use_subcommand");
    expect(script).toContain("init");
    expect(script).toContain("doctor");
    expect(script).toContain("claude-code opencode all");
    expect(script).toContain("__fish_seen_subcommand_from completion");
  });

  it("includes completion command itself in all shells", () => {
    for (const shell of ["bash", "zsh", "fish"] as const) {
      const script = generateCompletion(shell);
      expect(script).toContain("completion");
    }
  });

  it("includes --fix flag in all shells", () => {
    for (const shell of ["bash", "zsh", "fish"] as const) {
      const script = generateCompletion(shell);
      expect(script).toContain("fix");
    }
  });
});

describe("runCompletionCommand", () => {
  it("throws CLIError for unknown shell", async () => {
    await expect(runCompletionCommand({ shell: "powershell" }))
      .rejects.toThrow(CLIError);
  });

  it("throws CLIError for empty shell", async () => {
    await expect(runCompletionCommand({ shell: "" }))
      .rejects.toThrow(CLIError);
  });

  it("writes to stdout for valid shell", async () => {
    let output = "";
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: any) => { output += String(chunk); return true; }) as any;
    try {
      await runCompletionCommand({ shell: "bash" });
    } finally {
      process.stdout.write = orig;
    }
    expect(output).toContain("_lh_completions");
  });
});
