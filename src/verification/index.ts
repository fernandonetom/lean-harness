import path from "node:path";
import { readTextFile, readJsonFile, fileExists, dirExists, listFiles, writeTextFile } from "../core/fs.js";
import { featuresDir, memoryDir } from "../core/paths.js";
import { requireFeature } from "../core/features.js";
import { CLIError } from "../core/errors.js";
import { loadState, saveState, upsertFeatureEntry, nowIso } from "../core/state.js";
import type { AcceptanceCheck } from "./acceptance.js";
import { verifyAcceptanceCriteria } from "./acceptance.js";
import type { VerificationCommandResult, VerificationCommand } from "./commands.js";
import { extractVerificationCommands, runVerificationCommands } from "./commands.js";
import type { ChangedFile, BoundaryReview } from "./changed-files.js";
import { detectChangedFiles, reviewBoundaryCompliance, isImplementationPath } from "./changed-files.js";
import type { ReviewSummary } from "./review.js";
import { analyzeReviewEvidence } from "./review.js";
import { appendMemory, loadConfigForMemory } from "../memory/index.js";

export interface VerificationEvent {
  timestamp?: string;
  source?: string;
  event?: string;
  featureId?: string;
  feature?: string;
  taskId?: string;
  host?: string;
  status?: string;
  command?: string;
  paths?: string[];
  result?: string;
  exitCode?: number | null;
  durationMs?: number;
  outputPath?: string;
  summaryPath?: string;
  [key: string]: unknown;
}

export interface RunCheckOptions {
  root: string;
  featureRef: string;
  runCommands?: boolean | undefined;
  explicitCommands?: string[] | undefined;
  strict?: boolean | undefined;
  force?: boolean | undefined;
  maxCommandMs?: number | undefined;
  requireAcceptanceTrace?: boolean | undefined;
  requireChangedFiles?: boolean | undefined;
  requireReview?: boolean | undefined;
  allowSelfReview?: boolean | undefined;
}

export interface CheckResult {
  featureId: string;
  featureTitle: string;
  featureDir: string;
  verdict: "pass" | "needs-fix" | "blocked";
  checksPath: string;
  resultPath: string;
  acceptance: AcceptanceCheck[];
  commands: VerificationCommandResult[];
  changedFiles: ChangedFile[];
  boundary: BoundaryReview;
  review: ReviewSummary;
  riskGates: Array<{ name: string; status: string; reason: string }>;
  unresolvedIssues: string[];
  warnings: string[];
  nextAction: string;
}

