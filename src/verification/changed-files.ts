import { spawn } from "node:child_process";
import path from "node:path";
import type { VerificationEvent } from "./index.js";

export type BoundaryStatus = "in" | "out" | "unknown";

export interface ChangedFile {
  path: string;
  changeType: "created" | "modified" | "deleted" | "renamed" | "unknown";
  source: string;
  inBoundary: BoundaryStatus;
  notes: string[];
}

export interface BoundaryReview {
  status: "pass" | "fail" | "partial" | "unknown";
  changedFiles: ChangedFile[];
  violations: ChangedFile[];
  notes: string[];
}

const HARNESS_PREFIXES = [".lh/", ".claude/", ".opencode/", "docs/"];

export function isHarnessArtifactPath(filePath: string): boolean {
  const posix = filePath.replace(/\\/g, "/");
  return HARNESS_PREFIXES.some((p) => posix.startsWith(p));
}

export function isImplementationPath(filePath: string): boolean {
  return !isHarnessArtifactPath(filePath);
}

export function isPathAllowedByBoundary(filePath: string, boundary: unknown): BoundaryStatus {
  if (!boundary || typeof boundary !== "object") return "unknown";

  const b = boundary as Record<string, unknown>;
  const posix = filePath.replace(/\\/g, "/");

  const blockedGlobs = b["blockedEditGlobs"];
  if (Array.isArray(blockedGlobs)) {
    for (const glob of blockedGlobs) {
      if (typeof glob === "string" && matchSimpleGlob(posix, glob)) {
        return "out";
      }
    }
  }

  const doNotTouch = b["doNotTouch"];
  if (Array.isArray(doNotTouch)) {
    for (const prefix of doNotTouch) {
      if (typeof prefix === "string" && posix.startsWith(prefix)) {
        return "out";
      }
    }
  }

  const touchFiles = b["touchFiles"];
  if (Array.isArray(touchFiles)) {
    for (const tf of touchFiles) {
      if (typeof tf === "object" && tf !== null) {
        const entry = tf as Record<string, unknown>;
        if (typeof entry["path"] === "string" && entry["path"] === posix) {
          return "in";
        }
      }
    }
  }

  const allowedGlobs = b["allowedEditGlobs"];
  if (Array.isArray(allowedGlobs)) {
    for (const glob of allowedGlobs) {
      if (typeof glob === "string" && matchSimpleGlob(posix, glob)) {
        return "in";
      }
    }
  }

  return "unknown";
}

export async function detectChangedFiles(input: {
  root: string;
  featureDir: string;
  events: VerificationEvent[];
  taskSummaries: Array<{ path: string; content: string }>;
  useGit?: boolean;
}): Promise<ChangedFile[]> {
  const seen = new Map<string, ChangedFile>();

  function addFile(filePath: string, changeType: ChangedFile["changeType"], source: string): void {
    const posix = filePath.replace(/\\/g, "/");
    if (!posix || posix === "." || posix === "..") return;
    if (isHarnessArtifactPath(posix)) return;

    const existing = seen.get(posix);
    if (existing) {
      if (existing.changeType === "unknown" && changeType !== "unknown") {
        existing.changeType = changeType;
      }
      if (!existing.notes.includes(source)) {
        existing.notes.push(`also reported by: ${source}`);
      }
    } else {
      seen.set(posix, {
        path: posix,
        changeType,
        source,
        inBoundary: "unknown",
        notes: [],
      });
    }
  }

  for (const summary of input.taskSummaries) {
    const filesSection = extractSectionContent(summary.content, "files changed");
    const bullets = extractBullets(filesSection);
    for (const bullet of bullets) {
      if (bullet.toLowerCase().startsWith("unknown") || bullet.toLowerCase().startsWith("no ")) continue;
      addFile(bullet, "unknown", `task-summary:${summary.path}`);
    }

    const addSection = extractCavebusField(summary.content, "add");
    for (const line of addSection) {
      addFile(line, "created", `task-summary:${summary.path}`);
    }

    const modSection = extractCavebusField(summary.content, "mod");
    for (const line of modSection) {
      addFile(line, "modified", `task-summary:${summary.path}`);
    }
  }

  for (const ev of input.events) {
    if (ev.paths && Array.isArray(ev.paths)) {
      for (const p of ev.paths) {
        if (typeof p === "string") {
          addFile(p, "unknown", `event:${ev.event ?? "unknown"}`);
        }
      }
    }
  }

  if (input.useGit !== false) {
    try {
      const gitFiles = await getGitChangedFiles(input.root);
      for (const gf of gitFiles) {
        addFile(gf.path, gf.changeType, "git");
      }
    } catch {
      // git not available or not a git repo — fine
    }
  }

  return Array.from(seen.values());
}

