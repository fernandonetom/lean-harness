#!/usr/bin/env node
// Empirical smoke check against a real `opencode` binary, gated the same way as the Claude Code
// plugin's scripts/plugin-smoke.mjs (skip gracefully if the CLI isn't installed). It cannot
// exercise full guardrail-blocking behavior (that needs a configured LLM provider actually
// driving tool calls), but it DOES verify the built plugin loads without error under the real
// opencode runtime, and that the local-file distribution used by `--local-plugin` does not
// double-register the guardrail hooks (opencode's local-plugin loader treats every .js file
// dropped into .opencode/plugins/ as an independent plugin — see README "Self-contained by
// design" and packages/cli/scripts/copy-opencode-vendor.mjs, which deliberately vendors only
// shared.js + leanharness-guardrails.js for that path, never index.js).

import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, "..");
const distDir = path.join(packageRoot, "dist");

function hasOpenCode() {
  try {
    execFileSync("opencode", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

if (!hasOpenCode()) {
  console.log("opencode-smoke: `opencode` CLI not found on PATH — skipping (this is expected outside dev/CI-scheduled runs).");
  process.exit(0);
}

const tmp = mkdtempSync(path.join(tmpdir(), "lh-opencode-smoke-"));
try {
  execFileSync("git", ["init", "-q"], { cwd: tmp });
  mkdirSync(path.join(tmp, ".opencode", "plugins"), { recursive: true });
  mkdirSync(path.join(tmp, ".lh", "features", "F001-smoke"), { recursive: true });
  writeFileSync(path.join(tmp, ".lh", "state.json"), JSON.stringify({ active_feature: "F001-smoke" }));
  writeFileSync(path.join(tmp, ".lh", "features", "F001-smoke", "boundary.json"), JSON.stringify({ touchFiles: [] }));

  // Deliberately only these two files — see module docstring above.
  for (const filename of ["shared.js", "leanharness-guardrails.js"]) {
    copyFileSync(path.join(distDir, filename), path.join(tmp, ".opencode", "plugins", filename));
  }

  const raw = execFileSync("opencode", ["debug", "config"], { cwd: tmp, encoding: "utf8" });
  const config = JSON.parse(raw);
  const origins = (config.plugin_origins ?? []).map((o) => path.basename(o.spec));

  const expectedCount = 2; // shared.js + leanharness-guardrails.js, no more
  const guardrailLoaded = origins.includes("leanharness-guardrails.js");
  const sharedLoaded = origins.includes("shared.js");

  if (!guardrailLoaded) {
    console.error("opencode-smoke: FAILED — leanharness-guardrails.js did not appear in `opencode debug config`'s plugin_origins.");
    process.exit(1);
  }
  if (origins.length !== expectedCount || !sharedLoaded) {
    console.error(`opencode-smoke: FAILED — expected exactly ${expectedCount} local plugin files (shared.js, leanharness-guardrails.js), got: ${JSON.stringify(origins)}`);
    process.exit(1);
  }

  console.log("opencode-smoke: PASSED — plugin loads cleanly under a real opencode binary, no double-registration.");
  console.log("opencode-smoke: NOTE — this does not exercise actual tool-call blocking (requires a configured LLM provider driving real tool calls). See tests/tool-execute-before.test.ts and tests/permission-ask.test.ts for unit-level coverage of the blocking logic itself.");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
