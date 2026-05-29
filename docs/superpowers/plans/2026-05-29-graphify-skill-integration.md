# Graphify Skill Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace LeanHarness's internal graph system with Graphify — removing all internal graph code, installing Graphify during `lh init`, and updating discovery skills to use Graphify for D1–D4 traversal.

**Architecture:** Delete `src/graph/`, `graph-scorer.ts`, `mcp-server.ts`, and `lh graph` CLI. Clean up imports across 7 files. Add a graphify installation phase to `runInitCommand` (Python check → installed check → pip install → host-specific setup). Update the `lh-discover` skill and `lh-scout` agent content generators to instruct agents to use Graphify instead of grep/glob.

**Tech Stack:** TypeScript, Node.js `child_process` (spawnSync/execSync), Vitest, Graphify CLI (`pip install graphifyy && graphify install`)

**Spec:** `docs/superpowers/specs/2026-05-29-graphify-skill-design.md`

---

### Task 1: Create feature branch

**Files:**
- No file changes — git operation only

- [ ] **Step 1: Create and switch to feature branch**

```bash
git checkout -b feature/graphify-skill
```

Expected output: `Switched to a new branch 'feature/graphify-skill'`

- [ ] **Step 2: Verify branch**

```bash
git branch --show-current
```

Expected: `feature/graphify-skill`

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "chore: start feature/graphify-skill branch"
```

---

### Task 2: Delete graph test files

**Files:**
- Delete: `tests/graph/import-graph.test.ts`
- Delete: `tests/graph/knowledge-graph.test.ts`
- Delete: `tests/graph/symbol-graph.test.ts`
- Delete: `tests/discovery/graph-scorer.test.ts`

- [ ] **Step 1: Delete graph test directory**

```bash
rm -rf tests/graph/
```

- [ ] **Step 2: Delete graph-scorer test**

```bash
rm tests/discovery/graph-scorer.test.ts
```

- [ ] **Step 3: Verify files are gone**

```bash
ls tests/discovery/
```

Expected: `boundary.test.ts  discovery-flow.test.ts  import-resolver.test.ts  project-detector.test.ts  search.test.ts` — no `graph-scorer.test.ts`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: remove internal graph test files"
```

---

### Task 3: Delete graph source files

**Files:**
- Delete: `src/graph/` (entire directory)
- Delete: `src/discovery/graph-scorer.ts`
- Delete: `src/adapters/mcp-server.ts`
- Delete: `src/commands/graph.ts`

- [ ] **Step 1: Delete graph source directory**

```bash
rm -rf src/graph/
```

- [ ] **Step 2: Delete graph-scorer, mcp-server, and graph command**

```bash
rm src/discovery/graph-scorer.ts src/adapters/mcp-server.ts src/commands/graph.ts
```

- [ ] **Step 3: Verify**

```bash
ls src/graph 2>&1 || echo "GONE"
ls src/adapters/
```

Expected: `GONE` for graph, and `claude-code.ts  opencode.ts  registry.ts  types.ts` in adapters (no mcp-server.ts)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: remove internal graph source files"
```

---

### Task 4: Fix `src/cli.ts` — remove graph and mcp-server

**Files:**
- Modify: `src/cli.ts`

- [ ] **Step 1: Remove graph and mcp-server imports**

Find and remove these two import lines (around lines 18 and 21):
```typescript
import { runGraphCommand } from "./commands/graph.js";
```
```typescript
import { runMcpServer } from "./adapters/mcp-server.js";
```

- [ ] **Step 2: Remove graph from help text**

Find the help text block (around lines 270–275) and remove these lines:
```
  graph <build|update|inspect|clear|export> Manage code graph (imports, symbols, knowledge)
  graph export html        Export interactive HTML visualization
  graph export json        Export JSON data for programmatic access
  graph export dot         Export DOT format for Graphviz
  graph export svg         Export static SVG image
  graph export subgraph    Export filtered subgraph by pattern
