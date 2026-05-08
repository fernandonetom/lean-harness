import type { ProjectDetection } from "./project-detector.js";
import type { PackageDetection } from "./package-detector.js";
import type { SearchResult, CandidateFile } from "./search.js";
import type { TestDetection } from "./test-detector.js";
import type { DiscoveryDepth, Confidence, CompactConfidence } from "../core/types.js";

export interface BoundaryBuildInput {
  featureId: string;
  featureTitle: string;
  depth: DiscoveryDepth;
  project: ProjectDetection;
  packageInfo: PackageDetection;
  search: SearchResult;
  tests: TestDetection;
  hints: string[];
  maxFiles: number;
}

export interface BoundaryFileEntry {
  path: string;
  reason: string;
  confidence: "low" | "medium" | "high";
}

export interface BoundaryJson {
  featureId: string;
  featureTitle: string;
  status: string;
  confidence: Confidence;
  discoveryDepth: string;
  touchFiles: BoundaryFileEntry[];
  readOnlyFiles: BoundaryFileEntry[];
  relevantTests: Array<{
    path?: string | undefined;
    command?: string | undefined;
    reason: string;
    confidence: "low" | "medium" | "high";
  }>;
  commands: Array<{
    command: string;
    purpose: string;
    confidence: "low" | "medium" | "high";
    source: string;
  }>;
  allowedEditGlobs: string[];
  blockedEditGlobs: string[];
  riskGates: Array<{
    name: string;
    reason: string;
    status: "triggered" | "approved" | "resolved" | "unresolved";
  }>;
  unknowns: string[];
  doNotTouch: string[];
  protectedTokens: string[];
  lastUpdated: string;
}

export interface DiscoveryRenderInput {
  featureId: string;
  featureTitle: string;
  depth: DiscoveryDepth;
  confidence: Confidence;
  project: ProjectDetection;
  packageInfo: PackageDetection;
  boundary: BoundaryJson;
  search: SearchResult;
  tests: TestDetection;
  specSummary: string;
  warnings: string[];
  nextAction: string;
}

const BLOCKED_GLOBS = [
  "node_modules/**",
  "dist/**",
  "build/**",
  "coverage/**",
  ".next/**",
  ".nuxt/**",
  ".svelte-kit/**",
  ".turbo/**",
  ".cache/**",
  "out/**",
  "vendor/**",
  "target/**",
  ".git/**",
];

const DO_NOT_TOUCH = [
  "node_modules/",
  "dist/",
  "build/",
  "coverage/",
  ".git/",
  "vendor/",
  "target/",
];

interface RiskGateRule {
  name: string;
  pathTerms: string[];
  keywordTerms: string[];
}

const RISK_GATE_RULES: RiskGateRule[] = [
  {
    name: "auth_rewrite",
    pathTerms: ["auth", "session", "login", "logout"],
    keywordTerms: ["auth", "authentication", "session", "login", "logout"],
  },
  {
    name: "payment_logic",
    pathTerms: ["billing", "payment", "checkout", "invoice", "subscription"],
    keywordTerms: ["billing", "payment", "checkout", "invoice", "subscription", "price"],
  },
  {
    name: "destructive_migration",
    pathTerms: ["migration", "migrations", "schema"],
    keywordTerms: ["migration", "migrate", "drop", "schema", "destructive"],
  },
  {
    name: "new_dependency",
    pathTerms: [],
    keywordTerms: ["dependency", "install", "package"],
  },
  {
    name: "public_api_break",
    pathTerms: ["api", "routes", "controllers", "schema", "contract"],
    keywordTerms: ["api", "route", "endpoint", "contract", "breaking"],
  },
  {
    name: "security_sensitive_change",
    pathTerms: ["security", "permissions", "authorization", "secrets", "token", "permission", "secret"],
    keywordTerms: ["security", "permission", "secret", "token", "encrypt", "decrypt", "hash", "password", "credential"],
  },
];

function compactConf(c: Confidence): CompactConfidence {
  if (c === "medium") return "med";
  return c;
}

function medToFull(c: "low" | "med" | "high"): "low" | "medium" | "high" {
  if (c === "med") return "medium";
  return c;
}

