import path from "node:path";
import { requireFeature } from "../core/features.js";
import { readTextFile, readJsonFile, writeTextFile, fileExists, dirExists, listFiles, ensureDir } from "../core/fs.js";
import { featuresDir } from "../core/paths.js";
import { writeReviewArtifact, renderReviewCavebus } from "../verification/review-artifact.js";
import { createLogger, printJson } from "../core/logger.js";
import { CLIError } from "../core/errors.js";
import { loadHarnessConfig } from "../core/config.js";
import { resolveModelForRole } from "../core/types.js";
import { detectChangedFiles, reviewBoundaryCompliance, isImplementationPath } from "../verification/changed-files.js";
import type { ReviewArtifact, ReviewFinding, ReviewChecklist } from "../core/types.js";

export interface ReviewCommandOptions {
  cwd: string;
  featureRef: string;
  taskId?: string | undefined;
  host?: string | undefined;
  model?: string | undefined;
  dryRun?: boolean | undefined;
  json?: boolean | undefined;
}

interface ParsedTask {
  id: string;
  title: string;
  acceptanceCriteria: string[];
  expectedFiles: string[];
  verificationCommands: string[];
}

interface TaskReviewResult {
  taskId: string;
  artifact: ReviewArtifact;
  cavebus: string;
}