export async function runCheck(options: RunCheckOptions): Promise<CheckResult> {
  const { root, featureRef, strict = false, force = false } = options;
  const runCmds = options.runCommands ?? true;
  const maxCommandMs = options.maxCommandMs ?? 120000;
  const explicitCommands = options.explicitCommands ?? [];

  const entry = await requireFeature(root, featureRef);

  const featureDir = path.join(featuresDir(root), entry.path);
  const checksPath = path.join(featureDir, "checks.md");
  const resultPath = path.join(featureDir, "result.md");

  if (!force) {
    if (await fileExists(checksPath)) {
      throw new CLIError(
        `checks.md already exists for ${entry.path}. Use --force to overwrite check artifacts.`,
      );
    }
    if (await fileExists(resultPath)) {
      throw new CLIError(
        `result.md already exists for ${entry.path}. Use --force to overwrite check artifacts.`,
      );
    }
  }

  const specMd = await readTextFile(path.join(featureDir, "spec.md"));
  if (!specMd) {
    throw new CLIError(
      `Cannot check because spec.md is missing for ${entry.path}.\n` +
      `Run: lh spec "Describe the feature"`,
    );
  }

  const [discoveryMd, boundary, planMd, tasksMd, cavebusLog] = await Promise.all([
    readTextFile(path.join(featureDir, "discovery.md")),
    readJsonFile<unknown>(path.join(featureDir, "boundary.json")),
    readTextFile(path.join(featureDir, "plan.md")),
    readTextFile(path.join(featureDir, "tasks.md")),
    readTextFile(path.join(featureDir, "cavebus.log")),
  ]);

  const summariesDir = path.join(featureDir, "task-summaries");
  const taskSummaries: Array<{ path: string; content: string }> = [];
  if (await dirExists(summariesDir)) {
    const files = (await listFiles(summariesDir)).sort();
    for (const f of files) {
      const content = await readTextFile(path.join(summariesDir, f));
      if (content !== null) {
        taskSummaries.push({ path: `task-summaries/${f}`, content });
      }
    }
  }

  const eventsPath = path.join(featureDir, "events.jsonl");
  const events = await parseEventsJsonl(eventsPath);

  const missingArtifacts: string[] = [];
  if (!tasksMd) missingArtifacts.push("tasks.md");
  if (!boundary) missingArtifacts.push("boundary.json");
  if (!planMd) missingArtifacts.push("plan.md");
  if (!discoveryMd) missingArtifacts.push("discovery.md");

  const acceptance = verifyAcceptanceCriteria({
    specMarkdown: specMd,
    tasksMarkdown: tasksMd,
    taskSummaries,
    events,
    cavebus: cavebusLog,
  });

  const extractedCommands = extractVerificationCommands({
    boundary,
    planMarkdown: planMd,
    tasksMarkdown: tasksMd,
    taskSummaries,
    explicitCommands,
  });

  const commandResults = await runVerificationCommands({
    root,
    commands: extractedCommands,
    run: runCmds,
    maxCommandMs,
  });

  const changedFiles = await detectChangedFiles({
    root,
    featureDir,
    events,
    taskSummaries,
    useGit: true,
  });

  const boundaryReview = reviewBoundaryCompliance(changedFiles, boundary);

  const reviewsDir = path.join(featureDir, "reviews");
  const allowSelfReview = options.allowSelfReview ?? false;

  const review = await analyzeReviewEvidence({
    taskSummaries,
    cavebus: cavebusLog,
    events,
    reviewsDir,
    allowSelfReview,
    requireReview: options.requireReview,
  });

  const riskGates = extractRiskGates(boundary);

  const { verdict, unresolvedIssues } = determineVerdict({
    acceptance,
    commands: commandResults,
    changedFiles,
    boundary: boundaryReview,
    review,
    riskGates,
    missingArtifacts,
    strict,
    requireReview: options.requireReview,
  });

  const warnings: string[] = [];
  if (missingArtifacts.length > 0) {
    warnings.push(`Missing artifacts: ${missingArtifacts.join(", ")}`);
  }

  const nextAction = determineNextAction(verdict, entry.id, unresolvedIssues, missingArtifacts);

  const result: CheckResult = {
    featureId: entry.id,
    featureTitle: entry.title,
    featureDir: entry.path,
    verdict,
    checksPath: `.lh/features/${entry.path}/checks.md`,
    resultPath: `.lh/features/${entry.path}/result.md`,
    acceptance,
    commands: commandResults,
    changedFiles,
    boundary: boundaryReview,
    review,
    riskGates,
    unresolvedIssues,
    warnings,
    nextAction,
  };

  await writeTextFile(checksPath, renderChecksMarkdown(result), { overwrite: force });
  await writeTextFile(resultPath, renderResultMarkdown(result), { overwrite: force });

  const checkEvent = {
    timestamp: nowIso(),
    source: "lh-cli",
    event: "feature.checked",
    featureId: entry.id,
    feature: entry.path,
    verdict,
    acceptance: {
      pass: acceptance.filter((a) => a.status === "pass").length,
      partial: acceptance.filter((a) => a.status === "partial").length,
      fail: acceptance.filter((a) => a.status === "fail").length,
      notChecked: acceptance.filter((a) => a.status === "not checked").length,
    },
    commands: {
      pass: commandResults.filter((c) => c.result === "pass").length,
      fail: commandResults.filter((c) => c.result === "fail").length,
      skipped: commandResults.filter((c) => c.result === "skipped").length,
      notRun: commandResults.filter((c) => c.result === "not run").length,
    },
    changedFiles: changedFiles.length,
    boundaryViolations: boundaryReview.violations.length,
    unresolvedIssues: unresolvedIssues.length,
  };
  const existingEvents = await readTextFile(eventsPath);
  const eventLine = JSON.stringify(checkEvent) + "\n";
  await writeTextFile(eventsPath, (existingEvents ?? "") + eventLine, { overwrite: true });

  const cavebusEntry = renderCheckCavebus(result);
  const existingCavebus = await readTextFile(path.join(featureDir, "cavebus.log"));
  await writeTextFile(
    path.join(featureDir, "cavebus.log"),
    (existingCavebus ?? "") + "\n" + cavebusEntry + "\n",
    { overwrite: true },
  );

  const state = await loadState(root);
  const featureEntry = state.features.find((f) => f.id === entry.id);
  if (featureEntry) {
    featureEntry.status = verdict === "pass" ? "done" : verdict;
    featureEntry.updatedAt = nowIso();
    upsertFeatureEntry(state, featureEntry);
    await saveState(root, state);
  }

  try {
    const memConfig = await loadConfigForMemory(root);
    if (verdict === "pass") {
      const patternLines: string[] = [];
      if (changedFiles.length > 0) {
        const implFiles = changedFiles.filter(f => f.changeType !== "deleted").map(f => f.path);
        if (implFiles.length > 0) {
          patternLines.push(`Files changed: ${implFiles.slice(0, 10).join(", ")}`);
        }
      }
      const passedCmds = commandResults.filter(c => c.result === "pass").map(c => c.command);
      if (passedCmds.length > 0) {
        patternLines.push(`Verification commands: ${passedCmds.join(", ")}`);
      }
      if (patternLines.length > 0) {
        await appendMemory(root, "patterns", {
          section: "Code Patterns",
          content: patternLines.map(l => `- ${l}`).join("\n"),
          timestamp: nowIso(),
          featureId: entry.id,
        }, memConfig);
      }

    }

    const decisionContent = `${entry.id} — verdict: ${verdict}`;
    await appendMemory(root, "decisions", {
      section: `${entry.id} — ${entry.title}`,
      content: `- Verdict: ${verdict}\n- AC pass: ${acceptance.filter(a => a.status === "pass").length}/${acceptance.length}\n- Changed files: ${changedFiles.length}`,
      timestamp: nowIso(),
      featureId: entry.id,
    }, memConfig);
  } catch {
    // best-effort memory update
  }

  return result;
}