export function detectRiskGates(
  paths: string[],
  keywords: string[],
): BoundaryJson["riskGates"] {
  const triggered: BoundaryJson["riskGates"] = [];
  const lowerPaths = paths.map((p) => p.toLowerCase());
  const lowerKeywords = keywords.map((k) => k.toLowerCase());

  for (const rule of RISK_GATE_RULES) {
    const reasons: string[] = [];

    for (const term of rule.pathTerms) {
      if (lowerPaths.some((p) => p.includes(term))) {
        reasons.push(`path contains "${term}"`);
      }
    }
    for (const term of rule.keywordTerms) {
      if (lowerKeywords.includes(term)) {
        reasons.push(`keyword "${term}" present`);
      }
    }

    if (reasons.length > 0) {
      triggered.push({
        name: rule.name,
        reason: reasons.slice(0, 3).join("; "),
        status: "triggered",
      });
    }
  }

  return triggered;
}

export function buildBoundary(input: BoundaryBuildInput): BoundaryJson {
  const {
    featureId, featureTitle, depth,
    project, packageInfo, search, tests,
    hints, maxFiles,
  } = input;

  const touchFiles: BoundaryFileEntry[] = [];
  const readOnlyFiles: BoundaryFileEntry[] = [];

  const sourceCandiates = search.candidates.filter(
    (c) => c.kind === "source" && c.score >= 3,
  );

  let touchCount = 0;
  for (const c of sourceCandiates) {
    if (touchCount >= maxFiles) break;
    touchFiles.push({
      path: c.path,
      reason: c.reason,
      confidence: medToFull(c.confidence),
    });
    touchCount++;
  }

  const configCandidates = search.candidates.filter(
    (c) => (c.kind === "config" || c.kind === "docs") && c.score >= 2,
  );
  for (const c of configCandidates) {
    if (readOnlyFiles.length >= 10) break;
    readOnlyFiles.push({
      path: c.path,
      reason: c.reason,
      confidence: medToFull(c.confidence),
    });
  }

  for (const f of project.importantFiles) {
    if (!readOnlyFiles.some((r) => r.path === f) && !touchFiles.some((t) => t.path === f)) {
      readOnlyFiles.push({
        path: f,
        reason: "important project file",
        confidence: "low",
      });
    }
  }

  const relevantTests: BoundaryJson["relevantTests"] = [];
  for (const t of tests.testFiles) {
    relevantTests.push({
      path: t.path,
      reason: t.reason,
      confidence: medToFull(t.confidence),
    });
  }

  const commands: BoundaryJson["commands"] = [];
  const seenCmds = new Set<string>();
  for (const cmd of packageInfo.likelyCommands) {
    if (seenCmds.has(cmd.command)) continue;
    seenCmds.add(cmd.command);
    commands.push({
      command: cmd.command,
      purpose: cmd.purpose,
      confidence: medToFull(cmd.confidence),
      source: cmd.source,
    });
  }
  for (const cmd of tests.likelyTestCommands) {
    if (seenCmds.has(cmd.command)) continue;
    seenCmds.add(cmd.command);
    commands.push({
      command: cmd.command,
      purpose: cmd.purpose,
      confidence: medToFull(cmd.confidence),
      source: cmd.source,
    });
  }

  const allPaths = [
    ...touchFiles.map((f) => f.path),
    ...readOnlyFiles.map((f) => f.path),
    ...relevantTests.filter((t) => t.path).map((t) => t.path!),
  ];

  const allKeywords = search.candidates
    .flatMap((c) => c.matchedTerms)
    .filter((t) => !t.startsWith("hint:") && !t.startsWith("content:") && !t.startsWith("import:"));

  const riskGates = detectRiskGates(allPaths, allKeywords);

  const unknowns: string[] = [];
  if (touchFiles.length === 0) {
    unknowns.push("No likely touch files found. Add --hint paths or refine the spec.");
  }
  if (relevantTests.length === 0) {
    unknowns.push("No relevant tests found. Tests may need to be created.");
  }
  if (search.candidates.length === 0) {
    unknowns.push("No candidate files matched keywords. Discovery may need broader search or hints.");
  }

  const allowedEditGlobs = touchFiles.map((f) => f.path);

  const protectedTokens = [
    featureId,
    ...touchFiles.map((f) => f.path),
    ...commands.map((c) => c.command),
  ];

  let confidence: Confidence;
  if (touchFiles.length === 0 && relevantTests.length === 0) {
    confidence = "unknown";
  } else if (touchFiles.length <= 2 && relevantTests.length === 0) {
    confidence = "low";
  } else if (touchFiles.length >= 3 && relevantTests.length >= 1) {
    confidence = "high";
  } else {
    confidence = "medium";
  }

  return {
    featureId,
    featureTitle,
    status: "discovered",
    confidence,
    discoveryDepth: depth,
    touchFiles,
    readOnlyFiles,
    relevantTests,
    commands,
    allowedEditGlobs,
    blockedEditGlobs: BLOCKED_GLOBS,
    riskGates,
    unknowns,
    doNotTouch: DO_NOT_TOUCH,
    protectedTokens,
    lastUpdated: new Date().toISOString(),
  };
}

