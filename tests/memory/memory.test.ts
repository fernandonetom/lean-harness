import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import {
  readMemory,
  writeMemory,
  appendMemory,
  clearMemory,
  getMemoryStatus,
  resolveMemoryFilePath,
  type MemoryFileKind,
} from "../../src/memory/index.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lh-mem-"));
  await fs.mkdir(path.join(tmpDir, ".lh", "memory"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("resolveMemoryFilePath", () => {
  it("returns default path when no config", () => {
    const p = resolveMemoryFilePath(tmpDir, "project");
    expect(p).toBe(path.resolve(tmpDir, ".lh", "memory", "project.md"));
  });

  it("uses config override path", () => {
    const config = { memory: { project_file: "custom/proj.md" } };
    const p = resolveMemoryFilePath(tmpDir, "project", config);
    expect(p).toBe(path.resolve(tmpDir, "custom", "proj.md"));
  });

  it("resolves all four kinds", () => {
    const kinds: MemoryFileKind[] = ["project", "decisions", "patterns", "cave"];
    for (const k of kinds) {
      const p = resolveMemoryFilePath(tmpDir, k);
      expect(p).toContain(k);
    }
  });
});

describe("readMemory", () => {
  it("returns null for missing file", async () => {
    const result = await readMemory(tmpDir, "project");
    expect(result).toBeNull();
  });

  it("reads existing file", async () => {
    const filePath = path.join(tmpDir, ".lh", "memory", "project.md");
    await fs.writeFile(filePath, "# Test\n\nContent here.\n");
    const result = await readMemory(tmpDir, "project");
    expect(result).toBe("# Test\n\nContent here.\n");
  });
});

describe("writeMemory", () => {
  it("creates new file", async () => {
    const result = await writeMemory(tmpDir, "project", "# New Content\n");
    expect(result).toBe("created");
    const content = await fs.readFile(
      path.join(tmpDir, ".lh", "memory", "project.md"),
      "utf-8",
    );
    expect(content).toBe("# New Content\n");
  });

  it("overwrites existing file", async () => {
    const filePath = path.join(tmpDir, ".lh", "memory", "project.md");
    await fs.writeFile(filePath, "old content");
    const result = await writeMemory(tmpDir, "project", "new content");
    expect(result).toBe("updated");
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("new content");
  });
});

describe("appendMemory", () => {
  it("creates file and appends to new section when file missing", async () => {
    await appendMemory(tmpDir, "project", {
      section: "Tech Stack",
      content: "- Language: TypeScript",
      timestamp: "2024-01-01",
      featureId: "F001",
    });
    const content = await fs.readFile(
      path.join(tmpDir, ".lh", "memory", "project.md"),
      "utf-8",
    );
    expect(content).toContain("## Tech Stack");
    expect(content).toContain("- Language: TypeScript");
    expect(content).toContain("F001");
  });

  it("appends to existing section", async () => {
    const filePath = path.join(tmpDir, ".lh", "memory", "project.md");
    await fs.writeFile(filePath, "# Project Memory\n\n## Tech Stack\n\n- Existing entry\n\n## Other\n\nStuff\n");
    await appendMemory(tmpDir, "project", {
      section: "Tech Stack",
      content: "- Language: Go",
    });
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toContain("- Existing entry");
    expect(content).toContain("- Language: Go");
    expect(content).toContain("## Other");
  });

  it("replaces placeholder text in section", async () => {
    const filePath = path.join(tmpDir, ".lh", "memory", "project.md");
    await fs.writeFile(filePath, "# Project Memory\n\n## Tech Stack\n\n_Discovered on first feature run._\n\n## Other\n\nStuff\n");
    await appendMemory(tmpDir, "project", {
      section: "Tech Stack",
      content: "- Language: Rust",
    });
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toContain("- Language: Rust");
    expect(content).not.toContain("Discovered on first feature run");
  });

  it("creates new section when heading not found", async () => {
    const filePath = path.join(tmpDir, ".lh", "memory", "project.md");
    await fs.writeFile(filePath, "# Project Memory\n\n## Existing\n\nData\n");
    await appendMemory(tmpDir, "project", {
      section: "New Section",
      content: "- Item 1",
    });
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toContain("## New Section");
    expect(content).toContain("- Item 1");
  });
});

describe("clearMemory", () => {
  it("resets file to default template", async () => {
    const filePath = path.join(tmpDir, ".lh", "memory", "project.md");
    await fs.writeFile(filePath, "# Lots of content\n\nStuff here\n");
    await clearMemory(tmpDir, "project");
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toContain("# Project Memory");
    expect(content).not.toContain("Lots of content");
  });

  it("clears decisions file with correct title", async () => {
    const filePath = path.join(tmpDir, ".lh", "memory", "decisions.md");
    await fs.writeFile(filePath, "old");
    await clearMemory(tmpDir, "decisions");
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toContain("# Decision Log");
  });
});

describe("getMemoryStatus", () => {
  it("reports all four files", async () => {
    const status = await getMemoryStatus(tmpDir);
    expect(status.files).toHaveLength(4);
    expect(status.files.map(f => f.kind)).toEqual(["project", "decisions", "patterns", "cave"]);
  });

  it("detects existing vs missing files", async () => {
    await fs.writeFile(
      path.join(tmpDir, ".lh", "memory", "project.md"),
      "# Project\n",
    );
    const status = await getMemoryStatus(tmpDir);
    const project = status.files.find(f => f.kind === "project")!;
    const decisions = status.files.find(f => f.kind === "decisions")!;
    expect(project.exists).toBe(true);
    expect(project.content).toBe("# Project\n");
    expect(decisions.exists).toBe(false);
    expect(decisions.content).toBeNull();
  });
});
