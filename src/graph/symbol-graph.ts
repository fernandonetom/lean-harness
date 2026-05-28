import path from "node:path";
import * as ts from "typescript";
import { readJsonFile, writeJsonFile, ensureDir, readTextFile } from "../core/fs.js";
import { harnessPath } from "../core/paths.js";

export interface SymbolNode {
  name: string;
  kind: SymbolKind;
  filePath: string;
  line?: number | undefined;
  isExported?: boolean;
}

export interface SymbolEdge {
  from: string;
  to: string;
  kind: "implements" | "extends" | "calls" | "uses" | "references";
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
  | "enum"
  | "method"
  | "property";

const SYMBOL_GRAPH_FILE = "graph/symbol-graph.json";

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

    const fileSymbols = extractSymbolsWithTS(content, filePath);
    if (fileSymbols.length > 0) {
      symbols[filePath] = fileSymbols;
    }

    const fileRelationships = extractRelationshipsWithTS(content, filePath);
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

function extractSymbolsWithTS(content: string, filePath: string): SymbolNode[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const symbols: SymbolNode[] = [];

  function getLineNumber(pos: number): number {
    return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
  }

  function getExportStatus(node: ts.Node): boolean {
    return ts.canHaveModifiers(node)
      ? ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false
      : false;
  }

  function visit(node: ts.Node) {
    switch (node.kind) {
      case ts.SyntaxKind.ClassDeclaration: {
        const decl = node as ts.ClassDeclaration;
        if (decl.name) {
          symbols.push({
            name: decl.name.text,
            kind: "class",
            filePath,
            line: getLineNumber(decl.name.pos),
            isExported: getExportStatus(node),
          });
        }
        break;
      }

      case ts.SyntaxKind.InterfaceDeclaration: {
        const decl = node as ts.InterfaceDeclaration;
        symbols.push({
          name: decl.name.text,
          kind: "interface",
          filePath,
          line: getLineNumber(decl.name.pos),
          isExported: getExportStatus(node),
        });
        break;
      }

      case ts.SyntaxKind.FunctionDeclaration: {
        const decl = node as ts.FunctionDeclaration;
        if (decl.name) {
          symbols.push({
            name: decl.name.text,
            kind: "function",
            filePath,
            line: getLineNumber(decl.name.pos),
            isExported: getExportStatus(node),
          });
        }
        break;
      }

      case ts.SyntaxKind.VariableStatement: {
        const decl = node as ts.VariableStatement;
        for (const varDecl of decl.declarationList.declarations) {
          if (ts.isIdentifier(varDecl.name)) {
            symbols.push({
              name: varDecl.name.text,
              kind: "const",
              filePath,
              line: getLineNumber(varDecl.pos),
              isExported: getExportStatus(node),
            });
          }
        }
        break;
      }

      case ts.SyntaxKind.TypeAliasDeclaration: {
        const decl = node as ts.TypeAliasDeclaration;
        symbols.push({
          name: decl.name.text,
          kind: "type",
          filePath,
          line: getLineNumber(decl.name.pos),
          isExported: getExportStatus(node),
        });
        break;
      }

      case ts.SyntaxKind.EnumDeclaration: {
        const decl = node as ts.EnumDeclaration;
        symbols.push({
          name: decl.name.text,
          kind: "enum",
          filePath,
          line: getLineNumber(decl.name.pos),
          isExported: getExportStatus(node),
        });
        break;
      }

      case ts.SyntaxKind.MethodDeclaration: {
        const decl = node as ts.MethodDeclaration;
        if (ts.isIdentifier(decl.name)) {
          symbols.push({
            name: decl.name.text,
            kind: "method",
            filePath,
            line: getLineNumber(decl.name.pos),
            isExported: false,
          });
        }
        break;
      }

      case ts.SyntaxKind.PropertyDeclaration: {
        const decl = node as ts.PropertyDeclaration;
        if (ts.isIdentifier(decl.name)) {
          symbols.push({
            name: decl.name.text,
            kind: "property",
            filePath,
            line: getLineNumber(decl.name.pos),
            isExported: false,
          });
        }
        break;
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return symbols;
}

function extractRelationshipsWithTS(content: string, filePath: string): SymbolEdge[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const relationships: SymbolEdge[] = [];
  const symbolMap = new Map<string, ts.Node>();

  function buildSymbolMap(node: ts.Node) {
    if (
      ts.isClassDeclaration(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isInterfaceDeclaration(node)
    ) {
      const name = (node as ts.ClassDeclaration | ts.FunctionDeclaration | ts.InterfaceDeclaration).name;
      if (name && ts.isIdentifier(name)) {
        symbolMap.set(name.text, node);
      }
    }
    ts.forEachChild(node, buildSymbolMap);
  }

  buildSymbolMap(sourceFile);

  function visit(node: ts.Node) {
    if (ts.isClassDeclaration(node)) {
      const heritageClauses = node.heritageClauses;
      if (heritageClauses) {
        for (const clause of heritageClauses) {
          for (const type of clause.types) {
            const expr = type.expression;
            if (ts.isIdentifier(expr)) {
              const className = (node.name as ts.Identifier)?.text;
              if (className) {
                const kind =
                  clause.token === ts.SyntaxKind.ImplementsKeyword ? "implements" : "extends";
                relationships.push({
                  from: filePath,
                  to: expr.text,
                  kind,
                });
              }
            }
          }
        }
      }
    }

    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr)) {
        const name = expr.text;
        if (symbolMap.has(name)) {
          relationships.push({
            from: filePath,
            to: name,
            kind: "calls",
          });
        }
      }
    }

    if (ts.isPropertyAccessExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr)) {
        const name = expr.text;
        if (symbolMap.has(name)) {
          relationships.push({
            from: filePath,
            to: name,
            kind: "references",
          });
        }
      }
    }

    if (ts.isTypeReferenceNode(node)) {
      const typeName = node.typeName;
      if (ts.isIdentifier(typeName)) {
        const name = typeName.text;
        if (symbolMap.has(name)) {
          relationships.push({
            from: filePath,
            to: name,
            kind: "references",
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return relationships;
}
