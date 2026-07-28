import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

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

/** LeanHarness-managed OpenCode agent templates (copied to dist on build). */
export function loadOpenCodeAgentFiles(): OpenCodeAgentFileEntry[] {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const bundleDir = path.join(dir, "opencode-agent-bundles");
  return AGENT_NAMES.map((filename) => ({
    filename,
    content: readFileSync(path.join(bundleDir, filename), "utf-8"),
  }));
}
