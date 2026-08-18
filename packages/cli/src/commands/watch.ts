import path from "node:path";
import { watch } from "node:fs";
import type { FSWatcher } from "node:fs";
import { createLogger } from "../core/logger.js";
import { featuresDir } from "../core/paths.js";
import { requireFeature } from "../core/features.js";
import { readJsonFile, fileExists } from "../core/fs.js";
import { CLIError } from "../core/errors.js";
import type { BoundaryJson } from "../discovery/boundary.js";
import { runCheckCommand } from "./check.js";

export interface WatchOptions {
  cwd: string;
  ref: string;
  run?: boolean | undefined;
  noRun?: boolean | undefined;
  strict?: boolean | undefined;
  debounceMs?: number | undefined;
  json?: boolean | undefined;
}

export interface WatchSession {
  close(): void;
}

export async function runWatchCommand(options: WatchOptions): Promise<void> {
  const { cwd, ref, json = false } = options;
  const log = createLogger({ json });

  if (!ref) {
    throw new CLIError("Missing feature reference.\nUsage: lh watch F001");
  }

  const entry = await requireFeature(cwd, ref);
  const featureDir = path.join(featuresDir(cwd), entry.path);

  const boundaryPath = path.join(featureDir, "boundary.json");
  if (!(await fileExists(boundaryPath))) {
    throw new CLIError(
      `Cannot watch: boundary.json missing for ${entry.path}.\n` +
      `Run: lh discover ${entry.id}`,
    );
  }

  const boundary = await readJsonFile<BoundaryJson>(boundaryPath);
  if (!boundary) {
    throw new CLIError("Failed to parse boundary.json.");
  }

  const watchPaths = collectWatchPaths(cwd, boundary);

  if (watchPaths.length === 0) {
    throw new CLIError(
      "No files to watch. boundary.json has no touch or read-only files.",
    );
  }

  log.info(`Watching ${watchPaths.length} boundary files for ${entry.id} — ${entry.title}`);
  log.info("Press Ctrl+C to stop.\n");

  const session = startWatch({
    cwd,
    ref: entry.id,
    watchPaths,
    debounceMs: options.debounceMs ?? 1000,
    onTrigger: async (changedPath: string) => {
      const rel = path.relative(cwd, changedPath);
      log.info(`Change detected: ${rel}`);
      log.info("Running verification...\n");
      try {
        await runCheckCommand({
          cwd,
          ref: entry.id,
          run: options.run,
          noRun: options.noRun,
          strict: options.strict,
          json,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn(`Check failed: ${msg}`);
      }
      log.info("\nWaiting for changes...");
    },
  });

  await new Promise<void>((resolve) => {
    const onSignal = () => {
      session.close();
      log.info("\nWatch stopped.");
      resolve();
    };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
  });
}

export function collectWatchPaths(root: string, boundary: BoundaryJson): string[] {
  const paths = new Set<string>();

  for (const f of boundary.touchFiles) {
    paths.add(path.resolve(root, f.path));
  }
  for (const f of boundary.readOnlyFiles) {
    paths.add(path.resolve(root, f.path));
  }
  for (const t of boundary.relevantTests) {
    if (t.path) {
      paths.add(path.resolve(root, t.path));
    }
  }

  return Array.from(paths);
}

interface StartWatchOptions {
  cwd: string;
  ref: string;
  watchPaths: string[];
  debounceMs: number;
  onTrigger: (changedPath: string) => Promise<void>;
}

export function startWatch(options: StartWatchOptions): WatchSession {
  const { watchPaths, debounceMs, onTrigger } = options;
  const watchers: FSWatcher[] = [];
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let running = false;

  const dirs = new Set<string>();
  for (const p of watchPaths) {
    dirs.add(path.dirname(p));
  }

  const watchedFiles = new Set(watchPaths.map((p) => path.resolve(p)));

  for (const dir of dirs) {
    try {
      const watcher = watch(dir, (eventType, filename) => {
        if (!filename) return;
        const full = path.resolve(dir, filename);
        if (!watchedFiles.has(full)) return;

        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          if (running) return;
          running = true;
          onTrigger(full).finally(() => { running = false; });
        }, debounceMs);
      });
      watchers.push(watcher);
    } catch {
      // dir may not exist — skip silently
    }
  }

  return {
    close() {
      if (debounceTimer) clearTimeout(debounceTimer);
      for (const w of watchers) {
        w.close();
      }
    },
  };
}
