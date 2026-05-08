import fsp from "node:fs/promises";
import path from "node:path";
import type { CandidateFile } from "./search.js";
import { classifyFileKind } from "./search.js";

export interface ImportChainOptions {
  maxDepth: number;
  maxContentReadBytes?: number;
}

export interface ImportChainResult {
  newCandidates: CandidateFile[];
  parsedImportCount: number;
  unresolvedImports: string[];
  notes: string[];
}

const IMPORT_PATTERNS = [
  /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g,
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

const EXTENSION_CANDIDATES = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

const INDEX_CANDIDATES = [
  "/index.ts",
  "/index.tsx",
  "/index.js",
  "/index.jsx",
];

export function parseImports(content: string): string[] {
  const specifiers = new Set<string>();

  for (const pattern of IMPORT_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(content)) !== null) {
      const spec = match[1];
      if (spec && (spec.startsWith("./") || spec.startsWith("../"))) {
        specifiers.add(spec);
      }
    }
  }

  return Array.from(specifiers);
}

export async function resolveImportPath(
  importSpecifier: string,
  importerDir: string,
): Promise<string | null> {
  const base = path.resolve(importerDir, importSpecifier);

  for (const ext of EXTENSION_CANDIDATES) {
    const candidate = base + ext;
    try {
      const stat = await fsp.stat(candidate);
      if (stat.isFile()) return candidate;
    } catch {
      // not found, try next
    }
  }

  for (const idx of INDEX_CANDIDATES) {
    const candidate = base + idx;
    try {
      const stat = await fsp.stat(candidate);
      if (stat.isFile()) return candidate;
    } catch {
      // not found, try next
    }
  }

  return null;
}

export async function resolveImportChain(
  root: string,
  candidates: CandidateFile[],
  options: ImportChainOptions,
): Promise<ImportChainResult> {
  const maxBytes = options.maxContentReadBytes ?? 20_000;
  const traversedPaths = new Set(candidates.filter((c) => c.kind === "source" && c.score >= 3).map((c) => c.path));
  const existingByPath = new Map(candidates.map((c) => [c.path, c]));
  const newCandidates: CandidateFile[] = [];
  const boostedCandidates: CandidateFile[] = [];
  const unresolvedImports: string[] = [];
  let parsedImportCount = 0;

  let seeds = candidates.filter((c) => c.kind === "source" && c.score >= 3);

  for (let depth = 0; depth < options.maxDepth; depth++) {
    const nextSeeds: CandidateFile[] = [];

    for (const seed of seeds) {
      const fullPath = path.resolve(root, seed.path);
      let content: string;
      try {
        const buf = Buffer.alloc(maxBytes);
        const fh = await fsp.open(fullPath, "r");
        try {
          const { bytesRead } = await fh.read(buf, 0, maxBytes, 0);
          content = buf.subarray(0, bytesRead).toString("utf-8");
        } finally {
          await fh.close();
        }
      } catch {
        continue;
      }

      const specifiers = parseImports(content);
      parsedImportCount += specifiers.length;

      for (const spec of specifiers) {
        const resolved = await resolveImportPath(spec, path.dirname(fullPath));
        if (!resolved) {
          unresolvedImports.push(`${seed.path}: ${spec}`);
          continue;
        }

        const absRoot = path.resolve(root);
        if (!resolved.startsWith(absRoot + path.sep)) {
          continue;
        }

        const relPath = path.relative(root, resolved).split(path.sep).join("/");

        if (traversedPaths.has(relPath)) continue;
        traversedPaths.add(relPath);

        const fileName = path.basename(relPath);
        const ext = path.extname(fileName);
        const kind = classifyFileKind(ext, fileName);
        const derivedScore = Math.max(3, Math.floor(seed.score * 0.6));
        const parentName = path.basename(seed.path);

        const existing = existingByPath.get(relPath);
        if (existing && existing.score < derivedScore) {
          existing.score = derivedScore;
          existing.reason = `imported by ${seed.path}`;
          existing.matchedTerms.push(`import:${parentName}`);
          boostedCandidates.push(existing);
          nextSeeds.push(existing);
          continue;
        }

        const candidate: CandidateFile = {
          path: relPath,
          reason: `imported by ${seed.path}`,
          confidence: "med",
          score: derivedScore,
          kind,
          matchedTerms: [`import:${parentName}`],
        };

        newCandidates.push(candidate);
        nextSeeds.push(candidate);
      }
    }

    seeds = nextSeeds;
    if (seeds.length === 0) break;
  }

  const notes: string[] = [];
  const totalFound = newCandidates.length + boostedCandidates.length;
  if (totalFound > 0) {
    notes.push(
      `Import traversal found ${totalFound} additional candidate(s)${boostedCandidates.length > 0 ? ` (${boostedCandidates.length} boosted)` : ""}.`,
    );
  }
  if (unresolvedImports.length > 0) {
    notes.push(
      `${unresolvedImports.length} import(s) could not be resolved.`,
    );
  }

  return { newCandidates, parsedImportCount, unresolvedImports, notes };
}
