import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ensureDir, writeTextFile, writeJsonFile } from "../../src/core/fs.js";
import { harnessPath, featuresDir } from "../../src/core/paths.js";
import { createDefaultState, createDefaultConfigYaml } from "../../src/core/config.js";

export interface TestWorkspace {
  root: string;
  cleanup: () => Promise<void>;
}

export async function createTempWorkspace(): Promise<TestWorkspace> {
  const root = await mkdtemp(path.join(tmpdir(), "lh-test-"));
  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

export async function initHarnessWorkspace(root: string): Promise<void> {
  await ensureDir(harnessPath(root));
  await ensureDir(featuresDir(root));
  await ensureDir(harnessPath(root, "templates"));
  await ensureDir(harnessPath(root, "memory"));
  await writeTextFile(harnessPath(root, "config.yml"), createDefaultConfigYaml());
  await writeJsonFile(harnessPath(root, "state.json"), createDefaultState());
}
