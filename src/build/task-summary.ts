import type { ParsedTask } from "../context/task-context.js";
import type { AgentRunResult, AgentHost } from "../adapters/types.js";

export interface TaskSummaryInput {
  featureId: string;
  featureTitle: string;
  featureFolderName: string;
  task: ParsedTask;
  host: AgentHost;
  status: "done" | "needs-fix" | "blocked";
  contextPath: string;
  resultPath?: string | undefined;
  runResult?: AgentRunResult | undefined;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  warnings: string[];
}

export function renderTaskSummary(input: TaskSummaryInput): string {
  const { featureId, featureTitle, task, host, status, contextPath, resultPath, runResult, warnings } = input;

  const lines: string[] = [];
  lines.push(`# ${featureId} ${task.id} Summary`);
  lines.push("");

  lines.push("## Status");
  lines.push("");
  lines.push(status);
  lines.push("");

  lines.push("## CaveBus Summary");
  lines.push("");
  lines.push(renderTaskCavebusSummary(input).trim());
  lines.push("");

  lines.push("## Human Summary");
  lines.push("");
  if (status === "done") {
    lines.push(`Task ${task.id} (${task.title}) was run via ${host} and completed successfully.`);
  } else if (status === "needs-fix") {
    lines.push(`Task ${task.id} (${task.title}) was run via ${host} but the host command returned a non-zero exit code.`);
  } else {
    lines.push(`Task ${task.id} (${task.title}) is blocked.`);
  }
  lines.push("");

  lines.push("## Feature");
  lines.push("");
  lines.push(`${featureId} — ${featureTitle}`);
  lines.push("");

  lines.push("## Files Changed");
  lines.push("");
  lines.push("Unknown unless reported by host or git evidence is available.");
  lines.push("");

  lines.push("## Tests Added or Updated");
  lines.push("");
  lines.push("Unknown unless reported by host.");
  lines.push("");

  lines.push("## Commands Run");
  lines.push("");
  if (runResult) {
    lines.push(`- \`${runResult.command.slice(0, 4).join(" ")}${runResult.command.length > 4 ? " ..." : ""}\``);
  } else {
    lines.push("- No host command was executed.");
  }
  if (task.verificationCommands.length > 0) {
    lines.push("");
    lines.push("Verification commands from task (not independently verified by lh build):");
    for (const vc of task.verificationCommands) {
      lines.push(`- \`${vc}\``);
    }
  }
  lines.push("");

  lines.push("## Acceptance Criteria Covered");
  lines.push("");
  if (task.acceptanceCriteria.length > 0) {
    for (const ac of task.acceptanceCriteria) {
      lines.push(`- [ ] ${ac}`);
    }
    lines.push("");
    lines.push("_Not verified by `lh check` yet._");
  } else {
    lines.push("None specified in task.");
  }
  lines.push("");

  lines.push("## Review Findings");
  lines.push("");
  lines.push("Not reviewed by `lh check` yet.");
  lines.push("");

  lines.push("## Artifacts");
  lines.push("");
  lines.push(`- Context: ${contextPath}`);
  if (resultPath) {
    lines.push(`- Result: ${resultPath}`);
  }
  lines.push(`- Started: ${input.startedAt}`);
  lines.push(`- Finished: ${input.finishedAt}`);
  if (runResult) {
    lines.push(`- Exit code: ${runResult.exitCode}`);
    lines.push(`- Duration: ${runResult.durationMs}ms`);
  }
  lines.push("");

  if (warnings.length > 0) {
    lines.push("## Warnings");
    lines.push("");
    for (const w of warnings) {
      lines.push(`- ${w}`);
    }
    lines.push("");
  }

  lines.push("## Follow-Ups");
  lines.push("");
  if (status === "done") {
    lines.push("- Review task output and inspect changes.");
    lines.push("- When check is implemented, run `lh check " + featureId + "`.");
    lines.push("- For now, review task summaries and run project verification commands manually.");
  } else if (status === "needs-fix") {
    lines.push("- Inspect the host result file for errors.");
    lines.push("- Fix the issue, then rerun `lh build " + featureId + " " + task.id + "`.");
  } else {
    lines.push("- Resolve the blocker before retrying.");
  }
  lines.push("");

  return lines.join("\n");
}

export function renderTaskCavebusSummary(input: TaskSummaryInput): string {
  const { featureId, task, host, status, contextPath, resultPath } = input;

  const lines: string[] = [];
  lines.push(`SUM ${featureId} ${task.id} status:${status}`);
  lines.push("host:");
  lines.push(`- ${host}`);
  lines.push("ctx:");
  lines.push(`- ${contextPath}`);
  if (resultPath) {
    lines.push("result:");
    lines.push(`- ${resultPath}`);
  }
  if (status === "done") {
    lines.push("pass:");
    lines.push("- host exit 0");
    lines.push("fail:");
    lines.push("risk:");
  } else {
    lines.push("pass:");
    lines.push("fail:");
    lines.push(`- host exit ${input.runResult?.exitCode ?? "unknown"}`);
    lines.push("risk:");
  }
  lines.push("next:");
  if (status === "done") {
    lines.push("- review summary; collect verification evidence");
  } else {
    lines.push(`- inspect result; fix task or rerun build`);
  }
  lines.push("");

  return lines.join("\n");
}

export function summarizeRunOutput(
  stdout: string,
  stderr: string,
  maxChars = 500,
): { stdoutPreview: string; stderrPreview: string } {
  return {
    stdoutPreview: stdout.length > maxChars ? stdout.slice(0, maxChars) + "\n[truncated]" : stdout,
    stderrPreview: stderr.length > maxChars ? stderr.slice(0, maxChars) + "\n[truncated]" : stderr,
  };
}