export async function runReviewCommand(options: ReviewCommandOptions): Promise<void> {
  const { cwd, featureRef, json = false, dryRun = false } = options;
  const log = createLogger({ json });

  if (!featureRef) {
    throw new CLIError(
      "Missing feature reference.\nUsage: lh review F001",
    );
  }

  const entry = await requireFeature(cwd, featureRef);
  const featureDir = path.join(featuresDir(cwd), entry.path);

  const specMd = await readTextFile(path.join(featureDir, "spec.md"));
  if (!specMd) {
    throw new CLIError(
      `Cannot review because spec.md is missing for ${entry.path}.\nRun: lh spec "Describe the feature"`,
    );
  }

  const boundary = await readJsonFile<Record<string, unknown>>(path.join(featureDir, "boundary.json"));
  const tasksMd = await readTextFile(path.join(featureDir, "tasks.md"));

  if (!tasksMd) {
    throw new CLIError(
      `Cannot review because tasks.md is missing for ${entry.path}.\nRun: lh plan ${entry.id}`,
    );
  }

  const parsedTasks = parseTasks(tasksMd);

  const tasksToReview = options.taskId
    ? parsedTasks.filter((t) => t.id === options.taskId)
    : parsedTasks;

  if (tasksToReview.length === 0) {
    throw new CLIError(
      options.taskId
        ? `Task ${options.taskId} not found in tasks.md for ${entry.path}.`
        : `No tasks found in tasks.md for ${entry.path}.`,
    );
  }

  const reviewsDir = path.join(featureDir, "reviews");

  const { parsed: rawConfig } = await loadHarnessConfig(cwd);
  const reviewerModel = resolveModelForRole(rawConfig?.models, "reviewer", options.host, options.model);

  if (dryRun) {
    if (json) {
      printJson({
        featureId: entry.id,
        featureTitle: entry.title,
        featureDir: entry.path,
        dryRun: true,
        tasksToReview: tasksToReview.map((t) => ({
          taskId: t.id,
          title: t.title,
          acceptanceCriteria: t.acceptanceCriteria,
        })),
        reviewDir: `.lh/features/${entry.path}/reviews/`,
        model: reviewerModel ?? "auto",
        mode: "independent",
      });
      return;
    }

    log.info("");
    log.info("LeanHarness review (dry run)");
    log.info("");
    log.info(`Feature:       ${entry.id} — ${entry.title}`);
    log.info(`Tasks:         ${tasksToReview.length}`);
    log.info(`Review dir:    .lh/features/${entry.path}/reviews/`);
    log.info(`Model:         ${reviewerModel ?? "auto"}`);
    log.info(`Review mode:   independent`);
    log.info("");

    log.info("Tasks to review:");
    for (const t of tasksToReview) {
      log.info(`  ${t.id}  ${t.title}`);
      if (t.acceptanceCriteria.length > 0) {
        log.info(`    ACs: ${t.acceptanceCriteria.join(", ")}`);
      }
    }

    log.info("");
    log.info("This was a dry run. No review artifacts were written.");
    return;
  }

  await ensureDir(reviewsDir);

  const specAcceptanceCriteria = extractAcceptanceCriteriaAsArray(specMd);
  const riskGates = extractRiskGates(boundary);

  const eventsPath = path.join(featureDir, "events.jsonl");
  const events = await parseEventsJsonl(eventsPath);

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

  const changedFiles = await detectChangedFiles({
    root: cwd,
    featureDir,
    events,
    taskSummaries,
    useGit: true,
  });

  const boundaryReview = reviewBoundaryCompliance(changedFiles, boundary);

  const reviewResults: TaskReviewResult[] = [];

  for (const task of tasksToReview) {
    const taskChangedFiles = findTaskSpecificFiles(changedFiles, task.expectedFiles, taskSummaries);

    const findings = generateReviewFindings({
      task,
      specAcceptanceCriteria,
      changedFiles,
      taskChangedFiles,
      boundary,
      boundaryReview,
      riskGates,
      taskSummaries,
    });

    const checklist = buildReviewChecklist({
      task,
      findings,
      boundaryReview,
      riskGates,
    });

    let verdict: ReviewArtifact["verdict"];
    const criticalCount = findings.filter((f) => f.severity === "critical").length;
    const majorCount = findings.filter((f) => f.severity === "major").length;

    if (criticalCount > 0) {
      verdict = "blocked";
    } else if (majorCount > 0) {
      verdict = "needs-fix";
    } else {
      verdict = "pass";
    }

    const existingReviews = await countReviewIterations(reviewsDir, task.id);

    const artifact = await writeReviewArtifact(reviewsDir, {
      featureId: entry.id,
      taskId: task.id,
      verdict,
      model: reviewerModel ?? "auto",
      mode: "independent",
      iteration: existingReviews + 1,
      filesReviewed: getReviewedFiles(taskChangedFiles, task.expectedFiles, changedFiles),
      findings,
      checklist,
    });

    const cavebus = renderReviewCavebus(artifact);
    reviewResults.push({ taskId: task.id, artifact, cavebus });
  }

  for (const result of reviewResults) {
    const cavebusPath = path.join(featureDir, "cavebus.log");
    const existingCavebus = await readTextFile(cavebusPath);
    await writeTextFile(
      cavebusPath,
      (existingCavebus ?? "") + "\n" + result.cavebus + "\n",
      { overwrite: true },
    );
  }

  if (json) {
    printJson({
      featureId: entry.id,
      featureTitle: entry.title,
      featureDir: entry.path,
      dryRun: false,
      reviewDir: `.lh/features/${entry.path}/reviews/`,
      results: reviewResults.map((r) => ({
        taskId: r.taskId,
        verdict: r.artifact.verdict,
        iteration: r.artifact.iteration,
        filesReviewed: r.artifact.filesReviewed,
        findingsCount: r.artifact.findings.length,
        critical: r.artifact.findings.filter((f) => f.severity === "critical").length,
        major: r.artifact.findings.filter((f) => f.severity === "major").length,
        minor: r.artifact.findings.filter((f) => f.severity === "minor").length,
        note: r.artifact.findings.filter((f) => f.severity === "note").length,
        checklist: r.artifact.checklist,
      })),
    });
    return;
  }

  log.info("");
  log.info("LeanHarness review complete");
  log.info("");
  log.info(`Feature:       ${entry.id} — ${entry.title}`);
  log.info(`Tasks reviewed: ${reviewResults.length}`);
  log.info(`Review dir:    .lh/features/${entry.path}/reviews/`);
  log.info("");

  for (const r of reviewResults) {
    const verdictPad = r.artifact.verdict.padEnd(12);
    const fCount = r.artifact.findings.length;
    const critical = r.artifact.findings.filter((f) => f.severity === "critical").length;
    const major = r.artifact.findings.filter((f) => f.severity === "major").length;
    log.info(`  ${r.taskId}  ${verdictPad}  ${fCount} finding(s) (${critical} crit, ${major} major)`);
  }

  log.info("");

  for (const r of reviewResults) {
    if (r.artifact.findings.length === 0) continue;
    log.info(`Findings for ${r.taskId}:`);
    for (const f of r.artifact.findings) {
      const sevPad = `[${f.severity}]`.padEnd(11);
      const loc = f.file ? ` ${f.file}` : "";
      log.info(`  ${sevPad}${loc}`);
    }
    log.info("");
  }

  log.info("Review artifacts written:");
  for (const r of reviewResults) {
    log.info(`  .lh/features/${entry.path}/reviews/${r.taskId}.json`);
    log.info(`  .lh/features/${entry.path}/reviews/${r.taskId}.md`);
  }

  log.info("");
  log.info("Next action:");
  log.info("  Review findings and fix issues before retrying.");
}

