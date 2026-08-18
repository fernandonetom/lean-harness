import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const pkgRaw = readFileSync(join(root, "packages/cli/package.json"), "utf-8");
const pkg = JSON.parse(pkgRaw);
const version = pkg.version;

if (!version) {
  console.error("[sync-readme-version] version not found in packages/cli/package.json");
  process.exit(1);
}

const vPattern = /\bv(\d+\.\d+\.\d+)\b/;
const isCheckMode = process.argv.includes("--check");
const outOfSync = [];

// Both the repo-root README (GitHub-facing) and packages/cli's own README (npm-facing, shown on
// npmjs.com for @feneto/lh) carry the same "**vX.Y.Z — ..." status line and must stay in sync.
for (const readmePath of [join(root, "README.md"), join(root, "packages/cli/README.md")]) {
  const readme = readFileSync(readmePath, "utf-8");
  const lines = readme.split("\n");
  const match = lines[6].match(vPattern);

  if (!match) {
    console.error(`[sync-readme-version] version not found on line 7 of ${readmePath}`);
    console.error("[sync-readme-version] current line:", JSON.stringify(lines[6]));
    process.exit(1);
  }

  const currentVersion = match[1];
  if (currentVersion === version) {
    console.log(`[sync-readme-version] ${readmePath} already at v${version} — nothing to do`);
    continue;
  }

  outOfSync.push(readmePath);
  if (isCheckMode) {
    continue;
  }

  lines[6] = lines[6].replace(vPattern, `v${version}`);
  writeFileSync(readmePath, lines.join("\n"), "utf-8");
  console.log(`[sync-readme-version] ${readmePath} updated: v${currentVersion} → v${version}`);
}

if (isCheckMode) {
  if (outOfSync.length > 0) {
    console.error(`[sync-readme-version] out of sync: ${outOfSync.join(", ")}`);
    process.exit(1);
  }
  console.log(`[sync-readme-version] all READMEs in sync at v${version}`);
  process.exit(0);
}
