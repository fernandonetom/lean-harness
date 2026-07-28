import { describe, it, expect } from "vitest";

/**
 * Regression guard for the package.json "./opencode" export
 * (`"./opencode": "./dist/commands/opencode-plugin-bundles/leanharness-guardrails.js"`),
 * which is currently unused by lh itself but documented as an experimental way for consumers
 * to reference the guardrail plugin via OpenCode's npm-package "plugin" array. Import the
 * source file it points at directly so this doesn't silently rot.
 */
describe("opencode-plugin-bundles/leanharness-guardrails.js", () => {
  it("exports a callable async plugin factory (named and default)", async () => {
    const mod = await import("../../src/commands/opencode-plugin-bundles/leanharness-guardrails.js");

    expect(typeof mod.LeanHarnessGuardrails).toBe("function");
    expect(typeof mod.default).toBe("function");
    expect(mod.default).toBe(mod.LeanHarnessGuardrails);
  });

  it("returns the expected OpenCode plugin hooks when invoked with a context", async () => {
    const { LeanHarnessGuardrails } = await import(
      "../../src/commands/opencode-plugin-bundles/leanharness-guardrails.js"
    );

    const hooks = await LeanHarnessGuardrails({ directory: process.cwd(), project: { cwd: process.cwd() } });

    expect(typeof hooks["tool.execute.before"]).toBe("function");
    expect(typeof hooks["tool.execute.after"]).toBe("function");
    expect(typeof hooks.event).toBe("function");
  });
});
