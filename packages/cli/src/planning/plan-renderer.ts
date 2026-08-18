import type { ParsedSpecForPlanning } from "./acceptance.js";
import type { PlanningBoundary, GeneratedPlan, PlannedTask } from "./task-generator.js";

export interface RenderPlanInput {
  featureId: string;
  featureTitle: string;
  featureFolderName: string;
  date: string;
  spec: ParsedSpecForPlanning;
  boundary: PlanningBoundary | null;
  plan: GeneratedPlan;
}

export function renderPlanMarkdown(input: RenderPlanInput): string {
  const { featureId, featureTitle, plan, boundary, spec } = input;
  const lines: string[] = [];

  lines.push(`# ${featureId} Plan`);
  lines.push("");
  lines.push("## Status");
  lines.push("");
  lines.push(plan.status);
  lines.push("");

  lines.push("## Plan Summary");
  lines.push("");
  lines.push(plan.summary);
  lines.push("");

  lines.push("## Inputs");
  lines.push("");
  lines.push("- spec.md");
  if (boundary) {
    lines.push("- discovery.md");
    lines.push("- boundary.json");
  } else {
    lines.push("- discovery.md (missing)");
    lines.push("- boundary.json (missing)");
  }
  lines.push("");

  lines.push(renderAcceptanceCoverageTable(input));
  lines.push("");

  lines.push("## Slices");
  lines.push("");
  lines.push("| Slice | Goal | Tasks | Notes |");
  lines.push("|---|---|---|---|");
  for (const slice of plan.slices) {
    const taskIds = slice.taskIds.join(", ");
    const notes = slice.notes.length > 0 ? slice.notes.join("; ") : "";
    lines.push(`| ${slice.title} | ${slice.goal} | ${taskIds} | ${notes} |`);
  }
  lines.push("");

  lines.push("## Task List");
  lines.push("");
  lines.push("See `tasks.md`.");
  lines.push("");

  lines.push("## Risk Gates");
  lines.push("");
  if (plan.riskGates.length === 0) {
    lines.push("_None identified._");
  } else {
    for (const rg of plan.riskGates) {
      lines.push(`- ${rg}`);
    }
  }
  lines.push("");

  lines.push("## Test Strategy");
  lines.push("");
  if (boundary && boundary.relevantTests.length > 0) {
    lines.push("Relevant tests found during discovery:");
    for (const t of boundary.relevantTests) {
      const ref = t.path ?? t.command ?? "unknown";
      lines.push(`- ${ref}`);
    }
  } else {
    lines.push("_No tests found during discovery. Tests may need to be created._");
  }
  lines.push("");
  if (boundary && boundary.commands.length > 0) {
    lines.push("Verification commands:");
    for (const c of boundary.commands) {
      lines.push(`- \`${c.command}\` — ${c.purpose}`);
    }
  }
  lines.push("");

  lines.push("## Rollback / Recovery Notes");
  lines.push("");
  lines.push("_Plan does not include rollback steps. Add before implementation if needed._");
  lines.push("");

  lines.push("## Out of Scope");
  lines.push("");
  if (spec.nonGoals.length > 0) {
    for (const ng of spec.nonGoals) {
      lines.push(`- ${ng}`);
    }
  } else {
    lines.push("_See spec non-goals._");
  }
  lines.push("");

  if (plan.unknowns.length > 0) {
    lines.push("## Unknowns");
    lines.push("");
    for (const u of plan.unknowns) {
      lines.push(`- ${u}`);
    }
    lines.push("");
  }

  if (plan.warnings.length > 0) {
    lines.push("## Warnings");
    lines.push("");
    for (const w of plan.warnings) {
      lines.push(`- ${w}`);
    }
    lines.push("");
  }

  lines.push("## Plan Review Checklist");
  lines.push("");
  lines.push("- [ ] Plan maps to acceptance criteria.");
  lines.push("- [ ] Plan respects the change boundary.");
  lines.push("- [ ] Risk gates are identified.");
  lines.push("- [ ] Verification commands are known or explicitly missing.");
  lines.push("- [ ] Tasks are small enough for bounded context.");
  lines.push("");

  return lines.join("\n");
}

export function renderTasksMarkdown(input: RenderPlanInput): string {
  const { featureId, plan } = input;
  const lines: string[] = [];

  lines.push(`# ${featureId} Tasks`);
  lines.push("");
  lines.push("## Status");
  lines.push("");
  lines.push(plan.status);
  lines.push("");

  lines.push("## Task Rules");
  lines.push("");
  lines.push("- Each task must map to acceptance criteria or a technical prerequisite.");
  lines.push("- Each task should stay inside the approved change boundary.");
  lines.push("- Behavior changes should prefer tests first.");
  lines.push("- A task is not done without verification evidence.");
  lines.push("- If a task needs files outside the boundary, update discovery and boundary first.");
  lines.push("");

  lines.push("## Tasks");
  lines.push("");

  for (const task of plan.tasks) {
    lines.push(renderSingleTask(task));
    lines.push("");
  }

  return lines.join("\n");
}

