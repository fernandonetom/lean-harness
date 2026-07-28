import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const pkgRaw = readFileSync(join(root, "package.json"), "utf-8");
const pkg = JSON.parse(pkgRaw);
const version = pkg.version;

if (!version) {
  console.error("[sync-plugin-version] version not found in package.json");
  process.exit(1);
}

const isCheckMode = process.argv.includes("--check");
const outOfSync = [];

// Check and update plugin.json
const pluginPath = join(root, ".claude-plugin/plugin.json");
const pluginRaw = readFileSync(pluginPath, "utf-8");
const plugin = JSON.parse(pluginRaw);

if (plugin.version !== version) {
  outOfSync.push("plugin.json");
  if (!isCheckMode) {
    plugin.version = version;
    writeFileSync(pluginPath, JSON.stringify(plugin, null, 2) + "\n", "utf-8");
  }
}

// Check and update marketplace.json
const marketplacePath = join(root, ".claude-plugin/marketplace.json");
const marketplaceRaw = readFileSync(marketplacePath, "utf-8");
const marketplace = JSON.parse(marketplaceRaw);

if (marketplace.plugins[0].version !== version) {
  outOfSync.push("marketplace.json");
  if (!isCheckMode) {
    marketplace.plugins[0].version = version;
    writeFileSync(marketplacePath, JSON.stringify(marketplace, null, 2) + "\n", "utf-8");
  }
}

if (isCheckMode) {
  if (outOfSync.length > 0) {
    console.error(`[sync-plugin-version] out of sync: ${outOfSync.join(", ")}`);
    process.exit(1);
  }
  console.log(`[sync-plugin-version] all versions in sync at v${version}`);
  process.exit(0);
}

if (outOfSync.length > 0) {
  console.log(`[sync-plugin-version] updated: ${outOfSync.join(", ")} to v${version}`);
} else {
  console.log(`[sync-plugin-version] all versions already at v${version} — nothing to do`);
}
