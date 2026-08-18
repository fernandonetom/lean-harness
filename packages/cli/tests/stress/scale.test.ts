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
import { createTempWorkspace, cleanupWorkspace, lhPath, featurePath, readJson } from "../e2e/helpers.js";
import { runInitCommand } from "../../src/commands/init.js";
import { runSpecCommand } from "../../src/commands/spec.js";
import { runDiscoverCommand } from "../../src/commands/discover.js";
import { searchRelevantFiles, extractKeywords } from "../../src/discovery/search.js";
import { resolveImportChain, parseImports } from "../../src/discovery/import-resolver.js";
import type { CandidateFile } from "../../src/discovery/search.js";

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

describe("stress: large codebase discovery", () => {
  it("handles 1000+ files without crashing", async () => {
    const srcDir = path.join(tmpDir, "src");

    const dirs = ["components", "utils", "services", "hooks", "pages", "api", "models", "helpers", "lib", "config"];
    for (const d of dirs) {
      await fs.mkdir(path.join(srcDir, d), { recursive: true });
    }

    const filePromises: Promise<void>[] = [];
    for (let i = 0; i < 1200; i++) {
      const dir = dirs[i % dirs.length]!;
      const filePath = path.join(srcDir, dir, `module-${i}.ts`);
      const content = `export function handler${i}() { return ${i}; }\n`;
      filePromises.push(fs.writeFile(filePath, content));
    }
    await Promise.all(filePromises);

    const keywords = extractKeywords("module handler utility");
    const result = await searchRelevantFiles(tmpDir, keywords, { maxResults: 80 });

    expect(result.scannedFiles).toBeGreaterThan(100);
    expect(result.candidates.length).toBeLessThanOrEqual(80);
    expect(result.candidates.length).toBeGreaterThan(0);
  }, 30000);

  it("respects MAX_WALK_ENTRIES limit gracefully", async () => {
    const deepDir = path.join(tmpDir, "deep");
    await fs.mkdir(deepDir, { recursive: true });

    const filePromises: Promise<void>[] = [];
    for (let i = 0; i < 6000; i++) {
      filePromises.push(
        fs.writeFile(path.join(deepDir, `file-${i}.ts`), `export const x${i} = ${i};\n`),
      );
    }
    await Promise.all(filePromises);

    const keywords = extractKeywords("file export");
    const result = await searchRelevantFiles(tmpDir, keywords);

    expect(result.scannedFiles + result.skippedFiles).toBeLessThanOrEqual(5001);
    expect(result.candidates.length).toBeGreaterThan(0);
  }, 30000);

  it("discovery command completes with large file tree", async () => {
    const restore = silenceOutput();
    try {
      await runInitCommand({ cwd: tmpDir });
      await runSpecCommand({ cwd: tmpDir, request: "Add authentication module" });

      const srcDir = path.join(tmpDir, "src");
      await fs.mkdir(path.join(srcDir, "auth"), { recursive: true });
      await fs.mkdir(path.join(srcDir, "utils"), { recursive: true });

      const promises: Promise<void>[] = [];
      for (let i = 0; i < 500; i++) {
        promises.push(
          fs.writeFile(
            path.join(srcDir, "utils", `util-${i}.ts`),
            `export function util${i}() {}\n`,
          ),
        );
      }
      await fs.writeFile(
        path.join(srcDir, "auth", "login.ts"),
        'export function login() { return "ok"; }\n',
      );
      await Promise.all(promises);

      await runDiscoverCommand({ cwd: tmpDir, ref: "F001" });

      const state = await readJson<any>(lhPath(tmpDir, "state.json"));
      expect(state.features[0].status).toBeDefined();
    } finally {
      restore();
    }
  }, 30000);
});

describe("stress: deep dependency chains", () => {
  it("resolves multi-level import chains", async () => {
    const srcDir = path.join(tmpDir, "src");
    await fs.mkdir(srcDir, { recursive: true });

    await fs.writeFile(path.join(srcDir, "a.ts"), 'import { b } from "./b";\nexport const a = b;\n');
    await fs.writeFile(path.join(srcDir, "b.ts"), 'import { c } from "./c";\nexport const b = c;\n');
    await fs.writeFile(path.join(srcDir, "c.ts"), 'import { d } from "./d";\nexport const c = d;\n');
    await fs.writeFile(path.join(srcDir, "d.ts"), 'import { e } from "./e";\nexport const d = e;\n');
    await fs.writeFile(path.join(srcDir, "e.ts"), "export const e = 42;\n");

    const seeds: CandidateFile[] = [
      { path: "src/a.ts", reason: "seed", confidence: "high", score: 10, kind: "source", matchedTerms: ["a"] },
    ];

    const result = await resolveImportChain(tmpDir, seeds, { maxDepth: 4 });
    expect(result.newCandidates.length).toBeGreaterThanOrEqual(4);
    expect(result.parsedImportCount).toBeGreaterThanOrEqual(4);
  });

  it("handles circular imports without infinite loop", async () => {
    const srcDir = path.join(tmpDir, "src");
    await fs.mkdir(srcDir, { recursive: true });

    await fs.writeFile(path.join(srcDir, "cycle-a.ts"), 'import { b } from "./cycle-b";\nexport const a = b;\n');
    await fs.writeFile(path.join(srcDir, "cycle-b.ts"), 'import { c } from "./cycle-c";\nexport const b = c;\n');
    await fs.writeFile(path.join(srcDir, "cycle-c.ts"), 'import { a } from "./cycle-a";\nexport const c = a;\n');

    const seeds: CandidateFile[] = [
      { path: "src/cycle-a.ts", reason: "seed", confidence: "high", score: 10, kind: "source", matchedTerms: ["cycle"] },
    ];

    const result = await resolveImportChain(tmpDir, seeds, { maxDepth: 10 });
    expect(result.newCandidates.length).toBe(2);
    expect(result.parsedImportCount).toBeGreaterThanOrEqual(2);
  });

  it("handles diamond dependency pattern", async () => {
    const srcDir = path.join(tmpDir, "src");
    await fs.mkdir(srcDir, { recursive: true });

    // A → B, A → C, B → D, C → D
    await fs.writeFile(path.join(srcDir, "top.ts"), 'import "./left";\nimport "./right";\n');
    await fs.writeFile(path.join(srcDir, "left.ts"), 'import "./bottom";\nexport const l = 1;\n');
    await fs.writeFile(path.join(srcDir, "right.ts"), 'import "./bottom";\nexport const r = 2;\n');
    await fs.writeFile(path.join(srcDir, "bottom.ts"), "export const b = 3;\n");

    const seeds: CandidateFile[] = [
      { path: "src/top.ts", reason: "seed", confidence: "high", score: 10, kind: "source", matchedTerms: ["top"] },
    ];

    const result = await resolveImportChain(tmpDir, seeds, { maxDepth: 3 });
    const paths = result.newCandidates.map((c) => c.path);
    expect(paths).toContain("src/bottom.ts");
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("parseImports extracts only relative imports", () => {
    const code = `
import { foo } from "./foo.js";
import { bar } from "../bar.js";
import { baz } from "baz";
import * as fs from "node:fs";
const x = require("./local.js");
const y = require("external-pkg");
`;
    const imports = parseImports(code);
    expect(imports).toContain("./foo.js");
    expect(imports).toContain("../bar.js");
    expect(imports).toContain("./local.js");
    expect(imports).not.toContain("baz");
    expect(imports).not.toContain("node:fs");
    expect(imports).not.toContain("external-pkg");
  });
});
