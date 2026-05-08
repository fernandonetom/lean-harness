import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { discoverPluginDirs, loadPluginManifest, loadAllPlugins } from "../../src/plugins/loader.js";

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = path.join(os.tmpdir(), `lh-plugin-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(path.join(tmpRoot, ".lh", "plugins"), { recursive: true });
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

describe("discoverPluginDirs", () => {
  it("returns empty when no plugins dir", async () => {
    const emptyRoot = path.join(os.tmpdir(), `lh-empty-${Date.now()}`);
    await mkdir(emptyRoot, { recursive: true });
    const dirs = await discoverPluginDirs(emptyRoot);
    expect(dirs).toEqual([]);
    await rm(emptyRoot, { recursive: true, force: true });
  });

  it("finds plugin directories", async () => {
    await mkdir(path.join(tmpRoot, ".lh", "plugins", "my-plugin"), { recursive: true });
    await mkdir(path.join(tmpRoot, ".lh", "plugins", "other-plugin"), { recursive: true });
    const dirs = await discoverPluginDirs(tmpRoot);
    expect(dirs).toHaveLength(2);
    expect(dirs.map((d) => path.basename(d)).sort()).toEqual(["my-plugin", "other-plugin"]);
  });

  it("ignores files in plugins directory", async () => {
    await writeFile(path.join(tmpRoot, ".lh", "plugins", "readme.txt"), "ignore me");
    const dirs = await discoverPluginDirs(tmpRoot);
    expect(dirs).toEqual([]);
  });
});

describe("loadPluginManifest", () => {
  it("loads valid manifest", async () => {
    const pluginDir = path.join(tmpRoot, ".lh", "plugins", "test-plugin");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(path.join(pluginDir, "plugin.json"), JSON.stringify({
      name: "test-plugin",
      version: "1.0.0",
      main: "index.js",
    }));
    const manifest = await loadPluginManifest(pluginDir);
    expect(manifest).toEqual({ name: "test-plugin", version: "1.0.0", main: "index.js" });
  });

  it("defaults main to index.js when missing", async () => {
    const pluginDir = path.join(tmpRoot, ".lh", "plugins", "default-main");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(path.join(pluginDir, "plugin.json"), JSON.stringify({
      name: "default-main",
      version: "0.1.0",
    }));
    const manifest = await loadPluginManifest(pluginDir);
    expect(manifest?.main).toBe("index.js");
  });

  it("returns null for missing manifest", async () => {
    const pluginDir = path.join(tmpRoot, ".lh", "plugins", "no-manifest");
    await mkdir(pluginDir, { recursive: true });
    const manifest = await loadPluginManifest(pluginDir);
    expect(manifest).toBeNull();
  });

  it("returns null for invalid JSON", async () => {
    const pluginDir = path.join(tmpRoot, ".lh", "plugins", "bad-json");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(path.join(pluginDir, "plugin.json"), "not json");
    const manifest = await loadPluginManifest(pluginDir);
    expect(manifest).toBeNull();
  });

  it("returns null when name missing", async () => {
    const pluginDir = path.join(tmpRoot, ".lh", "plugins", "no-name");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(path.join(pluginDir, "plugin.json"), JSON.stringify({ version: "1.0.0" }));
    const manifest = await loadPluginManifest(pluginDir);
    expect(manifest).toBeNull();
  });
});

describe("loadAllPlugins", () => {
  it("returns errors for plugin dirs missing entry file", async () => {
    const pluginDir = path.join(tmpRoot, ".lh", "plugins", "broken");
    await mkdir(pluginDir, { recursive: true });
    await writeFile(path.join(pluginDir, "plugin.json"), JSON.stringify({
      name: "broken",
      version: "1.0.0",
    }));
    const results = await loadAllPlugins(tmpRoot);
    expect(results).toHaveLength(1);
    expect(results[0]!.error).toBeDefined();
  });

  it("returns empty for no plugins", async () => {
    const results = await loadAllPlugins(tmpRoot);
    expect(results).toEqual([]);
  });
});
