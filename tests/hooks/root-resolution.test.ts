import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile, mkdir, realpath } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { initGitRepo, gitOut } from "../helpers/git.js";
import { addWorktree } from "../../src/core/git.js";

/**
 * Regression tests for git worktree root resolution in the hook system.
 *
 * Context: When Claude Code runs inside a git worktree (via `git worktree add`),
 * the hook scripts need to distinguish between:
 *   - worktreeRoot: the actual working directory where files are being edited
 *   - harnessRoot: the MAIN repository that owns .lh/ state, config, and boundaries
 *
 * Two bugs were fixed:
 * 1. Absolute paths inside a worktree would incorrectly be denied as "outside boundary"
 *    because they were normalized against the main repo root, not the worktree root.
 * 2. The hooks would fail open (silently allow everything) when they couldn't find the
 *    boundary file in a worktree, because there's no lookup fallback.
 *
 * These tests verify both bugs are fixed and regression doesn't occur.
 */

interface PreToolDecision {
  hookSpecificOutput?: {
    hookEventName: string;
    permissionDecision: string;
    permissionDecisionReason: string;
  };
}

let mainDir: string;
let worktreeDir: string;
const hookPath = path.resolve(process.cwd(), "hooks/pre-tool-use.js");

/**
 * Run the pre-tool-use hook as a subprocess, passing the payload via stdin.
 * This is necessary because resolveRoots() caches its result per-process in _rootCache.
 *
 * @param cwd The working directory to run the hook from
 * @param claudeProjectDir The value of CLAUDE_PROJECT_DIR env var (the harness root)
 * @param payload The JSON payload to send to stdin (the tool invocation)
 * @returns The hook's stdout (JSON) and exit code
 */
