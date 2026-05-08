import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let cached: string | null = null;

export function getVersion(): string {
  if (cached) return cached;

  const dir = dirname(fileURLToPath(import.meta.url));
  // Walk up from dist/core/ or src/core/ to find package.json
  for (let d = dir; d !== dirname(d); d = dirname(d)) {
    try {
      const raw = readFileSync(join(d, "package.json"), "utf-8");
      const pkg = JSON.parse(raw) as { name?: string; version?: string };
      // Accept legacy and scoped package names so CLI version lookup
      // keeps working after publication/renames.
      if ((pkg.name === "leanharness" || pkg.name === "@feneto/lh") && pkg.version) {
        cached = pkg.version;
        return cached;
      }
    } catch {
      // keep walking up
    }
  }

  cached = "0.0.0";
  return cached;
}