```
Also remove `--filter <pattern>` flag description (around line 331) if it is only used by `graph export subgraph`.

- [ ] **Step 3: Remove graph and mcp-server case handlers**

Find and remove the `case "graph":` block (around line 524) and the `case "mcp-server":` block (around line 565). These blocks call `runGraphCommand(...)` and `runMcpServer(...)` respectively.

- [ ] **Step 4: Run typecheck to confirm no broken references**

```bash
npm run typecheck 2>&1 | head -30
```

Expected: No errors about `graph` or `mcp-server`. There will be other errors from Tasks 3–9 still pending — that is expected.

- [ ] **Step 5: Commit**

```bash
git add src/cli.ts
git commit -m "feat: remove graph and mcp-server from CLI"
```

---

### Task 5: Fix `src/discovery/index.ts` — remove graph scoring

**Files:**
- Modify: `src/discovery/index.ts`

- [ ] **Step 1: Remove graph imports**

Remove these three lines (around lines 22–24):
```typescript
import { ensureGraphBuilt } from "../graph/index.js";
import type { LHImportGraph } from "../graph/import-graph.js";
import { applyGraphScoring } from "./graph-scorer.js";
```

- [ ] **Step 2: Remove graph scoring logic in `runDiscovery`**

Find the block that uses the graph (around lines 100–135):
```typescript
let importGraph: LHImportGraph | null = null;
```
and the block that builds and applies the graph:
```typescript
try {
  const builtGraph = await ensureGraphBuilt(root);
  importGraph = builtGraph.importGraph;
} catch {
  // graph build is best-effort; discovery proceeds without it
}

if (importGraph) {
  const scoredResult = applyGraphScoring(search.candidates, importGraph);
  search.candidates = scoredResult.candidates;
  search.notes.push(...scoredResult.notes);
}
```

Remove the `let importGraph: LHImportGraph | null = null;` declaration and the entire try/catch + if block. The `resolveImportChain` call above it stays.

- [ ] **Step 3: Remove `importGraph` from `buildBoundary` call**

Find the `buildBoundary(...)` call further down in the same function. It receives an object that includes `importGraph`. Remove that property from the call:
```typescript
// Before:
importGraph,
// After: (just delete that line from the object literal)
```

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck 2>&1 | grep "discovery/index" | head -10
```

Expected: No errors from `src/discovery/index.ts`

- [ ] **Step 5: Commit**

```bash
git add src/discovery/index.ts
git commit -m "feat: remove graph scoring from discovery"
```

---

### Task 6: Fix `src/discovery/boundary.ts` — remove graph boundary close

**Files:**
- Modify: `src/discovery/boundary.ts`

- [ ] **Step 1: Remove graph imports**

Remove these two lines (lines 6–7):
```typescript
import type { LHImportGraph } from "../graph/import-graph.js";
import { graphBoundaryClose } from "../graph/import-graph.js";
```

- [ ] **Step 2: Remove `importGraph` from `BoundaryBuildInput` interface**

Find the interface (around line 9) and remove:
```typescript
importGraph?: LHImportGraph | null | undefined;
```

- [ ] **Step 3: Remove `importGraph` from `buildBoundary` closure gaps logic**

Find the closure gaps calculation (around line 312):
```typescript
const closureGaps = importGraph
  ? graphBoundaryClose(importGraph, touchFilePaths)
  : [];
```

Replace with:
```typescript
const closureGaps: string[] = [];
```

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck 2>&1 | grep "discovery/boundary" | head -10
```

Expected: No errors from `src/discovery/boundary.ts`

- [ ] **Step 5: Commit**

```bash
git add src/discovery/boundary.ts
git commit -m "feat: remove graph boundary close from boundary builder"
```

---

### Task 7: Fix `src/context/compiler.ts` — remove knowledge graph

**Files:**
- Modify: `src/context/compiler.ts`

- [ ] **Step 1: Remove knowledge graph import (line 19)**

Remove:
```typescript
import { queryKnowledge, renderKnowledgeSection, type KnowledgeNode } from "../graph/knowledge-graph.js";
```

- [ ] **Step 2: Remove `knowledgeNodes` from `CompiledTaskContext` interface**

Find the interface definition and remove:
```typescript
knowledgeNodes?: KnowledgeNode[] | undefined;
```

- [ ] **Step 3: Remove knowledge graph query in `compileTaskContext`**

Find and remove (around lines 93–97):
```typescript
let knowledgeNodes: KnowledgeNode[] = [];
try {
  knowledgeNodes = await queryKnowledge(root, relevantPaths);
} catch (err) {
  warnings.push(`Knowledge graph query failed (best-effort): ${String(err)}`);
}
```

- [ ] **Step 4: Remove `knowledgeNodes` from the returned object**

Find `knowledgeNodes,` in the return object (around line 141) and remove it.

- [ ] **Step 5: Remove knowledge section from context rendering**

Find the block that renders knowledge into the context (around lines 272–276):
```typescript
if (input.knowledgeNodes && input.knowledgeNodes.length > 0) {
  sections.push({
    label: "knowledge",
    // ...
    content: `## Related Knowledge\n\n${truncateSection(renderKnowledgeSection(input.knowledgeNodes), 3000)}`,
  });
}
```
Remove it entirely.

- [ ] **Step 6: Run typecheck**

```bash
npm run typecheck 2>&1 | grep "context/compiler" | head -10
```

Expected: No errors from `src/context/compiler.ts`

- [ ] **Step 7: Commit**

```bash
git add src/context/compiler.ts
git commit -m "feat: remove knowledge graph from context compiler"
```

---

### Task 8: Fix `src/memory/index.ts` — remove knowledge graph re-exports

**Files:**
- Modify: `src/memory/index.ts`

- [ ] **Step 1: Remove the re-export block at the bottom of the file (lines 203–214)**

Remove:
```typescript
// Re-export knowledge graph operations (structured memory layer)
export {
  appendKnowledge,
  linkKnowledge,
  queryKnowledge,
  queryKnowledgeByFeature,
  renderKnowledgeSection,
  type KnowledgeNode,
  type KnowledgeKind,
  type KnowledgeEdgeKind,
  type LHKnowledgeGraph,
} from "../graph/knowledge-graph.js";
```

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck 2>&1 | grep "memory/index" | head -10
```

