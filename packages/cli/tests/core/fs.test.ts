import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fsp from "node:fs/promises";
import {
  pathExists,
  fileExists,
  dirExists,
  ensureDir,
  readTextFile,
  writeTextFile,
  readJsonFile,
  writeJsonFile,
  listDirs,
  listFiles,
} from "../../src/core/fs.js";
import { createTempWorkspace, type TestWorkspace } from "../helpers/workspace.js";

let ws: TestWorkspace;

beforeEach(async () => {
  ws = await createTempWorkspace();
});

afterEach(async () => {
  await ws.cleanup();
});

describe("pathExists", () => {
  it("returns true for an existing directory", async () => {
    expect(await pathExists(ws.root)).toBe(true);
  });

  it("returns true for an existing file", async () => {
    const fp = path.join(ws.root, "file.txt");
    await fsp.writeFile(fp, "hello");
    expect(await pathExists(fp)).toBe(true);
  });

  it("returns false for a missing path", async () => {
    expect(await pathExists(path.join(ws.root, "nope"))).toBe(false);
  });
});

describe("fileExists", () => {
  it("returns true for a file", async () => {
    const fp = path.join(ws.root, "file.txt");
    await fsp.writeFile(fp, "data");
    expect(await fileExists(fp)).toBe(true);
  });

  it("returns false for a directory", async () => {
    expect(await fileExists(ws.root)).toBe(false);
  });

  it("returns false for a missing path", async () => {
    expect(await fileExists(path.join(ws.root, "missing.txt"))).toBe(false);
  });
});

describe("dirExists", () => {
  it("returns true for a directory", async () => {
    expect(await dirExists(ws.root)).toBe(true);
  });

  it("returns false for a file", async () => {
    const fp = path.join(ws.root, "file.txt");
    await fsp.writeFile(fp, "data");
    expect(await dirExists(fp)).toBe(false);
  });

  it("returns false for a missing path", async () => {
    expect(await dirExists(path.join(ws.root, "nope"))).toBe(false);
  });
});

describe("ensureDir", () => {
  it("creates a directory recursively", async () => {
    const deep = path.join(ws.root, "a", "b", "c");
    await ensureDir(deep);
    expect(await dirExists(deep)).toBe(true);
  });

  it("is idempotent on an existing directory", async () => {
    const dir = path.join(ws.root, "existing");
    await fsp.mkdir(dir);
    await ensureDir(dir);
    expect(await dirExists(dir)).toBe(true);
  });
});

describe("readTextFile", () => {
  it("reads file content as a string", async () => {
    const fp = path.join(ws.root, "hello.txt");
    await fsp.writeFile(fp, "hello world");
    const content = await readTextFile(fp);
    expect(content).toBe("hello world");
  });

  it("returns null for a missing file", async () => {
    const result = await readTextFile(path.join(ws.root, "missing.txt"));
    expect(result).toBeNull();
  });
});

describe("writeTextFile", () => {
  it("creates a new file and returns 'created'", async () => {
    const fp = path.join(ws.root, "new.txt");
    const result = await writeTextFile(fp, "content");
    expect(result).toBe("created");
    expect(await fsp.readFile(fp, "utf-8")).toBe("content");
  });

  it("skips existing file by default and returns 'skipped'", async () => {
    const fp = path.join(ws.root, "existing.txt");
    await fsp.writeFile(fp, "original");
    const result = await writeTextFile(fp, "new content");
    expect(result).toBe("skipped");
    expect(await fsp.readFile(fp, "utf-8")).toBe("original");
  });

  it("overwrites existing file when overwrite is true and returns 'updated'", async () => {
    const fp = path.join(ws.root, "existing.txt");
    await fsp.writeFile(fp, "original");
    const result = await writeTextFile(fp, "updated content", {
      overwrite: true,
    });
    expect(result).toBe("updated");
    expect(await fsp.readFile(fp, "utf-8")).toBe("updated content");
  });

  it("creates parent directories automatically", async () => {
    const fp = path.join(ws.root, "deep", "nested", "file.txt");
    const result = await writeTextFile(fp, "nested content");
    expect(result).toBe("created");
    expect(await fsp.readFile(fp, "utf-8")).toBe("nested content");
  });
});

