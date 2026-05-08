import type { ParsedSpecForPlanning, AcceptanceCriterion } from "./acceptance.js";
import { ensureAcceptanceCriteria } from "./acceptance.js";

export type TaskSize = "small" | "medium" | "large";

export interface PlanningBoundaryFile {
  path: string;
  reason: string;
  confidence: "low" | "medium" | "high";
}

export interface PlanningBoundary {
  featureId: string;
  featureTitle: string;
  status?: string | undefined;
  confidence?: "low" | "medium" | "high" | "unknown" | undefined;
  discoveryDepth?: string | undefined;
  touchFiles: PlanningBoundaryFile[];
  readOnlyFiles: PlanningBoundaryFile[];
  relevantTests: Array<{
    path?: string | undefined;
    command?: string | undefined;
    reason: string;
    confidence?: "low" | "medium" | "high" | undefined;
  }>;
  commands: Array<{
    command: string;
    purpose: string;
    confidence?: "low" | "medium" | "high" | undefined;
    source?: string | undefined;
  }>;
  riskGates: Array<{
    name: string;
    reason: string;
    status: "triggered" | "approved" | "resolved" | "unresolved";
  }>;
  unknowns: string[];
  doNotTouch: string[];
  allowedEditGlobs: string[];
  blockedEditGlobs: string[];
  protectedTokens: string[];
}

export interface PlannedTask {
  id: string;
  title: string;
  status: "planned" | "blocked";
  acceptanceCriteria: string[];
  slice: string;
  goal: string;
  expectedFiles: string[];
  readOnlyContext: string[];
  testExpectation: string;
  verificationCommands: string[];
  riskNotes: string[];
  dependencies: string[];
  summaryFile: string;
  notes: string[];
}

export interface PlanSlice {
  id: string;
  title: string;
  goal: string;
  taskIds: string[];
  notes: string[];
}

export interface GeneratedPlan {
  status: "draft" | "planned" | "blocked";
  summary: string;
  slices: PlanSlice[];
  tasks: PlannedTask[];
  warnings: string[];
  unknowns: string[];
  riskGates: string[];
  nextAction: string;
}

export interface GenerateTasksOptions {
  spec: ParsedSpecForPlanning;
  boundary: PlanningBoundary | null;
  featureFolderName: string;
  taskSize: TaskSize;
  maxTasks: number;
  fromSpecOnly: boolean;
}

export function normalizeBoundary(
  input: unknown,
  fallback: { featureId: string; title: string },
): PlanningBoundary | null {
  if (input === null || input === undefined) return null;
  if (typeof input !== "object") return null;

  const data = input as Record<string, unknown>;

  const featureId =
    typeof data["featureId"] === "string" ? data["featureId"] : fallback.featureId;
  const featureTitle =
    typeof data["featureTitle"] === "string" ? data["featureTitle"] : fallback.title;

  const status = typeof data["status"] === "string" ? data["status"] : undefined;
  const confidence = normalizeConfidence(data["confidence"]);
  const discoveryDepth =
    typeof data["discoveryDepth"] === "string" ? data["discoveryDepth"] : undefined;

  return {
    featureId,
    featureTitle,
    status,
    confidence,
    discoveryDepth,
    touchFiles: normalizeFileEntries(data["touchFiles"]),
    readOnlyFiles: normalizeFileEntries(data["readOnlyFiles"]),
    relevantTests: normalizeTestEntries(data["relevantTests"]),
    commands: normalizeCommandEntries(data["commands"]),
    riskGates: normalizeRiskGates(data["riskGates"]),
    unknowns: normalizeStringArray(data["unknowns"]),
    doNotTouch: normalizeStringArray(data["doNotTouch"]),
    allowedEditGlobs: normalizeStringArray(data["allowedEditGlobs"]),
    blockedEditGlobs: normalizeStringArray(data["blockedEditGlobs"]),
    protectedTokens: normalizeStringArray(data["protectedTokens"]),
  };
}

