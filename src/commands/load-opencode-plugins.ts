import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PLUGIN_NAMES = ["shared.js", "leanharness-guardrails.js"] as const;

export interface OpenCodePluginFileEntry {
  filename: string;
  content: string;
}

/** LeanHarness-managed OpenCode plugin files (copied to dist on build). */
export function loadOpenCodePluginFiles(): OpenCodePluginFileEntry[] {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const bundleDir = path.join(dir, "opencode-plugin-bundles");
  return PLUGIN_NAMES.map((filename) => ({
    filename,
    content: readFileSync(path.join(bundleDir, filename), "utf-8"),
  }));
}
