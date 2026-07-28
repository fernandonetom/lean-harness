import fsp from "node:fs/promises";
import path from "node:path";
import { createLogger, printJson } from "../core/logger.js";
import { createColors } from "../core/colors.js";
import { promptConfirm } from "../core/prompt.js";
import { fileExists, dirExists, readTextFile, writeTextFile } from "../core/fs.js";
import { configPath } from "../core/paths.js";
import { updateConfigVersion } from "../core/config-mutate.js";
import { detectLegacyFootprint } from "./legacy-footprint.js";
import { detectPluginInstalled } from "./detect-install.js";
import { stripLhHooksFromSettings } from "./uninstall.js";
import { getVersion } from "../core/version.js";

export interface MigrateOptions {
  cwd: string;
  yes?: boolean;
  dryRun?: boolean;
  json?: boolean;
  force?: boolean;
}

async function removeDir(p: string): Promise<void> {
  await fsp.rm(p, { recursive: true, force: true });
}

async function removeFile(p: string): Promise<void> {
  try {
    await fsp.unlink(p);
  } catch (err: unknown) {
    if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
}

function printMigratePreview(
  footprint: string[],
  root: string,
  json: boolean,
  out: NodeJS.WritableStream,
): void {
  if (json) return;
  const colors = createColors();
  const rel = (p: string) => path.relative(root, p);

  out.write(`\n${colors.bold("LeanHarness migrate preview")}\n\n`);

  if (footprint.length > 0) {
    out.write(`${colors.dim("Files and directories to remove:")}\n`);
    for (const p of footprint) {
      const isDir = p.endsWith(path.sep) || p.includes("/") && !p.includes(".");
      out.write(`  ${colors.red("−")} ${rel(p)}${isDir ? "/" : ""}\n`);
    }
  }
  out.write("\n");
}

export async function runMigrateCommand(options: MigrateOptions): Promise<void> {
  const { cwd, yes = false, dryRun = false, json = false, force = false } = options;
  const log = createLogger({ json });
  const out = process.stdout;

  // Step 1: Detect legacy footprint
  const footprint = await detectLegacyFootprint(cwd);

  if (footprint.paths.length === 0) {
    if (json) {
      printJson({ status: "up-to-date", message: "Already on v2 layout. Nothing to migrate." });
    } else {
      log.info("Already on v2 layout. Nothing to migrate.");
    }
    return;
  }

  // Step 2: Check if plugin is installed (unless force is set)
  if (!force) {
    const pluginStatus = await detectPluginInstalled(cwd);
    if (!pluginStatus.claudeCode && !pluginStatus.openCode) {
      if (json) {
        printJson({
          status: "not-installed",
          message: "The lh plugin doesn't appear to be installed yet. Install it first, then re-run `lh migrate`.",
          files: footprint.paths.map((p) => path.relative(cwd, p)),
        });
      } else {
        out.write(
          `${log.colors.yellow("[warn]")} The lh plugin doesn't appear to be installed yet. Install it first, then re-run \`lh migrate\`:\n` +
            `  /plugin marketplace add fernandonetom/lean-harness\n` +
            `  /plugin install lh@lean-harness\n\n` +
            `Files that WOULD be removed once the plugin is installed:\n`,
        );
        for (const p of footprint.paths) {
          out.write(`  ${path.relative(cwd, p)}\n`);
        }
        out.write("\n");
      }
      return;
    }
  }

  // Step 3: Print preview
  printMigratePreview(footprint.paths, cwd, json, out);

  // Step 4: If dry run, stop here
  if (dryRun) {
    if (!json) {
      log.info("Dry run complete. No files removed.");
    } else {
      printJson({
        status: "dry-run",
        files: footprint.paths.map((p) => path.relative(cwd, p)),
      });
    }
    return;
  }

  // Step 5: Final confirmation (unless --yes)
  if (!yes) {
    const proceed = await promptConfirm("Proceed with migration?", false);
    if (!proceed) {
      if (!json) {
        log.info("Aborted.");
      }
      return;
    }
  }

  const removed: string[] = [];

  // Step 5a: Delete all paths from footprint
  for (const p of footprint.paths) {
    const isDir = await dirExists(p);
    if (isDir) {
      await removeDir(p);
    } else {
      await removeFile(p);
    }
    removed.push(path.relative(cwd, p));
  }

  // Step 6: Strip LH hooks from settings
  const settingsStripped = await stripLhHooksFromSettings(cwd);

  // Step 7: Bump config version
  let newConfigVersion: string | null = null;
  const cfgPath = configPath(cwd);
  if (await fileExists(cfgPath)) {
    const currentConfig = await readTextFile(cfgPath);
    if (currentConfig) {
      const newVersion = getVersion();
      const updatedConfig = updateConfigVersion(currentConfig, newVersion);
      await writeTextFile(cfgPath, updatedConfig, { overwrite: true });
      newConfigVersion = newVersion;
    }
  }

  // Step 8: Report success
  if (json) {
    printJson({
      status: "migrated",
      removed,
      settingsStripped,
      configVersion: newConfigVersion,
    });
  } else {
    out.write(`${log.colors.green("✓")} Migration complete.\n\n`);
    if (removed.length > 0) {
      out.write(`${log.colors.dim("Removed:")}\n`);
      for (const r of removed) {
        out.write(`  ${r}\n`);
      }
    }
    if (settingsStripped) {
      out.write(`${log.colors.dim("Settings updated:")}\n`);
      out.write(`  .claude/settings.json (LH hooks stripped)\n`);
    }
    if (newConfigVersion) {
      out.write(`${log.colors.dim("Config version:")}\n`);
      out.write(`  Updated to ${newConfigVersion}\n`);
    }
    out.write("\n");
  }
}
