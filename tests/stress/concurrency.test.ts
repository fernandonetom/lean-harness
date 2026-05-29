import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn((cmd: string, args: string[]) => {
    if (cmd === "python3" && args[0] === "--version") {
      return { status: 0, stdout: "Python 3.11.0\n", stderr: "", error: undefined };
    }
    if (cmd === "graphify" && args[0] === "--version") {
      return { status: 1, stdout: "", stderr: "", error: new Error("not found") };
    }
    return { status: 0, stdout: "", stderr: "", error: undefined };
  }),
  execSync: vi.fn(),
}));
import fs from "node:fs/promises";
import { createTempWorkspace, cleanupWorkspace, lhPath, featurePath, readJson, fileExists } from "../e2e/helpers.js";
import { runInitCommand } from "../../src/commands/init.js";
import { runSpecCommand } from "../../src/commands/spec.js";
import { runDiscoverCommand } from "../../src/commands/discover.js";
import { runPlanCommand } from "../../src/commands/plan.js";
import { runBuildCommand } from "../../src/commands/build.js";
import { runCheckCommand } from "../../src/commands/check.js";
import { loadState, saveState, upsertFeatureEntry, nowIso } from "../../src/core/state.js";
import type { FeatureIndexEntry } from "../../src/core/types.js";

let tmpDir: string;
const suppress = { write: () => true } as any;

function silenceOutput() {
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = suppress.write;
  process.stderr.write = suppress.write;
  return () => {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  };
}

beforeEach(async () => {
  tmpDir = await createTempWorkspace();
});

afterEach(async () => {
  await cleanupWorkspace(tmpDir);
});

describe("stress: concurrent features", () => {
  it("two features spec'd sequentially get distinct IDs", async () => {
    const restore = silenceOutput();
    try {
      await runInitCommand({ cwd: tmpDir });
      await runSpecCommand({ cwd: tmpDir, request: "Add login page" });
      await runSpecCommand({ cwd: tmpDir, request: "Add search functionality" });

      const state = await readJson<any>(lhPath(tmpDir, "state.json"));
      expect(state.features.length).toBe(2);
      expect(state.features[0].id).toBe("F001");
      expect(state.features[1].id).toBe("F002");
      expect(state.features[0].path).not.toBe(state.features[1].path);
    } finally {
      restore();
    }
  });

  it("two features can be discovered independently", async () => {
    const restore = silenceOutput();
    try {
      await runInitCommand({ cwd: tmpDir });
      await runSpecCommand({ cwd: tmpDir, request: "Add login page" });
      await runSpecCommand({ cwd: tmpDir, request: "Add search bar" });

      await runDiscoverCommand({ cwd: tmpDir, ref: "F001" });
      await runDiscoverCommand({ cwd: tmpDir, ref: "F002" });

      const state = await readJson<any>(lhPath(tmpDir, "state.json"));
      const f1Dir = state.features[0].path;
      const f2Dir = state.features[1].path;

      expect(await fileExists(featurePath(tmpDir, f1Dir, "discovery.md"))).toBe(true);
      expect(await fileExists(featurePath(tmpDir, f2Dir, "discovery.md"))).toBe(true);
      expect(await fileExists(featurePath(tmpDir, f1Dir, "boundary.json"))).toBe(true);
      expect(await fileExists(featurePath(tmpDir, f2Dir, "boundary.json"))).toBe(true);
    } finally {
      restore();
    }
  });

  it("two features through plan maintain separate artifacts", async () => {
    const restore = silenceOutput();
    try {
      await runInitCommand({ cwd: tmpDir });
      await runSpecCommand({ cwd: tmpDir, request: "Add auth module" });
      await runSpecCommand({ cwd: tmpDir, request: "Add billing page" });

      await runDiscoverCommand({ cwd: tmpDir, ref: "F001" });
      await runDiscoverCommand({ cwd: tmpDir, ref: "F002" });

      await runPlanCommand({ cwd: tmpDir, ref: "F001" });
      await runPlanCommand({ cwd: tmpDir, ref: "F002" });

      const state = await readJson<any>(lhPath(tmpDir, "state.json"));
      const f1Dir = state.features[0].path;
      const f2Dir = state.features[1].path;

      expect(await fileExists(featurePath(tmpDir, f1Dir, "plan.md"))).toBe(true);
      expect(await fileExists(featurePath(tmpDir, f2Dir, "plan.md"))).toBe(true);
      expect(await fileExists(featurePath(tmpDir, f1Dir, "tasks.md"))).toBe(true);
      expect(await fileExists(featurePath(tmpDir, f2Dir, "tasks.md"))).toBe(true);

      expect(f1Dir).not.toBe(f2Dir);
    } finally {
      restore();
    }
  });

  it("building one feature does not affect another", async () => {
    const restore = silenceOutput();
    try {
      await runInitCommand({ cwd: tmpDir });
      await runSpecCommand({ cwd: tmpDir, request: "Add login" });
      await runSpecCommand({ cwd: tmpDir, request: "Add search" });

      await runDiscoverCommand({ cwd: tmpDir, ref: "F001" });
      await runDiscoverCommand({ cwd: tmpDir, ref: "F002" });
      await runPlanCommand({ cwd: tmpDir, ref: "F001" });
      await runPlanCommand({ cwd: tmpDir, ref: "F002" });

      await runBuildCommand({ cwd: tmpDir, ref: "F001", dryRun: true });

      const state = await readJson<any>(lhPath(tmpDir, "state.json"));
      const f2 = state.features.find((f: any) => f.id === "F002");
      expect(f2.status).not.toBe("building");
    } finally {
      restore();
    }
  });
});

