import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const pkgRaw = readFileSync(join(root, "package.json"), "utf-8");
const pkg = JSON.parse(pkgRaw);
const version = pkg.version;

if (!version) {
  console.error("[sync-readme-version] version not found in package.json");
  process.exit(1);
}

const readmePath = join(root, "README.md");
const readme = readFileSync(readmePath, "utf-8");
const lines = readme.split("\n");

const vPattern = /\bv(\d+\.\d+\.\d+)\b/;
const match = lines[6].match(vPattern);

if (!match) {
  console.error("[sync-readme-version] version not found on README.md line 7");
  console.error("[sync-readme-version] current line:", JSON.stringify(lines[6]));
  process.exit(1);
}

const currentVersion = match[1];
if (currentVersion === version) {
  console.log(`[sync-readme-version] README.md already at v${version} — nothing to do`);
  process.exit(0);
}

lines[6] = lines[6].replace(vPattern, `v${version}`);
writeFileSync(readmePath, lines.join("\n"), "utf-8");
console.log(`[sync-readme-version] README.md updated: v${currentVersion} → v${version}`);
