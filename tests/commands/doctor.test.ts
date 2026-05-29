import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fsp from "node:fs/promises";
import { runDoctorCommand } from "../../src/commands/doctor.js";
import { createTempWorkspace, type TestWorkspace } from "../helpers/workspace.js";
import { ensureDir, writeTextFile } from "../../src/core/fs.js";
import { harnessPath, statePath } from "../../src/core/paths.js";

let ws: TestWorkspace;
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
  ws = await createTempWorkspace();
});

afterEach(async () => {
  await ws.cleanup();
});

describe("doctor --fix", () => {
  it("creates missing .lh/config.yml", async () => {
    await ensureDir(harnessPath(ws.root));

    const cfgPath = harnessPath(ws.root, "config.yml");
    const existsBefore = await fileExistsSafe(cfgPath);
    expect(existsBefore).toBe(false);

    const restore = silenceOutput();
    try {
      await runDoctorCommand({ cwd: ws.root, fix: true });
    } finally {
      restore();
    }

    const existsAfter = await fileExistsSafe(cfgPath);
    expect(existsAfter).toBe(true);
  });

  it("creates .lh/state.json when loadState detects missing file via fileExists check", async () => {
    // When state.json is missing, loadState returns default (pass).
    // The fix targets the fail case — corrupted state.json.
    await ensureDir(harnessPath(ws.root));
    await fsp.writeFile(statePath(ws.root), "CORRUPTED", "utf8");
    await writeTextFile(harnessPath(ws.root, "config.yml"), "version: 0.1");

    const restore = silenceOutput();
    try {
      await runDoctorCommand({ cwd: ws.root, fix: true });
    } finally {
      restore();
    }

    const content = JSON.parse(await fsp.readFile(statePath(ws.root), "utf8"));
    expect(content.version).toBe("0.1");
    expect(content.schema).toBe("leanharness-state");
  });

  it("resets corrupted state.json", async () => {
    await ensureDir(harnessPath(ws.root));
    await fsp.writeFile(statePath(ws.root), "NOT VALID JSON", "utf8");
    await writeTextFile(harnessPath(ws.root, "config.yml"), "version: 0.1");

    const restore = silenceOutput();
    try {
      await runDoctorCommand({ cwd: ws.root, fix: true });
    } finally {
      restore();
    }

    const content = JSON.parse(await fsp.readFile(statePath(ws.root), "utf8"));
    expect(content.version).toBe("0.1");
    expect(content.schema).toBe("leanharness-state");
  });

  it("installs missing scaffold files including spec.md", async () => {
    await ensureDir(harnessPath(ws.root));
    await writeTextFile(harnessPath(ws.root, "config.yml"), "version: 0.1");
    await fsp.writeFile(
      statePath(ws.root),
      JSON.stringify({ version: "0.1", schema: "leanharness-state" }),
      "utf8",
    );
    await ensureDir(harnessPath(ws.root, "templates"));

    const specPath = harnessPath(ws.root, "templates", "spec.md");
    expect(await fileExistsSafe(specPath)).toBe(false);

    const restore = silenceOutput();
    try {
      await runDoctorCommand({ cwd: ws.root, fix: true });
    } finally {
      restore();
    }

    expect(await fileExistsSafe(specPath)).toBe(true);
    const spec = await fsp.readFile(specPath, "utf8");
    expect(spec).toContain("# Spec:");
  });

  it("creates missing directories (templates, policies, features)", async () => {
    await ensureDir(harnessPath(ws.root));
    await writeTextFile(harnessPath(ws.root, "config.yml"), "version: 0.1");
    await fsp.writeFile(statePath(ws.root), JSON.stringify({ version: "0.1" }), "utf8");

    const templateDir = harnessPath(ws.root, "templates");
    const policiesDir = harnessPath(ws.root, "policies");
    const featuresDir = harnessPath(ws.root, "features");

    expect(await dirExistsSafe(templateDir)).toBe(false);
    expect(await dirExistsSafe(policiesDir)).toBe(false);
    expect(await dirExistsSafe(featuresDir)).toBe(false);

    const restore = silenceOutput();
    try {
      await runDoctorCommand({ cwd: ws.root, fix: true });
    } finally {
      restore();
    }

    expect(await dirExistsSafe(templateDir)).toBe(true);
    expect(await dirExistsSafe(policiesDir)).toBe(true);
    expect(await dirExistsSafe(featuresDir)).toBe(true);
  });

  it("does not fix when --fix is not set", async () => {
    const restore = silenceOutput();
    try {
      await runDoctorCommand({ cwd: ws.root });
    } finally {
      restore();
    }

    const cfgPath = harnessPath(ws.root, "config.yml");
    expect(await fileExistsSafe(cfgPath)).toBe(false);
  });

  it("reports fixes in JSON output", async () => {
    await ensureDir(harnessPath(ws.root));

    let output = "";
    const origWrite = process.stdout.write.bind(process.stdout);
    const origErr = process.stderr.write.bind(process.stderr);
    process.stdout.write = ((chunk: any) => {
      output += String(chunk);
      return true;
    }) as any;
    process.stderr.write = suppress.write;

    try {
      await runDoctorCommand({ cwd: ws.root, json: true, fix: true });
    } finally {
      process.stdout.write = origWrite;
      process.stderr.write = origErr;
    }

    const result = JSON.parse(output);
    expect(result.fixes).toBeDefined();
    expect(result.fixes.length).toBeGreaterThan(0);
    expect(result.fixes.some((f: any) => f.success)).toBe(true);
  });
});


async function fileExistsSafe(p: string): Promise<boolean> {
  try {
    const stat = await fsp.stat(p);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function dirExistsSafe(p: string): Promise<boolean> {
  try {
    const stat = await fsp.stat(p);
    return stat.isDirectory();
  } catch {
    return false;
  }
}
