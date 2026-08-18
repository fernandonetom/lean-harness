import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Resolves where vendored OpenCode host content (agents/commands templates, guardrail plugin JS)
 * lives, given a loader module's own directory (`path.dirname(fileURLToPath(import.meta.url))`).
 *
 * Two contexts:
 * - Published package (or any post-`pnpm -r run build` state): content lives at
 *   dist/vendor/opencode/{agents,commands,plugin,package-version.json}, copied in by
 *   scripts/copy-opencode-vendor.mjs.
 * - Running directly against TS source (tests, `pnpm --filter @feneto/lh test` without a prior
 *   build): dist/vendor doesn't exist yet. Fall back to reading the sibling hosts/opencode
 *   workspace package directly — valid only inside this monorepo, never true for the published
 *   tarball (whose dist/vendor is always present, produced by the build script above).
 */
function vendorRootExists(loaderDir: string): boolean {
  return existsSync(path.join(loaderDir, "..", "vendor", "opencode"));
}

function hostsOpenCodeRoot(loaderDir: string): string {
  return path.resolve(loaderDir, "../../../../hosts/opencode");
}

export function resolveOpenCodeAgentsDir(loaderDir: string): string {
  if (vendorRootExists(loaderDir)) return path.join(loaderDir, "..", "vendor", "opencode", "agents");
  return path.join(hostsOpenCodeRoot(loaderDir), "templates", "agents");
}

export function resolveOpenCodeCommandsDir(loaderDir: string): string {
  if (vendorRootExists(loaderDir)) return path.join(loaderDir, "..", "vendor", "opencode", "commands");
  return path.join(hostsOpenCodeRoot(loaderDir), "templates", "commands");
}

export function resolveOpenCodePluginDir(loaderDir: string): string {
  if (vendorRootExists(loaderDir)) return path.join(loaderDir, "..", "vendor", "opencode", "plugin");
  return path.join(hostsOpenCodeRoot(loaderDir), "dist");
}

export function resolveOpenCodePluginPackageSpec(loaderDir: string): string {
  if (vendorRootExists(loaderDir)) {
    const versionFile = path.join(loaderDir, "..", "vendor", "opencode", "package-version.json");
    const { name, version } = JSON.parse(readFileSync(versionFile, "utf-8")) as { name: string; version: string };
    return `${name}@^${version}`;
  }
  const pkgFile = path.join(hostsOpenCodeRoot(loaderDir), "package.json");
  const { name, version } = JSON.parse(readFileSync(pkgFile, "utf-8")) as { name: string; version: string };
  return `${name}@^${version}`;
}
