import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { LeanHarnessGuardrails } from "../src/leanharness-guardrails.js";

/**
 * Exercises the real blocking behavior of "tool.execute.before" — this is the enforcement
 * backbone (see docs/hosts/opencode.md); blocking here is done by throwing, which is
 * undocumented-but-relied-upon OpenCode plugin behavior (the real @opencode-ai/plugin types
 * show no deny field on this hook's output — only permission.ask has one, see
 * permission-ask.test.ts). Kept as the primary enforcement layer until empirically verified
 * otherwise (see scripts/opencode-smoke.mjs).
 */
describe("tool.execute.before blocking behavior", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "lh-opencode-test-"));
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

  it("throws for secret-path access regardless of tool type", async () => {
    const hooks = await getHooks();
    await expect(
      hooks["tool.execute.before"]?.({ tool: "read", sessionID: "s", callID: "c" }, { args: { path: ".env" } }),
    ).rejects.toThrow(/secret path/i);
  });

  it("throws for a builtin-deny dangerous bash command", async () => {
    const hooks = await getHooks();
    await expect(
      hooks["tool.execute.before"]?.({ tool: "bash", sessionID: "s", callID: "c" }, { args: { command: "rm -rf /" } }),
    ).rejects.toThrow(/destructive/i);
  });

  it("throws for an edit outside the active change boundary", async () => {
    const hooks = await getHooks();
    await expect(
      hooks["tool.execute.before"]?.({ tool: "edit", sessionID: "s", callID: "c" }, { args: { path: "src/outside/file.ts" } }),
    ).rejects.toThrow(/outside the active change boundary/i);
  });

  it("throws for an edit matching blockedEditGlobs even if a touchFiles entry would otherwise match", async () => {
    const hooks = await getHooks();
    await expect(
      hooks["tool.execute.before"]?.({ tool: "edit", sessionID: "s", callID: "c" }, { args: { path: "src/legacy/old.ts" } }),
    ).rejects.toThrow(/blocked list/i);
  });

  it("resolves without throwing for a safe read-only bash command", async () => {
    const hooks = await getHooks();
    await expect(
      hooks["tool.execute.before"]?.({ tool: "bash", sessionID: "s", callID: "c" }, { args: { command: "git status" } }),
    ).resolves.toBeUndefined();
  });

  it("resolves without throwing for an edit inside allowedEditGlobs", async () => {
    const hooks = await getHooks();
    await expect(
      hooks["tool.execute.before"]?.({ tool: "edit", sessionID: "s", callID: "c" }, { args: { path: "src/feature/new.ts" } }),
    ).resolves.toBeUndefined();
  });

  it("resolves without throwing for a bootstrap path even without a matching boundary entry", async () => {
    const hooks = await getHooks();
    await expect(
      hooks["tool.execute.before"]?.({ tool: "edit", sessionID: "s", callID: "c" }, { args: { path: ".lh/config.yml" } }),
    ).resolves.toBeUndefined();
  });
});
