import path from "node:path";
import { readJsonFile, writeJsonFile, ensureDir, readTextFile } from "../core/fs.js";
import { harnessPath } from "../core/paths.js";

export interface SymbolNode {
  name: string;
  kind: SymbolKind;
  filePath: string;
  line?: number | undefined;
}

export interface SymbolEdge {
  from: string;
  to: string;
  kind: "implements" | "extends" | "calls" | "uses";
}

export interface LHSymbolGraph {
  builtAt: string;
  rootDir: string;
  symbols: Record<string, SymbolNode[]>;
  relationships: SymbolEdge[];
}

export type SymbolKind =
  | "class"
  | "interface"
  | "function"
  | "const"
  | "type"
  | "enum";

const SYMBOL_GRAPH_FILE = "graph/symbol-graph.json";

const SYMBOL_PATTERNS: Array<{ pattern: RegExp; kind: SymbolKind }> = [
  { pattern: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/gm, kind: "class" },
  { pattern: /^(?:export\s+)?interface\s+(\w+)/gm, kind: "interface" },
  { pattern: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm, kind: "function" },
  { pattern: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?:=|:)/gm, kind: "const" },
  { pattern: /^(?:export\s+)?type\s+(\w+)\s*=/gm, kind: "type" },
  { pattern: /^(?:export\s+)?enum\s+(\w+)/gm, kind: "enum" },
];

const IMPLEMENTS_PATTERN = /class\s+\w+.*?\bimplements\s+([\w,\s<>]+?)(?:\{|extends)/g;
const EXTENDS_PATTERN = /class\s+\w+.*?\bextends\s+(\w+)/g;

export function symbolGraphPath(root: string): string {
  return harnessPath(root, SYMBOL_GRAPH_FILE);
}

export async function loadSymbolGraph(root: string): Promise<LHSymbolGraph | null> {
  return readJsonFile<LHSymbolGraph>(symbolGraphPath(root));
}

export async function saveSymbolGraph(root: string, graph: LHSymbolGraph): Promise<void> {
  const p = symbolGraphPath(root);
  await ensureDir(path.dirname(p));
  await writeJsonFile(p, graph, { overwrite: true });
}

export async function buildSymbolGraph(
  root: string,
  filePaths: string[],
): Promise<LHSymbolGraph> {
  const symbols: Record<string, SymbolNode[]> = {};
  const relationships: SymbolEdge[] = [];

  for (const filePath of filePaths) {
    const ext = path.extname(filePath);
    if (![".ts", ".tsx", ".js", ".jsx", ".mts", ".mjs"].includes(ext)) continue;

    const absPath = path.resolve(root, filePath);
    const content = await readTextFile(absPath);
    if (!content) continue;

    const fileSymbols = extractSymbols(content, filePath);
    if (fileSymbols.length > 0) {
      symbols[filePath] = fileSymbols;
    }

    const fileRelationships = extractRelationships(content, filePath);
    relationships.push(...fileRelationships);
  }

  return {
    builtAt: new Date().toISOString(),
    rootDir: root,
    symbols,
    relationships,
  };
}

export function findSymbol(graph: LHSymbolGraph, name: string, kind?: SymbolKind): SymbolNode[] {
  const results: SymbolNode[] = [];
  for (const [, fileSymbols] of Object.entries(graph.symbols)) {
    for (const sym of fileSymbols) {
      if (sym.name === name && (!kind || sym.kind === kind)) {
        results.push(sym);
      }
    }
  }
  return results;
}

export function findImplementors(graph: LHSymbolGraph, interfaceName: string): SymbolNode[] {
  const implementors: SymbolNode[] = [];
  for (const rel of graph.relationships) {
    if (rel.kind === "implements" && rel.to === interfaceName) {
      const symbols = graph.symbols[rel.from];
      if (symbols) {
        implementors.push(...symbols.filter((s) => s.kind === "class"));
      }
    }
  }
  return implementors;
}

export function findSubclasses(graph: LHSymbolGraph, className: string): SymbolNode[] {
  const subclasses: SymbolNode[] = [];
  for (const rel of graph.relationships) {
    if (rel.kind === "extends" && rel.to === className) {
      const symbols = graph.symbols[rel.from];
      if (symbols) {
        subclasses.push(...symbols.filter((s) => s.kind === "class"));
      }
    }
  }
  return subclasses;
}

export function symbolsInFiles(graph: LHSymbolGraph, filePaths: string[]): SymbolNode[] {
  const pathSet = new Set(filePaths);
  const results: SymbolNode[] = [];
  for (const [filePath, syms] of Object.entries(graph.symbols)) {
    if (pathSet.has(filePath)) results.push(...syms);
  }
  return results;
}

function extractSymbols(content: string, filePath: string): SymbolNode[] {
  const symbols: SymbolNode[] = [];
  const seen = new Set<string>();

  for (const { pattern, kind } of SYMBOL_PATTERNS) {
    const cloned = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = cloned.exec(content)) !== null) {
      const name = m[1];
      if (!name) continue;
      const key = `${kind}:${name}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const lineNum = countLines(content, m.index);
      symbols.push({ name, kind, filePath, line: lineNum });
    }
  }

  return symbols;
}

function extractRelationships(content: string, filePath: string): SymbolEdge[] {
  const relationships: SymbolEdge[] = [];

  let m: RegExpExecArray | null;

  const implClone = new RegExp(IMPLEMENTS_PATTERN.source, IMPLEMENTS_PATTERN.flags);
  while ((m = implClone.exec(content)) !== null) {
    const names = m[1]?.split(",").map((s) => s.trim().replace(/<.*>/, ""));
    if (!names) continue;
    for (const name of names) {
      if (name) {
        relationships.push({ from: filePath, to: name, kind: "implements" });
      }
    }
  }

  const extendsClone = new RegExp(EXTENDS_PATTERN.source, EXTENDS_PATTERN.flags);
  while ((m = extendsClone.exec(content)) !== null) {
    const name = m[1];
    if (name) {
      relationships.push({ from: filePath, to: name, kind: "extends" });
    }
  }

  return relationships;
}

function countLines(content: string, index: number): number {
  let count = 1;
  for (let i = 0; i < index; i++) {
    if (content[i] === "\n") count++;
  }
  return count;
}