function parseTasks(markdown: string): ParsedTask[] {
  const tasks: ParsedTask[] = [];
  const lines = markdown.split("\n");
  let currentTask: ParsedTask | null = null;
  let inExpectedFiles = false;
  let inVerification = false;

  for (const line of lines) {
    const taskMatch = /^###\s+T-(\d{2,})\s/.exec(line);
    if (taskMatch) {
      if (currentTask) tasks.push(currentTask);
      currentTask = {
        id: `T-${taskMatch[1]}`,
        title: line.slice(taskMatch[0].length).trim(),
        acceptanceCriteria: [],
        expectedFiles: [],
        verificationCommands: [],
      };
      inExpectedFiles = false;
      inVerification = false;
      continue;
    }

    if (!currentTask) continue;

    const hm = /^(#{1,6})\s/.exec(line);
    if (hm && hm[1]!.length <= 3) {
      tasks.push(currentTask);
      currentTask = null;
      inExpectedFiles = false;
      inVerification = false;
      continue;
    }

    const fileMatch = /^\s*-\s+`?([^`]+)`?/.exec(line);
    if (fileMatch && (inExpectedFiles || /expected files/i.test(getCurrentSection(line)))) {
      inExpectedFiles = true;
      currentTask.expectedFiles.push(fileMatch[1]!.trim());
      continue;
    }

    const acMatch = /\bAC-\d+\b/.exec(line);
    if (acMatch && currentTask.acceptanceCriteria.indexOf(acMatch[0]) === -1) {
      currentTask.acceptanceCriteria.push(acMatch[0]);
    }

    if (/verification/i.test(line) && /^###/.test(line)) {
      inVerification = true;
      continue;
    }

    if (inVerification) {
      const cmdMatch = /`([^`]+)`/.exec(line);
      if (cmdMatch) {
        currentTask.verificationCommands.push(cmdMatch[1]!);
      }
    }
  }

  if (currentTask) tasks.push(currentTask);
  return tasks;
}

function getCurrentSection(line: string): string {
  const hm = /^#{1,6}\s+(.*)$/.exec(line.trim());
  if (hm) return hm[1]!;
  return "";
}

