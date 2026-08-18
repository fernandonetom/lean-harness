import { existsSync, lstatSync, readlinkSync, rmSync, symlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Wires examples/reading-list/ to load both host plugins LIVE from this monorepo's own
// source (verified via Phase 0 spikes — both symlinks and a local-path Claude Code
// marketplace re-read live, no copy/update step needed on every edit):
//   - OpenCode: .opencode/{plugins/shared.js,plugins/leanharness-guardrails.js,agents,commands}
//     become symlinks into hosts/opencode/{dist,templates}.
//   - Claude Code: a project-scoped local-path marketplace registration replaces the
//     GitHub-shorthand one that `lh init --host claude-code` writes by default.
// Never run from CI or the `pnpm -r` fanout — see CLAUDE.md's file-ownership table.

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const exampleRoot = join(root, "examples/reading-list");

function ensureSymlink(dest, target) {
  const relTarget = relative(dirname(dest), target);
  let st;
  try {
    st = lstatSync(dest);
  } catch {
    st = null; // nothing at dest yet
  }
  if (st) {
    if (st.isSymbolicLink() && readlinkSync(dest) === relTarget) {
      return "already-linked";
    }
    rmSync(dest, { recursive: true, force: true });
  }
  symlinkSync(relTarget, dest);
  return "linked";
}

function syncOpenCode() {
  const distDir = join(root, "hosts/opencode/dist");
  const pluginFiles = ["shared.js", "leanharness-guardrails.js"];
  for (const file of pluginFiles) {
    if (!existsSync(join(distDir, file))) {
      console.error(
        `[sync-example-hosts] missing hosts/opencode/dist/${file} — run: pnpm --filter @feneto/lh-opencode run build`,
      );
      process.exit(1);
    }
  }

  const results = {};
  const pluginsDir = join(exampleRoot, ".opencode/plugins");
  for (const file of pluginFiles) {
    results[`.opencode/plugins/${file}`] = ensureSymlink(join(pluginsDir, file), join(distDir, file));
  }

  const templatesDir = join(root, "hosts/opencode/templates");
  for (const dir of ["agents", "commands"]) {
    results[`.opencode/${dir}`] = ensureSymlink(join(exampleRoot, ".opencode", dir), join(templatesDir, dir));
  }

  return results;
}

function syncClaudeCode() {
  try {
    execFileSync("claude", ["--version"], { stdio: "ignore" });
  } catch {
    console.log("[sync-example-hosts] claude CLI not found on PATH — skipping Claude Code marketplace sync");
    return { skipped: true };
  }

  const run = (args) => execFileSync("claude", args, { cwd: exampleRoot, encoding: "utf-8" }).trim();

  let addOutput;
  try {
    addOutput = run(["plugin", "marketplace", "add", root, "--scope", "project"]);
  } catch (err) {
    console.error(`[sync-example-hosts] claude plugin marketplace add failed: ${err.message}`);
    process.exit(1);
  }

  let installOutput;
  try {
    installOutput = run(["plugin", "install", "lh@lean-harness", "--scope", "project"]);
  } catch (err) {
    // Already-installed is not an error for our purposes.
    installOutput = err.stdout?.toString().trim() || err.message;
  }

  return { addOutput, installOutput };
}

const openCodeResults = syncOpenCode();
const claudeCodeResult = syncClaudeCode();

console.log("[sync-example-hosts] OpenCode wiring:");
for (const [label, status] of Object.entries(openCodeResults)) {
  console.log(`  ${label} (${status})`);
}
console.log("[sync-example-hosts] Claude Code marketplace:");
if (claudeCodeResult.skipped) {
  console.log("  skipped (claude CLI not found)");
} else {
  console.log(`  marketplace add: ${claudeCodeResult.addOutput}`);
  console.log(`  plugin install: ${claudeCodeResult.installOutput}`);
}
