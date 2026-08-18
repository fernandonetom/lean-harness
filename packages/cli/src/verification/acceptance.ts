import type { VerificationEvent } from "./index.js";
import { extractAcceptanceCriteria } from "../planning/acceptance.js";

export type AcceptanceStatus = "pass" | "fail" | "partial" | "not checked";

export interface AcceptanceCheck {
  id: string;
  text: string;
  status: AcceptanceStatus;
  evidence: string[];
  notes: string[];
}

export interface AcceptanceVerificationInput {
  specMarkdown: string;
  tasksMarkdown: string | null;
  taskSummaries: Array<{ path: string; content: string }>;
  events: VerificationEvent[];
  cavebus: string | null;
}

export function extractAcceptanceCriteriaForCheck(
  specMarkdown: string,
): Array<{ id: string; text: string }> {
  const criteria = extractAcceptanceCriteria(
    extractAcSection(specMarkdown),
  );
  return criteria.map((c) => ({ id: c.id, text: c.text }));
}

export function findAcceptanceEvidence(
  acId: string,
  input: AcceptanceVerificationInput,
): string[] {
  const evidence: string[] = [];
  const upperAcId = acId.toUpperCase();

  for (const summary of input.taskSummaries) {
    const upper = summary.content.toUpperCase();
    if (upper.includes(upperAcId)) {
      evidence.push(`task summary ${summary.path} mentions ${acId}`);
    }
  }

  if (input.tasksMarkdown) {
    const taskLines = input.tasksMarkdown.split("\n");
    let currentTask: string | null = null;
    for (const line of taskLines) {
      const taskMatch = /^#{1,3}\s+(T\d{2,}):/i.exec(line);
      if (taskMatch) {
        currentTask = taskMatch[1]!;
        continue;
      }
      if (currentTask && line.toUpperCase().includes(upperAcId)) {
        const statusLine = findTaskStatusInMarkdown(input.tasksMarkdown, currentTask);
        if (statusLine === "done" || statusLine === "verified") {
          evidence.push(`task ${currentTask} mapped to ${acId} and status is ${statusLine}`);
        }
      }
    }
  }

  for (const ev of input.events) {
    const evStr = JSON.stringify(ev).toUpperCase();
    if (evStr.includes(upperAcId) && ev.event === "task.completed") {
      evidence.push(`event ${ev.event} for ${ev.taskId ?? "unknown"} references ${acId}`);
    }
  }

  if (input.cavebus) {
    const lines = input.cavebus.split("\n");
    for (const line of lines) {
      const upper = line.toUpperCase();
      if (upper.includes(upperAcId) && upper.includes("PASS")) {
        evidence.push(`cavebus entry: ${line.trim().slice(0, 120)}`);
      }
    }
  }

  return evidence;
}

export function verifyAcceptanceCriteria(
  input: AcceptanceVerificationInput,
): AcceptanceCheck[] {
  const criteria = extractAcceptanceCriteriaForCheck(input.specMarkdown);

  if (criteria.length === 0) {
    return [{
      id: "AC0",
      text: "No acceptance criteria found in spec",
      status: "not checked",
      evidence: [],
      notes: ["Spec does not contain acceptance criteria. Add criteria to the Acceptance Criteria section."],
    }];
  }

  const results: AcceptanceCheck[] = [];

  for (const ac of criteria) {
    const evidence = findAcceptanceEvidence(ac.id, input);
    const taskSummaryMentions = evidence.filter((e) => e.startsWith("task summary"));
    const taskMappingEvidence = evidence.filter((e) => e.startsWith("task ") && e.includes("mapped to"));
    const commandEvidence = evidence.filter((e) => e.startsWith("event") || e.startsWith("cavebus"));

    let status: AcceptanceStatus;

    if (evidence.length === 0) {
      status = "not checked";
    } else if (taskSummaryMentions.length > 0 && (taskMappingEvidence.length > 0 || commandEvidence.length > 0)) {
      status = "pass";
    } else if (taskSummaryMentions.length > 0) {
      const summaryHasDoneStatus = taskSummaryMentions.some((e) => {
        const summaryPath = e.replace(/^task summary /, "").replace(/ mentions .*$/, "");
        const summary = input.taskSummaries.find((s) => s.path === summaryPath);
        if (!summary) return false;
        return hasStatusDone(summary.content);
      });
      status = summaryHasDoneStatus ? "pass" : "partial";
    } else if (taskMappingEvidence.length > 0) {
      status = "pass";
    } else {
      status = "partial";
    }

    const notes: string[] = [];
    if (status === "not checked") {
      notes.push(`No evidence found for ${ac.id}. Ensure task summaries or verification commands reference this criterion.`);
    } else if (status === "partial") {
      notes.push(`Weak evidence for ${ac.id}. Strengthen by adding task summary references or verification command results.`);
    }

    results.push({ id: ac.id, text: ac.text, status, evidence, notes });
  }

  return results;
}

function extractAcSection(markdown: string): string {
  const lines = markdown.split("\n");
  let capturing = false;
  let sectionLevel = 0;
  const sectionLines: string[] = [];

  for (const line of lines) {
    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      const text = headingMatch[2]!.trim().toLowerCase();
      if (capturing && level <= sectionLevel) break;
      if (!capturing && text === "acceptance criteria") {
        capturing = true;
        sectionLevel = level;
        continue;
      }
    }
    if (capturing) sectionLines.push(line);
  }

  return sectionLines.join("\n");
}

function findTaskStatusInMarkdown(markdown: string, taskId: string): string | null {
  const lines = markdown.split("\n");
  const headingRe = /^#{1,3}\s+(T\d{2,}):/i;
  let inTarget = false;

  for (const line of lines) {
    const hm = headingRe.exec(line);
    if (hm) {
      inTarget = hm[1]!.toUpperCase() === taskId.toUpperCase();
      continue;
    }
    if (inTarget) {
      const statusMatch = /^\s*-\s+Status:\s*(.+)$/i.exec(line);
      if (statusMatch) return statusMatch[1]!.trim().toLowerCase();
    }
  }

  return null;
}

function hasStatusDone(summaryContent: string): boolean {
  const lines = summaryContent.split("\n");
  let inStatus = false;
  for (const line of lines) {
    if (/^##\s+Status/i.test(line)) {
      inStatus = true;
      continue;
    }
    if (inStatus) {
      const trimmed = line.trim().toLowerCase();
      if (trimmed === "") continue;
      if (/^#/.test(line)) break;
      return trimmed === "done" || trimmed === "verified";
    }
  }
  return false;
}
