#!/usr/bin/env node
// Vendors OpenCode host content into this package's dist/ at build time, from the
// hosts/opencode workspace package (a devDependency, never a runtime dependency of @feneto/lh —
// see CLAUDE.md). This freezes exactly what was tested/released together and avoids forcing
// every @feneto/lh install to also pull in the independently-versioned @feneto/lh-opencode.
//
// Build-order note: hosts/opencode must be built BEFORE this runs (`pnpm -r run build`
// respects this automatically via the workspace devDependency). Fails loudly rather than
// silently vendoring stale/missing content.

import { existsSync, mkdirSync, readdirSync, copyFileSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const cliRoot = path.resolve(here, "..");
const openCodeRoot = path.resolve(cliRoot, "../../hosts/opencode");

const vendorRoot = path.join(cliRoot, "dist", "vendor", "opencode");

function requireDir(dir, hint) {
  if (!existsSync(dir)) {
    throw new Error(`copy-opencode-vendor: expected source directory not found: ${dir}\n${hint}`);
  }
  return dir;
}

function copyDirFiles(srcDir, destDir) {
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    copyFileSync(path.join(srcDir, entry.name), path.join(destDir, entry.name));
  }
}

rmSync(vendorRoot, { recursive: true, force: true });

const agentsSrc = requireDir(
  path.join(openCodeRoot, "templates", "agents"),
  "Run `pnpm --filter @feneto/lh-opencode run build` (or `pnpm -r run build` from the repo root) first.",
);
copyDirFiles(agentsSrc, path.join(vendorRoot, "agents"));

const commandsSrc = requireDir(
  path.join(openCodeRoot, "templates", "commands"),
  "Run `pnpm --filter @feneto/lh-opencode run build` (or `pnpm -r run build` from the repo root) first.",
);
copyDirFiles(commandsSrc, path.join(vendorRoot, "commands"));

// Deliberately only these two files for the LOCAL (--local-plugin) file-drop distribution path —
// NOT dist/index.js. OpenCode's local-plugin loader treats every .js file dropped into
// .opencode/plugins/ as an independent plugin module; including index.js alongside
// leanharness-guardrails.js would register the guardrail hooks twice (verified empirically via
// hosts/opencode/scripts/opencode-smoke.mjs). index.js is only ever consumed via the npm package
// entry point (opencode.json's "plugin": ["@feneto/lh-opencode"] — the default, non-local path).
const pluginDistDir = requireDir(
  path.join(openCodeRoot, "dist"),
  "Run `pnpm --filter @feneto/lh-opencode run build` (or `pnpm -r run build` from the repo root) first.",
);
const pluginDestDir = path.join(vendorRoot, "plugin");
mkdirSync(pluginDestDir, { recursive: true });
for (const filename of ["shared.js", "leanharness-guardrails.js"]) {
  const src = path.join(pluginDistDir, filename);
  if (!existsSync(src)) {
    throw new Error(`copy-opencode-vendor: expected built file not found: ${src}`);
  }
  copyFileSync(src, path.join(pluginDestDir, filename));
}

// Record the exact hosts/opencode version this build vendored, so init.ts can register a
// version-pinned "@feneto/lh-opencode@^X.Y.Z" entry in opencode.json without @feneto/lh needing
// a runtime dependency on the (independently-versioned) opencode package.
const openCodePkgJson = JSON.parse(readFileSync(path.join(openCodeRoot, "package.json"), "utf-8"));
writeFileSync(path.join(vendorRoot, "package-version.json"), JSON.stringify({ name: openCodePkgJson.name, version: openCodePkgJson.version }, null, 2) + "\n");

console.log(`copy-opencode-vendor: vendored OpenCode agents/commands/plugin content into ${path.relative(cliRoot, vendorRoot)}`);
