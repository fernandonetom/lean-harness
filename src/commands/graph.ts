import { createLogger, printJson } from "../core/logger.js";
import { CLIError } from "../core/errors.js";
import { ensureGraphBuilt } from "../graph/index.js";
import {
  buildImportGraph, saveImportGraph, loadImportGraph, graphPath,
} from "../graph/import-graph.js";
import {
  buildSymbolGraph, saveSymbolGraph, loadSymbolGraph, symbolGraphPath,
} from "../graph/symbol-graph.js";
import fsp from "node:fs/promises";

export interface GraphOptions {
  cwd: string;
  subcommand: string;
  json?: boolean | undefined;
}

export async function runGraphCommand(options: GraphOptions): Promise<void> {
  const { cwd, subcommand, json = false } = options;
  const log = createLogger({ json });

  switch (subcommand) {
    case "build": {
      log.info("Building import and symbol graphs from scratch...");
      const importGraph = await buildImportGraph(cwd);
      await saveImportGraph(cwd, importGraph);
      const symbolGraph = await buildSymbolGraph(cwd, Object.keys(importGraph.nodes));
      await saveSymbolGraph(cwd, symbolGraph);
      if (json) {
        printJson({ built: true, nodeCount: importGraph.nodeCount, edgeCount: importGraph.edgeCount, symbolCount: Object.keys(symbolGraph.symbols).length });
      } else {
        log.success(`Graph built: ${importGraph.nodeCount} nodes, ${importGraph.edgeCount} edges, ${Object.keys(symbolGraph.symbols).length} symbol files.`);
        log.info(`  Import graph: ${graphPath(cwd)}`);
        log.info(`  Symbol graph: ${symbolGraphPath(cwd)}`);
      }
      break;
    }
    case "update": {
      log.info("Updating graphs (incremental)...");
      const result = await ensureGraphBuilt(cwd);
      const action = result.built ? "built" : result.updated ? "updated" : "already up to date";
      if (json) {
        printJson({ action, nodeCount: result.nodeCount, edgeCount: result.edgeCount });
      } else {
        log.success(`Graph ${action}: ${result.nodeCount} nodes, ${result.edgeCount} edges.`);
      }
      break;
    }
    case "inspect": {
      const importGraph = await loadImportGraph(cwd);
      const symbolGraph = await loadSymbolGraph(cwd);
      if (!importGraph) {
        if (json) { printJson({ error: "No import graph found. Run: lh graph build" }); return; }
        throw new CLIError("No import graph found. Run: lh graph build");
      }
      if (json) {
        printJson({
          builtAt: importGraph.builtAt,
          rootDir: importGraph.rootDir,
          nodeCount: importGraph.nodeCount,
          edgeCount: importGraph.edgeCount,
          symbolFiles: symbolGraph ? Object.keys(symbolGraph.symbols).length : 0,
          importGraphPath: graphPath(cwd),
          symbolGraphPath: symbolGraphPath(cwd),
        });
      } else {
        log.info(`Import graph: ${importGraph.nodeCount} nodes, ${importGraph.edgeCount} edges`);
        log.info(`Built at:     ${importGraph.builtAt}`);
        log.info(`Root:         ${importGraph.rootDir}`);
        if (symbolGraph) {
          log.info(`Symbol graph: ${Object.keys(symbolGraph.symbols).length} files with symbols`);
        }
      }
      break;
    }
    case "clear": {
      const importFile = graphPath(cwd);
      const symbolFile = symbolGraphPath(cwd);
      let cleared = 0;
      for (const f of [importFile, symbolFile]) {
        try { await fsp.unlink(f); cleared++; } catch { /* already absent */ }
      }
      if (json) {
        printJson({ cleared });
      } else {
        log.success(`Cleared ${cleared} graph file(s).`);
      }
      break;
    }
    default:
      throw new CLIError(`Unknown graph subcommand: ${subcommand}. Expected build, update, inspect, or clear.`);
  }
}