export function renderDiscoveryMarkdown(input: DiscoveryRenderInput): string {
  const {
    featureId, featureTitle, depth, confidence,
    project, packageInfo, boundary, search, tests,
    specSummary, warnings, nextAction,
  } = input;

  const depthLabels: Record<DiscoveryDepth, string> = {
    D0: "repo shape only",
    D1: "candidate surfaces",
    D2: "dependency boundary",
    D3: "risk probes",
    D4: "deep dive",
  };

  const lines: string[] = [];

  lines.push(`# ${featureId} Discovery`);
  lines.push("");
  lines.push("## Status");
  lines.push("");
  lines.push("discovered");
  lines.push("");

  lines.push("## Discovery Goal");
  lines.push("");
  lines.push(specSummary || `On-demand discovery for ${featureTitle}.`);
  lines.push("");

  lines.push("## Discovery Depth");
  lines.push("");
  lines.push(`${depth} ${depthLabels[depth] ?? depth}`);
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  lines.push(`Bounded discovery at depth ${depth}. Confidence: ${confidence}.`);
  if (project.languages.length > 0) {
    lines.push(`Languages: ${project.languages.join(", ")}.`);
  }
  if (project.frameworks.length > 0) {
    lines.push(`Frameworks: ${project.frameworks.join(", ")}.`);
  }
  if (project.packageManagers.length > 0) {
    lines.push(`Package managers: ${project.packageManagers.join(", ")}.`);
  }
  lines.push(`Scanned ${search.scannedFiles} files, skipped ${search.skippedFiles}.`);
  lines.push("");

  lines.push("## Relevant Project Facts");
  lines.push("");
  if (project.sourceDirs.length > 0) {
    lines.push(`Source directories: ${project.sourceDirs.join(", ")}`);
  }
  if (project.testDirs.length > 0) {
    lines.push(`Test directories: ${project.testDirs.join(", ")}`);
  }
  if (project.configFiles.length > 0) {
    lines.push(`Config files: ${project.configFiles.join(", ")}`);
  }
  if (project.notes.length > 0) {
    for (const n of project.notes) {
      lines.push(`- ${n}`);
    }
  }
  lines.push("");

  lines.push("## Likely Touch Files");
  lines.push("");
  if (boundary.touchFiles.length === 0) {
    lines.push("_No likely touch files found. Add --hint paths or refine the spec._");
  } else {
    lines.push("| Path | Why | Confidence |");
    lines.push("|---|---|---|");
    for (const f of boundary.touchFiles) {
      lines.push(`| ${f.path} | ${f.reason} | ${f.confidence} |`);
    }
  }
  lines.push("");

  lines.push("## Read-Only Reference Files");
  lines.push("");
  if (boundary.readOnlyFiles.length === 0) {
    lines.push("_None identified._");
  } else {
    lines.push("| Path | Why |");
    lines.push("|---|---|");
    for (const f of boundary.readOnlyFiles) {
      lines.push(`| ${f.path} | ${f.reason} |`);
    }
  }
  lines.push("");

  lines.push("## Relevant Tests");
  lines.push("");
  if (boundary.relevantTests.length === 0) {
    lines.push("_No relevant tests found. Tests may need to be created._");
  } else {
    lines.push("| Path or Command | Why |");
    lines.push("|---|---|");
    for (const t of boundary.relevantTests) {
      const ref = t.path ?? t.command ?? "unknown";
      lines.push(`| ${ref} | ${t.reason} |`);
    }
  }
  lines.push("");

  lines.push("## Commands Discovered");
  lines.push("");
  if (boundary.commands.length === 0) {
    lines.push("_No commands discovered._");
  } else {
    lines.push("| Command | Purpose | Status |");
    lines.push("|---|---|---|");
    for (const c of boundary.commands) {
      lines.push(`| \`${c.command}\` | ${c.purpose} | discovered |`);
    }
  }
  lines.push("");

  lines.push("## Change Boundary Summary");
  lines.push("");
  lines.push(`Touch files: ${boundary.touchFiles.length}`);
  lines.push(`Read-only files: ${boundary.readOnlyFiles.length}`);
  lines.push(`Tests: ${boundary.relevantTests.length}`);
  lines.push(`Commands: ${boundary.commands.length}`);
  lines.push(`Risk gates: ${boundary.riskGates.length}`);
  lines.push("");

  lines.push("## Risks");
  lines.push("");
  if (boundary.riskGates.length === 0) {
    lines.push("_No risks identified._");
  } else {
    for (const r of boundary.riskGates) {
      lines.push(`- **${r.name}**: ${r.reason} (status: ${r.status})`);
    }
  }
  lines.push("");

  lines.push("## Risk Gates Triggered");
  lines.push("");
  if (boundary.riskGates.length === 0) {
    lines.push("_None triggered._");
  } else {
    for (const r of boundary.riskGates) {
      lines.push(`- ${r.name}: ${r.reason}`);
    }
  }
  lines.push("");

  lines.push("## Unknowns");
  lines.push("");
  if (boundary.unknowns.length === 0) {
    lines.push("_None._");
  } else {
    for (const u of boundary.unknowns) {
      lines.push(`- ${u}`);
    }
  }
  lines.push("");

  lines.push("## Do Not Touch");
  lines.push("");
  for (const d of boundary.doNotTouch) {
    lines.push(`- ${d}`);
  }
  lines.push("");

  lines.push("## Discovery Log");
  lines.push("");
  lines.push(`Discovery ran at ${boundary.lastUpdated} with depth ${depth}.`);
  if (warnings.length > 0) {
    for (const w of warnings) {
      lines.push(`- Warning: ${w}`);
    }
  }
  lines.push("");

  lines.push("## Next Step Recommendation");
  lines.push("");
  lines.push(nextAction);
  lines.push("");

  return lines.join("\n");
}

