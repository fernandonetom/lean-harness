import path from "node:path";
import fsp from "node:fs/promises";
import { ensureDir } from "../core/fs.js";
import type { LHImportGraph, GraphNode } from "./import-graph.js";
import type { LHSymbolGraph } from "./symbol-graph.js";
import { graphNeighborhood } from "./import-graph.js";

export interface GraphExportData {
  version: string;
  exportedAt: string;
  rootDir: string;
  importGraph: {
    nodeCount: number;
    edgeCount: number;
    nodes: Array<{
      path: string;
      kind: string;
      size: number;
      importCount: number;
    }>;
    edges: Array<{
      from: string;
      to: string;
      kind: string;
    }>;
  };
  symbolGraph: {
    symbolFileCount: number;
    totalSymbols: number;
    symbols: Array<{
      name: string;
      kind: string;
      filePath: string;
      line?: number;
      isExported?: boolean;
    }>;
    relationships: Array<{
      from: string;
      to: string;
      kind: string;
    }>;
  };
  metadata: {
    godNodes: Array<{ path: string; importCount: number }>;
    directoryClusters: Record<string, string[]>;
    communities?: {
      count: number;
      sizes: number[];
      largest: number;
      nodeAssignments: Record<string, number>;
    };
  };
}

interface CommunityStats {
  communityCount: number;
  communitySizes: number[];
  largestCommunity: number;
}

export async function exportJson(
  root: string,
  importGraph: LHImportGraph,
  symbolGraph: LHSymbolGraph,
): Promise<string> {
  const outputPath = path.resolve(root, "graphify-out/graph.json");
  await ensureDir(path.dirname(outputPath));

  const godNodes = Object.entries(importGraph.nodes)
    .map(([path, node]) => ({ path, importCount: node.importCount }))
    .sort((a, b) => b.importCount - a.importCount)
    .slice(0, 20);

  const dirClusters: Record<string, string[]> = {};
  for (const filePath of Object.keys(importGraph.nodes)) {
    const dir = path.dirname(filePath);
    if (!dirClusters[dir]) dirClusters[dir] = [];
    dirClusters[dir]!.push(filePath);
  }

  const communityData = detectCommunities(importGraph);

  const allSymbols: Array<{
    name: string;
    kind: string;
    filePath: string;
    line?: number;
    isExported?: boolean;
  }> = [];
  for (const [filePath, symbols] of Object.entries(symbolGraph.symbols)) {
    for (const sym of symbols) {
      const symEntry: { name: string; kind: string; filePath: string; line?: number; isExported?: boolean } = {
        name: sym.name,
        kind: sym.kind,
        filePath: sym.filePath,
      };
      if (sym.line !== undefined) symEntry.line = sym.line;
      if (sym.isExported !== undefined) symEntry.isExported = sym.isExported;
      allSymbols.push(symEntry);
    }
  }

  const exportData: GraphExportData = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    rootDir: importGraph.rootDir,
    importGraph: {
      nodeCount: importGraph.nodeCount,
      edgeCount: importGraph.edgeCount,
      nodes: Object.values(importGraph.nodes).map((node) => ({
        path: node.path,
        kind: node.kind,
        size: node.size,
        importCount: node.importCount,
      })),
      edges: importGraph.edges.map((edge) => ({
        from: edge.from,
        to: edge.to,
        kind: edge.kind,
      })),
    },
    symbolGraph: {
      symbolFileCount: Object.keys(symbolGraph.symbols).length,
      totalSymbols: allSymbols.length,
      symbols: allSymbols,
      relationships: symbolGraph.relationships.map((rel) => ({
        from: rel.from,
        to: rel.to,
        kind: rel.kind,
      })),
    },
    metadata: {
      godNodes,
      directoryClusters: dirClusters,
      communities: {
        count: communityData.stats.communityCount,
        sizes: communityData.stats.communitySizes,
        largest: communityData.stats.largestCommunity,
        nodeAssignments: communityData.communities,
      },
    },
  };

  await fsp.writeFile(outputPath, JSON.stringify(exportData, null, 2));
  return outputPath;
}

