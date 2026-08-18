import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { resolveOpenCodeAgentsDir } from "./opencode-vendor-resolve.js";

const AGENT_NAMES = [
  "lh-scout.md",
  "lh-builder.md",
  "lh-builder-fix.md",
  "lh-reviewer.md",
  "lh-verifier.md",
  "lh-compressor.md",
] as const;

export interface OpenCodeAgentFileEntry {
  filename: string;
  content: string;
}

/**
 * LeanHarness-managed OpenCode agent templates, vendored from the hosts/opencode workspace
 * package at build time (see scripts/copy-opencode-vendor.mjs).
 */
export function loadOpenCodeAgentFiles(): OpenCodeAgentFileEntry[] {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const bundleDir = resolveOpenCodeAgentsDir(dir);
  return AGENT_NAMES.map((filename) => ({
    filename,
    content: readFileSync(path.join(bundleDir, filename), "utf-8"),
  }));
}
