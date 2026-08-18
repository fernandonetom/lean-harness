import path from "node:path";
import { readdir, stat, readFile } from "node:fs/promises";
import type { LHPlugin, PluginManifest } from "./types.js";
import { harnessPath } from "../core/paths.js";

export async function discoverPluginDirs(root: string): Promise<string[]> {
  const pluginsDir = harnessPath(root, "plugins");
  try {
    const entries = await readdir(pluginsDir, { withFileTypes: true });
    const dirs: string[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        dirs.push(path.join(pluginsDir, entry.name));
      }
    }
    return dirs;
  } catch {
    return [];
  }
}

export async function loadPluginManifest(pluginDir: string): Promise<PluginManifest | null> {
  const manifestPath = path.join(pluginDir, "plugin.json");
  try {
    const raw = await readFile(manifestPath, "utf-8");
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (typeof data["name"] !== "string" || typeof data["version"] !== "string") {
      return null;
    }
    return {
      name: data["name"] as string,
      version: data["version"] as string,
      main: typeof data["main"] === "string" ? data["main"] as string : "index.js",
    };
  } catch {
    return null;
  }
}

export async function loadPlugin(pluginDir: string): Promise<LHPlugin | null> {
  const manifest = await loadPluginManifest(pluginDir);
  if (!manifest) return null;

  const entryPath = path.join(pluginDir, manifest.main);
  try {
    const stats = await stat(entryPath);
    if (!stats.isFile()) return null;
  } catch {
    return null;
  }

  try {
    const mod = await import(entryPath) as Record<string, unknown>;
    const plugin = (mod["default"] ?? mod["plugin"]) as LHPlugin | undefined;
    if (!plugin || typeof plugin.name !== "string" || typeof plugin.version !== "string") {
      return null;
    }
    return plugin;
  } catch {
    return null;
  }
}

export async function loadAllPlugins(root: string): Promise<Array<{ dir: string; plugin: LHPlugin; error?: undefined } | { dir: string; plugin?: undefined; error: string }>> {
  const dirs = await discoverPluginDirs(root);
  const results: Array<{ dir: string; plugin: LHPlugin; error?: undefined } | { dir: string; plugin?: undefined; error: string }> = [];

  for (const dir of dirs) {
    const plugin = await loadPlugin(dir);
    if (plugin) {
      results.push({ dir, plugin });
    } else {
      results.push({ dir, error: `Failed to load plugin from ${path.basename(dir)}` });
    }
  }

  return results;
}