export function determineVerdict(input: {
  acceptance: AcceptanceCheck[];
  commands: VerificationCommandResult[];
  changedFiles: ChangedFile[];
  boundary: BoundaryReview;
  review: ReviewSummary;
  riskGates: Array<{ name: string; status: string; reason: string }>;
  missingArtifacts: string[];
  strict: boolean;
  requireReview?: boolean | undefined;
}): { verdict: "pass" | "needs-fix" | "blocked"; unresolvedIssues: string[] } {
  const issues: string[] = [];

  const implFiles = input.changedFiles.filter((f) => isImplementationPath(f.path));
  if (implFiles.length === 0) {
    issues.push("No implementation files changed.");
  }

  if (input.missingArtifacts.includes("tasks.md")) {
    issues.push("tasks.md is missing — planning/build evidence unavailable.");
  }
  if (input.missingArtifacts.includes("boundary.json")) {
    issues.push("boundary.json is missing — boundary compliance cannot be verified.");
  }

  const acFail = input.acceptance.filter((a) => a.status === "fail");
  const acNotChecked = input.acceptance.filter((a) => a.status === "not checked");
  const acPartial = input.acceptance.filter((a) => a.status === "partial");

  if (acFail.length > 0) {
    issues.push(`${acFail.length} acceptance criteria failed: ${acFail.map((a) => a.id).join(", ")}`);
  }
  if (acNotChecked.length > 0) {
    issues.push(`${acNotChecked.length} acceptance criteria not checked: ${acNotChecked.map((a) => a.id).join(", ")}`);
  }
  if (acPartial.length > 0 && input.strict) {
    issues.push(`${acPartial.length} acceptance criteria only partially evidenced: ${acPartial.map((a) => a.id).join(", ")}`);
  }

  const cmdFail = input.commands.filter((c) => c.result === "fail");
  if (cmdFail.length > 0) {
    issues.push(`${cmdFail.length} verification command(s) failed: ${cmdFail.map((c) => c.command).join(", ")}`);
  }

  const requiredNotRun = input.commands.filter((c) => c.required && c.result === "not run");
  if (requiredNotRun.length > 0 && input.strict) {
    issues.push(`${requiredNotRun.length} required command(s) not run.`);
  }

  if (input.boundary.violations.length > 0) {
    issues.push(`${input.boundary.violations.length} file(s) changed outside boundary.`);
  }

  const unresolvedRisk = input.riskGates.filter((g) => g.status === "triggered" || g.status === "unresolved");
  if (unresolvedRisk.length > 0) {
    issues.push(`${unresolvedRisk.length} unresolved risk gate(s): ${unresolvedRisk.map((g) => g.name).join(", ")}`);
  }

  if (input.review.blockingFindings.length > 0) {
    issues.push(`${input.review.blockingFindings.length} blocking review finding(s).`);
  }

  if (input.requireReview && input.review.verdict === "unknown") {
    issues.push("Review is required but no independent review evidence was found.");
  }

  if (issues.length === 0) {
    const allAcPass = input.acceptance.every((a) => a.status === "pass");
    if (!allAcPass) {
      issues.push("Not all acceptance criteria have strong evidence.");
    }
  }

  if (issues.length === 0) {
    return { verdict: "pass", unresolvedIssues: [] };
  }

  const isBlocked =
    implFiles.length === 0 ||
    input.missingArtifacts.includes("tasks.md") ||
    input.missingArtifacts.includes("boundary.json") ||
    input.review.verdict === "blocked" ||
    (input.requireReview && input.review.verdict === "unknown" && input.missingArtifacts.length > 0) ||
    (input.strict && acNotChecked.length > 0) ||
    (input.strict && requiredNotRun.length > 0);

  return {
    verdict: isBlocked ? "blocked" : "needs-fix",
    unresolvedIssues: issues,
  };
}

