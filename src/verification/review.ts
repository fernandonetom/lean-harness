import path from "node:path";
import type { VerificationEvent } from "./index.js";
import { dirExists, listFiles, readJsonFile } from "../core/fs.js";
import type { ReviewArtifact } from "../core/types.js";
import type { ReviewFinding as CoreReviewFinding } from "../core/types.js";

export interface ReviewFinding {
  severity: "critical" | "major" | "minor" | "note";
  source: string;
  message: string;
}

export interface ReviewSummary {
  verdict: "pass" | "needs-fix" | "blocked" | "unknown";
  findings: ReviewFinding[];
  blockingFindings: ReviewFinding[];
  notes: string[];
  reviewsFound: boolean;
  reviewModes: string[];
}

const CRITICAL_MARKERS = [
  "critical",
  "security vulnerability",
  "data loss",
  "production break",
];

const MAJOR_MARKERS = [
  "major",
  "needs-fix",
  "needs fix",
  "blocked",
  "missing evidence",
  "boundary violation",
  "failing test",
  "test failure",
];

const MINOR_MARKERS = [
  "minor",
  "warning",
  "style issue",
  "code smell",
];

export async function analyzeReviewEvidence(input: {
  taskSummaries: Array<{ path: string; content: string }>;
  cavebus: string | null;
  events: VerificationEvent[];
  reviewsDir: string;
  allowSelfReview: boolean;
  requireReview?: boolean | undefined;
}): Promise<ReviewSummary> {
  const findings: ReviewFinding[] = [];
  const notes: string[] = [];
  const reviewModes: string[] = [];
  let reviewsFound = false;
  let primaryJsonVerdict: ReviewSummary["verdict"] | null = null;

  // Priority 1: Load reviews/*.json files
  if (input.reviewsDir && await dirExists(input.reviewsDir)) {
    const files = (await listFiles(input.reviewsDir))
      .filter((f) => f.endsWith(".json"))
      .sort();

    if (files.length > 0) {
      reviewsFound = true;
      const validReviews: ReviewArtifact[] = [];

      for (const file of files) {
        const filePath = path.join(input.reviewsDir, file);
        const json = await readJsonFile<ReviewArtifact>(filePath);
        if (!json || json.schema !== "v1") continue;

        if (!input.allowSelfReview && json.mode === "self") {
          notes.push(`Skipped self-review: ${file} (allowSelfReview is false)`);
          continue;
        }

        reviewModes.push(json.mode);
        validReviews.push(json);
      }

      if (validReviews.length > 0) {
        for (const review of validReviews) {
          const source = `reviews/${path.basename(input.reviewsDir)}/${review.featureId}`;
          // Convert core findings to local format
          for (const f of review.findings) {
            findings.push(coreFindingToLocal(f, source));
          }
        }

        // Consolidate verdict from valid JSON reviews
        primaryJsonVerdict = consolidateJsonVerdicts(validReviews);
      }
    }
  }

  // Priority 2/3: Legacy fallback (only if no valid JSON reviews processed)
  if (primaryJsonVerdict === null) {
    let hasLegacyFindings = false;

    // Parse CaveBus multiline REV messages
    if (input.cavebus) {
      const revFindings = parseCavebusRevBlocks(input.cavebus);
      if (revFindings.length > 0) {
        for (const f of revFindings) {
          findings.push({ ...f, source: `(legacy) ${f.source}` });
        }
        hasLegacyFindings = true;
      }
    }

    // Legacy keyword scrape from task summaries
    for (const summary of input.taskSummaries) {
      const reviewSection = extractReviewSection(summary.content);
      if (!reviewSection) continue;

      const lines = reviewSection.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        if (isNonFindingLine(trimmed)) continue;

        const severity = classifySeverity(trimmed);
        if (severity) {
          findings.push({
            severity,
            source: `(legacy) ${summary.path}`,
            message: trimmed.replace(/^-\s+/, ""),
          });
          hasLegacyFindings = true;
        }
      }
    }

    // Legacy keyword scrape from CaveBus (old single-line REV pattern)
    if (input.cavebus) {
      const lines = input.cavebus.split("\n");
      for (const line of lines) {
        if (/^REV\s/i.test(line) || /review:/i.test(line)) {
          const lower = line.toLowerCase();
          if (CRITICAL_MARKERS.some((m) => lower.includes(m))) {
            findings.push({ severity: "critical", source: "(legacy) cavebus.log", message: line.trim() });
            hasLegacyFindings = true;
          } else if (MAJOR_MARKERS.some((m) => lower.includes(m))) {
            findings.push({ severity: "major", source: "(legacy) cavebus.log", message: line.trim() });
            hasLegacyFindings = true;
          }
        }
      }
    }

    // Legacy events
    for (const ev of input.events) {
      if (ev.event === "review.finding" || ev.event === "review.block") {
        const severity = ev.event === "review.block" ? "critical" : "major";
        findings.push({
          severity,
          source: "(legacy) events.jsonl",
          message: typeof ev.result === "string" ? ev.result : JSON.stringify(ev),
        });
        hasLegacyFindings = true;
      }
    }

    if (hasLegacyFindings) {
      notes.push("Review evidence was sourced from legacy artifacts (task summaries, CaveBus entries, events). Consider adding structured review JSON files under reviews/.");
    }
  }

  // Determine final verdict
  const blockingFindings = findings.filter((f) => f.severity === "critical" || f.severity === "major");

  let verdict: ReviewSummary["verdict"];

  if (primaryJsonVerdict !== null) {
    verdict = primaryJsonVerdict;
  } else if (findings.length === 0) {
    verdict = "unknown";
  } else if (blockingFindings.some((f) => f.severity === "critical")) {
    verdict = "blocked";
  } else if (blockingFindings.length > 0) {
    verdict = "needs-fix";
  } else {
    verdict = "pass";
  }

  if (verdict === "unknown") {
    if (input.requireReview && !reviewsFound) {
      notes.push("Review is required but no review evidence was found. Add review JSON files under reviews/ or include CaveBus REV entries.");
    } else if (!input.requireReview) {
      notes.push("No review evidence found in review JSON files, task summaries, or CaveBus entries.");
    }
  }

  return { verdict, findings, blockingFindings, notes, reviewsFound, reviewModes };
}