export async function exportDot(
  root: string,
  importGraph: LHImportGraph,
): Promise<string> {
  const outputPath = path.resolve(root, "graphify-out/graph.dot");
  await ensureDir(path.dirname(outputPath));

  const lines: string[] = [];
  lines.push("digraph CodeGraph {");
  lines.push("  rankdir=LR;");
  lines.push("  node [shape=box, style=filled, fontsize=10];");
  lines.push("  edge [fontsize=8];");
  lines.push("");

  const dirClusters: Record<string, string[]> = {};
  for (const filePath of Object.keys(importGraph.nodes)) {
    const dir = path.dirname(filePath);
    if (!dirClusters[dir]) dirClusters[dir] = [];
    dirClusters[dir]!.push(filePath);
  }

  const clusterIds = new Map<string, number>();
  let clusterId = 0;
  for (const dir of Object.keys(dirClusters)) {
    clusterIds.set(dir, clusterId++);
  }

  for (const [dir, files] of Object.entries(dirClusters)) {
    const clusterNum = clusterIds.get(dir)!;
    const safeDir = dir.replace(/[^a-zA-Z0-9]/g, "_");
    lines.push(`  subgraph cluster_${clusterNum} {`);
    lines.push(`    label="${dir}";`);
    lines.push("    style=dashed;");
    lines.push("    color=gray;");

    for (const filePath of files) {
      const node = importGraph.nodes[filePath]!;
      const color = getNodeColor(node.kind);
      const safeName = filePath.replace(/[^a-zA-Z0-9]/g, "_");
      const label = path.basename(filePath);
      lines.push(`    "${safeName}" [label="${label}", fillcolor="${color}"];`);
    }

    lines.push("  }");
    lines.push("");
  }

  for (const edge of importGraph.edges) {
    const fromSafe = edge.from.replace(/[^a-zA-Z0-9]/g, "_");
    const toSafe = edge.to.replace(/[^a-zA-Z0-9]/g, "_");
    const color = getEdgeColor(edge.kind);
    lines.push(`  "${fromSafe}" -> "${toSafe}" [color="${color}"];`);
  }

  lines.push("}");

  await fsp.writeFile(outputPath, lines.join("\n"));
  return outputPath;
}