function extractAcceptanceCriteriaAsArray(specMarkdown: string): string[] {
  const acs: string[] = [];
  for (const line of specMarkdown.split("\n")) {
    const m = /- \[[ x]\] (\w{2,4}):/.exec(line);
    if (m) acs.push(m[1]!);
  }
  return acs;
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

function findTaskSpecificFiles(
  changedFiles: Array<{ path: string; changeType: string; source: string; inBoundary: string; notes: string[] }>,
  expectedFiles: string[],
  taskSummaries: Array<{ path: string; content: string }>,
): Array<{ path: string; changeType: string }> {
  const results: Array<{ path: string; changeType: string }> = [];

  for (const cf of changedFiles) {
    if (isImplementationPath(cf.path)) {
      results.push({ path: cf.path, changeType: cf.changeType });
    }
  }

  for (const ef of expectedFiles) {
    if (!results.some((r) => r.path === ef)) {
      const fileExists = changedFiles.some((c) => c.path === ef);
      results.push({
        path: ef,
        changeType: fileExists ? "modified" : "unknown",
      });
    }
  }

  return results;
}

function generateReviewFindings(input: {
  task: ParsedTask;
  specAcceptanceCriteria: string[];
  changedFiles: Array<{ path: string; changeType: string; source: string; inBoundary: string; notes: string[] }>;
  taskChangedFiles: Array<{ path: string; changeType: string }>;
  boundary: unknown;
  boundaryReview: { status: string; violations: Array<{ path: string; changeType: string }> };
  riskGates: Array<{ name: string; status: string; reason: string }>;
  taskSummaries: Array<{ path: string; content: string }>;
}): ReviewFinding[] {
  const findings: ReviewFinding[] = [];

  for (const ac of input.task.acceptanceCriteria) {
    const found = input.taskSummaries.some((s) => s.content.includes(ac));
    if (!found) {
      const finding: ReviewFinding = {
        severity: "major",
        evidence: `${ac} not evidenced in task summaries`,
        fix: `Ensure ${ac} is verified in task summary for ${input.task.id}`,
      };
      if (input.task.expectedFiles[0]) {
        finding.file = input.task.expectedFiles[0];
      }
      findings.push(finding);
    }
  }

  const unverifiedACs = input.task.acceptanceCriteria.filter(
    (ac) => !input.specAcceptanceCriteria.includes(ac) && !input.taskSummaries.some((s) => s.content.includes(ac)),
  );
  for (const ac of unverifiedACs) {
    findings.push({
      severity: "major",
      evidence: `${ac} not found in spec acceptance criteria or task summaries`,
      fix: `Add evidence for ${ac} to task summaries or update spec`,
    });
  }

  for (const v of input.boundaryReview.violations) {
    findings.push({
      severity: "critical",
      file: v.path,
      evidence: `File ${v.path} changed outside boundary (${v.changeType})`,
      fix: `Either expand boundary to include ${v.path} or revert changes`,
    });
  }

  for (const tf of input.taskChangedFiles) {
    if (tf.changeType === "unknown") {
      findings.push({
        severity: "major",
        file: tf.path,
        evidence: `Expected file ${tf.path} not detected as changed`,
        fix: `Verify ${tf.path} was created or modified for task ${input.task.id}`,
      });
    }
  }

  const unresolvedRisk = input.riskGates.filter(
    (g) => g.status === "triggered" || g.status === "unresolved",
  );
  for (const gate of unresolvedRisk) {
    findings.push({
      severity: "critical",
      evidence: `Risk gate ${gate.name} is unresolved: ${gate.reason}`,
      fix: `Approve or resolve risk gate ${gate.name} before proceeding`,
    });
  }

  if (input.taskChangedFiles.length === 0 && input.task.expectedFiles.length === 0) {
    findings.push({
      severity: "major",
      evidence: `Task ${input.task.id} has no expected files or changed files`,
      fix: "Define expected files in tasks.md for this task",
    });
  }

  const hasTests = input.task.verificationCommands.some(
    (c) => c.includes("test") || c.includes("jest") || c.includes("vitest"),
  );
  if (!hasTests && input.taskChangedFiles.length > 0) {
    const finding: ReviewFinding = {
      severity: "minor",
      evidence: "No test commands defined for this task",
      fix: `Add a test verification command for task ${input.task.id}`,
    };
    if (input.task.expectedFiles[0]) {
      finding.file = input.task.expectedFiles[0];
    }
    findings.push(finding);
  }

  return findings;
}

function buildReviewChecklist(input: {
  task: ParsedTask;
  findings: ReviewFinding[];
  boundaryReview: { status: string; violations: Array<{ path: string; changeType: string }> };
  riskGates: Array<{ name: string; status: string }>;
}): ReviewChecklist {
  const hasAcIssues = input.findings.some(
    (f) => (f.severity === "critical" || f.severity === "major") && f.evidence?.includes("AC"),
  );

  return {
    acceptanceCriteria: hasAcIssues ? "partial" : "pass",
    boundary: input.boundaryReview.status === "pass" ? "pass" : "fail",
    tests: input.task.verificationCommands.length > 0 ? "pass" : "missing",
    security: "n/a",
    riskGates: input.riskGates.length > 0 ? "pass" : "n/a",
  };
}

function getReviewedFiles(
  taskChangedFiles: Array<{ path: string; changeType: string }>,
  expectedFiles: string[],
  changedFiles: Array<{ path: string; changeType: string; source: string; inBoundary: string; notes: string[] }>,
): string[] {
  const files = new Set<string>();

  for (const f of taskChangedFiles) {
    files.add(f.path);
  }

  for (const f of expectedFiles) {
    files.add(f);
  }

  for (const f of changedFiles) {
    if (isImplementationPath(f.path)) {
      files.add(f.path);
    }
  }

  return Array.from(files).sort();
}

async function countReviewIterations(reviewsDir: string, taskId: string): Promise<number> {
  if (!(await dirExists(reviewsDir))) return 0;
  const jsonPath = path.join(reviewsDir, `${taskId}.json`);
  if (await fileExists(jsonPath)) {
    try {
      const existing = await readJsonFile<{ iteration?: number }>(jsonPath);
      return (existing?.iteration ?? 0);
    } catch {
      return 0;
    }
  }
  return 0;
}

async function parseEventsJsonl(eventsPath: string): Promise<Array<Record<string, unknown>>> {
  const text = await readTextFile(eventsPath);
  if (!text) return [];
  const events: Array<Record<string, unknown>> = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as Record<string, unknown>);
    } catch {
      // malformed line — skip
    }
  }
  return events;
}