Expected: No errors from `src/memory/index.ts`

- [ ] **Step 3: Check if anything imports these re-exported types from memory**

```bash
grep -rn "from.*memory.*knowledge\|from.*memory.*Knowledge\|from.*memory.*appendKnowledge\|from.*memory.*queryKnowledge" src/ tests/
```

Expected: No results. If results appear, remove those usages too.

- [ ] **Step 4: Commit**

```bash
git add src/memory/index.ts
git commit -m "feat: remove knowledge graph re-exports from memory module"
```

---

### Task 9: Fix `src/commands/doctor.ts` — remove graph health checks

**Files:**
- Modify: `src/commands/doctor.ts`

- [ ] **Step 1: Remove graph import (line 8)**

Remove:
```typescript
import { ensureGraphBuilt } from "../graph/index.js";
```

- [ ] **Step 2: Remove `.lh/graph/import-graph.json` check (around lines 184–189)**

Remove this check object from the checks array:
```typescript
const importGraphFile = harnessPath(cwd, "graph/import-graph.json");
// ...
? { name: ".lh/graph/import-graph.json", status: "pass", message: "present" }
: { name: ".lh/graph/import-graph.json", status: "warn", message: "missing — run `lh graph build`" },
```

- [ ] **Step 3: Remove `.lh/graph/symbol-graph.json` check (around lines 191–195)**

Remove similarly:
```typescript
const symbolGraphFile = harnessPath(cwd, "graph/symbol-graph.json");
// ...
? { name: ".lh/graph/symbol-graph.json", status: "pass", message: "present" }
: { name: ".lh/graph/symbol-graph.json", status: "warn", message: "missing — run `lh graph build`" },
```

- [ ] **Step 4: Remove `.lh/graph/` paths from the fixable paths list (around lines 419–420)**

Remove:
```typescript
".lh/graph/import-graph.json",
".lh/graph/symbol-graph.json",
```

- [ ] **Step 5: Remove graph rebuild logic in `--fix` handler (around lines 539–562)**

Remove:
```typescript
const importGraphCheck = checks.find((c) => c.name === ".lh/graph/import-graph.json");
const symbolGraphCheck = checks.find((c) => c.name === ".lh/graph/symbol-graph.json");
// ...
await ensureGraphBuilt(cwd);
// ...the entire if/catch block around it
```

- [ ] **Step 6: Run typecheck**

```bash
npm run typecheck 2>&1 | grep "commands/doctor" | head -10
```

Expected: No errors from `src/commands/doctor.ts`

- [ ] **Step 7: Commit**

```bash
git add src/commands/doctor.ts
git commit -m "feat: remove graph health checks from doctor command"
```

---

### Task 10: Verify clean compile and full test suite

**Files:** No changes — verification only

- [ ] **Step 1: Run full typecheck**

```bash
npm run typecheck
```

Expected: Exit code 0, no errors.

- [ ] **Step 2: Run full test suite**

```bash
npm test 2>&1 | tail -30
```

Expected: All tests pass. The deleted graph tests are gone; no new failures.

- [ ] **Step 3: If typecheck or tests fail, fix the issue before proceeding**