export async function exportHtml(
  root: string,
  importGraph: LHImportGraph,
  symbolGraph: LHSymbolGraph,
  options?: { seedFiles?: string[]; maxDistance?: number },
): Promise<string> {
  const outputPath = path.resolve(root, "graphify-out/graph.html");
  await ensureDir(path.dirname(outputPath));

  const godNodes = Object.entries(importGraph.nodes)
    .map(([path, node]) => ({ path, importCount: node.importCount }))
    .sort((a, b) => b.importCount - a.importCount)
    .slice(0, 10);

  const communityData = detectCommunities(importGraph);

  let filteredNodes = Object.values(importGraph.nodes);
  let filteredEdges = importGraph.edges;

  if (options?.seedFiles && options.seedFiles.length > 0) {
    const maxDist = options.maxDistance ?? 2;
    const neighborhood = graphNeighborhood(importGraph, options.seedFiles, maxDist);
    const neighborhoodSet = new Set(neighborhood.paths);
    
    filteredNodes = filteredNodes.filter(n => neighborhoodSet.has(n.path));
    filteredEdges = filteredEdges.filter(e => 
      neighborhoodSet.has(e.from) && neighborhoodSet.has(e.to)
    );
  }

  const nodes = filteredNodes.map((node) => ({
    id: node.path,
    label: path.basename(node.path),
    group: node.kind,
    size: Math.min(20, 5 + node.importCount),
    importCount: node.importCount,
    distance: options?.seedFiles ? graphDistanceFromSeeds(importGraph, node.path, options.seedFiles) : -1,
    community: communityData.communities[node.path] ?? 0,
  }));

  const edges = filteredEdges.map((edge) => ({
    source: edge.from,
    target: edge.to,
    type: edge.kind,
  }));

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LeanHarness Code Graph - ${path.basename(importGraph.rootDir)}</title>
  <script src="https://cdn.jsdelivr.net/npm/d3@7.8.5/dist/d3.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; }
    #container { display: flex; height: 100vh; }
    #sidebar { width: 320px; background: #1e293b; padding: 20px; overflow-y: auto; border-right: 1px solid #334155; }
    #graph-container { flex: 1; position: relative; overflow: hidden; }
    h1 { font-size: 18px; margin-bottom: 16px; color: #f1f5f9; }
    h2 { font-size: 14px; margin: 16px 0 8px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
    .stat { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #334155; }
    .stat-label { color: #94a3b8; }
    .stat-value { color: #f1f5f9; font-weight: 600; }
    .god-node { padding: 8px; margin: 4px 0; background: #334155; border-radius: 4px; font-size: 12px; cursor: pointer; transition: background 0.2s; }
    .god-node:hover { background: #475569; }
    .god-node-count { color: #22c55e; float: right; }
    #search { width: 100%; padding: 10px; border: 1px solid #334155; border-radius: 6px; background: #0f172a; color: #e2e8f0; margin-bottom: 16px; }
    #search::placeholder { color: #64748b; }
    .legend { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; }
    .legend-color { width: 16px; height: 16px; border-radius: 3px; }
    .node-label { position: absolute; pointer-events: none; font-size: 11px; fill: #e2e8f0; text-shadow: 0 1px 2px rgba(0,0,0,0.8); }
    .tooltip { position: absolute; padding: 12px; background: #1e293b; border: 1px solid #334155; border-radius: 8px; font-size: 12px; pointer-events: none; opacity: 0; transition: opacity 0.2s; max-width: 300px; z-index: 1000; }
    .tooltip-title { font-weight: 600; margin-bottom: 8px; color: #f1f5f9; }
    .tooltip-row { display: flex; justify-content: space-between; padding: 4px 0; }
    .filter-group { margin: 16px 0; }
    .filter-checkbox { display: flex; align-items: center; gap: 8px; margin: 4px 0; font-size: 12px; cursor: pointer; }
    .filter-checkbox input { accent-color: #3b82f6; }
    #zoom-controls { position: absolute; bottom: 20px; right: 20px; display: flex; gap: 8px; }
    .zoom-btn { width: 36px; height: 36px; border: none; border-radius: 6px; background: #1e293b; color: #e2e8f0; cursor: pointer; font-size: 18px; transition: background 0.2s; }
    .zoom-btn:hover { background: #334155; }
  </style>
</head>
<body>
  <div id="container">
    <div id="sidebar">
      <h1>Code Graph</h1>
      <input type="text" id="search" placeholder="Search files...">
      
      <h2>Statistics</h2>
      <div class="stat"><span class="stat-label">Files</span><span class="stat-value">${importGraph.nodeCount}</span></div>
      <div class="stat"><span class="stat-label">Dependencies</span><span class="stat-value">${importGraph.edgeCount}</span></div>
      <div class="stat"><span class="stat-label">Symbol Files</span><span class="stat-value">${Object.keys(symbolGraph.symbols).length}</span></div>
      <div class="stat"><span class="stat-label">Communities</span><span class="stat-value" id="community-count">${communityData.stats.communityCount}</span></div>
      <div class="stat"><span class="stat-label">Largest</span><span class="stat-value" id="largest-community">${communityData.stats.largestCommunity}</span></div>
      
      <h2>Communities</h2>
      <div class="filter-group">
        <label class="filter-checkbox"><input type="checkbox" id="community-all" checked> Show All</label>
        <div id="community-filters"></div>
      </div>
      
      <h2>Most Imported Files</h2>
      <div id="god-nodes">
        ${godNodes.map((n) => `<div class="god-node" data-path="${n.path}">${path.basename(n.path)}<span class="god-node-count">${n.importCount}</span></div>`).join("")}
      </div>
      
      <h2>File Types</h2>
      <div class="filter-group">
        <label class="filter-checkbox"><input type="checkbox" value="source" checked> Source</label>
        <label class="filter-checkbox"><input type="checkbox" value="test" checked> Test</label>
        <label class="filter-checkbox"><input type="checkbox" value="config" checked> Config</label>
        <label class="filter-checkbox"><input type="checkbox" value="docs" checked> Docs</label>
      </div>
      
      <h2>Filter by Distance</h2>
      <div class="filter-group">
        <label>Max Distance: <span id="distance-value">all</span></label>
        <input type="range" id="distance-filter" min="0" max="5" value="5" style="width:100%;margin:8px 0;">
        <input type="text" id="seed-files" placeholder="Seed files (comma-separated)" style="width:100%;padding:8px;border:1px solid #334155;border-radius:4px;background:#0f172a;color:#e2e8f0;font-size:12px;">
        <button id="apply-distance" style="width:100%;padding:8px;margin-top:8px;border:none;border-radius:4px;background:#3b82f6;color:#fff;cursor:pointer;font-size:12px;">Apply Filter</button>
      </div>
      
      <h2>Legend</h2>
      <div class="legend">
        <div class="legend-item"><div class="legend-color" style="background: #3b82f6;"></div>Source</div>
        <div class="legend-item"><div class="legend-color" style="background: #22c55e;"></div>Test</div>
        <div class="legend-item"><div class="legend-color" style="background: #f59e0b;"></div>Config</div>
        <div class="legend-item"><div class="legend-color" style="background: #8b5cf6;"></div>Docs</div>
      </div>
      <div class="legend">
        <div class="legend-item"><div style="width:16px;height:2px;background:#64748b;"></div>Import</div>
        <div class="legend-item"><div style="width:16px;height:2px;background:#3b82f6;"></div>Dynamic</div>
        <div class="legend-item"><div style="width:16px;height:2px;background:#f59e0b;"></div>Require</div>
      </div>
      <div class="legend" id="distance-legend" style="margin-top:12px;">
        <div style="font-size:11px;color:#94a3b8;margin-bottom:4px;">Distance from seed:</div>
        <div class="legend-item"><div class="legend-color" style="background: #22c55e;"></div>0 hops (seed)</div>
        <div class="legend-item"><div class="legend-color" style="background: #84cc16;"></div>1 hop</div>
        <div class="legend-item"><div class="legend-color" style="background: #eab308;"></div>2 hops</div>
        <div class="legend-item"><div class="legend-color" style="background: #f97316;"></div>3 hops</div>
        <div class="legend-item"><div class="legend-color" style="background: #ef4444;"></div>4+ hops</div>
      </div>
    </div>
    
    <div id="graph-container">
      <div id="zoom-controls">
        <button class="zoom-btn" id="zoom-in">+</button>
        <button class="zoom-btn" id="zoom-out">−</button>
        <button class="zoom-btn" id="zoom-fit">⟲</button>
      </div>
    </div>
  </div>
  
  <div id="tooltip" class="tooltip"></div>
  
  <script>
    const graphData = ${JSON.stringify({ nodes, edges })};
    const allNodes = graphData.nodes;
    const allEdges = graphData.edges;
    const container = document.getElementById('graph-container');
    const tooltip = document.getElementById('tooltip');
    
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    const svg = d3.select('#graph-container')
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height]);
    
    const g = svg.append('g');
    
    const colorMap = { source: '#3b82f6', test: '#22c55e', config: '#f59e0b', docs: '#8b5cf6', unknown: '#64748b' };
    const edgeColorMap = { import: '#64748b', dynamic: '#3b82f6', require: '#f59e0b' };
    const distanceColorMap = {
      0: '#22c55e',
      1: '#84cc16',
      2: '#eab308',
      3: '#f97316',
      4: '#ef4444',
    };
    const communityColors = [
      '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444',
      '#ec4899', '#14b8a6', '#f97316', '#84cc16', '#06b6d4',
      '#8b5cf6', '#f43f5e', '#0ea5e9', '#6366f1', '#10b981'
    ];
    
    let currentFilter = new Set(['source', 'test', 'config', 'docs']);
    let currentMaxDistance = 5;
    let currentSeedFiles = [];
    let showByCommunity = false;
    let selectedCommunities = new Set();
    
    let filteredNodes = allNodes;
    let filteredEdges = allEdges;
    let currentSearchTerm = '';
    let node, link;
    
    function applyFilters() {
      filteredNodes = allNodes.filter(n => {
        const typeMatch = currentFilter.has(n.group);
        const distanceMatch = currentSeedFiles.length === 0 || 
          (n.distance >= 0 && n.distance <= currentMaxDistance);
        const communityMatch = selectedCommunities.size === 0 || selectedCommunities.has(n.community);
        return typeMatch && distanceMatch && communityMatch;
      });
      
      filteredEdges = allEdges.filter(e => 
        filteredNodes.some(n => n.id === e.source) &&
        filteredNodes.some(n => n.id === e.target)
      );
      
      rebuildGraph();
    }
    
    const communityCounts = {};
    allNodes.forEach(n => {
      communityCounts[n.community] = (communityCounts[n.community] || 0) + 1;
    });
    
    const communityFilterContainer = document.getElementById('community-filters');
    Object.entries(communityCounts).forEach(([commId, count]) => {
      const communityId = parseInt(commId, 10);
      selectedCommunities.add(communityId);
      const label = document.createElement('label');
      label.className = 'filter-checkbox';
      const colorBox = document.createElement('span');
      colorBox.style.cssText = 'display:inline-block;width:12px;height:12px;border-radius:2px;margin-right:4px;';
      colorBox.style.background = communityColors[communityId % communityColors.length];
      label.appendChild(colorBox);
      label.innerHTML += '<input type="checkbox" value="' + communityId + '" checked> Community ' + communityId + ' (' + count + ' files)';
      label.querySelector('input').addEventListener('change', (e) => {
        const checked = e.target.checked;
        if (checked) {
          selectedCommunities.add(communityId);
        } else {
          selectedCommunities.delete(communityId);
        }
        applyFilters();
      });
      communityFilterContainer.appendChild(label);
    });
    
    document.getElementById('community-all').addEventListener('change', (e) => {
      const checked = e.target.checked;
      const checkboxes = communityFilterContainer.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach(cb => {
        cb.checked = checked;
      });
      if (checked) {
        Object.keys(communityCounts).forEach(id => {
          selectedCommunities.add(parseInt(id, 10));
        });
      } else {
        selectedCommunities.clear();
      }
      applyFilters();
    });
    
    function rebuildGraph() {
      g.selectAll('*').remove();
      
      const simulation = d3.forceSimulation(filteredNodes)
        .force('charge', d3.forceManyBody().strength(-50))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('link', d3.forceLink(filteredEdges).id(d => d.id).distance(100))
        .force('collide', d3.forceCollide().radius(20))
        .on('tick', ticked);
      
      link = g.append('g')
        .attr('stroke', '#999')
        .attr('stroke-opacity', 0.6)
        .selectAll('line')
        .data(filteredEdges)
        .join('line')
        .attr('stroke', d => edgeColorMap[d.type] || '#64748b')
        .attr('stroke-width', 1.5);
      
      node = g.append('g')
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.5)
        .selectAll('circle')
        .data(filteredNodes)
        .join('circle')
        .attr('r', d => d.size)
        .attr('fill', d => {
          if (showByCommunity) {
            return communityColors[d.community % communityColors.length];
          }
          if (currentSeedFiles.length > 0 && d.distance >= 0) {
            return distanceColorMap[Math.min(4, d.distance)] || '#64748b';
          }
          return colorMap[d.group] || '#64748b';
        })
        .call(drag(simulation));
      
      if (currentSearchTerm) {
        node.attr('opacity', d => d.id.toLowerCase().includes(currentSearchTerm) ? 1 : 0.2);
        link.attr('opacity', d => d.source.id.toLowerCase().includes(currentSearchTerm) || d.target.id.toLowerCase().includes(currentSearchTerm) ? 1 : 0.1);
      }
      
      function ticked() {
        link
          .attr('x1', d => d.source.x)
          .attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x)
          .attr('y2', d => d.target.y);
        
        node
          .attr('cx', d => d.x)
          .attr('cy', d => d.y);
      }
      
      function drag(simulation) {
        function dragstarted(event) {
          if (!event.active) simulation.alphaTarget(0.3).restart();
        }
        function dragged(event) {
          event.subject.fx = event.x;
          event.subject.fy = event.y;
          simulation.alpha(0.3).restart();
        }
        function dragended(event) {
          if (!event.active) simulation.alphaTarget(0);
          event.subject.fx = null;
          event.subject.fy = null;
        }
        return d3.drag().on('start', dragstarted).on('drag', dragged).on('end', dragended);
      }
      
      node.on('mouseover', (event, d) => {
        tooltip.style.opacity = 1;
        tooltip.innerHTML = \`
          <div class="tooltip-title">\${d.label}</div>
          <div class="tooltip-row"><span>Path:</span><span>\${d.id}</span></div>
          <div class="tooltip-row"><span>Type:</span><span>\${d.group}</span></div>
          <div class="tooltip-row"><span>Imported by:</span><span>\${d.importCount}</span></div>
          \${currentSeedFiles.length > 0 && d.distance >= 0 ? 
            \`<div class="tooltip-row"><span>Distance:</span><span>\${d.distance} hops</span></div>\` : ''}
        \`;
      }).on('mousemove', (event) => {
        tooltip.style.left = (event.pageX + 10) + 'px';
        tooltip.style.top = (event.pageY - 10) + 'px';
      }).on('mouseout', () => {
        tooltip.style.opacity = 0;
      });
    }
    
    rebuildGraph();
    
    const zoom = d3.zoom().on('zoom', (event) => {
      g.attr('transform', event.transform);
    });
    
    svg.call(zoom);
    
    document.getElementById('zoom-in').addEventListener('click', () => {
      svg.transition().call(zoom.scaleBy, 1.3);
    });
    
    document.getElementById('zoom-out').addEventListener('click', () => {
      svg.transition().call(zoom.scaleBy, 0.7);
    });
    
    document.getElementById('zoom-fit').addEventListener('click', () => {
      svg.transition().call(zoom.transform, d3.zoomIdentity);
    });
    
    function graphDistanceFromSeeds(nodes, seedFiles) {
      if (seedFiles.length === 0) return -1;
      const distances = new Map();
      const queue = [];
      
      for (const seed of seedFiles) {
        const node = nodes.find(n => n.id === seed || n.id.includes(seed));
        if (node) {
          distances.set(node.id, 0);
          queue.push({ id: node.id, dist: 0 });
        }
      }
      
      while (queue.length > 0) {
        const { id, dist } = queue.shift();
        if (dist >= 5) continue;
        
        const neighbors = allEdges
          .filter(e => e.source === id || e.target === id)
          .map(e => e.source === id ? e.target : e.source);
        
        for (const neighbor of neighbors) {
          if (!distances.has(neighbor)) {
            distances.set(neighbor, dist + 1);
            queue.push({ id: neighbor, dist: dist + 1 });
          }
        }
      }
      
      return distances;
    }
    
    const distanceMap = graphDistanceFromSeeds(allNodes, currentSeedFiles);
    allNodes.forEach(n => {
      n.distance = distanceMap.get(n.id) ?? -1;
    });
    
    document.getElementById('search').addEventListener('input', (e) => {
      currentSearchTerm = e.target.value.toLowerCase();
      if (node) {
        node.attr('opacity', d => currentSearchTerm === '' || d.id.toLowerCase().includes(currentSearchTerm) ? 1 : 0.2);
      }
      if (link) {
        link.attr('opacity', d => currentSearchTerm === '' || d.source.id.toLowerCase().includes(currentSearchTerm) || d.target.id.toLowerCase().includes(currentSearchTerm) ? 1 : 0.1);
      }
    });
    
    document.querySelectorAll('.filter-checkbox input').forEach(cb => {
      cb.addEventListener('change', () => {
        currentFilter = new Set(Array.from(document.querySelectorAll('.filter-checkbox input:checked')).map(i => i.value));
        applyFilters();
      });
    });
    
    document.getElementById('distance-filter').addEventListener('input', (e) => {
      const val = e.target.value;
      currentMaxDistance = parseInt(val, 10);
      document.getElementById('distance-value').textContent = val === '5' ? 'all' : val + ' hops';
    });
    
    document.getElementById('apply-distance').addEventListener('click', () => {
      const seedInput = document.getElementById('seed-files').value;
      currentSeedFiles = seedInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
      applyFilters();
    });
    
    document.querySelectorAll('.god-node').forEach(el => {
      el.addEventListener('click', () => {
        const path = el.dataset.path;
        const targetNode = graphData.nodes.find(n => n.id === path);
        if (targetNode) {
          svg.transition().duration(750).call(
            zoom.transform,
            d3.zoomIdentity.translate(width/2 - targetNode.x, height/2 - targetNode.y).scale(3)
          );
        }
      });
    });
    
    window.addEventListener('resize', () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      svg.attr('width', w).attr('height', h);
      simulation.force('center', d3.forceCenter(w / 2, h / 2));
      simulation.alpha(0.3).restart();
    });
  </script>
</body>
</html>`;

  await fsp.writeFile(outputPath, html);
  return outputPath;
}

function detectCommunities(
  importGraph: LHImportGraph
): { communities: Record<string, number>; stats: CommunityStats } {
  const communities: Record<string, number> = {};
  let communityId = 0;
  const visited = new Set<string>();
  
  for (const node of Object.keys(importGraph.nodes)) {
    if (!visited.has(node)) {
      bfsAssignCommunity(node, communityId++, visited, communities, importGraph);
    }
  }
  
  const communitySizes: number[] = [];
  for (let i = 0; i < communityId; i++) {
    communitySizes.push(0);
  }
  for (const commId of Object.values(communities)) {
    communitySizes[commId]!++;
  }
  communitySizes.sort((a, b) => b - a);
  
  return {
    communities,
    stats: {
      communityCount: communityId,
      communitySizes,
      largestCommunity: communitySizes[0] ?? 0,
    },
  };
}

function bfsAssignCommunity(
  startNode: string,
  communityId: number,
  visited: Set<string>,
  communities: Record<string, number>,
  graph: LHImportGraph
): void {
  const queue = [startNode];
  visited.add(startNode);
  communities[startNode] = communityId;
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = graph.edges
      .filter(e => e.from === current || e.to === current)
      .map(e => e.from === current ? e.to : e.from);
    
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor) && graph.nodes[neighbor]) {
        visited.add(neighbor);
        communities[neighbor] = communityId;
        queue.push(neighbor);
      }
    }
  }
}

function getNodeColor(kind: string): string {
  const colors: Record<string, string> = {
    source: "#3b82f6",
    test: "#22c55e",
    config: "#f59e0b",
    docs: "#8b5cf6",
    unknown: "#64748b",
  };
  return colors[kind] || "#64748b";
}

function getEdgeColor(kind: string): string {
  const colors: Record<string, string> = {
    import: "#64748b",
    dynamic: "#3b82f6",
    require: "#f59e0b",
  };
  return colors[kind] || "#64748b";
}

function graphDistanceFromSeeds(
  graph: LHImportGraph,
  filePath: string,
  seedFiles: string[],
): number {
  const hops: Record<string, number> = {};
  const neighborhood = graphNeighborhood(graph, seedFiles, 5);
  
  for (const [path, distance] of Object.entries(neighborhood.hops)) {
    if (path === filePath) return distance;
  }
  
  return -1;
}

export interface SubgraphOptions {
  pattern?: string;
  kind?: string[];
  directory?: string;
}

export async function exportSubgraph(
  root: string,
  importGraph: LHImportGraph,
  symbolGraph: LHSymbolGraph,
  options: SubgraphOptions,
): Promise<string> {
  const outputPath = path.resolve(root, "graphify-out/subgraph.json");
  await ensureDir(path.dirname(outputPath));

  const matchesPattern = (filePath: string) => {
    if (!options.pattern) return true;
    const pattern = options.pattern.replace(/\*/g, ".*").replace(/\?/g, ".");
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(filePath);
  };
  
  const matchesKind = (kind: string) => {
    if (!options.kind || options.kind.length === 0) return true;
    return options.kind.includes(kind);
  };
  
  const matchesDirectory = (filePath: string) => {
    if (!options.directory) return true;
    return filePath.startsWith(options.directory + "/") || 
           filePath.startsWith(options.directory);
  };

  const filteredNodes: Record<string, GraphNode> = {};
  for (const [filePath, node] of Object.entries(importGraph.nodes)) {
    if (matchesPattern(filePath) && matchesKind(node.kind) && matchesDirectory(filePath)) {
      filteredNodes[filePath] = node;
    }
  }

  const filteredEdges = importGraph.edges.filter(
    (edge) => filteredNodes[edge.from] && filteredNodes[edge.to]
  );

  const subgraph: LHImportGraph = {
    version: importGraph.version,
    builtAt: importGraph.builtAt,
    rootDir: importGraph.rootDir,
    nodeCount: Object.keys(filteredNodes).length,
    edgeCount: filteredEdges.length,
    nodes: filteredNodes,
    edges: filteredEdges,
  };

  const exportData = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    filterOptions: options,
    subgraph: {
      nodeCount: subgraph.nodeCount,
      edgeCount: subgraph.edgeCount,
      nodes: Object.values(subgraph.nodes).map((node) => ({
        path: node.path,
        kind: node.kind,
        size: node.size,
        importCount: node.importCount,
      })),
      edges: subgraph.edges.map((edge) => ({
        from: edge.from,
        to: edge.to,
        kind: edge.kind,
      })),
    },
  };

  await fsp.writeFile(outputPath, JSON.stringify(exportData, null, 2));
  return outputPath;
}

export interface SvgExportOptions {
  width?: number;
  height?: number;
}

export async function exportSvg(
  root: string,
  importGraph: LHImportGraph,
  options: SvgExportOptions = {},
): Promise<string> {
  const outputPath = path.resolve(root, "graphify-out/graph.svg");
  await ensureDir(path.dirname(outputPath));

  const width = options.width ?? 1920;
  const height = options.height ?? 1080;

  const nodes = Object.values(importGraph.nodes);
  const edges = importGraph.edges;

  const svgLines: string[] = [];
  svgLines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  svgLines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
  svgLines.push(`  <rect width="100%" height="100%" fill="#0f172a"/>`);
  svgLines.push(`  <defs>`);
  svgLines.push(`    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">`);
  svgLines.push(`      <polygon points="0 0, 10 3.5, 0 7" fill="#64748b"/>`);
  svgLines.push(`    </marker>`);
  svgLines.push(`  </defs>`);

  const nodePositions: Record<string, { x: number; y: number }> = {};
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.35;

  for (let i = 0; i < nodes.length; i++) {
    const angle = (2 * Math.PI * i) / nodes.length;
    nodePositions[nodes[i]!.path] = {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  }

  for (const edge of edges) {
    const from = nodePositions[edge.from];
    const to = nodePositions[edge.to];
    if (!from || !to) continue;

    const color = getEdgeColor(edge.kind);
    svgLines.push(`  <line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${color}" stroke-width="1" marker-end="url(#arrowhead)" opacity="0.6"/>`);
  }

  for (const node of nodes) {
    const pos = nodePositions[node.path];
    if (!pos) continue;

    const color = getNodeColor(node.kind);
    const nodeRadius = Math.min(15, 4 + node.importCount * 0.5);
    
    svgLines.push(`  <circle cx="${pos.x}" cy="${pos.y}" r="${nodeRadius}" fill="${color}" stroke="#fff" stroke-width="1.5"/>`);
    
    if (nodeRadius > 6) {
      const label = path.basename(node.path, path.extname(node.path));
      svgLines.push(`  <text x="${pos.x}" y="${pos.y - nodeRadius - 4}" text-anchor="middle" fill="#e2e8f0" font-size="10" font-family="sans-serif">${escapeXml(label)}</text>`);
    }
  }

  svgLines.push(`  <text x="20" y="30" fill="#94a3b8" font-size="14" font-family="sans-serif">Code Graph - ${path.basename(importGraph.rootDir)}</text>`);
  svgLines.push(`  <text x="20" y="50" fill="#64748b" font-size="12" font-family="sans-serif">${nodes.length} files, ${edges.length} dependencies</text>`);

  svgLines.push(`</svg>`);

  await fsp.writeFile(outputPath, svgLines.join("\n"));
  return outputPath;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