describe("readJsonFile", () => {
  it("returns parsed JSON for a valid file", async () => {
    const fp = path.join(ws.root, "data.json");
    await fsp.writeFile(fp, JSON.stringify({ key: "value" }));
    const result = await readJsonFile<{ key: string }>(fp);
    expect(result).toEqual({ key: "value" });
  });

  it("returns null for a missing file", async () => {
    const result = await readJsonFile(path.join(ws.root, "missing.json"));
    expect(result).toBeNull();
  });

  it("throws on invalid JSON", async () => {
    const fp = path.join(ws.root, "bad.json");
    await fsp.writeFile(fp, "not valid json {{{");
    await expect(readJsonFile(fp)).rejects.toThrow("Failed to parse JSON");
  });
});

describe("writeJsonFile", () => {
  it("writes JSON with 2-space indent and trailing newline", async () => {
    const fp = path.join(ws.root, "out.json");
    await writeJsonFile(fp, { hello: "world" });
    const raw = await fsp.readFile(fp, "utf-8");
    expect(raw).toBe('{\n  "hello": "world"\n}\n');
  });

  it("skips existing file by default", async () => {
    const fp = path.join(ws.root, "out.json");
    await fsp.writeFile(fp, '{"old":true}\n');
    const result = await writeJsonFile(fp, { new: true });
    expect(result).toBe("skipped");
    const raw = await fsp.readFile(fp, "utf-8");
    expect(raw).toBe('{"old":true}\n');
  });

  it("overwrites when overwrite is true", async () => {
    const fp = path.join(ws.root, "out.json");
    await fsp.writeFile(fp, '{"old":true}\n');
    const result = await writeJsonFile(fp, { new: true }, { overwrite: true });
    expect(result).toBe("updated");
    const parsed = JSON.parse(await fsp.readFile(fp, "utf-8"));
    expect(parsed).toEqual({ new: true });
  });

  it("creates parent directories automatically", async () => {
    const fp = path.join(ws.root, "sub", "dir", "data.json");
    const result = await writeJsonFile(fp, { nested: true });
    expect(result).toBe("created");
    const parsed = JSON.parse(await fsp.readFile(fp, "utf-8"));
    expect(parsed).toEqual({ nested: true });
  });
});

describe("listDirs", () => {
  it("returns directory names only", async () => {
    await fsp.mkdir(path.join(ws.root, "dirA"));
    await fsp.mkdir(path.join(ws.root, "dirB"));
    await fsp.writeFile(path.join(ws.root, "file.txt"), "data");

    const dirs = await listDirs(ws.root);
    expect(dirs).toContain("dirA");
    expect(dirs).toContain("dirB");
    expect(dirs).not.toContain("file.txt");
  });

  it("returns empty array for a missing directory", async () => {
    const result = await listDirs(path.join(ws.root, "nonexistent"));
    expect(result).toEqual([]);
  });

  it("returns empty array for an empty directory", async () => {
    const empty = path.join(ws.root, "empty");
    await fsp.mkdir(empty);
    const result = await listDirs(empty);
    expect(result).toEqual([]);
  });
});

describe("listFiles", () => {
  it("returns file names only", async () => {
    await fsp.mkdir(path.join(ws.root, "subdir"));
    await fsp.writeFile(path.join(ws.root, "a.txt"), "a");
    await fsp.writeFile(path.join(ws.root, "b.txt"), "b");

    const files = await listFiles(ws.root);
    expect(files).toContain("a.txt");
    expect(files).toContain("b.txt");
    expect(files).not.toContain("subdir");
  });

  it("returns empty array for a missing directory", async () => {
    const result = await listFiles(path.join(ws.root, "nonexistent"));
    expect(result).toEqual([]);
  });

  it("returns empty array for an empty directory", async () => {
    const empty = path.join(ws.root, "empty");
    await fsp.mkdir(empty);
    const result = await listFiles(empty);
    expect(result).toEqual([]);
  });
});