Common issues to check:
- Any file that imported re-exported knowledge graph types from `src/memory/index.ts`
- Any test file that references graph functions

Run to find remaining references:
```bash
grep -rn "from.*graph" src/ tests/ --include="*.ts" | grep -v "\.lh/"
```

Expected: No results. If results appear, remove those imports/usages.

- [ ] **Step 4: Commit if any additional fixes were needed**

```bash
git add -A
git commit -m "fix: resolve remaining graph import references"
```

---

### Task 11: Write failing tests for graphify installation

**Files:**
- Create: `tests/commands/init-graphify.test.ts`
- Modify: `tests/commands/init-e2e.test.ts` (add child_process mock)

- [ ] **Step 1: Add child_process mock to `tests/commands/init-e2e.test.ts`**

`vi` is already imported in this file. Add the `vi.mock` call right after the existing imports (Vitest hoists it automatically):

```typescript
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
```

- [ ] **Step 2: Run existing init-e2e tests to confirm they still pass**

```bash
npm test tests/commands/init-e2e.test.ts
```

Expected: All existing tests pass (graphify install is mocked to succeed).

- [ ] **Step 3: Create `tests/commands/init-graphify.test.ts` with failing tests**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CLIError } from "../../src/core/errors.js";

// Mock child_process before importing the module under test
const mockSpawnSync = vi.fn();
const mockExecSync = vi.fn();

vi.mock("node:child_process", () => ({
  spawnSync: mockSpawnSync,
  execSync: mockExecSync,
}));

import {
  checkPythonVersion,
  checkGraphifyInstalled,
  runGraphifyInstall,
} from "../../src/commands/init.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkPythonVersion", () => {
  it("returns ok=true for Python 3.10", () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: "Python 3.10.0\n", stderr: "", error: undefined });
    const result = checkPythonVersion();
    expect(result.ok).toBe(true);
    expect(result.version).toBe("3.10");
  });

  it("returns ok=true for Python 3.11", () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: "Python 3.11.2\n", stderr: "", error: undefined });
    expect(checkPythonVersion().ok).toBe(true);
  });

  it("returns ok=false for Python 3.9", () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: "Python 3.9.7\n", stderr: "", error: undefined });
    const result = checkPythonVersion();
    expect(result.ok).toBe(false);
    expect(result.version).toBe("3.9");
  });

  it("returns ok=false when python3 is not found", () => {
    mockSpawnSync.mockReturnValue({ status: 1, stdout: "", stderr: "", error: new Error("not found") });
    expect(checkPythonVersion().ok).toBe(false);
  });
});

describe("checkGraphifyInstalled", () => {
  it("returns true when graphify --version exits 0", () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: "graphify 1.2.0\n", stderr: "", error: undefined });
    expect(checkGraphifyInstalled()).toBe(true);
  });

  it("returns false when graphify --version exits non-zero", () => {
    mockSpawnSync.mockReturnValue({ status: 127, stdout: "", stderr: "", error: undefined });
    expect(checkGraphifyInstalled()).toBe(false);
  });

  it("returns false when graphify command throws", () => {
    mockSpawnSync.mockReturnValue({ status: 1, error: new Error("ENOENT") });
    expect(checkGraphifyInstalled()).toBe(false);
  });
});

