import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTempWorkspace, cleanupWorkspace, fileExists, readFile, readJson, lhPath, featurePath } from "./helpers.js";
import { runInitCommand } from "../../src/commands/init.js";
import { runSpecCommand } from "../../src/commands/spec.js";
import { runDiscoverCommand } from "../../src/commands/discover.js";
import { runPlanCommand } from "../../src/commands/plan.js";
import { runBuildCommand } from "../../src/commands/build.js";
import { runCheckCommand } from "../../src/commands/check.js";
import { runListCommand } from "../../src/commands/list.js";
import { runShowCommand } from "../../src/commands/show.js";
import { CLIError } from "../../src/core/errors.js";

let tmpDir: string;
const suppress = { write: () => true } as any;

beforeEach(async () => {
  tmpDir = await createTempWorkspace();
});

afterEach(async () => {
  await cleanupWorkspace(tmpDir);
});

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

describe("E2E: full workflow", () => {
  it("init → spec → discover → plan → build --dry-run → check --no-run", async () => {
    const restore = silenceOutput();
    try {
      // 1. Init
      await runInitCommand({ cwd: tmpDir });
      expect(await fileExists(lhPath(tmpDir, "config.yml"))).toBe(true);
      expect(await fileExists(lhPath(tmpDir, "state.json"))).toBe(true);

      // 2. Spec
      await runSpecCommand({ cwd: tmpDir, request: "Add a login page with email and password" });
      const state = await readJson<any>(lhPath(tmpDir, "state.json"));
      expect(state.features.length).toBe(1);
      const feature = state.features[0];
      expect(feature.id).toBe("F001");
      expect(feature.status).toBe("draft");

      const specPath = featurePath(tmpDir, feature.path, "spec.md");
      expect(await fileExists(specPath)).toBe(true);
      const spec = await readFile(specPath);
      expect(spec).toContain("login");

      // 3. Discover
      await runDiscoverCommand({ cwd: tmpDir, ref: "F001" });
      expect(await fileExists(featurePath(tmpDir, feature.path, "discovery.md"))).toBe(true);
      expect(await fileExists(featurePath(tmpDir, feature.path, "boundary.json"))).toBe(true);

      const stateAfterDiscover = await readJson<any>(lhPath(tmpDir, "state.json"));
      expect(stateAfterDiscover.features[0].status).toBeDefined();

      // 4. Plan
      await runPlanCommand({ cwd: tmpDir, ref: "F001" });
      expect(await fileExists(featurePath(tmpDir, feature.path, "plan.md"))).toBe(true);
      expect(await fileExists(featurePath(tmpDir, feature.path, "tasks.md"))).toBe(true);

      const stateAfterPlan = await readJson<any>(lhPath(tmpDir, "state.json"));
      expect(stateAfterPlan.features[0].status).toBeDefined();

      // 5. Build --dry-run (no real agent needed)
      await runBuildCommand({ cwd: tmpDir, ref: "F001", dryRun: true });

      // 6. Check --no-run
      await runCheckCommand({ cwd: tmpDir, ref: "F001", noRun: true });
      expect(await fileExists(featurePath(tmpDir, feature.path, "checks.md"))).toBe(true);
      expect(await fileExists(featurePath(tmpDir, feature.path, "result.md"))).toBe(true);
    } finally {
      restore();
    }
  });

  it("list and show work after spec", async () => {
    const restore = silenceOutput();
    try {
      await runInitCommand({ cwd: tmpDir });
      await runSpecCommand({ cwd: tmpDir, request: "Add search functionality" });

      // List
      let listOutput = "";
      process.stdout.write = ((c: string) => { listOutput += c; return true; }) as any;
      await runListCommand({ cwd: tmpDir });
      expect(listOutput).toContain("F001");

      // Show
      let showOutput = "";
      process.stdout.write = ((c: string) => { showOutput += c; return true; }) as any;
      await runShowCommand({ cwd: tmpDir, ref: "F001" });
      expect(showOutput).toContain("F001");
    } finally {
      restore();
    }
  });
});

describe("E2E: error recovery", () => {
  it("spec before init creates feature anyway (init not required)", async () => {
    const restore = silenceOutput();
    try {
      await runSpecCommand({ cwd: tmpDir, request: "something" });
      expect(await fileExists(lhPath(tmpDir, "state.json"))).toBe(true);
    } finally {
      restore();
    }
  });

  it("discover before spec throws", async () => {
    const restore = silenceOutput();
    try {
      await runInitCommand({ cwd: tmpDir });
      await expect(
        runDiscoverCommand({ cwd: tmpDir, ref: "F001" }),
      ).rejects.toThrow(/Could not find feature/);
    } finally {
      restore();
    }
  });

  it("plan before discover throws", async () => {
    const restore = silenceOutput();
    try {
      await runInitCommand({ cwd: tmpDir });
      await runSpecCommand({ cwd: tmpDir, request: "Add feature X" });
      await expect(
        runPlanCommand({ cwd: tmpDir, ref: "F001" }),
      ).rejects.toThrow(/discovery.md is missing/);
    } finally {
      restore();
    }
  });

  it("check before plan still runs with partial artifacts", async () => {
    const restore = silenceOutput();
    try {
      await runInitCommand({ cwd: tmpDir });
      await runSpecCommand({ cwd: tmpDir, request: "Add feature Y" });
      await runDiscoverCommand({ cwd: tmpDir, ref: "F001" });
      // Skip plan, go directly to check
      await runCheckCommand({ cwd: tmpDir, ref: "F001", noRun: true });
      const state = await readJson<any>(lhPath(tmpDir, "state.json"));
      const feature = state.features[0];
      expect(await fileExists(featurePath(tmpDir, feature.path, "checks.md"))).toBe(true);
    } finally {
      restore();
    }
  });

  it("plan --force overwrites existing plan", async () => {
    const restore = silenceOutput();
    try {
      await runInitCommand({ cwd: tmpDir });
      await runSpecCommand({ cwd: tmpDir, request: "Add feature Z" });
      await runDiscoverCommand({ cwd: tmpDir, ref: "F001" });
      await runPlanCommand({ cwd: tmpDir, ref: "F001" });

      // Without force, should throw
      await expect(
        runPlanCommand({ cwd: tmpDir, ref: "F001" }),
      ).rejects.toThrow(/already exists/);

      // With force, should succeed
      await runPlanCommand({ cwd: tmpDir, ref: "F001", force: true });
    } finally {
      restore();
    }
  });

  it("missing ref throws CLIError", async () => {
    await expect(
      runSpecCommand({ cwd: tmpDir, request: "" }),
    ).rejects.toThrow(CLIError);
  });
});
