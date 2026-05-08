import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fsp from "node:fs/promises";
import {
  parseImports,
  resolveImportPath,
  resolveImportChain,
} from "../../src/discovery/import-resolver.js";
import type { CandidateFile } from "../../src/discovery/search.js";
import { createTempWorkspace, type TestWorkspace } from "../helpers/workspace.js";

describe("parseImports", () => {
  it("extracts named import", () => {
    expect(parseImports(`import { foo } from './utils'`)).toEqual(["./utils"]);
  });

  it("extracts default import", () => {
    expect(parseImports(`import Modal from './modal-sheet'`)).toEqual([
      "./modal-sheet",
    ]);
  });

  it("extracts namespace import", () => {
    expect(parseImports(`import * as helpers from '../helpers'`)).toEqual([
      "../helpers",
    ]);
  });

  it("extracts side-effect import", () => {
    expect(parseImports(`import './polyfill'`)).toEqual(["./polyfill"]);
  });

  it("extracts re-export named", () => {
    expect(parseImports(`export { foo } from './foo'`)).toEqual(["./foo"]);
  });

  it("extracts re-export wildcard", () => {
    expect(parseImports(`export * from './barrel'`)).toEqual(["./barrel"]);
  });

  it("extracts CommonJS require", () => {
    expect(parseImports(`const fs = require('./local-fs')`)).toEqual([
      "./local-fs",
    ]);
  });

  it("skips bare module specifiers", () => {
    expect(parseImports(`import React from 'react'`)).toEqual([]);
  });

  it("skips scoped packages", () => {
    expect(parseImports(`import { x } from '@scope/pkg'`)).toEqual([]);
  });

  it("skips node built-ins", () => {
    expect(parseImports(`import fs from 'node:fs'`)).toEqual([]);
  });

  it("handles mixed imports", () => {
    const content = `
import React from 'react';
import { foo } from './foo';
import bar from '../bar';
const baz = require('lodash');
export * from './barrel';
    `;
    const result = parseImports(content);
    expect(result).toContain("./foo");
    expect(result).toContain("../bar");
    expect(result).toContain("./barrel");
    expect(result).toHaveLength(3);
  });

  it("deduplicates same specifier", () => {
    const content = `
import { a } from './utils';
import { b } from './utils';
    `;
    expect(parseImports(content)).toEqual(["./utils"]);
  });

  it("handles double quotes", () => {
    expect(parseImports(`import X from "./path"`)).toEqual(["./path"]);
  });
});

describe("resolveImportPath", () => {
  let ws: TestWorkspace;

  beforeEach(async () => {
    ws = await createTempWorkspace();
  });

  afterEach(async () => {
    await ws.cleanup();
  });

  it("resolves .ts file", async () => {
    await fsp.writeFile(path.join(ws.root, "foo.ts"), "export const x = 1;");
    const result = await resolveImportPath("./foo", ws.root);
    expect(result).toBe(path.join(ws.root, "foo.ts"));
  });

  it("resolves .tsx file", async () => {
    await fsp.writeFile(path.join(ws.root, "bar.tsx"), "export default () => null;");
    const result = await resolveImportPath("./bar", ws.root);
    expect(result).toBe(path.join(ws.root, "bar.tsx"));
  });

  it("resolves .js file", async () => {
    await fsp.writeFile(path.join(ws.root, "baz.js"), "module.exports = {};");
    const result = await resolveImportPath("./baz", ws.root);
    expect(result).toBe(path.join(ws.root, "baz.js"));
  });

  it("resolves index file", async () => {
    await fsp.mkdir(path.join(ws.root, "dir"));
    await fsp.writeFile(path.join(ws.root, "dir", "index.ts"), "export {};");
    const result = await resolveImportPath("./dir", ws.root);
    expect(result).toBe(path.join(ws.root, "dir", "index.ts"));
  });

  it("resolves file with explicit extension", async () => {
    await fsp.writeFile(path.join(ws.root, "qux.ts"), "export {};");
    const result = await resolveImportPath("./qux.ts", ws.root);
    expect(result).toBe(path.join(ws.root, "qux.ts"));
  });

  it("returns null for missing file", async () => {
    const result = await resolveImportPath("./missing", ws.root);
    expect(result).toBeNull();
  });

  it("prefers .ts over .js", async () => {
    await fsp.writeFile(path.join(ws.root, "x.ts"), "export {};");
    await fsp.writeFile(path.join(ws.root, "x.js"), "module.exports = {};");
    const result = await resolveImportPath("./x", ws.root);
    expect(result).toBe(path.join(ws.root, "x.ts"));
  });
});