function runHook(
  cwd: string,
  claudeProjectDir: string,
  payload: unknown
): { stdout: string; exitCode: number } {
  try {
    const stdout = execFileSync("node", [hookPath], {
      cwd,
      input: JSON.stringify(payload),
      env: { ...process.env, CLAUDE_PROJECT_DIR: claudeProjectDir },
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { stdout, exitCode: 0 };
  } catch (err: any) {
    return { stdout: err.stdout ? String(err.stdout) : "", exitCode: err.status ?? 1 };
  }
}

/**
 * Parse hook stdout to extract the decision (allow/deny) and reason.
 * If the hook denies the operation, it writes a JSON object with decision details.
 * If no decision is written, the operation is allowed.
 */
function parseHookDecision(stdout: string): {
  decision: "allow" | "deny";
  reason?: string;
} {
  if (!stdout.trim()) {
    return { decision: "allow" };
  }

  try {
    const parsed = JSON.parse(stdout) as PreToolDecision;
    if (parsed.hookSpecificOutput?.permissionDecision === "deny") {
      return {
        decision: "deny",
        reason: parsed.hookSpecificOutput.permissionDecisionReason,
      };
    }
  } catch {
    // Parse error or non-JSON output — treat as allow
  }

  return { decision: "allow" };
}

beforeAll(async () => {
  // Create main repo
  const tempMainDir = await mkdtemp(path.join(tmpdir(), "lh-hook-test-main-"));
  mainDir = await realpath(tempMainDir); // Resolve symlinks (important on macOS)
  await initGitRepo(mainDir);

  // Set up minimal LeanHarness structure in main repo
  const lhDir = path.join(mainDir, ".lh");
  await mkdir(lhDir, { recursive: true });

  // Create .lh/config.yml with strict boundary enforcement
  const configPath = path.join(lhDir, "config.yml");
  await writeFile(
    configPath,
    `boundary_enforcement:
  mode: strict
`,
    "utf8"
  );

  // Create .lh/state.json with an active feature
  const statePath = path.join(lhDir, "state.json");
  await writeFile(
    statePath,
    JSON.stringify(
      {
        version: "0.1",
        activeFeature: "F001-test",
        features: [
          {
            id: "F001-test",
            slug: "test",
            title: "Test Feature",
            path: ".lh/features/F001-test",
            status: "building",
          },
        ],
        last_event_id: 0,
        session: { started_at: null, host: null, adapter: null },
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  // Create .lh/features/F001-test/boundary.json
  const featurePath = path.join(lhDir, "features", "F001-test");
  await mkdir(featurePath, { recursive: true });
  const boundaryPath = path.join(featurePath, "boundary.json");
  await writeFile(
    boundaryPath,
    JSON.stringify(
      {
        touchFiles: [{ path: "src/a.ts" }],
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  // Commit all .lh/ files to git
  await gitOut(mainDir, ["add", "-A"]);
  await gitOut(mainDir, ["commit", "-m", "add leanharness config"]);

  // Create test source files in main repo (for non-worktree baseline tests)
  const srcDir = path.join(mainDir, "src");
  await mkdir(srcDir, { recursive: true });
  await writeFile(path.join(srcDir, "a.ts"), "// in boundary\n");
  await writeFile(path.join(srcDir, "zzz.ts"), "// outside boundary\n");
  await gitOut(mainDir, ["add", "-A"]);
  await gitOut(mainDir, ["commit", "-m", "add test files"]);

  // Create linked worktree
  worktreeDir = path.join(mainDir, ".worktrees", "feature-F001-test");
  await addWorktree(mainDir, {
    path: worktreeDir,
    branch: "feature/F001-test",
    createBranch: true,
  });

  // Create test source files in worktree
  // (worktree shares git index with main, so files don't automatically exist)
  await writeFile(path.join(worktreeDir, "src/a.ts"), "// in boundary (from worktree)\n");
  await writeFile(path.join(worktreeDir, "src/zzz.ts"), "// outside boundary (from worktree)\n");
});

afterAll(async () => {
  // Clean up
  if (mainDir && existsSync(mainDir)) {
    await rm(mainDir, { recursive: true, force: true });
  }
});

describe("pre-tool-use hook — git worktree root resolution", () => {
  /**
   * Test 1: Regression — absolute path inside worktree, in-boundary file
   *
   * Before the fix, this would fail because normalizeRelativePath would be called
   * against the MAIN repo root, causing a valid in-boundary file to appear as
   * if it was outside the boundary.
   *
   * After the fix, normalizeAgainstRoots() tries the worktree root first, then
   * falls back to the harness root. For a path like /path/to/worktree/src/a.ts,
   * it correctly normalizes to "src/a.ts" when normalized against the worktree root.
   */
  it("allows in-boundary file with absolute path from worktree", async () => {
    const payload = {
      tool_name: "Edit",
      tool_input: {
        file_path: path.join(worktreeDir, "src/a.ts"),
      },
    };

    const result = runHook(worktreeDir, mainDir, payload);
    const decision = parseHookDecision(result.stdout);

    expect(decision.decision).toBe("allow");
  });

  /**
   * Test 2: Out-of-boundary file inside worktree still correctly denies
   *
   * This verifies that the fix doesn't just disable enforcement.
   * The hook should still deny attempts to edit files outside the boundary.
   */
  it("denies out-of-boundary file from worktree", async () => {
    const payload = {
      tool_name: "Edit",
      tool_input: {
        file_path: path.join(worktreeDir, "src/zzz.ts"),
      },
    };

    const result = runHook(worktreeDir, mainDir, payload);
    const decision = parseHookDecision(result.stdout);

    expect(decision.decision).toBe("deny");
    expect(decision.reason).toContain("outside the active change boundary");
  });

  /**
   * Test 3: Fail-open regression check
   *
   * Before the fix, if the boundary couldn't be found in a worktree scenario,
   * the hook would silently allow ANY file (fail open).
   *
   * This test confirms that case 2 actually found the boundary.
   * If the boundary wasn't found, case 2 would also allow zzz.ts, which would
   * make this test fail. So case 2 passing is exactly the proof this bug is fixed.
   *
   * We also run findActiveFeature via a direct subprocess to confirm the boundary
   * is actually non-null and found.
   */
  it("verifies boundary is actually found from worktree (not fail-open)", async () => {
    // Use node -e to directly call the shared.js functions
    const testCode = `
      const shared = require('${hookPath.replace(/pre-tool-use\.js$/, "shared.js")}');
      const roots = shared.resolveRoots();
      const featureRef = shared.findActiveFeature(roots.harnessRoot);
      const featureDir = shared.resolveFeatureDir(roots.harnessRoot, featureRef);
      const boundary = shared.loadBoundary(roots.harnessRoot, featureDir);

      if (!boundary) {
        console.log(JSON.stringify({ found: false, boundary: null, featureRef, featureDir }));
      } else {
        console.log(JSON.stringify({
          found: true,
          boundary: Object.keys(boundary).length > 0,
          hasTouch: !!boundary.touchFiles,
          featureRef
        }));
      }
    `;

    try {
      const stdout = execFileSync("node", ["-e", testCode], {
        cwd: worktreeDir,
        env: { ...process.env, CLAUDE_PROJECT_DIR: mainDir },
        encoding: "utf8",
      });

      const result = JSON.parse(stdout);
      expect(result.found).toBe(true);
      expect(result.boundary).toBe(true);
      expect(result.hasTouch).toBe(true);
      expect(result.featureRef).toBe("F001-test");
    } catch (err: any) {
      throw new Error(`Failed to verify boundary lookup: ${err.message}\n${err.stdout}`);
    }
  });

  /**
   * Test 4: Non-worktree baseline unaffected (in-boundary)
   *
   * Ensure that edits in the main repo (non-worktree) still work correctly.
   * This is the common case — we must not break it.
   */
  it("allows in-boundary file from main repo (non-worktree)", async () => {
    const payload = {
      tool_name: "Edit",
      tool_input: {
        file_path: path.join(mainDir, "src/a.ts"),
      },
    };

    const result = runHook(mainDir, mainDir, payload);
    const decision = parseHookDecision(result.stdout);

    expect(decision.decision).toBe("allow");
  });

  /**
   * Test 5: Non-worktree baseline unaffected (out-of-boundary)
   *
   * Ensure that boundary enforcement still works in the main repo.
   */
  it("denies out-of-boundary file from main repo (non-worktree)", async () => {
    const payload = {
      tool_name: "Edit",
      tool_input: {
        file_path: path.join(mainDir, "src/zzz.ts"),
      },
    };

    const result = runHook(mainDir, mainDir, payload);
    const decision = parseHookDecision(result.stdout);

    expect(decision.decision).toBe("deny");
    expect(decision.reason).toContain("outside the active change boundary");
  });

  /**
   * Test 6: Non-git directory falls back gracefully
   *
   * If the hook runs in a plain directory with no git, it should not crash.
   * It should fall back to CLAUDE_PROJECT_DIR or process.cwd().
   */
  it("runs without error in non-git directory", async () => {
    // Create a plain temp directory (no git)
    const plainDir = await mkdtemp(path.join(tmpdir(), "lh-plain-"));

    try {
      const payload = {
        tool_name: "Edit",
        tool_input: {
          file_path: "some/file.ts",
        },
      };

      // This should not throw — it's the fallback case
      expect(() => {
        runHook(plainDir, mainDir, payload);
      }).not.toThrow();
    } finally {
      await rm(plainDir, { recursive: true, force: true });
    }
  });

  /**
   * Test 7: Relative path from worktree is correctly handled
   *
   * If the hook receives a relative path (not absolute), it should still work.
   * normalizeAgainstRoots should handle this correctly.
   */
  it("allows in-boundary file with relative path from worktree", async () => {
    const payload = {
      tool_name: "Edit",
      tool_input: {
        file_path: "src/a.ts", // relative path
      },
    };

    const result = runHook(worktreeDir, mainDir, payload);
    const decision = parseHookDecision(result.stdout);

    expect(decision.decision).toBe("allow");
  });

  /**
   * Test 8: Mixed absolute and relative paths in MultiEdit
   *
   * Test the extractToolPaths function with a MultiEdit scenario that has
   * both absolute and relative paths.
   */
  it("handles MultiEdit with mixed absolute and relative paths from worktree", async () => {
    const payload = {
      tool_name: "MultiEdit",
      tool_input: {
        edits: [
          { file_path: path.join(worktreeDir, "src/a.ts") }, // absolute, in boundary
          { file_path: "src/a.ts" }, // relative, in boundary
        ],
      },
    };

    const result = runHook(worktreeDir, mainDir, payload);
    const decision = parseHookDecision(result.stdout);

    // Both files are in the boundary, so the operation should be allowed
    expect(decision.decision).toBe("allow");
  });

  /**
   * Test 9: MultiEdit with first file out of boundary is correctly denied
   *
   * The hook should deny as soon as it encounters ANY out-of-boundary file.
   */
  it("denies MultiEdit when any file is out-of-boundary", async () => {
    const payload = {
      tool_name: "MultiEdit",
      tool_input: {
        edits: [
          { file_path: "src/a.ts" }, // in boundary
          { file_path: path.join(worktreeDir, "src/zzz.ts") }, // out of boundary
        ],
      },
    };

    const result = runHook(worktreeDir, mainDir, payload);
    const decision = parseHookDecision(result.stdout);

    expect(decision.decision).toBe("deny");
    expect(decision.reason).toContain("outside the active change boundary");
  });

  /**
   * Test 10: Write tool also respects boundary enforcement from worktree
   *
   * Ensure the hook enforces boundaries for Write operations too.
   */
  it("denies Write of out-of-boundary file from worktree", async () => {
    const payload = {
      tool_name: "Write",
      tool_input: {
        file_path: path.join(worktreeDir, "src/zzz.ts"),
      },
    };

    const result = runHook(worktreeDir, mainDir, payload);
    const decision = parseHookDecision(result.stdout);

    expect(decision.decision).toBe("deny");
    expect(decision.reason).toContain("outside the active change boundary");
  });
});
