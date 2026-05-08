import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function fileExists(p: string): Promise<boolean> {
  try {
    const stat = await fsp.stat(p);
    return stat.isFile();
  } catch {
    return false;
  }
}

export async function dirExists(p: string): Promise<boolean> {
  try {
    const stat = await fsp.stat(p);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

export async function ensureDir(p: string): Promise<void> {
  await fsp.mkdir(p, { recursive: true });
}

export async function readTextFile(p: string): Promise<string | null> {
  try {
    return await fsp.readFile(p, "utf-8");
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") return null;
    throw err;
  }
}

export async function writeTextFile(
  p: string,
  content: string,
  options?: { overwrite?: boolean },
): Promise<"created" | "updated" | "skipped"> {
  const exists = await fileExists(p);
  if (exists && !options?.overwrite) return "skipped";
  await ensureDir(path.dirname(p));
  const result = exists ? "updated" : "created";
  await fsp.writeFile(p, content, "utf-8");
  return result;
}

export async function readJsonFile<T>(p: string): Promise<T | null> {
  const text = await readTextFile(p);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse JSON in ${p}: ${msg}`);
  }
}

export async function writeJsonFile(
  p: string,
  value: unknown,
  options?: { overwrite?: boolean },
): Promise<"created" | "updated" | "skipped"> {
  const content = JSON.stringify(value, null, 2) + "\n";
  return writeTextFile(p, content, options);
}

export async function listDirs(p: string): Promise<string[]> {
  try {
    const entries = await fsp.readdir(p, { withFileTypes: true });
    return entries.filter((e: fs.Dirent) => e.isDirectory()).map((e: fs.Dirent) => e.name);
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") return [];
    throw err;
  }
}

export async function listFiles(p: string): Promise<string[]> {
  try {
    const entries = await fsp.readdir(p, { withFileTypes: true });
    return entries.filter((e: fs.Dirent) => e.isFile()).map((e: fs.Dirent) => e.name);
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === "ENOENT") return [];
    throw err;
  }
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