export function reviewBoundaryCompliance(
  changedFiles: ChangedFile[],
  boundary: unknown | null,
): BoundaryReview {
  if (!boundary || typeof boundary !== "object") {
    return {
      status: changedFiles.length > 0 ? "unknown" : "unknown",
      changedFiles,
      violations: [],
      notes: ["No boundary.json available. Cannot verify boundary compliance."],
    };
  }

  const violations: ChangedFile[] = [];

  for (const file of changedFiles) {
    file.inBoundary = isPathAllowedByBoundary(file.path, boundary);
    if (file.inBoundary === "out") {
      violations.push(file);
    }
  }

  let status: BoundaryReview["status"];
  if (changedFiles.length === 0) {
    status = "unknown";
  } else if (violations.length === 0) {
    status = "pass";
  } else if (violations.length < changedFiles.length) {
    status = "partial";
  } else {
    status = "fail";
  }

  const notes: string[] = [];
  if (violations.length > 0) {
    notes.push(`${violations.length} file(s) changed outside the boundary.`);
  }

  return { status, changedFiles, violations, notes };
}

function matchSimpleGlob(filePath: string, glob: string): boolean {
  if (glob === filePath) return true;

  if (glob.endsWith("/**")) {
    const prefix = glob.slice(0, -3);
    return filePath.startsWith(prefix + "/") || filePath === prefix;
  }

  if (glob.endsWith("/*")) {
    const prefix = glob.slice(0, -2);
    return filePath.startsWith(prefix + "/") && !filePath.slice(prefix.length + 1).includes("/");
  }

  if (glob.startsWith("**/")) {
    const suffix = glob.slice(3);
    return filePath.endsWith("/" + suffix) || filePath === suffix || filePath.includes("/" + suffix);
  }

  if (glob.includes("*")) {
    const escapedGlob = glob
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*\*/g, "DOUBLE_STAR")
      .replace(/\*/g, "[^/]*")
      .replace(/DOUBLE_STAR/g, ".*");
    try {
      return new RegExp("^" + escapedGlob + "$").test(filePath);
    } catch {
      return false;
    }
  }

  return false;
}

function extractSectionContent(markdown: string, heading: string): string {
  const lines = markdown.split("\n");
  const lower = heading.toLowerCase();
  let capturing = false;
  let level = 0;
  const result: string[] = [];

  for (const line of lines) {
    const hm = /^(#{1,6})\s+(.*)$/.exec(line);
    if (hm) {
      if (capturing && hm[1]!.length <= level) break;
      if (!capturing && hm[2]!.trim().toLowerCase() === lower) {
        capturing = true;
        level = hm[1]!.length;
        continue;
      }
    }
    if (capturing) result.push(line);
  }

  return result.join("\n");
}

function extractBullets(text: string): string[] {
  const items: string[] = [];
  for (const line of text.split("\n")) {
    const m = /^\s*-\s+(.+)$/.exec(line);
    if (m) items.push(m[1]!.trim());
  }
  return items;
}

function extractCavebusField(content: string, fieldName: string): string[] {
  const lines = content.split("\n");
  const items: string[] = [];
  let inField = false;

  for (const line of lines) {
    if (line.trim() === `${fieldName}:`) {
      inField = true;
      continue;
    }
    if (inField) {
      const m = /^-\s+(.+)$/.exec(line.trim());
      if (m) {
        const value = m[1]!.trim().split(/\s+/)[0];
        if (value) items.push(value);
      } else if (line.trim() !== "" && !/^\s+-/.test(line)) {
        inField = false;
      }
    }
  }

  return items;
}

async function getGitChangedFiles(
  cwd: string,
): Promise<Array<{ path: string; changeType: ChangedFile["changeType"] }>> {
  const results: Array<{ path: string; changeType: ChangedFile["changeType"] }> = [];

  try {
    const statusOutput = await runGitCommand(cwd, ["status", "--short"]);
    for (const line of statusOutput.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const code = trimmed.slice(0, 2).trim();
      const filePath = trimmed.slice(3).trim().replace(/^"/, "").replace(/"$/, "");
      if (!filePath) continue;

      let changeType: ChangedFile["changeType"] = "unknown";
      if (code.includes("A") || code === "??") changeType = "created";
      else if (code.includes("M")) changeType = "modified";
      else if (code.includes("D")) changeType = "deleted";
      else if (code.includes("R")) changeType = "renamed";

      results.push({ path: filePath, changeType });
    }
  } catch {
    // git not available
  }

  return results;
}

function runGitCommand(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    const proc = spawn("git", args, { cwd, stdio: ["ignore", "pipe", "ignore"] });
    proc.stdout?.on("data", (data: Buffer) => { stdout += data.toString(); });
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`git ${args.join(" ")} exited ${code}`));
    });
    proc.on("error", reject);
  });
}