describe("runGraphifyInstall", () => {
  const mockLog = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    colors: { bold: (s: string) => s },
  } as any;

  it("throws CLIError when Python version is too old", async () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: "Python 3.9.0\n", stderr: "", error: undefined });
    await expect(runGraphifyInstall("claude-code", mockLog, false)).rejects.toThrow(CLIError);
  });

  it("throws CLIError when Python is not found", async () => {
    mockSpawnSync.mockReturnValue({ status: 1, stdout: "", stderr: "", error: new Error("not found") });
    await expect(runGraphifyInstall("claude-code", mockLog, false)).rejects.toThrow(CLIError);
  });

  it("skips pip install when graphify is already installed", async () => {
    mockSpawnSync
      .mockReturnValueOnce({ status: 0, stdout: "Python 3.11.0\n", stderr: "", error: undefined }) // python check
      .mockReturnValueOnce({ status: 0, stdout: "graphify 1.0\n", stderr: "", error: undefined }); // graphify check
    await runGraphifyInstall("claude-code", mockLog, false);
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it("runs pip install when graphify is not installed", async () => {
    mockSpawnSync
      .mockReturnValueOnce({ status: 0, stdout: "Python 3.11.0\n", stderr: "", error: undefined }) // python check
      .mockReturnValueOnce({ status: 1, error: new Error("not found") }); // graphify not found
    await runGraphifyInstall("claude-code", mockLog, false);
    expect(mockExecSync).toHaveBeenCalledWith(
      "pip install graphifyy && graphify install",
      expect.any(Object),
    );
  });

  it("runs graphify opencode install for opencode host", async () => {
    mockSpawnSync
      .mockReturnValueOnce({ status: 0, stdout: "Python 3.11.0\n", stderr: "", error: undefined })
      .mockReturnValueOnce({ status: 0, stdout: "graphify 1.0\n", stderr: "", error: undefined }); // already installed
    await runGraphifyInstall("opencode", mockLog, false);
    expect(mockExecSync).toHaveBeenCalledWith(
      "graphify opencode install",
      expect.any(Object),
    );
  });

  it("runs graphify opencode install for all host", async () => {
    mockSpawnSync
      .mockReturnValueOnce({ status: 0, stdout: "Python 3.11.0\n", stderr: "", error: undefined })
      .mockReturnValueOnce({ status: 0, stdout: "graphify 1.0\n", stderr: "", error: undefined });
    await runGraphifyInstall("all", mockLog, false);
    expect(mockExecSync).toHaveBeenCalledWith(
      "graphify opencode install",
      expect.any(Object),
    );
  });

  it("does not run graphify opencode install for claude-code host", async () => {
    mockSpawnSync
      .mockReturnValueOnce({ status: 0, stdout: "Python 3.11.0\n", stderr: "", error: undefined })
      .mockReturnValueOnce({ status: 0, stdout: "graphify 1.0\n", stderr: "", error: undefined });
    await runGraphifyInstall("claude-code", mockLog, false);
    expect(mockExecSync).not.toHaveBeenCalledWith(
      "graphify opencode install",
      expect.any(Object),
    );
  });

  it("throws CLIError when pip install fails", async () => {
    mockSpawnSync
      .mockReturnValueOnce({ status: 0, stdout: "Python 3.11.0\n", stderr: "", error: undefined })
      .mockReturnValueOnce({ status: 1, error: new Error("not found") });
    mockExecSync.mockImplementation(() => { throw new Error("pip failed"); });
    await expect(runGraphifyInstall("claude-code", mockLog, false)).rejects.toThrow(CLIError);
  });
});
```

- [ ] **Step 4: Run the new tests to confirm they fail**

```bash
npm test tests/commands/init-graphify.test.ts 2>&1 | tail -20
```

Expected: Tests fail with errors like `checkPythonVersion is not a function` or similar — the functions don't exist yet. This confirms the tests are correctly written and waiting for implementation.

- [ ] **Step 5: Commit**

```bash
git add tests/commands/init-graphify.test.ts tests/commands/init-e2e.test.ts
git commit -m "test: add failing tests for graphify installation in lh init"
```

---

### Task 12: Implement graphify installation in `src/commands/init.ts`

**Files:**
- Modify: `src/commands/init.ts`

- [ ] **Step 1: Add `child_process` import at the top of `src/commands/init.ts`**

Add after the existing imports (after the last `import` line):
```typescript
import { spawnSync, execSync } from "node:child_process";
```

- [ ] **Step 2: Add the exported helper functions before `runInitCommand`**

Insert these three functions before the `runInitCommand` export:

```typescript
export function checkPythonVersion(): { ok: boolean; version: string } {
  try {
    const result = spawnSync("python3", ["--version"], { encoding: "utf-8" });
    if (result.status !== 0 || result.error) return { ok: false, version: "" };
    const output = (result.stdout || result.stderr || "").trim();
    const match = /Python (\d+)\.(\d+)/.exec(output);
    if (!match) return { ok: false, version: output };
    const major = parseInt(match[1]!, 10);
    const minor = parseInt(match[2]!, 10);
    const ok = major > 3 || (major === 3 && minor >= 10);
    return { ok, version: `${major}.${minor}` };
  } catch {
    return { ok: false, version: "" };
  }
}

export function checkGraphifyInstalled(): boolean {
  try {
    const result = spawnSync("graphify", ["--version"], { encoding: "utf-8" });
    return result.status === 0 && !result.error;
  } catch {
    return false;
  }
}

