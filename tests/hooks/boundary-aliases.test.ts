import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";

/**
 * Regression tests for the deployed boundary enforcement code in
 * `.opencode/plugins/shared.js` and `hooks/shared.js` (the Claude Code
 * plugin's canonical hook shared module, at the repo root).
 *
 * These are the JS files that run inside agent hosts. They must accept
 * `boundary.json` field aliases (`touch`, `touchFiles`, `files`, and
 * `readOnly`/`readOnlyFiles`) so existing feature folders with older
 * schemas still work.
 *
 * The OpenCode plugin imports `../core/version.js`, which only exists in
 * the runtime bundle that `lh init --host opencode` deploys. To load the
 * plugin in a unit test, we materialize a temporary stub under
 * `.opencode/core/version.js` and remove it on teardown.
 */

interface CheckResult {
  inside: boolean;
  blocked: boolean;
  reason: string;
}

let pluginExports: { isPathInsideBoundary: (...args: unknown[]) => CheckResult } | null = null;
let hookModule: { isPathInsideBoundary: (...args: unknown[]) => CheckResult } | null = null;

const coreDir = path.resolve(process.cwd(), ".opencode/core");
const versionFile = path.join(coreDir, "version.js");
const pluginPath = path.resolve(process.cwd(), ".opencode/plugins/shared.js");
const hookPath = path.resolve(process.cwd(), "hooks/shared.js");

beforeAll(async () => {
  // Materialize a temporary version.js stub so the plugin can resolve its
  // runtime-only import. We do NOT want this file to be present in source
  // control — that's why it's created and removed in this test only.
  if (!existsSync(coreDir)) {
    mkdirSync(coreDir, { recursive: true });
  }
  writeFileSync(
    versionFile,
    `export function getVersion() { return "0.0.0-test"; }\n`,
    "utf8",
  );

  // Dynamically import the ESM plugin
  const pluginMod: any = await import(pathToFileURL(pluginPath).href);
  pluginExports = pluginMod;

  // Require the CommonJS hook
  hookModule = require(hookPath);
});

afterAll(() => {
  if (existsSync(versionFile)) {
    rmSync(versionFile, { force: true });
  }
  if (existsSync(coreDir)) {
    try {
      rmSync(coreDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
});

// Use the same import.meta.url polyfill pattern as vitest
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

describe("deployed .opencode/plugins/shared.js - field aliases", () => {
  it("accepts touchFiles (current canonical form)", () => {
    const boundary = { touchFiles: [{ path: "src/auth/login.ts" }] };
    const r = pluginExports!.isPathInsideBoundary("src/auth/login.ts", boundary) as CheckResult;
    expect(r.inside).toBe(true);
  });

  it("accepts touch (string array) as a backward-compat alias", () => {
    const boundary = { touch: ["src/cobranca/charge.ts"] };
    const r = pluginExports!.isPathInsideBoundary("src/cobranca/charge.ts", boundary) as CheckResult;
    expect(r.inside).toBe(true);
  });

  it("accepts files (object with modify/create/delete)", () => {
    const boundary = {
      files: {
        modify: ["src/cobranca/charge.ts"],
        create: ["src/cobranca/charge.test.ts"],
      },
    };
    const r1 = pluginExports!.isPathInsideBoundary("src/cobranca/charge.ts", boundary) as CheckResult;
    const r2 = pluginExports!.isPathInsideBoundary("src/cobranca/charge.test.ts", boundary) as CheckResult;
    expect(r1.inside).toBe(true);
    expect(r2.inside).toBe(true);
  });

  it("accepts files (string array)", () => {
    const boundary = { files: ["src/cobranca/charge.ts"] };
    const r = pluginExports!.isPathInsideBoundary("src/cobranca/charge.ts", boundary) as CheckResult;
    expect(r.inside).toBe(true);
  });

  it("blocks paths outside the boundary", () => {
    const boundary = { touch: ["src/cobranca/charge.ts"] };
    const r = pluginExports!.isPathInsideBoundary("src/other/file.ts", boundary) as CheckResult;
    expect(r.inside).toBe(false);
    expect(r.blocked).toBe(false);
  });

  it("respects blockedEditGlobs (prefix-style)", () => {
    const boundary = {
      touch: ["secrets/key.ts"],
      blockedEditGlobs: ["secrets/**"],
    };
    const r = pluginExports!.isPathInsideBoundary("secrets/key.ts", boundary) as CheckResult;
    expect(r.blocked).toBe(true);
  });

  it("regression: cobranca files in 'touch' field are marked inside", () => {
    // Without the fix, the hook would report `inside: false` even for paths
    // that ARE in the boundary, blocking legitimate edits. With the fix, the
    // hook reads `touch` and reports `inside: true`.
    const boundary = { touch: ["src/cobranca/charge.ts"] };
    const r = pluginExports!.isPathInsideBoundary("src/cobranca/charge.ts", boundary) as CheckResult;
    expect(r.inside).toBe(true);
    expect(r.reason).toMatch(/touchFiles/);
  });
});

describe("deployed hooks/shared.js - field aliases", () => {
  it("accepts touchFiles (current canonical form)", () => {
    const boundary = { touchFiles: [{ path: "src/auth/login.ts" }] };
    const r = hookModule!.isPathInsideBoundary("src/auth/login.ts", boundary) as CheckResult;
    expect(r.inside).toBe(true);
  });

  it("accepts touch (string array) as a backward-compat alias", () => {
    const boundary = { touch: ["src/cobranca/charge.ts"] };
    const r = hookModule!.isPathInsideBoundary("src/cobranca/charge.ts", boundary) as CheckResult;
    expect(r.inside).toBe(true);
  });

  it("accepts files (object with modify/create/delete)", () => {
    const boundary = {
      files: {
        modify: ["src/cobranca/charge.ts"],
        create: ["src/cobranca/charge.test.ts"],
      },
    };
    const r1 = hookModule!.isPathInsideBoundary("src/cobranca/charge.ts", boundary) as CheckResult;
    const r2 = hookModule!.isPathInsideBoundary("src/cobranca/charge.test.ts", boundary) as CheckResult;
    expect(r1.inside).toBe(true);
    expect(r2.inside).toBe(true);
  });

  it("blocks paths outside the boundary", () => {
    const boundary = { touch: ["src/cobranca/charge.ts"] };
    const r = hookModule!.isPathInsideBoundary("src/other/file.ts", boundary) as CheckResult;
    expect(r.inside).toBe(false);
    expect(r.blocked).toBe(false);
  });

  it("respects blockedEditGlobs (prefix-style)", () => {
    const boundary = {
      touch: ["secrets/key.ts"],
      blockedEditGlobs: ["secrets/**"],
    };
    const r = hookModule!.isPathInsideBoundary("secrets/key.ts", boundary) as CheckResult;
    expect(r.blocked).toBe(true);
  });
});