export function renderPlanCavebus(input: RenderPlanInput): string {
  const { featureId, plan } = input;
  const lines: string[] = [];

  lines.push(`PLAN ${featureId} status:${plan.status}`);
  lines.push(`tasks:${plan.tasks.map((t) => t.id).join(",")}`);

  const acMappings: string[] = [];
  for (const task of plan.tasks) {
    for (const ac of task.acceptanceCriteria) {
      acMappings.push(`${ac}->${task.id}`);
    }
  }
  lines.push(`ac:${acMappings.join(" ") || "none"}`);

  lines.push("risk:");
  if (plan.riskGates.length > 0) {
    for (const rg of plan.riskGates) {
      lines.push(`- ${rg}`);
    }
  } else {
    lines.push("- none");
  }

  lines.push("verify:");
  const verifyCommands = plan.tasks.length > 0
    ? [...new Set(plan.tasks.flatMap((t) => t.verificationCommands))]
    : [];
  if (verifyCommands.length > 0) {
    for (const vc of verifyCommands.slice(0, 5)) {
      lines.push(`- ${vc}`);
    }
  } else {
    lines.push("- none specified");
  }

  lines.push("next:");
  lines.push(`- ${plan.nextAction}`);
  lines.push("");

  return lines.join("\n");
}

export function renderAcceptanceCoverageTable(input: RenderPlanInput): string {
  const { spec, plan } = input;
  const lines: string[] = [];

  lines.push("## Acceptance Criteria Coverage");
  lines.push("");
  lines.push("| AC | Planned Coverage | Task IDs |");
  lines.push("|---|---|---|");

  const criteria = spec.acceptanceCriteria.length > 0
    ? spec.acceptanceCriteria
    : [
        { id: "AC1", text: "Define the primary observable outcome.", checked: false },
        { id: "AC2", text: "Define important constraints or edge cases.", checked: false },
        { id: "AC3", text: "Define verification expectations.", checked: false },
      ];

  for (const ac of criteria) {
    const coveringTasks = plan.tasks.filter((t) => t.acceptanceCriteria.includes(ac.id));
    const taskIds = coveringTasks.map((t) => t.id).join(", ");
    const coverage = coveringTasks.length > 0 ? "covered" : "not yet covered";
    lines.push(`| ${ac.id}: ${ac.text} | ${coverage} | ${taskIds} |`);
  }

  return lines.join("\n");
}

function renderSingleTask(task: PlannedTask): string {
  const lines: string[] = [];

  lines.push(`### ${task.id}: ${task.title}`);
  lines.push("");
  lines.push(`- Status: ${task.status}`);

  if (task.acceptanceCriteria.length > 0) {
    lines.push("- Acceptance criteria:");
    for (const ac of task.acceptanceCriteria) {
      lines.push(`  - ${ac}`);
    }
  } else {
    lines.push("- Acceptance criteria: none");
  }

  lines.push(`- Slice: ${task.slice}`);
  lines.push(`- Goal: ${task.goal}`);

  if (task.expectedFiles.length > 0) {
    lines.push("- Expected files:");
    for (const f of task.expectedFiles) {
      lines.push(`  - ${f}`);
    }
  } else {
    lines.push("- Expected files: none");
  }

  if (task.readOnlyContext.length > 0) {
    lines.push("- Read-only context:");
    for (const f of task.readOnlyContext) {
      lines.push(`  - ${f}`);
    }
  } else {
    lines.push("- Read-only context: none");
  }

  lines.push(`- Test expectation: ${task.testExpectation}`);

  if (task.verificationCommands.length > 0) {
    lines.push("- Verification commands:");
    for (const c of task.verificationCommands) {
      lines.push(`  - ${c}`);
    }
  } else {
    lines.push("- Verification commands: none specified");
  }

  if (task.riskNotes.length > 0) {
    lines.push("- Risk notes:");
    for (const r of task.riskNotes) {
      lines.push(`  - ${r}`);
    }
  } else {
    lines.push("- Risk notes: none");
  }

  if (task.dependencies.length > 0) {
    lines.push("- Dependencies:");
    for (const d of task.dependencies) {
      lines.push(`  - ${d}`);
    }
  } else {
    lines.push("- Dependencies: none");
  }

  lines.push("- Summary file:");
  lines.push(`  - ${task.summaryFile}`);

  return lines.join("\n");
}