export function generatePlan(options: GenerateTasksOptions): GeneratedPlan {
  const { spec, boundary, featureFolderName, taskSize, maxTasks, fromSpecOnly } = options;
  const warnings: string[] = [];
  const unknowns: string[] = [];
  const riskGateNames: string[] = [];

  const criteria = ensureAcceptanceCriteria(spec);
  const isPlaceholder = spec.acceptanceCriteria.length === 0;

  if (isPlaceholder) {
    warnings.push("Acceptance criteria are placeholders. Refine spec before implementation.");
  }

  if (fromSpecOnly || !boundary) {
    return generateFromSpecOnly(spec, criteria, featureFolderName, isPlaceholder, warnings);
  }

  for (const rg of boundary.riskGates) {
    riskGateNames.push(rg.name);
  }

  for (const u of boundary.unknowns) {
    unknowns.push(u);
  }

  if (boundary.touchFiles.length === 0) {
    unknowns.push("No touch files in boundary. Boundary may need refinement.");
    warnings.push("No touch files found. Tasks will reference boundary refinement.");
  }

  const verifyCommands = chooseVerificationCommands(boundary);
  const fileGroups = groupFilesForTasks(boundary, taskSize);

  const hasSecurityRisk = riskGateNames.some(
    (n) => n === "security_sensitive_change" || n === "auth_rewrite",
  );
  const hasPaymentRisk = riskGateNames.some((n) => n === "payment_logic");
  const hasMigrationFiles = boundary.touchFiles.some(
    (f) =>
      f.path.includes("migration") ||
      f.path.includes("schema") ||
      f.path.endsWith(".sql"),
  );

  const tasks: PlannedTask[] = [];
  const slices: PlanSlice[] = [];

  if (fileGroups.length === 0) {
    const t = createBoundaryRefinementTask(
      1,
      featureFolderName,
      criteria,
      verifyCommands,
      riskGateNames,
    );
    tasks.push(t);
    slices.push({
      id: "S01",
      title: "Boundary refinement",
      goal: "Refine change boundary before implementation.",
      taskIds: [t.id],
      notes: ["No touch files found."],
    });
  } else {
    let migrationTaskId: string | null = null;

    if (hasMigrationFiles) {
      const idx = tasks.length + 1;
      const migFiles = boundary.touchFiles.filter(
        (f) =>
          f.path.includes("migration") ||
          f.path.includes("schema") ||
          f.path.endsWith(".sql"),
      );
      const migReadOnly = boundary.readOnlyFiles
        .filter((f) => f.path.includes("migration") || f.path.includes("schema"))
        .map((f) => f.path);

      const t: PlannedTask = {
        id: taskId(idx),
        title: "Prepare migration or schema changes",
        status: "planned",
        acceptanceCriteria: pickCriteria(criteria, idx - 1, 1),
        slice: "Migration",
        goal: "Safely create or update migration/schema files before behavior changes.",
        expectedFiles: migFiles.map((f) => f.path),
        readOnlyContext: migReadOnly,
        testExpectation: "Migration applies without errors.",
        verificationCommands: verifyCommands,
        riskNotes: ["destructive_migration risk gate triggered"],
        dependencies: [],
        summaryFile: `.lh/features/${featureFolderName}/task-summaries/${taskId(idx)}.md`,
        notes: [],
      };
      tasks.push(t);
      migrationTaskId = t.id;

      slices.push({
        id: `S${String(slices.length + 1).padStart(2, "0")}`,
        title: "Migration",
        goal: "Schema/migration changes isolated from behavior.",
        taskIds: [t.id],
        notes: ["Separated due to destructive_migration risk gate."],
      });
    }

    const implSlice: PlanSlice = {
      id: `S${String(slices.length + 1).padStart(2, "0")}`,
      title: "Implementation",
      goal: `Implement ${spec.title} within the change boundary.`,
      taskIds: [],
      notes: [],
    };

    for (let gi = 0; gi < fileGroups.length; gi++) {
      if (tasks.length >= maxTasks) break;
      if (tasks.length >= 12) break;

      const group = fileGroups[gi]!;
      const idx = tasks.length + 1;
      const acIds = pickCriteria(criteria, gi, fileGroups.length);
      const groupRiskNotes = riskNotesForFiles(group.files, riskGateNames, hasSecurityRisk, hasPaymentRisk);

      if (hasSecurityRisk || hasPaymentRisk) {
        for (const f of group.files) {
          if (isHighRiskFile(f)) {
            groupRiskNotes.push(`High-risk file: ${f}. Review carefully.`);
          }
        }
      }

      const deps: string[] = [];
      if (migrationTaskId && gi === 0) {
        deps.push(migrationTaskId);
      }

      const testFiles = group.tests;
      const allExpected = [...group.files];
      for (const tf of testFiles) {
        if (!allExpected.includes(tf)) allExpected.push(tf);
      }

      const readOnly = [...group.readOnly];
      for (const ro of boundary.readOnlyFiles) {
        if (!readOnly.includes(ro.path) && !allExpected.includes(ro.path)) {
          readOnly.push(ro.path);
        }
      }

      const testExp = testFiles.length > 0
        ? `Tests in ${testFiles.join(", ")} should pass after changes.`
        : "Add or update tests for changed behavior.";

      const t: PlannedTask = {
        id: taskId(idx),
        title: group.title,
        status: "planned",
        acceptanceCriteria: acIds,
        slice: implSlice.title,
        goal: `Implement changes in ${group.files.join(", ")}.`,
        expectedFiles: allExpected,
        readOnlyContext: readOnly.slice(0, 10),
        testExpectation: testExp,
        verificationCommands: verifyCommands,
        riskNotes: groupRiskNotes,
        dependencies: deps,
        summaryFile: `.lh/features/${featureFolderName}/task-summaries/${taskId(idx)}.md`,
        notes: [],
      };
      tasks.push(t);
      implSlice.taskIds.push(t.id);
    }

    if (implSlice.taskIds.length > 0) {
      slices.push(implSlice);
    }
  }

  const allBlocked = tasks.every((t) => t.status === "blocked");
  const planStatus: GeneratedPlan["status"] = allBlocked
    ? "blocked"
    : isPlaceholder
      ? "draft"
      : "planned";

  const firstTaskId = tasks.length > 0 ? tasks[0]!.id : "T01";
  const nextAction = planStatus === "blocked"
    ? `Resolve blockers, then retry: lh plan ${spec.featureId} --force`
    : `Run: lh compile-task ${spec.featureId} ${firstTaskId}`;

  const summary =
    `Plan for ${spec.featureId} — ${spec.title}. ` +
    `${tasks.length} task(s) across ${slices.length} slice(s). ` +
    `${riskGateNames.length} risk gate(s). ` +
    (unknowns.length > 0 ? `${unknowns.length} unknown(s).` : "No unknowns.");

  return {
    status: planStatus,
    summary,
    slices,
    tasks,
    warnings,
    unknowns,
    riskGates: riskGateNames,
    nextAction,
  };
}

