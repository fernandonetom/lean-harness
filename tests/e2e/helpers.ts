import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";

export async function createTempWorkspace(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "lh-e2e-"));
}

export async function cleanupWorkspace(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf-8");
}

export async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

export function lhPath(root: string, ...segments: string[]): string {
  return path.join(root, ".lh", ...segments);
}

export function featurePath(root: string, folderName: string, ...segments: string[]): string {
  return path.join(root, ".lh", "features", folderName, ...segments);
}
