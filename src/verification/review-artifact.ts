import path from "node:path";
import { writeTextFile, writeJsonFile } from "../core/fs.js";
import type { ReviewArtifact } from "../core/types.js";
import { nowIso } from "../core/state.js";

export interface CreateReviewInput {
  featureId: string;
  taskId: string;
  verdict: ReviewArtifact["verdict"];
  model: string;
  mode: ReviewArtifact["mode"];
  iteration: number;
  filesReviewed: string[];
  findings: ReviewArtifact["findings"];
  checklist: ReviewArtifact["checklist"];
}

export async function writeReviewArtifact(
  reviewsDir: string,
  input: CreateReviewInput,
): Promise<ReviewArtifact> {
  const artifact: ReviewArtifact = {
    schema: "v1",
    featureId: input.featureId,
    taskId: input.taskId,
    verdict: input.verdict,
    model: input.model,
    mode: input.mode,
    reviewedAt: nowIso(),
    iteration: input.iteration,
    filesReviewed: input.filesReviewed,
    findings: input.findings,
    checklist: input.checklist,
  };

  const jsonPath = path.join(reviewsDir, `${input.taskId}.json`);
  await writeJsonFile(jsonPath, artifact, { overwrite: true });

  await writeTextFile(
    path.join(reviewsDir, `${input.taskId}.md`),
    renderReviewMarkdown(artifact),
    { overwrite: true },
  );

  return artifact;
}

export function renderReviewMarkdown(review: ReviewArtifact): string {
  const lines: string[] = [];
  lines.push(`# Review: ${review.featureId} / ${review.taskId}`);
  lines.push("");
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| Verdict | ${review.verdict} |`);
  lines.push(`| Mode | ${review.mode} |`);
  lines.push(`| Model | ${review.model} |`);
  lines.push(`| Reviewed at | ${review.reviewedAt} |`);
  lines.push(`| Iteration | ${review.iteration} |`);
  lines.push("");

  lines.push("## Files Reviewed");
  lines.push("");
  if (review.filesReviewed.length === 0) {
    lines.push("None.");
  } else {
    for (const f of review.filesReviewed) {
      lines.push(`- \`${f}\``);
    }
  }
  lines.push("");

  lines.push("## Findings");
  lines.push("");
  if (review.findings.length === 0) {
    lines.push("No findings. Clean review.");
  } else {
    for (const f of review.findings) {
      lines.push(`### [${f.severity}] ${f.file ?? ""}${f.symbol ? ` — \`${f.symbol}\`` : ""}`);
      lines.push("");
      if (f.evidence) lines.push(`**Evidence:** ${f.evidence}`);
      if (f.fix) lines.push(`**Fix:** ${f.fix}`);
      lines.push("");
    }
  }

  lines.push("## Checklist");
  lines.push("");
  lines.push("| Gate | Result |");
  lines.push("|------|--------|");
  lines.push(`| Acceptance Criteria | ${review.checklist.acceptanceCriteria} |`);
  lines.push(`| Boundary | ${review.checklist.boundary} |`);
  lines.push(`| Tests | ${review.checklist.tests} |`);
  lines.push(`| Security | ${review.checklist.security} |`);
  lines.push(`| Risk Gates | ${review.checklist.riskGates} |`);

  return lines.join("\n");
}

export function renderReviewCavebus(review: ReviewArtifact): string {
  const lines: string[] = [];
  lines.push(`REV ${review.featureId} ${review.taskId} verdict:${review.verdict}`);
  lines.push(`mode:${review.mode}`);

  const sevGroups = groupBy(review.findings, (f) => f.severity);
  for (const sev of ["critical", "major", "minor", "note"] as const) {
    const items = sevGroups[sev];
    if (!items || items.length === 0) continue;
    lines.push(`${sev}:`);
    for (const f of items) {
      const parts: string[] = [];
      if (f.file) parts.push(`file:${f.file}`);
      if (f.evidence) parts.push(`evidence:${f.evidence}`);
      if (f.fix) parts.push(`fix:${f.fix}`);
      lines.push(`- ${parts.join(" ")}`);
    }
  }

  lines.push(`checklist: ac:${review.checklist.acceptanceCriteria} boundary:${review.checklist.boundary} tests:${review.checklist.tests}`);
  return lines.join("\n");
}

function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of arr) {
    const key = keyFn(item);
    if (!groups[key]) groups[key] = [];
    groups[key]!.push(item);
  }
  return groups;
}
