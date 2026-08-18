import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { resolveOpenCodeCommandsDir } from "./opencode-vendor-resolve.js";

const COMMAND_NAMES = [
  "lh-spec.md",
  "lh-discover.md",
  "lh-plan.md",
  "lh-build.md",
  "lh-check.md",
  "lh-status.md",
  "lh-do.md",
] as const;

export interface OpenCodeCommandFileEntry {
  filename: string;
  content: string;
}

/**
 * LeanHarness-managed OpenCode slash-command templates, vendored from the hosts/opencode
 * workspace package at build time (see scripts/copy-opencode-vendor.mjs).
 */
export function createOpenCodeCommandFiles(): OpenCodeCommandFileEntry[] {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const bundleDir = resolveOpenCodeCommandsDir(dir);
  return COMMAND_NAMES.map((filename) => ({
    filename,
    content: readFileSync(path.join(bundleDir, filename), "utf-8"),
  }));
}