export async function runGraphifyInstall(
  host: InitHost | undefined,
  log: ReturnType<typeof createLogger>,
  json: boolean,
): Promise<{ warnings: string[] }> {
  const warnings: string[] = [];

  const python = checkPythonVersion();
  if (!python.ok) {
    const found = python.version ? `Found Python ${python.version}.` : "Python 3 not found.";
    throw new CLIError(
      `Graphify requires Python 3.10 or later. ${found}\n` +
        `Install Python 3.10+ from https://python.org and re-run lh init.`,
    );
  }
  if (!json) log.info(`  Python ${python.version} (ok)`);

  const alreadyInstalled = checkGraphifyInstalled();
  if (alreadyInstalled) {
    if (!json) log.info("  graphify already installed (skipped)");
  } else {
    if (!json) log.info("  installing graphify...");
    try {
      execSync("pip install graphifyy && graphify install", {
        stdio: json ? "pipe" : "inherit",
      });
    } catch (err) {
      throw new CLIError(
        `Failed to install graphify. Run manually: pip install graphifyy && graphify install\n` +
          `Error: ${String(err)}`,
      );
    }
    if (!json) log.info("  graphify installed");
  }

  const needsOpenCode = host === "opencode" || host === "all";
  if (needsOpenCode) {
    if (!json) log.info("  configuring graphify for OpenCode...");
    try {
      execSync("graphify opencode install", { stdio: json ? "pipe" : "inherit" });
    } catch (err) {
      const msg = `graphify opencode install failed: ${String(err)}`;
      warnings.push(msg);
      if (!json) log.warn(`  ${msg}`);
    }
    if (!json) log.info("  graphify OpenCode integration configured");
  }

  return { warnings };
}
```

- [ ] **Step 3: Call `runGraphifyInstall` in `runInitCommand` after the host packs are installed**

Find the section in `runInitCommand` after the `installClaudeCode` and `installOpenCode` blocks (around line 163), just before the `isGlobal` check. Add:

```typescript
  // --- graphify installation ---
  if (!json) {
    log.info("");
    log.info("Graphify installation:");
  }
  const graphifyResult = await runGraphifyInstall(parsedHost, log, json);
  result.warnings.push(...graphifyResult.warnings);
```

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck 2>&1 | grep "commands/init" | head -10
```

Expected: No errors from `src/commands/init.ts`

- [ ] **Step 5: Commit**

```bash
git add src/commands/init.ts
git commit -m "feat: add graphify installation to lh init"
```

---

### Task 13: Run graphify tests to verify they pass

**Files:** No changes — verification only

- [ ] **Step 1: Run graphify-specific tests**

```bash
npm test tests/commands/init-graphify.test.ts
```

Expected: All tests pass.

- [ ] **Step 2: Run full init test suite**

```bash
npm test tests/commands/init-e2e.test.ts tests/commands/init-global.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: All tests pass.

---

### Task 14: Update `lh-discover` Claude Code skill

**Files:**
- Modify: `src/commands/init-claude-code.ts` — update `createCCSkillDiscover()`

- [ ] **Step 1: Find `createCCSkillDiscover` in `src/commands/init-claude-code.ts`**

The function starts around line 1759 and returns a multi-line string. The section to update is the **Workflow** section (around steps 5–6) and the **On-Demand Discovery Rules** section.

- [ ] **Step 2: Replace the D0-D4 workflow section**

Find and replace the existing workflow steps 5–10:
```markdown
5. **Perform discovery.** Explore in levels, starting at the configured default depth (usually D2):
   - **D0 — Repo shape:** Package manager, major folders, framework clues, test command candidates.
   - **D1 — Candidate surfaces:** Files likely related to the feature (routes, components, services, models), obvious tests.
   - **D2 — Dependency boundary:** Imports, callers, callees, neighboring tests, shared utilities, edit vs. read-only distinction.
   - **D3 — Risk probes:** Focused test runs, migration inspection, security-sensitive paths, permissions/auth/payment checks.
   - **D4 — Deep dive:** Broader architecture inspection only when necessary.
6. **Stop when sufficient.** ...
```

With:
```markdown
5. **Perform discovery.** Explore in levels, starting at the configured default depth (usually D2):
   - **D0 — Repo shape:** Check for `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `Makefile`. Use `find` / `ls` for these config files only. Identify package manager, major folders, framework clues, and test command candidates.
   - **D1 — Seed files:** Invoke `/graphify` with the feature description and goal as input. Use graphify's semantic search to identify files most relevant to the feature. Do not use grep or glob for seed discovery.
   - **D2 — Dependency boundary:** Use graphify neighbor traversal from the D1 seed files to find imports, callees, callers, neighboring tests, and shared utilities. Distinguish edit vs. read-only files using graphify relationship data.
   - **D3 — Risk probes:** Use graphify symbol lookup to find auth, payment, permission, and security-sensitive paths. Run focused test commands to detect failures. Do not use grep for symbol discovery.
   - **D4 — Deep dive:** Use graphify relationship queries for broader architecture inspection. Only escalate when D0–D3 is insufficient.
6. **Stop when sufficient.** ...
```