export function renderChecksMarkdown(result: CheckResult): string {
  const lines: string[] = [];
  lines.push(`# ${result.featureId} Check Report`);
  lines.push("");
  lines.push("## Verdict");
  lines.push("");
  lines.push(result.verdict);
  lines.push("");

  lines.push("## Summary");
  lines.push("");
  if (result.verdict === "pass") {
    lines.push(`Feature ${result.featureId} (${result.featureTitle}) verified. All acceptance criteria pass with evidence.`);
  } else if (result.verdict === "needs-fix") {
    lines.push(`Feature ${result.featureId} (${result.featureTitle}) needs fixes before completion.`);
  } else {
    lines.push(`Feature ${result.featureId} (${result.featureTitle}) is blocked. Missing evidence or approvals.`);
  }
  lines.push("");

  lines.push("## Acceptance Criteria Coverage");
  lines.push("");
  lines.push("| AC | Status | Evidence | Notes |");
  lines.push("|---|---|---|---|");
  for (const ac of result.acceptance) {
    const evidence = ac.evidence.length > 0 ? ac.evidence.join("; ").slice(0, 120) : "none";
    const notes = ac.notes.length > 0 ? ac.notes.join("; ").slice(0, 120) : "";
    lines.push(`| ${ac.id}: ${ac.text.slice(0, 60)} | ${ac.status} | ${evidence} | ${notes} |`);
  }
  lines.push("");

  lines.push("## Verification Commands");
  lines.push("");
  if (result.commands.length === 0) {
    lines.push("No verification commands found or run.");
  } else {
    lines.push("| Command | Result | Evidence | Notes |");
    lines.push("|---|---|---|---|");
    for (const cmd of result.commands) {
      const evidence = cmd.evidence.slice(0, 100);
      const notes = cmd.notes.length > 0 ? cmd.notes.join("; ").slice(0, 80) : "";
      lines.push(`| \`${cmd.command}\` | ${cmd.result} | ${evidence} | ${notes} |`);
    }
  }
  lines.push("");

  lines.push("## Changed Files");
  lines.push("");
  if (result.changedFiles.length === 0) {
    lines.push("No changed files detected.");
  } else {
    lines.push("| Path | Change Type | In Boundary | Notes |");
    lines.push("|---|---|---|---|");
    for (const f of result.changedFiles) {
      const notes = f.notes.length > 0 ? f.notes.join("; ").slice(0, 80) : "";
      lines.push(`| ${f.path} | ${f.changeType} | ${f.inBoundary} | ${notes} |`);
    }
  }
  lines.push("");

  lines.push("## Boundary Review");
  lines.push("");
  lines.push(`Status: ${result.boundary.status}`);
  if (result.boundary.violations.length > 0) {
    lines.push("");
    lines.push("Violations:");
    for (const v of result.boundary.violations) {
      lines.push(`- ${v.path} (${v.changeType})`);
    }
  }
  if (result.boundary.notes.length > 0) {
    for (const n of result.boundary.notes) {
      lines.push(`- ${n}`);
    }
  }
  lines.push("");

  lines.push("## Risk Gate Review");
  lines.push("");
  if (result.riskGates.length === 0) {
    lines.push("No risk gates triggered.");
  } else {
    for (const g of result.riskGates) {
      lines.push(`- **${g.name}**: ${g.reason} (status: ${g.status})`);
    }
  }
  lines.push("");

  lines.push("## Code Review Summary");
  lines.push("");
  lines.push(`Review verdict: ${result.review.verdict}`);
  if (result.review.findings.length > 0) {
    for (const f of result.review.findings) {
      lines.push(`- [${f.severity}] ${f.message} (source: ${f.source})`);
    }
  }
  if (result.review.notes.length > 0) {
    for (const n of result.review.notes) {
      lines.push(`- ${n}`);
    }
  }
  lines.push("");

  lines.push("## Unresolved Issues");
  lines.push("");
  if (result.unresolvedIssues.length === 0) {
    lines.push("None.");
  } else {
    for (const issue of result.unresolvedIssues) {
      lines.push(`- ${issue}`);
    }
  }
  lines.push("");

  lines.push("## Regression Risks");
  lines.push("");
  lines.push("Not assessed by deterministic check. Review task summaries and test results.");
  lines.push("");

  lines.push("## Final Decision");
  lines.push("");
  lines.push(`Verdict: **${result.verdict}**`);
  lines.push("");
  if (result.verdict !== "pass") {
    lines.push("Recovery path:");
    lines.push(`- ${result.nextAction}`);
  }
  lines.push("");

  return lines.join("\n");
}

