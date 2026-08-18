import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { dirExists } from "../core/fs.js";
import type { DetectedCommand } from "./package-detector.js";

export interface CandidateFile {
  path: string;
  reason: string;
  confidence: "low" | "med" | "high";
  score: number;
  kind: "source" | "test" | "config" | "docs" | "unknown";
  matchedTerms: string[];
}

export interface TestDetection {
  testFiles: CandidateFile[];
  testDirs: string[];
  likelyTestCommands: DetectedCommand[];
  notes: string[];
}

const TEST_FILE_PATTERNS = [
  /\.test\.tsx?$/,
  /\.spec\.tsx?$/,
  /\.test\.jsx?$/,
  /\.spec\.jsx?$/,
  /_test\.go$/,
  /test_[^/]+\.py$/,
  /[^/]+_test\.py$/,
  /_spec\.rb$/,
  /\.feature$/,
  /Tests?\.cs$/,
  /Test\.java$/,
  /Tests?\.kt$/,
];

const TEST_DIR_NAMES = new Set([
  "tests", "test", "spec", "__tests__", "e2e", "integration",
]);

const SKIP_DIRS = new Set([
  ".git", "node_modules", "dist", "build", "coverage",
  ".next", ".nuxt", ".svelte-kit", ".turbo", ".cache",
  "out", "vendor", "target", ".mypy_cache", ".pytest_cache",
  ".venv", "venv", "__pycache__", ".lh", ".claude",
]);

const MAX_WALK_ENTRIES = 5000;

export async function detectTests(
  root: string,
  keywords: string[],
  options?: { maxResults?: number },
): Promise<TestDetection> {
  const maxResults = options?.maxResults ?? 30;
  const result: TestDetection = {
    testFiles: [],
    testDirs: [],
    likelyTestCommands: [],
    notes: [],
  };

  for (const dirName of TEST_DIR_NAMES) {
    const dirPath = path.join(root, dirName);
    if (await dirExists(dirPath)) {
      result.testDirs.push(dirName);
    }
  }

  const allTestFiles: CandidateFile[] = [];
  let entryCount = 0;

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 6 || entryCount > MAX_WALK_ENTRIES) return;

    let entries: fs.Dirent[];
    try {
      entries = (await fsp.readdir(dir, { withFileTypes: true })).slice(0, 500);
    } catch {
      return;
    }

    for (const entry of entries) {
      entryCount++;
      if (entryCount > MAX_WALK_ENTRIES) return;

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(path.join(dir, entry.name), depth + 1);
        continue;
      }

      if (!entry.isFile()) continue;

      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(root, fullPath).split(path.sep).join("/");
      const isTestFile = TEST_FILE_PATTERNS.some((p) => p.test(entry.name));

      if (!isTestFile) continue;

      const matched = scoreTestFile(relPath, entry.name, keywords);
      allTestFiles.push({
        path: relPath,
        reason: matched.reason,
        confidence: matched.confidence,
        score: matched.score,
        kind: "test",
        matchedTerms: matched.matchedTerms,
      });
    }
  }

  await walk(root, 0);

  allTestFiles.sort((a, b) => b.score - a.score);
  result.testFiles = allTestFiles.slice(0, maxResults);

  if (allTestFiles.length === 0) {
    result.notes.push("No test files found matching standard naming patterns.");
  } else if (allTestFiles.length > maxResults) {
    result.notes.push(
      `Found ${allTestFiles.length} test files; showing top ${maxResults} by keyword relevance.`,
    );
  }

  return result;
}

function scoreTestFile(
  relPath: string,
  fileName: string,
  keywords: string[],
): { score: number; confidence: "low" | "med" | "high"; reason: string; matchedTerms: string[] } {
  let score = 1;
  const matchedTerms: string[] = [];
  const lowerPath = relPath.toLowerCase();
  const lowerName = fileName.toLowerCase();

  for (const kw of keywords) {
    const kwLower = kw.toLowerCase();
    if (lowerName.includes(kwLower)) {
      score += 5;
      matchedTerms.push(kw);
    } else if (lowerPath.includes(kwLower)) {
      score += 3;
      matchedTerms.push(kw);
    }
  }

  const reason =
    matchedTerms.length > 0
      ? `test file matching keywords: ${matchedTerms.join(", ")}`
      : "test file by naming convention";

  const confidence: "low" | "med" | "high" =
    matchedTerms.length >= 2 ? "high" : matchedTerms.length === 1 ? "med" : "low";

  return { score, confidence, reason, matchedTerms };
}