- [ ] **Step 3: Replace the On-Demand Discovery Rules section**

Find:
```markdown
## On-Demand Discovery Rules

- Do not create a full repo map by default.
- Do not read large unrelated files.
- Prefer exact paths and commands.
```

Replace with:
```markdown
## On-Demand Discovery Rules

- Do not create a full repo map by default.
- Do not read large unrelated files.
- **Use graphify for D1–D4.** Do not use grep or glob for finding seed files, dependency traversal, or symbol lookup. Graphify provides semantic graph navigation that replaces grep/glob for all graph-aware discovery.
- **D0 only:** Use `find` / `ls` for config file existence checks (package.json, pyproject.toml, go.mod, etc.).
- Prefer exact paths and commands.
```

- [ ] **Step 4: Commit**

```bash
git add src/commands/init-claude-code.ts
git commit -m "feat: update lh-discover skill to use graphify for D1-D4"
```

---

### Task 15: Update `lh-scout` agent content (Claude Code + OpenCode)

**Files:**
- Modify: `src/commands/init-claude-code.ts` — update `createCCAgentScout()`
- Modify: `src/commands/init.ts` — update `createAgentScout()` for OpenCode

- [ ] **Step 1: Update `createCCAgentScout` in `src/commands/init-claude-code.ts`**

Find the `## Discovery rules` section inside `createCCAgentScout()` and add graphify rules:

Find:
```markdown
## Discovery rules

- Do not edit files.
- Do not create a full repo map by default.
- Do not read large unrelated files.
- Prefer search, targeted reads, and exact paths.
```

Replace with:
```markdown
## Discovery rules

- Do not edit files.
- Do not create a full repo map by default.
- Do not read large unrelated files.
- **Use graphify for D1–D4.** Invoke `/graphify` for seed file discovery (D1), neighbor traversal (D2), symbol lookup (D3), and relationship queries (D4). Do not use grep or glob for graph-aware discovery.
- **D0 only:** Use `find` / `ls` for config file existence checks (package.json, pyproject.toml, go.mod, etc.).
- Prefer exact paths and targeted reads.
```

- [ ] **Step 2: Update `createAgentScout` (OpenCode) in `src/commands/init.ts`**

Find the OpenCode `createAgentScout()` function (returns the `lh-scout.md` content for OpenCode agents). Apply the same rule addition to its `## Rules` or `## Discovery rules` section:

Find:
```markdown
- Do not edit files or implement the feature.
- Prefer search, targeted reads, and exact paths.
```

Replace with:
```markdown
- Do not edit files or implement the feature.
- **Use graphify for D1–D4.** Use graphify semantic search for seed discovery (D1), neighbor traversal for dependency boundary (D2), symbol lookup for risk probes (D3), and relationship queries for deep dive (D4). Do not use grep or glob for graph-aware discovery.
- **D0 only:** Use `find` / `ls` for config file existence checks (package.json, pyproject.toml, go.mod, etc.).
- Prefer exact paths and targeted reads.
```

- [ ] **Step 3: Commit**

```bash
git add src/commands/init-claude-code.ts src/commands/init.ts
git commit -m "feat: update lh-scout agent to use graphify for D1-D4"
```

---

### Task 16: Update OpenCode `lh-discover` command template

**Files:**
- Modify: `src/commands/opencode-command-bundles/lh-discover.md`
- Modify: `src/commands/init.ts` — if `lh-discover.md` content is generated inline

- [ ] **Step 1: Check how OpenCode lh-discover content is generated**

```bash
grep -n "lh-discover\|lh_discover\|createOpenCodeCommandFiles" src/commands/init.ts src/commands/load-opencode-commands.ts | head -20
```

- [ ] **Step 2: Update the lh-discover OpenCode command template**

Open `src/commands/opencode-command-bundles/lh-discover.md`. Find the discovery levels section and apply the same D0-D4 update as in Task 14:

