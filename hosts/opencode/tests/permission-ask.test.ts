import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { LeanHarnessGuardrails } from "../src/leanharness-guardrails.js";

/**
 * Exercises the additive "permission.ask" deny layer. This hook only fires for calls OpenCode's
 * static permission config marks "ask" — the generated opencode.json sets `permission.edit:
 * "allow"` for the primary lh-builder agent, so this layer is NOT a substitute for the
 * throw-based blocking in tool.execute.before (see tool-execute-before.test.ts and
 * docs/hosts/opencode.md). Whether OpenCode actually invokes this hook for "allow"-tier calls is
 * unverified — see scripts/opencode-smoke.mjs for the empirical check against a real binary.
 */
describe("permission.ask deny behavior", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "lh-opencode-permission-test-"));
    mkdirSync(path.join(root, ".lh", "features", "F001-test"), { recursive: true });
    writeFileSync(path.join(root, ".lh", "state.json"), JSON.stringify({ active_feature: "F001-test" }), "utf8");
    writeFileSync(
      path.join(root, ".lh", "features", "F001-test", "boundary.json"),
      JSON.stringify({
        touchFiles: ["src/allowed.ts"],
        allowedEditGlobs: ["src/feature/**"],
        blockedEditGlobs: ["src/legacy/**"],
      }),
      "utf8",
    );
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  async function getHooks() {
    return LeanHarnessGuardrails({ directory: root, project: { cwd: root } } as unknown as Parameters<typeof LeanHarnessGuardrails>[0]);
  }

  it("sets status to deny for a dangerous bash pattern", async () => {
    const hooks = await getHooks();
    const output: { status: "ask" | "deny" | "allow" } = { status: "ask" };
    await hooks["permission.ask"]?.({ pattern: "rm -rf /" } as never, output);
    expect(output.status).toBe("deny");
  });

  it("sets status to deny for an edit outside the boundary", async () => {
    const hooks = await getHooks();
    const output: { status: "ask" | "deny" | "allow" } = { status: "ask" };
    await hooks["permission.ask"]?.({ path: "src/outside/file.ts" } as never, output);
    expect(output.status).toBe("deny");
  });

  it("leaves status untouched for a safe bash pattern", async () => {
    const hooks = await getHooks();
    const output: { status: "ask" | "deny" | "allow" } = { status: "ask" };
    await hooks["permission.ask"]?.({ pattern: "git status" } as never, output);
    expect(output.status).toBe("ask");
  });

  it("leaves status untouched for an edit inside allowedEditGlobs", async () => {
    const hooks = await getHooks();
    const output: { status: "ask" | "deny" | "allow" } = { status: "ask" };
    await hooks["permission.ask"]?.({ path: "src/feature/new.ts" } as never, output);
    expect(output.status).toBe("ask");
  });

  it("never throws even with a malformed permission object", async () => {
    const hooks = await getHooks();
    const output: { status: "ask" | "deny" | "allow" } = { status: "ask" };
    await expect(hooks["permission.ask"]?.(null as never, output)).resolves.toBeUndefined();
    expect(output.status).toBe("ask");
  });
});