export function chooseVerificationCommands(
  boundary: PlanningBoundary | null,
): string[] {
  if (!boundary) return [];
  const commands: string[] = [];
  const seen = new Set<string>();

  for (const cmd of boundary.commands) {
    const lower = cmd.purpose.toLowerCase();
    if (
      lower.includes("test") ||
      lower.includes("check") ||
      lower.includes("lint") ||
      lower.includes("typecheck") ||
      lower.includes("type-check") ||
      lower.includes("verify")
    ) {
      if (!seen.has(cmd.command)) {
        commands.push(cmd.command);
        seen.add(cmd.command);
      }
    }
  }

  if (commands.length === 0) {
    for (const cmd of boundary.commands) {
      if (!seen.has(cmd.command)) {
        commands.push(cmd.command);
        seen.add(cmd.command);
      }
      if (commands.length >= 3) break;
    }
  }

  for (const test of boundary.relevantTests) {
    if (test.command && !seen.has(test.command)) {
      commands.push(test.command);
      seen.add(test.command);
    }
  }

  return commands.slice(0, 5);
}

export function groupFilesForTasks(
  boundary: PlanningBoundary | null,
  taskSize: TaskSize,
): Array<{ title: string; files: string[]; readOnly: string[]; tests: string[] }> {
  if (!boundary || boundary.touchFiles.length === 0) return [];

  const filesPerTask =
    taskSize === "small" ? 2 : taskSize === "medium" ? 4 : 7;

  const touchPaths = boundary.touchFiles.map((f) => f.path);
  const testPaths = boundary.relevantTests
    .filter((t) => t.path)
    .map((t) => t.path!);

  const dirGroups = new Map<string, string[]>();
  for (const fp of touchPaths) {
    const dir = fp.includes("/") ? fp.slice(0, fp.lastIndexOf("/")) : ".";
    const existing = dirGroups.get(dir);
    if (existing) {
      existing.push(fp);
    } else {
      dirGroups.set(dir, [fp]);
    }
  }

  const groups: Array<{ title: string; files: string[]; readOnly: string[]; tests: string[] }> = [];
  let currentFiles: string[] = [];
  let currentDir = "";

  const dirEntries = Array.from(dirGroups.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  for (const [dir, files] of dirEntries) {
    for (const file of files) {
      if (currentFiles.length >= filesPerTask) {
        groups.push(finishGroup(currentFiles, currentDir, testPaths, boundary));
        currentFiles = [];
      }
      currentFiles.push(file);
      currentDir = dir;
    }
  }

  if (currentFiles.length > 0) {
    groups.push(finishGroup(currentFiles, currentDir, testPaths, boundary));
  }

  return groups;
}

export function taskId(index: number): string {
  return `T${String(index).padStart(2, "0")}`;
}

function generateFromSpecOnly(
  spec: ParsedSpecForPlanning,
  criteria: AcceptanceCriterion[],
  featureFolderName: string,
  isPlaceholder: boolean,
  warnings: string[],
): GeneratedPlan {
  warnings.push("Plan created from spec only. Discovery has not run.");
  warnings.push("Run `lh discover` before implementation to create a proper change boundary.");

  const tasks: PlannedTask[] = [
    {
      id: "T01",
      title: "Refine specification and acceptance criteria",
      status: "planned",
      acceptanceCriteria: criteria.map((c) => c.id),
      slice: "Preparation",
      goal: "Review and refine spec. Ensure acceptance criteria are concrete and verifiable.",
      expectedFiles: [],
      readOnlyContext: [`.lh/features/${featureFolderName}/spec.md`],
      testExpectation: "Spec has concrete, verifiable acceptance criteria.",
      verificationCommands: [],
      riskNotes: isPlaceholder
        ? ["Acceptance criteria are placeholders. Must be refined before implementation."]
        : [],
      dependencies: [],
      summaryFile: `.lh/features/${featureFolderName}/task-summaries/T01.md`,
      notes: ["This is a draft plan. Discovery is required before implementation."],
    },
    {
      id: "T02",
      title: "Run on-demand discovery and create change boundary",
      status: "blocked",
      acceptanceCriteria: [],
      slice: "Preparation",
      goal: `Run lh discover ${spec.featureId} to identify touch files, tests, commands, and risk gates.`,
      expectedFiles: [
        `.lh/features/${featureFolderName}/discovery.md`,
        `.lh/features/${featureFolderName}/boundary.json`,
      ],
      readOnlyContext: [`.lh/features/${featureFolderName}/spec.md`],
      testExpectation: "Discovery produces boundary.json with touch files and tests.",
      verificationCommands: [`lh discover ${spec.featureId} --depth D2`],
      riskNotes: [],
      dependencies: ["T01"],
      summaryFile: `.lh/features/${featureFolderName}/task-summaries/T02.md`,
      notes: ["Blocked until spec is refined."],
    },
    {
      id: "T03",
      title: "Create implementation tasks after discovery",
      status: "blocked",
      acceptanceCriteria: criteria.map((c) => c.id),
      slice: "Planning",
      goal: `Run lh plan ${spec.featureId} --force to generate implementation tasks from discovery.`,
      expectedFiles: [
        `.lh/features/${featureFolderName}/plan.md`,
        `.lh/features/${featureFolderName}/tasks.md`,
      ],
      readOnlyContext: [
        `.lh/features/${featureFolderName}/spec.md`,
        `.lh/features/${featureFolderName}/discovery.md`,
        `.lh/features/${featureFolderName}/boundary.json`,
      ],
      testExpectation: "Plan has implementation tasks mapped to acceptance criteria.",
      verificationCommands: [`lh plan ${spec.featureId} --force`],
      riskNotes: [],
      dependencies: ["T02"],
      summaryFile: `.lh/features/${featureFolderName}/task-summaries/T03.md`,
      notes: ["Blocked until discovery is complete."],
    },
  ];

  const slices: PlanSlice[] = [
    {
      id: "S01",
      title: "Preparation",
      goal: "Refine spec and run discovery before implementation.",
      taskIds: ["T01", "T02"],
      notes: ["From-spec planning. Discovery required."],
    },
    {
      id: "S02",
      title: "Planning",
      goal: "Generate implementation tasks from discovery results.",
      taskIds: ["T03"],
      notes: [],
    },
  ];

  return {
    status: "draft",
    summary:
      `Draft plan for ${spec.featureId} — ${spec.title}. ` +
      `Created from spec only. Discovery is required before implementation. ` +
      `3 preparation tasks across 2 slices.`,
    slices,
    tasks,
    warnings,
    unknowns: ["Discovery has not run. Change boundary is unknown."],
    riskGates: [],
    nextAction: `Run: lh discover ${spec.featureId} --depth D2`,
  };
}

function createBoundaryRefinementTask(
  index: number,
  featureFolderName: string,
  criteria: AcceptanceCriterion[],
  verifyCommands: string[],
  riskGateNames: string[],
): PlannedTask {
  return {
    id: taskId(index),
    title: "Refine change boundary",
    status: "blocked",
    acceptanceCriteria: criteria.map((c) => c.id),
    slice: "Boundary refinement",
    goal: "No touch files found. Re-run discovery with hints or refine the spec.",
    expectedFiles: [],
    readOnlyContext: [`.lh/features/${featureFolderName}/boundary.json`],
    testExpectation: "Boundary has at least one touch file after refinement.",
    verificationCommands: verifyCommands,
    riskNotes: riskGateNames.map((n) => `Risk gate: ${n}`),
    dependencies: [],
    summaryFile: `.lh/features/${featureFolderName}/task-summaries/${taskId(index)}.md`,
    notes: ["Blocked until boundary is refined with touch files."],
  };
}

function finishGroup(
  files: string[],
  dir: string,
  testPaths: string[],
  boundary: PlanningBoundary,
): { title: string; files: string[]; readOnly: string[]; tests: string[] } {
  const dirLabel = dir === "." ? "root" : dir;
  const title = files.length === 1
    ? `Update ${files[0]}`
    : `Update ${dirLabel} files`;

  const relatedTests = testPaths.filter((tp) => {
    for (const f of files) {
      const stem = f.replace(/\.[^.]+$/, "").replace(/^.*\//, "");
      if (tp.includes(stem)) return true;
    }
    return false;
  });

  const readOnly = boundary.readOnlyFiles
    .filter((rf) => {
      const rfDir = rf.path.includes("/") ? rf.path.slice(0, rf.path.lastIndexOf("/")) : ".";
      return rfDir === dir;
    })
    .map((rf) => rf.path);

  return { title, files, readOnly, tests: relatedTests };
}

function pickCriteria(
  criteria: AcceptanceCriterion[],
  groupIndex: number,
  totalGroups: number,
): string[] {
  if (criteria.length === 0) return [];
  if (totalGroups <= 1) return criteria.map((c) => c.id);

  const perGroup = Math.max(1, Math.ceil(criteria.length / totalGroups));
  const start = groupIndex * perGroup;
  const end = Math.min(start + perGroup, criteria.length);

  if (start >= criteria.length) {
    return [criteria[criteria.length - 1]!.id];
  }

  return criteria.slice(start, end).map((c) => c.id);
}

function riskNotesForFiles(
  files: string[],
  riskGateNames: string[],
  hasSecurityRisk: boolean,
  hasPaymentRisk: boolean,
): string[] {
  const notes: string[] = [];
  for (const name of riskGateNames) {
    const relevant = files.some((f) => isFileRelevantToRisk(f, name));
    if (relevant) {
      notes.push(`Risk gate: ${name}`);
    }
  }
  return notes;
}

function isFileRelevantToRisk(filePath: string, riskName: string): boolean {
  const lower = filePath.toLowerCase();
  switch (riskName) {
    case "auth_rewrite":
      return lower.includes("auth") || lower.includes("session") || lower.includes("login");
    case "payment_logic":
      return lower.includes("payment") || lower.includes("billing") || lower.includes("checkout");
    case "destructive_migration":
      return lower.includes("migration") || lower.includes("schema") || lower.endsWith(".sql");
    case "new_dependency":
      return lower.endsWith("package.json") || lower.endsWith("cargo.toml") || lower.endsWith("go.mod");
    case "public_api_break":
      return lower.includes("api") || lower.includes("route") || lower.includes("controller");
    case "security_sensitive_change":
      return lower.includes("security") || lower.includes("permission") || lower.includes("secret") || lower.includes("token");
    default:
      return false;
  }
}

function isHighRiskFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return (
    lower.includes("auth") ||
    lower.includes("payment") ||
    lower.includes("secret") ||
    lower.includes("credential") ||
    lower.includes("permission")
  );
}

function normalizeConfidence(
  value: unknown,
): "low" | "medium" | "high" | "unknown" | undefined {
  if (typeof value !== "string") return undefined;
  const lower = value.toLowerCase();
  if (lower === "low" || lower === "medium" || lower === "high" || lower === "unknown") {
    return lower as "low" | "medium" | "high" | "unknown";
  }
  return undefined;
}

function normalizeFileEntries(value: unknown): PlanningBoundaryFile[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (v): v is Record<string, unknown> =>
        typeof v === "object" && v !== null && typeof (v as Record<string, unknown>)["path"] === "string",
    )
    .map((v) => ({
      path: v["path"] as string,
      reason: typeof v["reason"] === "string" ? v["reason"] : "",
      confidence: normalizeFileConfidence(v["confidence"]),
    }));
}

