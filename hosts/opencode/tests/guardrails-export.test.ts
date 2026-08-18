import { describe, it, expect } from "vitest";

/**
 * Regression guard for the @feneto/lh-opencode package export (index.ts), the real OpenCode
 * plugin per https://opencode.ai/docs/plugins/, registered via a target repo's opencode.json
 * "plugin" array. Import the TS source directly so this doesn't silently rot.
 */
describe("leanharness-guardrails.ts", () => {
  it("exports a callable async plugin factory (named and default)", async () => {
    const mod = await import("../src/leanharness-guardrails.js");

    expect(typeof mod.LeanHarnessGuardrails).toBe("function");
    expect(typeof mod.default).toBe("function");
    expect(mod.default).toBe(mod.LeanHarnessGuardrails);
  });

  it("returns the expected OpenCode plugin hooks when invoked with a context", async () => {
    const { LeanHarnessGuardrails } = await import("../src/leanharness-guardrails.js");

    const hooks = await LeanHarnessGuardrails(
      { directory: process.cwd(), project: { cwd: process.cwd() } } as unknown as Parameters<typeof LeanHarnessGuardrails>[0],
    );

    expect(typeof hooks["tool.execute.before"]).toBe("function");
    expect(typeof hooks["tool.execute.after"]).toBe("function");
    expect(typeof hooks["permission.ask"]).toBe("function");
    expect(typeof hooks.event).toBe("function");
  });

  it("exports the package index re-exporting the same plugin and shared helpers", async () => {
    const indexMod = await import("../src/index.js");
    const directMod = await import("../src/leanharness-guardrails.js");

    expect(indexMod.LeanHarnessGuardrails).toBe(directMod.LeanHarnessGuardrails);
    expect(indexMod.default).toBe(directMod.LeanHarnessGuardrails);
    expect(typeof indexMod.classifyCommand).toBe("function");
    expect(typeof indexMod.isPathInsideBoundary).toBe("function");
  });
});
