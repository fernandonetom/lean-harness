import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

export interface SearchOptions {
  maxResults?: number;
  maxFileSizeBytes?: number;
  maxContentReadBytes?: number;
  hints?: string[];
}

export interface CandidateFile {
  path: string;
  reason: string;
  confidence: "low" | "med" | "high";
  score: number;
  kind: "source" | "test" | "config" | "docs" | "unknown";
  matchedTerms: string[];
}

export interface SearchResult {
  candidates: CandidateFile[];
  scannedFiles: number;
  skippedFiles: number;
  notes: string[];
}

const SYNONYM_MAP: Record<string, string[]> = {
  auth: ["auth", "authentication", "session", "login", "logout", "password", "token"],
  password: ["password", "credential", "reset", "hash"],
  billing: ["billing", "payment", "checkout", "invoice", "subscription", "price"],
  email: ["email", "mail", "notification", "smtp"],
  user: ["user", "account", "profile"],
  api: ["api", "route", "controller", "endpoint"],
};

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "shall",
  "should", "may", "might", "must", "can", "could", "to", "of", "in",
  "for", "on", "with", "at", "by", "from", "as", "into", "through",
  "during", "before", "after", "above", "below", "between", "out", "off",
  "up", "down", "about", "over", "under", "again", "further", "then",
  "once", "here", "there", "when", "where", "why", "how", "all", "each",
  "every", "both", "few", "more", "most", "other", "some", "such", "no",
  "not", "only", "own", "same", "so", "than", "too", "very", "just",
  "also", "now", "and", "but", "or", "if", "while", "because", "until",
  "that", "this", "these", "those", "it", "its", "i", "me", "my", "we",
  "our", "you", "your", "he", "she", "they", "them", "what", "which",
  "who", "whom", "add", "without", "replacing", "existing", "new",
  "make", "create", "implement", "update", "change", "fix", "remove",
]);

const SKIP_DIRS = new Set([
  ".git", "node_modules", "dist", "build", "coverage",
  ".next", ".nuxt", ".svelte-kit", ".turbo", ".cache",
  "out", "vendor", "target", ".mypy_cache", ".pytest_cache",
  ".venv", "venv", "__pycache__", ".DS_Store",
  ".lh", ".claude",
]);

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg", ".webp", ".avif",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".zip", ".tar", ".gz", ".bz2", ".7z", ".rar",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx",
  ".mp3", ".mp4", ".avi", ".mov", ".wav",
  ".exe", ".dll", ".so", ".dylib", ".bin",
  ".lock", ".lockb",
]);

const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".rs", ".rb", ".java", ".kt",
  ".php", ".cs", ".swift", ".scala", ".clj",
  ".vue", ".svelte", ".astro",
]);

const CONFIG_EXTENSIONS = new Set([
  ".json", ".yml", ".yaml", ".toml", ".ini", ".cfg",
  ".env", ".conf",
]);

const DOC_EXTENSIONS = new Set([
  ".md", ".mdx", ".txt", ".rst",
]);

const TEST_PATTERNS = [
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /_test\.go$/,
  /test_[^/]+\.py$/,
  /[^/]+_test\.py$/,
  /_spec\.rb$/,
];

const MAX_WALK_ENTRIES = 5000;

export function extractKeywords(input: string): string[] {
  let text = input.toLowerCase();

  text = text
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/-/g, " ");

  text = text.replace(/[^a-z0-9\s]/g, " ");

  const raw = text.split(/\s+/).filter((w) => w.length > 1);

  const filtered = raw.filter((w) => !STOP_WORDS.has(w));

  const expanded = new Set<string>();
  for (const word of filtered) {
    expanded.add(word);
    const synonyms = SYNONYM_MAP[word];
    if (synonyms) {
      for (const s of synonyms) {
        expanded.add(s);
      }
    }
  }

  return Array.from(expanded);
}