describe("resolveImportChain", () => {
  let ws: TestWorkspace;

  beforeEach(async () => {
    ws = await createTempWorkspace();
  });

  afterEach(async () => {
    await ws.cleanup();
  });

  function makeSeed(filePath: string, score = 8): CandidateFile {
    return {
      path: filePath,
      reason: "test seed",
      confidence: "high",
      score,
      kind: "source",
      matchedTerms: ["test"],
    };
  }

  it("finds single-level imports", async () => {
    await fsp.mkdir(path.join(ws.root, "src"), { recursive: true });
    await fsp.writeFile(
      path.join(ws.root, "src", "a.ts"),
      `import { x } from './b';\nexport const y = x;`,
    );
    await fsp.writeFile(path.join(ws.root, "src", "b.ts"), "export const x = 1;");

    const result = await resolveImportChain(ws.root, [makeSeed("src/a.ts")], {
      maxDepth: 1,
    });

    expect(result.newCandidates).toHaveLength(1);
    expect(result.newCandidates[0]!.path).toBe("src/b.ts");
    expect(result.newCandidates[0]!.matchedTerms).toContain("import:a.ts");
    expect(result.newCandidates[0]!.score).toBeGreaterThanOrEqual(3);
  });

  it("respects maxDepth=1", async () => {
    await fsp.mkdir(path.join(ws.root, "src"), { recursive: true });
    await fsp.writeFile(path.join(ws.root, "src", "a.ts"), `import './b';`);
    await fsp.writeFile(path.join(ws.root, "src", "b.ts"), `import './c';`);
    await fsp.writeFile(path.join(ws.root, "src", "c.ts"), "export {};");

    const result = await resolveImportChain(ws.root, [makeSeed("src/a.ts")], {
      maxDepth: 1,
    });

    expect(result.newCandidates).toHaveLength(1);
    expect(result.newCandidates[0]!.path).toBe("src/b.ts");
  });

  it("traverses two levels with maxDepth=2", async () => {
    await fsp.mkdir(path.join(ws.root, "src"), { recursive: true });
    await fsp.writeFile(path.join(ws.root, "src", "a.ts"), `import './b';`);
    await fsp.writeFile(path.join(ws.root, "src", "b.ts"), `import './c';`);
    await fsp.writeFile(path.join(ws.root, "src", "c.ts"), "export {};");

    const result = await resolveImportChain(ws.root, [makeSeed("src/a.ts")], {
      maxDepth: 2,
    });

    expect(result.newCandidates).toHaveLength(2);
    const paths = result.newCandidates.map((c) => c.path);
    expect(paths).toContain("src/b.ts");
    expect(paths).toContain("src/c.ts");
  });

  it("skips bare specifiers", async () => {
    await fsp.mkdir(path.join(ws.root, "src"), { recursive: true });
    await fsp.writeFile(
      path.join(ws.root, "src", "a.ts"),
      `import React from 'react';\nimport { x } from './b';`,
    );
    await fsp.writeFile(path.join(ws.root, "src", "b.ts"), "export const x = 1;");

    const result = await resolveImportChain(ws.root, [makeSeed("src/a.ts")], {
      maxDepth: 1,
    });

    expect(result.newCandidates).toHaveLength(1);
    expect(result.newCandidates[0]!.path).toBe("src/b.ts");
  });

  it("deduplicates across parents", async () => {
    await fsp.mkdir(path.join(ws.root, "src"), { recursive: true });
    await fsp.writeFile(path.join(ws.root, "src", "a.ts"), `import './shared';`);
    await fsp.writeFile(path.join(ws.root, "src", "b.ts"), `import './shared';`);
    await fsp.writeFile(path.join(ws.root, "src", "shared.ts"), "export {};");

    const candidates = [makeSeed("src/a.ts"), makeSeed("src/b.ts")];
    const result = await resolveImportChain(ws.root, candidates, {
      maxDepth: 1,
    });

    expect(result.newCandidates).toHaveLength(1);
  });

  it("handles circular imports without infinite loop", async () => {
    await fsp.mkdir(path.join(ws.root, "src"), { recursive: true });
    await fsp.writeFile(path.join(ws.root, "src", "a.ts"), `import './b';`);
    await fsp.writeFile(path.join(ws.root, "src", "b.ts"), `import './a';`);

    const result = await resolveImportChain(ws.root, [makeSeed("src/a.ts")], {
      maxDepth: 2,
    });

    expect(result.newCandidates).toHaveLength(1);
    expect(result.newCandidates[0]!.path).toBe("src/b.ts");
  });

  it("skips low-scoring candidates", async () => {
    await fsp.mkdir(path.join(ws.root, "src"), { recursive: true });
    await fsp.writeFile(path.join(ws.root, "src", "low.ts"), `import './secret';`);
    await fsp.writeFile(path.join(ws.root, "src", "secret.ts"), "export {};");

    const result = await resolveImportChain(
      ws.root,
      [makeSeed("src/low.ts", 2)],
      { maxDepth: 1 },
    );

    expect(result.newCandidates).toHaveLength(0);
  });

  it("applies score decay", async () => {
    await fsp.mkdir(path.join(ws.root, "src"), { recursive: true });
    await fsp.writeFile(path.join(ws.root, "src", "a.ts"), `import './b';`);
    await fsp.writeFile(path.join(ws.root, "src", "b.ts"), `import './c';`);
    await fsp.writeFile(path.join(ws.root, "src", "c.ts"), "export {};");

    const result = await resolveImportChain(
      ws.root,
      [makeSeed("src/a.ts", 10)],
      { maxDepth: 2 },
    );

    const b = result.newCandidates.find((c) => c.path === "src/b.ts");
    const c = result.newCandidates.find((c) => c.path === "src/c.ts");
    expect(b!.score).toBe(6); // floor(10 * 0.6)
    expect(c!.score).toBe(3); // max(3, floor(6 * 0.6)) = max(3, 3)
  });

  it("rejects files outside project root", async () => {
    const outside = await fsp.mkdtemp(path.join(ws.root, "..", "outside-"));
    try {
      await fsp.mkdir(path.join(ws.root, "src"), { recursive: true });
      await fsp.writeFile(
        path.join(ws.root, "src", "a.ts"),
        `import '../../${path.basename(outside)}/secret';`,
      );
      await fsp.writeFile(path.join(outside, "secret.ts"), "export {};");

      const result = await resolveImportChain(ws.root, [makeSeed("src/a.ts")], {
        maxDepth: 1,
      });

      expect(result.newCandidates).toHaveLength(0);
    } finally {
      await fsp.rm(outside, { recursive: true, force: true });
    }
  });

  it("returns empty when no imports exist", async () => {
    await fsp.mkdir(path.join(ws.root, "src"), { recursive: true });
    await fsp.writeFile(path.join(ws.root, "src", "a.ts"), "export const x = 1;");

    const result = await resolveImportChain(ws.root, [makeSeed("src/a.ts")], {
      maxDepth: 1,
    });

    expect(result.newCandidates).toHaveLength(0);
  });
});