describe("stress: missing artifacts graceful degradation", () => {
  it("check with only spec produces blocked verdict", async () => {
    const restore = silenceOutput();
    try {
      await runInitCommand({ cwd: tmpDir });
      await runSpecCommand({ cwd: tmpDir, request: "Add feature X" });

      const state = await readJson<any>(lhPath(tmpDir, "state.json"));
      const fDir = state.features[0].path;

      await runCheckCommand({ cwd: tmpDir, ref: "F001", noRun: true });

      expect(await fileExists(featurePath(tmpDir, fDir, "checks.md"))).toBe(true);
      expect(await fileExists(featurePath(tmpDir, fDir, "result.md"))).toBe(true);

      const stateAfter = await readJson<any>(lhPath(tmpDir, "state.json"));
      expect(stateAfter.features[0].status).toBe("blocked");
    } finally {
      restore();
    }
  });

  it("check with spec+discovery but no plan still runs", async () => {
    const restore = silenceOutput();
    try {
      await runInitCommand({ cwd: tmpDir });
      await runSpecCommand({ cwd: tmpDir, request: "Add feature Y" });
      await runDiscoverCommand({ cwd: tmpDir, ref: "F001" });

      await runCheckCommand({ cwd: tmpDir, ref: "F001", noRun: true });

      const state = await readJson<any>(lhPath(tmpDir, "state.json"));
      expect(["blocked", "needs-fix"]).toContain(state.features[0].status);
    } finally {
      restore();
    }
  });

  it("manually adding state entries without artifacts degrades gracefully", async () => {
    const restore = silenceOutput();
    try {
      await runInitCommand({ cwd: tmpDir });

      const state = await loadState(tmpDir);
      const ghost: FeatureIndexEntry = {
        id: "F099",
        slug: "ghost-feature",
        title: "Ghost Feature",
        path: "F099-ghost-feature",
        status: "draft",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      upsertFeatureEntry(state, ghost);
      await saveState(tmpDir, state);

      await expect(
        runDiscoverCommand({ cwd: tmpDir, ref: "F099" }),
      ).rejects.toThrow(/spec\.md is missing/);
    } finally {
      restore();
    }
  });
});
