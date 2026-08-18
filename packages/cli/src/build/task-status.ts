import type { ParsedTask } from "../context/task-context.js";

export type BuildTaskStatus =
  | "planned"
  | "building"
  | "needs-fix"
  | "blocked"
  | "verified"
  | "done";

const KNOWN_STATUSES = new Set<string>([
  "planned", "building", "needs-fix", "blocked", "verified", "done",
]);

const RUNNABLE_STATUSES = new Set<string>(["planned", "needs-fix"]);

export interface TaskSelectionOptions {
  taskId?: string | undefined;
  all?: boolean | undefined;
  maxTasks?: number | undefined;
}

export interface SelectedTasks {
  tasks: ParsedTask[];
  warnings: string[];
}

export function normalizeTaskStatus(value: string | undefined): BuildTaskStatus {
  if (!value) return "planned";
  const lower = value.toLowerCase().trim();
  if (KNOWN_STATUSES.has(lower)) return lower as BuildTaskStatus;
  return "planned";
}

export function isRunnableTaskStatus(status: string | undefined): boolean {
  return RUNNABLE_STATUSES.has(normalizeTaskStatus(status));
}

export function selectTasks(
  tasks: ParsedTask[],
  options: TaskSelectionOptions,
): SelectedTasks {
  const warnings: string[] = [];

  if (options.taskId) {
    const normalized = options.taskId.toUpperCase();
    const task = tasks.find((t) => t.id.toUpperCase() === normalized);
    if (!task) {
      const known = extractKnownTaskIds(tasks);
      throw new Error(
        `Could not find task ${options.taskId} in tasks.md.\n` +
        (known.length > 0 ? `Known tasks: ${known.join(", ")}` : "No tasks found."),
      );
    }
    const status = normalizeTaskStatus(task.status);
    if (status === "blocked") {
      throw new Error(
        `Refusing to run blocked task ${task.id}.\n` +
        "Resolve the blocker or update tasks.md before building.",
      );
    }
    if (status === "verified" || status === "done") {
      warnings.push(`Task ${task.id} has status "${status}" and will be skipped.`);
      return { tasks: [], warnings };
    }
    if (status === "building") {
      warnings.push(`Task ${task.id} is already building. Re-running.`);
    }
    return { tasks: [task], warnings };
  }

  if (options.all) {
    const runnable = tasks.filter((t) => isRunnableTaskStatus(t.status));
    if (runnable.length === 0) {
      warnings.push("No runnable tasks found.");
    }
    return { tasks: runnable, warnings };
  }

  if (options.maxTasks !== undefined && options.maxTasks > 0) {
    const runnable = tasks.filter((t) => isRunnableTaskStatus(t.status));
    const selected = runnable.slice(0, options.maxTasks);
    if (selected.length === 0) {
      warnings.push("No runnable tasks found.");
    }
    return { tasks: selected, warnings };
  }

  const next = findNextRunnableTask(tasks);
  if (!next) {
    warnings.push("No runnable tasks found.");
    return { tasks: [], warnings };
  }
  return { tasks: [next], warnings };
}

export function findNextRunnableTask(tasks: ParsedTask[]): ParsedTask | null {
  for (const t of tasks) {
    if (isRunnableTaskStatus(t.status)) return t;
  }
  return null;
}

export function updateTaskStatusInMarkdown(
  markdown: string,
  taskId: string,
  status: BuildTaskStatus,
): string {
  const lines = markdown.split("\n");
  const headingRe = /^#{1,3}\s+(T\d{2,}):\s*/;
  let inTarget = false;
  let statusUpdated = false;
  let insertAfterLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const hm = headingRe.exec(line);
    if (hm) {
      if (inTarget && !statusUpdated && insertAfterLine >= 0) {
        lines.splice(insertAfterLine + 1, 0, `- Status: ${status}`);
        return lines.join("\n");
      }
      inTarget = hm[1]!.toUpperCase() === taskId.toUpperCase();
      if (inTarget) {
        insertAfterLine = i;
      }
      statusUpdated = false;
      continue;
    }

    if (inTarget && !statusUpdated) {
      const statusMatch = /^(\s*-\s+Status:\s*)(.*)$/.exec(line);
      if (statusMatch) {
        lines[i] = `${statusMatch[1]}${status}`;
        statusUpdated = true;
        inTarget = false;
      }
    }
  }

  if (inTarget && !statusUpdated && insertAfterLine >= 0) {
    lines.splice(insertAfterLine + 1, 0, `- Status: ${status}`);
  }

  return lines.join("\n");
}

export function extractKnownTaskIds(tasks: ParsedTask[]): string[] {
  return tasks.map((t) => t.id);
}
