import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const COMMAND_NAMES = [
  "lh-spec.md",
  "lh-discover.md",
  "lh-plan.md",
  "lh-build.md",
  "lh-check.md",
  "lh-status.md",
  "lh-release.md",
  "lh-do.md",
] as const;

export interface OpenCodeCommandFileEntry {
  filename: string;
  content: string;
}

/** LeanHarness-managed OpenCode slash-command templates (copied to dist on build). */
export function createOpenCodeCommandFiles(): OpenCodeCommandFileEntry[] {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const bundleDir = path.join(dir, "opencode-command-bundles");
  return COMMAND_NAMES.map((filename) => ({
    filename,
    content: readFileSync(path.join(bundleDir, filename), "utf-8"),
  }));
}