function normalizeFileConfidence(value: unknown): "low" | "medium" | "high" {
  if (typeof value !== "string") return "low";
  const lower = value.toLowerCase();
  if (lower === "low" || lower === "medium" || lower === "high") return lower;
  return "low";
}

function normalizeTestEntries(
  value: unknown,
): PlanningBoundary["relevantTests"] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (v): v is Record<string, unknown> => typeof v === "object" && v !== null,
    )
    .map((v) => ({
      path: typeof v["path"] === "string" ? v["path"] : undefined,
      command: typeof v["command"] === "string" ? v["command"] : undefined,
      reason: typeof v["reason"] === "string" ? v["reason"] : "",
      confidence: normalizeConfidence(v["confidence"]) as
        | "low"
        | "medium"
        | "high"
        | undefined,
    }));
}

function normalizeCommandEntries(
  value: unknown,
): PlanningBoundary["commands"] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (v): v is Record<string, unknown> =>
        typeof v === "object" && v !== null && typeof (v as Record<string, unknown>)["command"] === "string",
    )
    .map((v) => ({
      command: v["command"] as string,
      purpose: typeof v["purpose"] === "string" ? v["purpose"] : "",
      confidence: normalizeConfidence(v["confidence"]) as
        | "low"
        | "medium"
        | "high"
        | undefined,
      source: typeof v["source"] === "string" ? v["source"] : undefined,
    }));
}

function normalizeRiskGates(
  value: unknown,
): PlanningBoundary["riskGates"] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (v): v is Record<string, unknown> =>
        typeof v === "object" && v !== null && typeof (v as Record<string, unknown>)["name"] === "string",
    )
    .map((v) => ({
      name: v["name"] as string,
      reason: typeof v["reason"] === "string" ? v["reason"] : "",
      status: normalizeRiskStatus(v["status"]),
    }));
}

function normalizeRiskStatus(
  value: unknown,
): "triggered" | "approved" | "resolved" | "unresolved" {
  if (typeof value !== "string") return "triggered";
  const lower = value.toLowerCase();
  if (
    lower === "triggered" ||
    lower === "approved" ||
    lower === "resolved" ||
    lower === "unresolved"
  ) {
    return lower as "triggered" | "approved" | "resolved" | "unresolved";
  }
  return "triggered";
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}