// ── Legacy helper functions ──────────────────────────────────────────────

function extractReviewSection(markdown: string): string | null {
  const lines = markdown.split("\n");
  let capturing = false;
  let level = 0;
  const result: string[] = [];

  for (const line of lines) {
    const hm = /^(#{1,6})\s+(.*)$/.exec(line);
    if (hm) {
      if (capturing && hm[1]!.length <= level) break;
      if (!capturing && hm[2]!.trim().toLowerCase().includes("review")) {
        capturing = true;
        level = hm[1]!.length;
        continue;
      }
    }
    if (capturing) result.push(line);
  }

  return result.length > 0 ? result.join("\n") : null;
}

function classifySeverity(text: string): ReviewFinding["severity"] | null {
  const lower = text.toLowerCase();

  if (CRITICAL_MARKERS.some((m) => lower.includes(m))) return "critical";
  if (MAJOR_MARKERS.some((m) => lower.includes(m))) return "major";
  if (MINOR_MARKERS.some((m) => lower.includes(m))) return "minor";

  return null;
}

function isNonFindingLine(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower === "none." ||
    lower === "none" ||
    lower.startsWith("no blocking") ||
    lower.startsWith("no findings") ||
    lower.startsWith("no issues") ||
    lower.startsWith("not reviewed") ||
    lower.startsWith("_not reviewed") ||
    lower.startsWith("n/a")
  );
}

// ── Structured review JSON helpers ───────────────────────────────────────

function coreFindingToLocal(f: CoreReviewFinding, source: string): ReviewFinding {
  const parts: string[] = [];
  if (f.file) parts.push(`file:${f.file}`);
  if (f.symbol) parts.push(`symbol:${f.symbol}`);
  if (f.evidence) parts.push(`evidence:${f.evidence}`);
  if (f.fix) parts.push(`fix:${f.fix}`);
  return {
    severity: f.severity,
    source,
    message: parts.join(" "),
  };
}

function consolidateJsonVerdicts(reviews: ReviewArtifact[]): ReviewSummary["verdict"] {
  let hasBlocked = false;
  let hasNeedsFix = false;

  for (const review of reviews) {
    if (review.verdict === "blocked") hasBlocked = true;
    else if (review.verdict === "needs-fix") hasNeedsFix = true;
  }

  if (hasBlocked) return "blocked";
  if (hasNeedsFix) return "needs-fix";
  return "pass";
}

// ── CaveBus REV block parser ─────────────────────────────────────────────

type CaveBusRevBlock = {
  header: string;
  findings: ReviewFinding[];
};

function parseCavebusRevBlocks(cavebus: string): ReviewFinding[] {
  if (!cavebus) return [];

  const blocks = splitCaveBusBlocks(cavebus).filter((b) => b.startsWith("REV "));
  const results: ReviewFinding[] = [];

  for (const block of blocks) {
    const findings = parseSingleRevBlock(block);
    results.push(...findings);
  }

  return results;
}

function splitCaveBusBlocks(text: string): string[] {
  const lines = text.split("\n");
  const blocks: string[] = [];
  const msgTypeRe = /^([A-Z]{2,})\s/;

  let currentBlock: string[] = [];

  for (const line of lines) {
    const m = msgTypeRe.exec(line);
    if (m) {
      if (currentBlock.length > 0) {
        blocks.push(currentBlock.join("\n"));
        currentBlock = [];
      }
      currentBlock.push(line);
    } else {
      currentBlock.push(line);
    }
  }

  if (currentBlock.length > 0) {
    blocks.push(currentBlock.join("\n"));
  }

  return blocks;
}

function parseSingleRevBlock(block: string): ReviewFinding[] {
  const lines = block.split("\n");
  if (lines.length === 0) return [];

  const header = lines[0]!;
  const findings: ReviewFinding[] = [];

  // Parse the REV header for feature/task context
  const sourceInfo = extractRevSourceInfo(header);

  let currentSection: string | null = null;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Detect section headers like "major:", "critical:", "minor:", "note:", "miss:", "fix:"
    const sectionMatch = /^(critical|major|minor|note):\s*$/i.exec(trimmed);
    if (sectionMatch) {
      currentSection = sectionMatch[1]!.toLowerCase() as ReviewFinding["severity"];
      continue;
    }

    // Lines starting with other keys (verdict, miss, fix, next, etc.) are not finding lines
    if (/^[a-z]+:/i.test(trimmed) && !trimmed.startsWith("-")) {
      currentSection = null;
      continue;
    }

    // Finding lines: "- description"
    if (currentSection && trimmed.startsWith("-")) {
      findings.push({
        severity: currentSection as ReviewFinding["severity"],
        source: sourceInfo,
        message: trimmed.replace(/^-\s*/, ""),
      });
    }
  }

  return findings;
}

function extractRevSourceInfo(header: string): string {
  // REV F003 T-01 verdict:needs-fix
  const parts = header.trim().split(/\s+/);
  if (parts.length >= 2) {
    const featureId = parts[1];
    const taskId = parts.length >= 3 && !parts[2]!.startsWith("verdict:") ? ` ${parts[2]}` : "";
    return `cavebus.log${taskId ? ` ${featureId}${taskId}` : ` ${featureId}`}`;
  }
  return "cavebus.log";
}