export function renderDiscoveryCavebus(input: DiscoveryRenderInput): string {
  const { featureId, depth, confidence, boundary } = input;
  const cc = compactConf(confidence);

  const lines: string[] = [];
  lines.push(`DISC ${featureId} conf:${cc} depth:${depth}`);

  lines.push("touch:");
  if (boundary.touchFiles.length === 0) {
    lines.push("- none found");
  } else {
    for (const f of boundary.touchFiles) {
      const c = compactConf(f.confidence as Confidence);
      lines.push(`- ${f.path} reason:${f.reason.slice(0, 60)} conf:${c}`);
    }
  }

  lines.push("read:");
  if (boundary.readOnlyFiles.length === 0) {
    lines.push("- none");
  } else {
    for (const f of boundary.readOnlyFiles) {
      lines.push(`- ${f.path} reason:${f.reason.slice(0, 60)}`);
    }
  }

  lines.push("tests:");
  if (boundary.relevantTests.length === 0) {
    lines.push("- none found");
  } else {
    for (const t of boundary.relevantTests) {
      const ref = t.path ?? t.command ?? "unknown";
      lines.push(`- ${ref} reason:${t.reason.slice(0, 60)}`);
    }
  }

  lines.push("cmd:");
  if (boundary.commands.length === 0) {
    lines.push("- none discovered");
  } else {
    for (const c of boundary.commands) {
      const cc2 = compactConf(c.confidence as Confidence);
      lines.push(`- ${c.command} purpose:${c.purpose} conf:${cc2}`);
    }
  }

  lines.push("risk:");
  if (boundary.riskGates.length === 0) {
    lines.push("- none");
  } else {
    for (const r of boundary.riskGates) {
      lines.push(`- ${r.name} reason:${r.reason.slice(0, 60)}`);
    }
  }

  lines.push("unknown:");
  if (boundary.unknowns.length === 0) {
    lines.push("- none");
  } else {
    for (const u of boundary.unknowns) {
      lines.push(`- ${u.slice(0, 80)}`);
    }
  }

  lines.push("avoid:");
  for (const d of boundary.doNotTouch.slice(0, 5)) {
    lines.push(`- ${d} reason:generated/vendor`);
  }

  lines.push("next:");
  lines.push(`- review boundary.json then plan ${featureId}`);
  lines.push("");

  return lines.join("\n");
}