Replace the D1–D4 descriptions to reference graphify:
```markdown
- **D0 — Repo shape:** Check for package.json, pyproject.toml, go.mod, Cargo.toml, Makefile using find/ls. Identify package manager, framework, and test commands.
- **D1 — Seed files:** Use graphify semantic search with the feature description to identify relevant files. Do not use grep or glob for D1.
- **D2 — Dependency boundary:** Use graphify neighbor traversal from D1 seeds to find imports, callees, tests, and utilities.
- **D3 — Risk probes:** Use graphify symbol lookup for auth, payment, security paths. Run targeted test commands.
- **D4 — Deep dive:** Use graphify relationship queries for broader inspection only when D0–D3 is insufficient.
```

Also add to the discovery rules:
```markdown
- Use graphify for D1–D4. Do not use grep or glob for graph-aware discovery.
- D0 only: use find/ls for config file existence checks.
```

- [ ] **Step 3: Commit**

```bash
git add src/commands/opencode-command-bundles/lh-discover.md src/commands/init.ts src/commands/load-opencode-commands.ts
git commit -m "feat: update OpenCode lh-discover command to use graphify for D1-D4"
```

---

### Task 17: Replace `docs/graph.md` with graphify integration guide

**Files:**
- Modify: `docs/graph.md`

- [ ] **Step 1: Replace the entire contents of `docs/graph.md`**

```markdown
# Graphify Integration

LeanHarness uses [Graphify](https://graphify.net) for code graph navigation. Graphify is an LLM-powered knowledge graph tool that provides semantic search, neighbor traversal, and symbol lookup.

## Installation

Graphify is installed automatically during `lh init`. Requirements:

- Python 3.10 or later
- `pip` (comes with Python)

Manual install:

```bash
pip install graphifyy && graphify install          # Claude Code
graphify opencode install                          # OpenCode (additional step)
```

## How LeanHarness uses Graphify

Graphify replaces grep/glob for all D1–D4 discovery:

| Discovery Level | Method |
|----------------|--------|
| D0 — Repo shape | `find`/`ls` for config files (`package.json`, etc.) |
| D1 — Seed files | Graphify semantic search on the feature description |
| D2 — Dependency boundary | Graphify neighbor traversal from seed files |
| D3 — Risk probes | Graphify symbol lookup + targeted reads |
| D4 — Deep dive | Graphify relationship queries |

## Graph freshness

Graphify manages its own graph freshness. LeanHarness does not trigger graph builds. If Graphify reports a stale graph, follow its instructions to rebuild.

## Troubleshooting

**`graphify` command not found**  
Run: `pip install graphifyy && graphify install`

**Python version error**  
Graphify requires Python 3.10+. Check: `python3 --version`

**OpenCode integration missing**  
Run: `graphify opencode install`
```

- [ ] **Step 2: Commit**

```bash
git add docs/graph.md
git commit -m "docs: replace internal graph doc with graphify integration guide"
```

---

### Task 18: Final verification

**Files:** No changes — verification only

- [ ] **Step 1: Run full typecheck**

```bash
npm run typecheck
```

Expected: Exit code 0.

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 3: Verify no remaining internal graph references in src/**

```bash
grep -rn "from.*\.\./graph\|from.*\./graph\|graph-scorer\|ensureGraphBuilt\|mcp-server\|runGraphCommand\|runMcpServer" src/ --include="*.ts"
```

Expected: No results.

- [ ] **Step 4: Verify AC checklist from spec**

Check each acceptance criterion in `docs/superpowers/specs/2026-05-29-graphify-skill-design.md`:
- AC-01: Python check in `checkPythonVersion()` ✓
- AC-02: Graphify installed check in `checkGraphifyInstalled()` ✓
- AC-03: `pip install graphifyy && graphify install` in `runGraphifyInstall()` ✓
- AC-04: `graphify opencode install` for opencode/all hosts ✓
- AC-05: `src/graph/`, `graph-scorer.ts`, `mcp-server.ts`, `graph.ts` deleted ✓
- AC-06: Graph tests deleted ✓
- AC-07: No `graph:` section in config template ✓ (was not in template to begin with)
- AC-08: `docs/graph.md` replaced ✓
- AC-09: `lh-discover` CC skill uses graphify D1–D4 ✓
- AC-10: `lh-discover` OpenCode command uses graphify D1–D4 ✓
- AC-11: `lh-scout` agent references graphify ✓
- AC-12: All tests pass ✓

- [ ] **Step 5: Final commit if any last-minute fixes were applied**

```bash
git add -A
git commit -m "chore: final verification and cleanup for graphify integration"
```
