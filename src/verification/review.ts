import type { VerificationEvent } from "./index.js";

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

export function analyzeReviewEvidence(input: {
  taskSummaries: Array<{ path: string; content: string }>;
  cavebus: string | null;
  events: VerificationEvent[];
}): ReviewSummary {
  const findings: ReviewFinding[] = [];

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
          source: summary.path,
          message: trimmed.replace(/^-\s+/, ""),
        });
      }
    }
  }

  if (input.cavebus) {
    const lines = input.cavebus.split("\n");
    for (const line of lines) {
      if (/^REV\s/i.test(line) || /review:/i.test(line)) {
        const lower = line.toLowerCase();
        if (CRITICAL_MARKERS.some((m) => lower.includes(m))) {
          findings.push({ severity: "critical", source: "cavebus.log", message: line.trim() });
        } else if (MAJOR_MARKERS.some((m) => lower.includes(m))) {
          findings.push({ severity: "major", source: "cavebus.log", message: line.trim() });
        }
      }
    }
  }

  for (const ev of input.events) {
    if (ev.event === "review.finding" || ev.event === "review.block") {
      const severity = ev.event === "review.block" ? "critical" : "major";
      findings.push({
        severity,
        source: "events.jsonl",
        message: typeof ev.result === "string" ? ev.result : JSON.stringify(ev),
      });
    }
  }

  const blockingFindings = findings.filter((f) => f.severity === "critical" || f.severity === "major");

  let verdict: ReviewSummary["verdict"];
  if (findings.length === 0) {
    verdict = "unknown";
  } else if (blockingFindings.some((f) => f.severity === "critical")) {
    verdict = "blocked";
  } else if (blockingFindings.length > 0) {
    verdict = "needs-fix";
  } else {
    verdict = "pass";
  }

  const notes: string[] = [];
  if (verdict === "unknown") {
    notes.push("No review evidence found in task summaries or CaveBus entries.");
  }

  return { verdict, findings, blockingFindings, notes };
}

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
