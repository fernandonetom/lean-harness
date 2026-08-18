import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { resolveOpenCodePluginDir, resolveOpenCodePluginPackageSpec } from "./opencode-vendor-resolve.js";

const PLUGIN_NAMES = ["shared.js", "leanharness-guardrails.js"] as const;

export interface OpenCodePluginFileEntry {
  filename: string;
  content: string;
}

/**
 * LeanHarness-managed OpenCode guardrail plugin files, vendored from the hosts/opencode
 * workspace package at build time (see scripts/copy-opencode-vendor.mjs). Used only for the
 * `--local-plugin` fallback — the default install path registers the npm-published
 * @feneto/lh-opencode package in opencode.json instead (see installOpenCodePack in init.ts).
 */
export function loadOpenCodePluginFiles(): OpenCodePluginFileEntry[] {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const bundleDir = resolveOpenCodePluginDir(dir);
  return PLUGIN_NAMES.map((filename) => ({
    filename,
    content: readFileSync(path.join(bundleDir, filename), "utf-8"),
  }));
}

/**
 * npm package name + version of the real OpenCode plugin (@feneto/lh-opencode). Used to register
 * a version-pinned entry in a target repo's opencode.json "plugin" array, without @feneto/lh
 * needing a runtime dependency on the independently-versioned opencode package.
 */
export function loadOpenCodePluginPackageSpec(): string {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  return resolveOpenCodePluginPackageSpec(dir);
}