export async function searchRelevantFiles(
  root: string,
  keywords: string[],
  options?: SearchOptions,
): Promise<SearchResult> {
  const maxResults = options?.maxResults ?? 80;
  const maxFileSize = options?.maxFileSizeBytes ?? 250_000;
  const maxContentRead = options?.maxContentReadBytes ?? 20_000;
  const hints = options?.hints ?? [];

  const result: SearchResult = {
    candidates: [],
    scannedFiles: 0,
    skippedFiles: 0,
    notes: [],
  };

  const allCandidates: CandidateFile[] = [];
  let entryCount = 0;

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 8 || entryCount > MAX_WALK_ENTRIES) return;

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

      const ext = path.extname(entry.name).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) {
        result.skippedFiles++;
        continue;
      }

      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(root, fullPath).split(path.sep).join("/");

      let stat: fsp.FileHandle | null = null;
      try {
        const s = await fsp.stat(fullPath);
        if (s.size > maxFileSize) {
          result.skippedFiles++;
          continue;
        }
      } catch {
        result.skippedFiles++;
        continue;
      }

      result.scannedFiles++;

      const scored = scoreFile(relPath, entry.name, ext, keywords, hints);
      if (scored.score > 0) {
        if (scored.score >= 3 && scored.matchedTerms.length > 0) {
          const contentScore = await scoreContent(fullPath, keywords, maxContentRead);
          scored.score += contentScore.score;
          for (const t of contentScore.matchedTerms) {
            if (!scored.matchedTerms.includes(t)) {
              scored.matchedTerms.push(t);
            }
          }
        }

        allCandidates.push({
          path: relPath,
          reason: scored.reason,
          confidence: scored.confidence,
          score: scored.score,
          kind: scored.kind,
          matchedTerms: scored.matchedTerms,
        });
      }
    }
  }

  await walk(root, 0);

  allCandidates.sort((a, b) => b.score - a.score);
  result.candidates = allCandidates.slice(0, maxResults);

  if (allCandidates.length === 0) {
    result.notes.push("No candidate files found matching keywords.");
  } else if (allCandidates.length > maxResults) {
    result.notes.push(
      `Found ${allCandidates.length} candidates; showing top ${maxResults} by relevance.`,
    );
  }

  return result;
}

export function classifyFileKind(
  ext: string,
  fileName: string,
): CandidateFile["kind"] {
  const isTest = TEST_PATTERNS.some((p) => p.test(fileName));
  if (isTest) return "test";
  if (SOURCE_EXTENSIONS.has(ext)) return "source";
  if (CONFIG_EXTENSIONS.has(ext) || fileName.startsWith(".")) return "config";
  if (DOC_EXTENSIONS.has(ext)) return "docs";
  return "unknown";
}

function scoreFile(
  relPath: string,
  fileName: string,
  ext: string,
  keywords: string[],
  hints: string[],
): {
  score: number;
  confidence: "low" | "med" | "high";
  reason: string;
  kind: CandidateFile["kind"];
  matchedTerms: string[];
} {
  let score = 0;
  const matchedTerms: string[] = [];
  const lowerPath = relPath.toLowerCase();
  const lowerName = fileName.toLowerCase();

  const kind = classifyFileKind(ext, fileName);
  const isSource = kind === "source";

  if (isSource) score += 1;

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

  for (const hint of hints) {
    const hintLower = hint.toLowerCase().split(path.sep).join("/");
    if (lowerPath.startsWith(hintLower) || lowerPath.includes(hintLower)) {
      score += 4;
      if (!matchedTerms.includes(`hint:${hint}`)) {
        matchedTerms.push(`hint:${hint}`);
      }
    }
  }

  const reasons: string[] = [];
  if (matchedTerms.length > 0) {
    reasons.push(`matches: ${matchedTerms.join(", ")}`);
  }
  if (kind === "source" && score > 0) reasons.push("source file");
  if (kind === "test") reasons.push("test file");
  if (kind === "config" && score > 0) reasons.push("config file");

  const reason = reasons.length > 0 ? reasons.join("; ") : "scanned";

  const confidence: "low" | "med" | "high" =
    matchedTerms.length >= 3 ? "high" : matchedTerms.length >= 1 ? "med" : "low";

  return { score, confidence, reason, kind, matchedTerms };
}

async function scoreContent(
  fullPath: string,
  keywords: string[],
  maxBytes: number,
): Promise<{ score: number; matchedTerms: string[] }> {
  let content: string;
  try {
    const buf = Buffer.alloc(maxBytes);
    const fh = await fsp.open(fullPath, "r");
    try {
      const { bytesRead } = await fh.read(buf, 0, maxBytes, 0);
      content = buf.subarray(0, bytesRead).toString("utf-8").toLowerCase();
    } finally {
      await fh.close();
    }
  } catch {
    return { score: 0, matchedTerms: [] };
  }

  let score = 0;
  const matchedTerms: string[] = [];

  for (const kw of keywords) {
    const kwLower = kw.toLowerCase();
    if (content.includes(kwLower)) {
      score += 2;
      matchedTerms.push(`content:${kw}`);
    }
  }

  return { score, matchedTerms };
}