export function renderResultMarkdown(result: CheckResult): string {
  const finalStatus = result.verdict === "pass" ? "done" : result.verdict;

  const lines: string[] = [];
  lines.push(`# ${result.featureId} Result`);
  lines.push("");
  lines.push("## Final Status");
  lines.push("");
  lines.push(finalStatus);
  lines.push("");

  lines.push("## Outcome");
  lines.push("");
  if (result.verdict === "pass") {
    lines.push(`Feature ${result.featureId} (${result.featureTitle}) verified and marked done.`);
  } else if (result.verdict === "needs-fix") {
    lines.push(`Feature ${result.featureId} (${result.featureTitle}) needs fixes.`);
  } else {
    lines.push(`Feature ${result.featureId} (${result.featureTitle}) is blocked.`);
  }
  lines.push("");

  lines.push("## What Changed");
  lines.push("");
  if (result.changedFiles.length === 0) {
    lines.push("No implementation files detected.");
  } else {
    for (const f of result.changedFiles) {
      lines.push(`- ${f.path} (${f.changeType})`);
    }
  }
  lines.push("");

  lines.push("## Acceptance Criteria Result");
  lines.push("");
  for (const ac of result.acceptance) {
    const icon = ac.status === "pass" ? "[x]" : "[ ]";
    lines.push(`- ${icon} ${ac.id}: ${ac.text} — ${ac.status}`);
  }
  lines.push("");

  lines.push("## Verification Evidence");
  lines.push("");
  if (result.commands.length === 0) {
    lines.push("No verification commands were found or run.");
  } else {
    for (const cmd of result.commands) {
      lines.push(`- \`${cmd.command}\`: ${cmd.result} — ${cmd.evidence}`);
    }
  }
  lines.push("");

  lines.push("## Known Follow-Ups");
  lines.push("");
  if (result.unresolvedIssues.length === 0) {
    lines.push("None.");
  } else {
    for (const issue of result.unresolvedIssues) {
      lines.push(`- ${issue}`);
    }
  }
  lines.push("");

  lines.push("## Files Changed");
  lines.push("");
  if (result.changedFiles.length === 0) {
    lines.push("None detected.");
  } else {
    for (const f of result.changedFiles) {
      lines.push(`- ${f.path}`);
    }
  }
  lines.push("");

  lines.push("## Commands Run");
  lines.push("");
  if (result.commands.length === 0) {
    lines.push("None.");
  } else {
    for (const cmd of result.commands) {
      lines.push(`- \`${cmd.command}\` — ${cmd.result}`);
    }
  }
  lines.push("");

  lines.push("## Review Notes");
  lines.push("");
  lines.push(`Review verdict: ${result.review.verdict}`);
  if (result.review.findings.length > 0) {
    for (const f of result.review.findings) {
      lines.push(`- [${f.severity}] ${f.message}`);
    }
  }
  lines.push("");

  lines.push("## Lessons Learned");
  lines.push("");
  lines.push("No reusable memory updates identified by deterministic check.");
  lines.push("");

  lines.push("## Reusable Memory Updates");
  lines.push("");
  lines.push("No reusable memory updates identified by deterministic check.");
  lines.push("");

  return lines.join("\n");
}

