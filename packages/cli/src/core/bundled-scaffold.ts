import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { harnessPath } from "./paths.js";
import { writeTextFile } from "./fs.js";

const HOST_NEUTRAL_POLICIES = ["risk-gates.yml", "boundary.yml", "commands.yml"] as const;

export interface BundledScaffoldFile {
  /** Path relative to `.lh/`, e.g. `templates/spec.md` */
  relativePath: string;
  content: string;
}

/** Resolve the bundled `.lh/` directory shipped with the npm package. */
export function resolvePackageLhRoot(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const packageRoot = path.resolve(moduleDir, "../..");
  return path.join(packageRoot, ".lh");
}

function readTree(lhRoot: string, subdir: string): BundledScaffoldFile[] {
  const files: BundledScaffoldFile[] = [];

  function walk(relativeDir: string): void {
    const absDir = path.join(lhRoot, relativeDir);
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      const rel = path.join(relativeDir, entry.name).replace(/\\/g, "/");
      const abs = path.join(lhRoot, rel);
      if (entry.isDirectory()) {
        walk(rel);
      } else if (entry.isFile()) {
        files.push({
          relativePath: rel,
          content: readFileSync(abs, "utf-8"),
        });
      }
    }
  }

  walk(subdir);
  return files;
}

/** List all harness scaffold files bundled with the CLI package. */
export function listBundledScaffoldFiles(): BundledScaffoldFile[] {
  const lhRoot = resolvePackageLhRoot();
  const files: BundledScaffoldFile[] = [
    ...readTree(lhRoot, "templates"),
    ...readTree(lhRoot, "protocols"),
  ];

  for (const policy of HOST_NEUTRAL_POLICIES) {
    const abs = path.join(lhRoot, "policies", policy);
    files.push({
      relativePath: `policies/${policy}`,
      content: readFileSync(abs, "utf-8"),
    });
  }

  return files;
}

export async function installBundledScaffold(
  cwd: string,
  options?: { overwrite?: boolean },
): Promise<Record<string, "created" | "updated" | "skipped">> {
  const overwrite = options?.overwrite ?? false;
  const result: Record<string, "created" | "updated" | "skipped"> = {};

  for (const file of listBundledScaffoldFiles()) {
    const label = `.lh/${file.relativePath}`;
    const dest = harnessPath(cwd, ...file.relativePath.split("/"));
    const status = await writeTextFile(dest, file.content, { overwrite });
    result[label] = status;
  }

  return result;
}
