import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

/**
 * Regression tests for boundary-enforcement field-alias handling, which is implemented
 * separately in two places that must stay behaviorally identical:
 *
 * - hosts/opencode/src/shared.ts — the real OpenCode plugin (@feneto/lh-opencode)
 * - hosts/claude-code/hooks/shared.js — the Claude Code plugin's hook shared module
 *
 * Both must accept boundary.json field aliases (`touch`, `touchFiles`, `files`, and
 * `readOnly`/`readOnlyFiles`) so existing feature folders with older schemas still work.
 */

interface CheckResult {
  inside: boolean;
  blocked: boolean;
  reason: string;
}

const require = createRequire(import.meta.url);

const openCodeSharedPath = path.resolve(import.meta.dirname, "../../../../hosts/opencode/src/shared.ts");
const claudeCodeHookPath = path.resolve(import.meta.dirname, "../../../../hosts/claude-code/hooks/shared.js");

let openCodeShared: { isPathInsideBoundary: (...args: unknown[]) => CheckResult } | null = null;
let claudeCodeShared: { isPathInsideBoundary: (...args: unknown[]) => CheckResult } | null = null;

beforeAll(async () => {
  openCodeShared = await import(pathToFileURL(openCodeSharedPath).href);
  claudeCodeShared = require(claudeCodeHookPath);
});

describe("hosts/opencode/src/shared.ts - field aliases", () => {
  it("accepts touchFiles (current canonical form)", () => {
    const boundary = { touchFiles: [{ path: "src/auth/login.ts" }] };
    const r = openCodeShared!.isPathInsideBoundary("src/auth/login.ts", boundary) as CheckResult;
    expect(r.inside).toBe(true);
  });

  it("accepts touch (string array) as a backward-compat alias", () => {
    const boundary = { touch: ["src/cobranca/charge.ts"] };
    const r = openCodeShared!.isPathInsideBoundary("src/cobranca/charge.ts", boundary) as CheckResult;
    expect(r.inside).toBe(true);
  });

  it("accepts files (object with modify/create/delete)", () => {
    const boundary = {
      files: {
        modify: ["src/cobranca/charge.ts"],
        create: ["src/cobranca/charge.test.ts"],
      },
    };
    const r1 = openCodeShared!.isPathInsideBoundary("src/cobranca/charge.ts", boundary) as CheckResult;
    const r2 = openCodeShared!.isPathInsideBoundary("src/cobranca/charge.test.ts", boundary) as CheckResult;
    expect(r1.inside).toBe(true);
    expect(r2.inside).toBe(true);
  });

  it("accepts files (string array)", () => {
    const boundary = { files: ["src/cobranca/charge.ts"] };
    const r = openCodeShared!.isPathInsideBoundary("src/cobranca/charge.ts", boundary) as CheckResult;
    expect(r.inside).toBe(true);
  });

  it("blocks paths outside the boundary", () => {
    const boundary = { touch: ["src/cobranca/charge.ts"] };
    const r = openCodeShared!.isPathInsideBoundary("src/other/file.ts", boundary) as CheckResult;
    expect(r.inside).toBe(false);
    expect(r.blocked).toBe(false);
  });

  it("respects blockedEditGlobs (prefix-style)", () => {
    const boundary = {
      touch: ["secrets/key.ts"],
      blockedEditGlobs: ["secrets/**"],
    };
    const r = openCodeShared!.isPathInsideBoundary("secrets/key.ts", boundary) as CheckResult;
    expect(r.blocked).toBe(true);
  });

  it("regression: cobranca files in 'touch' field are marked inside", () => {
    // Without the fix, the hook would report `inside: false` even for paths
    // that ARE in the boundary, blocking legitimate edits. With the fix, the
    // hook reads `touch` and reports `inside: true`.
    const boundary = { touch: ["src/cobranca/charge.ts"] };
    const r = openCodeShared!.isPathInsideBoundary("src/cobranca/charge.ts", boundary) as CheckResult;
    expect(r.inside).toBe(true);
    expect(r.reason).toMatch(/touchFiles/);
  });
});

describe("hosts/claude-code/hooks/shared.js - field aliases", () => {
  it("accepts touchFiles (current canonical form)", () => {
    const boundary = { touchFiles: [{ path: "src/auth/login.ts" }] };
    const r = claudeCodeShared!.isPathInsideBoundary("src/auth/login.ts", boundary) as CheckResult;
    expect(r.inside).toBe(true);
  });

  it("accepts touch (string array) as a backward-compat alias", () => {
    const boundary = { touch: ["src/cobranca/charge.ts"] };
    const r = claudeCodeShared!.isPathInsideBoundary("src/cobranca/charge.ts", boundary) as CheckResult;
    expect(r.inside).toBe(true);
  });

  it("accepts files (object with modify/create/delete)", () => {
    const boundary = {
      files: {
        modify: ["src/cobranca/charge.ts"],
        create: ["src/cobranca/charge.test.ts"],
      },
    };
    const r1 = claudeCodeShared!.isPathInsideBoundary("src/cobranca/charge.ts", boundary) as CheckResult;
    const r2 = claudeCodeShared!.isPathInsideBoundary("src/cobranca/charge.test.ts", boundary) as CheckResult;
    expect(r1.inside).toBe(true);
    expect(r2.inside).toBe(true);
  });

  it("blocks paths outside the boundary", () => {
    const boundary = { touch: ["src/cobranca/charge.ts"] };
    const r = claudeCodeShared!.isPathInsideBoundary("src/other/file.ts", boundary) as CheckResult;
    expect(r.inside).toBe(false);
    expect(r.blocked).toBe(false);
  });

  it("respects blockedEditGlobs (prefix-style)", () => {
    const boundary = {
      touch: ["secrets/key.ts"],
      blockedEditGlobs: ["secrets/**"],
    };
    const r = claudeCodeShared!.isPathInsideBoundary("secrets/key.ts", boundary) as CheckResult;
    expect(r.blocked).toBe(true);
  });
});