export function renderCheckCavebus(result: CheckResult): string {
  const lines: string[] = [];
  lines.push(`VERIFY ${result.featureId} verdict:${result.verdict}`);

  lines.push("ac:");
  for (const ac of result.acceptance) {
    const ev = ac.evidence.length > 0 ? ` evidence:${ac.evidence[0]!.slice(0, 60)}` : "";
    lines.push(`- ${ac.id} ${ac.status}${ev}`);
  }

  lines.push("cmd:");
  if (result.commands.length === 0) {
    lines.push("- none");
  } else {
    for (const cmd of result.commands) {
      lines.push(`- ${cmd.command} result:${cmd.result}`);
    }
  }

  lines.push("chg:");
  if (result.changedFiles.length === 0) {
    lines.push("- none");
  } else {
    for (const f of result.changedFiles) {
      lines.push(`- ${f.path} boundary:${f.inBoundary}`);
    }
  }

  lines.push("boundary:");
  lines.push(`- ${result.boundary.status}`);

  lines.push("risk:");
  if (result.riskGates.length === 0) {
    lines.push("- none");
  } else {
    for (const g of result.riskGates) {
      lines.push(`- ${g.name} status:${g.status}`);
    }
  }

  lines.push("miss:");
  if (result.unresolvedIssues.length === 0) {
    lines.push("- none");
  } else {
    for (const issue of result.unresolvedIssues) {
      lines.push(`- ${issue.slice(0, 100)}`);
    }
  }

  lines.push("next:");
  lines.push(`- ${result.nextAction.slice(0, 120)}`);

  return lines.join("\n");
}

function extractRiskGates(boundary: unknown | null): Array<{ name: string; status: string; reason: string }> {
  if (!boundary || typeof boundary !== "object") return [];
  const b = boundary as Record<string, unknown>;
  const gates = b["riskGates"];
  if (!Array.isArray(gates)) return [];

  return gates
    .filter((g): g is Record<string, unknown> => typeof g === "object" && g !== null)
    .map((g) => ({
      name: typeof g["name"] === "string" ? g["name"] : "unknown",
      status: typeof g["status"] === "string" ? g["status"] : "unknown",
      reason: typeof g["reason"] === "string" ? g["reason"] : "",
    }));
}

function determineNextAction(
  verdict: "pass" | "needs-fix" | "blocked",
  featureId: string,
  issues: string[],
  missingArtifacts: string[],
): string {
  if (verdict === "pass") return "feature done";
  if (missingArtifacts.includes("tasks.md") || missingArtifacts.includes("boundary.json")) {
    const cmds: string[] = [];
    if (missingArtifacts.includes("boundary.json")) cmds.push(`lh discover ${featureId}`);
    if (missingArtifacts.includes("tasks.md")) cmds.push(`lh plan ${featureId}`);
    return `run ${cmds.join("; then ")}`;
  }
  if (verdict === "blocked") {
    return `resolve blockers, then rerun lh check ${featureId} --force`;
  }
  return `fix failing checks; rerun lh check ${featureId} --force`;
}

async function parseEventsJsonl(eventsPath: string): Promise<VerificationEvent[]> {
  const text = await readTextFile(eventsPath);
  if (!text) return [];
  const events: VerificationEvent[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as VerificationEvent);
    } catch {
      // malformed line — skip
    }
  }
  return events;
}
