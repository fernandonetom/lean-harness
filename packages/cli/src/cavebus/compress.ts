import path from "node:path";
import { readTextFile, readJsonFile, fileExists, dirExists, listFiles } from "../core/fs.js";
import { featuresDir, memoryDir } from "../core/paths.js";
import { requireFeature } from "../core/features.js";
import { CLIError } from "../core/errors.js";
import type { CaveBusMessageType } from "./schema.js";
import { extractCaveBusProtectedTokens, checkProtectedTokensPreserved, containsSecretLikeValue, redactSecrets } from "./protected.js";
import { validateCaveBusLog } from "./validate.js";

export type CompressionMode = "lite" | "full" | "ultra";

export type CompressionSource =
  | "all"
  | "discovery"
  | "plan"
  | "tasks"
  | "build"
  | "check"
  | "memory";

export interface CompressionInput {
  root: string;
  featureRef: string;
  mode: CompressionMode;
  source: CompressionSource;
}

export interface CompressedMessage {
  type: CaveBusMessageType;
  content: string;
  source: string;
  protectedTokens: string[];
  warnings: string[];
}

export interface CompressionResult {
  featureId: string;
  featureTitle: string;
  featureDir: string;
  mode: CompressionMode;
  source: CompressionSource;
  outputPath: string;
  messages: CompressedMessage[];
  content: string;
  protectedTokenWarnings: string[];
  validation: {
    ok: boolean;
    issues: Array<{ severity: "error" | "warning"; line: number; message: string; code: string }>;
  };
  warnings: string[];
  nextAction: string;
}

const VALID_MODES = new Set<string>(["lite", "full", "ultra"]);
const VALID_SOURCES = new Set<string>(["all", "discovery", "plan", "tasks", "build", "check", "memory"]);

export function normalizeCompressionMode(value: string | undefined): CompressionMode {
  if (!value) return "full";
  if (VALID_MODES.has(value)) return value as CompressionMode;
  throw new CLIError(`Invalid compression mode: ${value}. Expected lite, full, or ultra.`);
}

export function normalizeCompressionSource(value: string | undefined): CompressionSource {
  if (!value) return "all";
  if (VALID_SOURCES.has(value)) return value as CompressionSource;
  throw new CLIError(`Invalid compression source: ${value}. Expected all, discovery, plan, tasks, build, check, or memory.`);
}

export async function compressFeatureArtifacts(input: CompressionInput): Promise<CompressionResult> {
  const { root, featureRef, mode, source } = input;

  const feature = await requireFeature(root, featureRef);

  const featureDir = path.join(featuresDir(root), feature.path);
  const outputPath = path.join(featureDir, "cavebus.log");

  const messages: CompressedMessage[] = [];
  const warnings: string[] = [];
  const protectedTokenWarnings: string[] = [];

  if (source === "all" || source === "discovery") {
    const specMsgs = source === "all" ? await compressSpec(featureDir, feature.id, mode) : [];
    messages.push(...specMsgs);
    const discMsgs = await compressDiscovery(featureDir, feature.id, mode);
    messages.push(...discMsgs);
    if (discMsgs.length === 0 && source === "discovery") {
      warnings.push("No discovery artifacts found to compress");
    }
  }

  if (source === "all") {
    const specMsgsExist = messages.some((m) => m.type === "REQ");
    if (!specMsgsExist) {
      const specMsgs = await compressSpec(featureDir, feature.id, mode);
      messages.push(...specMsgs);
    }
  }

  if (source === "all" || source === "plan") {
    const planMsgs = await compressPlan(featureDir, feature.id, mode);
    messages.push(...planMsgs);
    if (planMsgs.length === 0 && source === "plan") {
      warnings.push("No plan artifacts found to compress");
    }
  }

  if (source === "all" || source === "tasks") {
    const taskMsgs = await compressTasks(featureDir, feature.id, mode);
    messages.push(...taskMsgs);
    if (taskMsgs.length === 0 && source === "tasks") {
      warnings.push("No task artifacts found to compress");
    }
  }

  if (source === "all" || source === "build") {
    const buildMsgs = await compressBuild(featureDir, feature.id, mode);
    messages.push(...buildMsgs);
    if (buildMsgs.length === 0 && source === "build") {
      warnings.push("No build artifacts found to compress");
    }
  }

  if (source === "all" || source === "check") {
    const checkMsgs = await compressCheck(featureDir, feature.id, mode);
    messages.push(...checkMsgs);
    if (checkMsgs.length === 0 && source === "check") {
      warnings.push("No check artifacts found to compress");
    }
  }

  if (source === "all" || source === "memory") {
    const memMsgs = await compressMemory(root, mode);
    messages.push(...memMsgs);
    if (memMsgs.length === 0 && source === "memory") {
      warnings.push("No memory files found to compress");
    }
  }

  for (const msg of messages) {
    warnings.push(...msg.warnings);
    if (msg.warnings.some((w) => w.includes("protected token"))) {
      protectedTokenWarnings.push(...msg.warnings.filter((w) => w.includes("protected token")));
    }
  }

  const content = messages.map((m) => m.content).join("\n\n");

  const validation = validateCaveBusLog(content);

  const nextAction = messages.length === 0
    ? `Create feature artifacts first, then rerun lh compress ${feature.id}`
    : `lh cavebus ${feature.id} --validate`;

  return {
    featureId: feature.id,
    featureTitle: feature.title,
    featureDir,
    mode,
    source,
    outputPath,
    messages,
    content,
    protectedTokenWarnings,
    validation: {
      ok: validation.ok,
      issues: validation.issues,
    },
    warnings,
    nextAction,
  };
}

export function renderManagedCompressionBlock(input: {
  source: CompressionSource;
  mode: CompressionMode;
  generatedAt: string;
  content: string;
}): string {
  const lines: string[] = [];
  lines.push(`# LH-COMPRESS-BEGIN source:${input.source} mode:${input.mode} generated:${input.generatedAt}`);
  lines.push(input.content);
  lines.push("# LH-COMPRESS-END");
  return lines.join("\n");
}

export function replaceManagedCompressionBlock(
  existing: string,
  source: CompressionSource,
  block: string,
): string {
  const beginRe = new RegExp(
    `# LH-COMPRESS-BEGIN source:${source}\\b`,
  );
  const lines = existing.split("\n");
  const result: string[] = [];
  let skipUntilEnd = false;
  let replaced = false;

  for (const line of lines) {
    if (beginRe.test(line)) {
      skipUntilEnd = true;
      replaced = true;
      result.push(block);
      continue;
    }
    if (skipUntilEnd) {
      if (MANAGED_END_RE.test(line)) {
        skipUntilEnd = false;
      }
      continue;
    }
    result.push(line);
  }

  if (!replaced) {
    result.push("");
    result.push(block);
  }

  return result.join("\n");
}

export function appendManagedCompressionBlock(existing: string, block: string): string {
  const trimmed = existing.trimEnd();
  return trimmed + "\n\n" + block + "\n";
}

const MANAGED_END_RE = /^#\s*LH-COMPRESS-END\b/;

// ---------------------------------------------------------------------------
// Artifact compressors
// ---------------------------------------------------------------------------

async function compressSpec(
  featureDir: string,
  featureId: string,
  mode: CompressionMode,
): Promise<CompressedMessage[]> {
  const specPath = path.join(featureDir, "spec.md");
  const specContent = await readTextFile(specPath);
  if (!specContent) return [];

  const { redacted, hadSecrets } = redactSecrets(specContent);
  const msgWarnings: string[] = [];
  if (hadSecrets) {
    msgWarnings.push("secret-like value redacted from spec.md");
  }

  const statusMatch = specContent.match(/\*\*Status:\*\*\s*(\S+)/);
  const status = statusMatch?.[1] ?? "draft";

  const goalMatch = specContent.match(/^##\s+Goal\s*\n\s*\n([^\n#]+)/m);
  const goal = goalMatch?.[1]?.trim() ?? featureId;

  const acMatches = [...specContent.matchAll(/- \[[ x]\]\s+(AC\d+):\s*(.+)/g)];
  const constraints = extractSection(specContent, "Constraints");
  const risks = extractSection(specContent, "Risk Notes");

  const lines: string[] = [];
  lines.push(`REQ ${featureId} status:${status}`);
  lines.push("goal:");
  lines.push(`- ${goal}`);

  if (acMatches.length > 0) {
    lines.push("ac:");
    for (const m of acMatches) {
      if (mode === "ultra") {
        lines.push(`- ${m[1]}`);
      } else {
        lines.push(`- ${m[1]}: ${m[2]}`);
      }
    }
  }

  if (constraints && mode !== "ultra") {
    const constraintBullets = extractBullets(constraints);
    if (constraintBullets.length > 0) {
      lines.push("constraints:");
      for (const c of constraintBullets) {
        lines.push(`- ${c}`);
      }
    }
  }

  if (risks && risks !== "_None identified._") {
    const riskBullets = extractBullets(risks);
    if (riskBullets.length > 0) {
      lines.push("risk:");
      for (const r of riskBullets) {
        lines.push(`- ${r}`);
      }
    }
  }

  lines.push("next:");
  lines.push("- discover or plan");

  const content = lines.join("\n");

  const check = checkProtectedTokensPreserved(redacted, content, "spec.md");
  msgWarnings.push(...check.warnings);

  const tokens = extractCaveBusProtectedTokens(content, "spec.md");

  return [{
    type: "REQ",
    content,
    source: "spec.md",
    protectedTokens: tokens.map((t) => t.value),
    warnings: msgWarnings,
  }];
}

async function compressDiscovery(
  featureDir: string,
  featureId: string,
  mode: CompressionMode,
): Promise<CompressedMessage[]> {
  const messages: CompressedMessage[] = [];

  const discoveryPath = path.join(featureDir, "discovery.md");
  const discoveryContent = await readTextFile(discoveryPath);
  const boundaryPath = path.join(featureDir, "boundary.json");
  const boundaryContent = await readJsonFile<Record<string, unknown>>(boundaryPath).catch(() => null);

  if (discoveryContent) {
    const { redacted, hadSecrets } = redactSecrets(discoveryContent);
    const msgWarnings: string[] = [];
    if (hadSecrets) msgWarnings.push("secret-like value redacted from discovery.md");

    const confMatch = discoveryContent.match(/\*\*Confidence:\*\*\s*(\S+)/i)
      ?? discoveryContent.match(/confidence:\s*(\S+)/i);
    const conf = confMatch?.[1] === "medium" ? "med" : (confMatch?.[1] ?? "med");

    const depthMatch = discoveryContent.match(/\*\*Depth:\*\*\s*(D\d)/i)
      ?? discoveryContent.match(/depth:\s*(D\d)/i);
    const depth = depthMatch?.[1] ?? "D2";

    const touchSection = extractSection(discoveryContent, "Touch Files") ?? extractSection(discoveryContent, "Files to Touch");
    const readSection = extractSection(discoveryContent, "Read-Only Files") ?? extractSection(discoveryContent, "Files to Read");
    const testSection = extractSection(discoveryContent, "Test Files") ?? extractSection(discoveryContent, "Tests");
    const cmdSection = extractSection(discoveryContent, "Verification Commands") ?? extractSection(discoveryContent, "Commands");
    const riskSection = extractSection(discoveryContent, "Risk Gates") ?? extractSection(discoveryContent, "Risks");
    const unknownSection = extractSection(discoveryContent, "Unknowns") ?? extractSection(discoveryContent, "Unknown");

    const lines: string[] = [];
    lines.push(`DISC ${featureId} conf:${conf} depth:${depth}`);

    if (touchSection) {
      const bullets = extractBullets(touchSection);
      if (bullets.length > 0) {
        lines.push("touch:");
        for (const b of bullets.slice(0, mode === "ultra" ? 10 : 25)) {
          lines.push(`- ${b}`);
        }
      }
    }

    if (readSection) {
      const bullets = extractBullets(readSection);
      if (bullets.length > 0) {
        lines.push("read:");
        for (const b of bullets.slice(0, mode === "ultra" ? 5 : 15)) {
          lines.push(`- ${b}`);
        }
      }
    }

    if (testSection) {
      const bullets = extractBullets(testSection);
      if (bullets.length > 0) {
        lines.push("tests:");
        for (const b of bullets.slice(0, mode === "ultra" ? 5 : 15)) {
          lines.push(`- ${b}`);
        }
      }
    }

    if (cmdSection) {
      const bullets = extractBullets(cmdSection);
      if (bullets.length > 0) {
        lines.push("cmd:");
        for (const b of bullets.slice(0, 10)) {
          lines.push(`- ${b}`);
        }
      }
    }

    if (riskSection) {
      const bullets = extractBullets(riskSection);
      if (bullets.length > 0) {
        lines.push("risk:");
        for (const b of bullets) {
          lines.push(`- ${b}`);
        }
      }
    }

    if (unknownSection) {
      const bullets = extractBullets(unknownSection);
      if (bullets.length > 0) {
        lines.push("unknown:");
        for (const b of bullets) {
          lines.push(`- ${b}`);
        }
      }
    }

    lines.push("next:");
    lines.push(`- plan ${featureId}`);

    const content = lines.join("\n");
    const check = checkProtectedTokensPreserved(redacted, content, "discovery.md");
    msgWarnings.push(...check.warnings);
    const tokens = extractCaveBusProtectedTokens(content, "discovery.md");

    messages.push({
      type: "DISC",
      content,
      source: "discovery.md",
      protectedTokens: tokens.map((t) => t.value),
      warnings: msgWarnings,
    });
  }

  if (boundaryContent) {
    const msgWarnings: string[] = [];
    const boundaryStr = JSON.stringify(boundaryContent, null, 2);
    const { hadSecrets } = redactSecrets(boundaryStr);
    if (hadSecrets) msgWarnings.push("secret-like value redacted from boundary.json");

    const lines: string[] = [];
    lines.push(`BOUNDARY ${featureId} status:unchanged`);

    const touchFiles = extractArrayField(boundaryContent, "touch_files") ?? extractArrayField(boundaryContent, "touchFiles");
    if (touchFiles && touchFiles.length > 0) {
      lines.push("add:");
      for (const f of touchFiles.slice(0, mode === "ultra" ? 10 : 25)) {
        const fp = typeof f === "string" ? f : (f as Record<string, unknown>)["path"] ?? String(f);
        lines.push(`- ${fp} reason:touch file`);
      }
    }

    const readOnly = extractArrayField(boundaryContent, "read_only_files") ?? extractArrayField(boundaryContent, "readOnlyFiles");
    if (readOnly && readOnly.length > 0) {
      lines.push("avoid:");
      for (const f of readOnly.slice(0, mode === "ultra" ? 5 : 15)) {
        const fp = typeof f === "string" ? f : (f as Record<string, unknown>)["path"] ?? String(f);
        lines.push(`- ${fp} reason:read-only`);
      }
    }

    lines.push("next:");
    lines.push("- stay inside boundary");

    const content = lines.join("\n");
    const tokens = extractCaveBusProtectedTokens(content, "boundary.json");

    messages.push({
      type: "BOUNDARY",
      content,
      source: "boundary.json",
      protectedTokens: tokens.map((t) => t.value),
      warnings: msgWarnings,
    });
  }

  return messages;
}

async function compressPlan(
  featureDir: string,
  featureId: string,
  mode: CompressionMode,
): Promise<CompressedMessage[]> {
  const messages: CompressedMessage[] = [];

  const planPath = path.join(featureDir, "plan.md");
  const planContent = await readTextFile(planPath);
  const tasksPath = path.join(featureDir, "tasks.md");
  const tasksContent = await readTextFile(tasksPath);

  if (planContent) {
    const { redacted, hadSecrets } = redactSecrets(planContent);
    const msgWarnings: string[] = [];
    if (hadSecrets) msgWarnings.push("secret-like value redacted from plan.md");

    const statusMatch = planContent.match(/\*\*Status:\*\*\s*(\S+)/);
    const status = statusMatch?.[1] ?? "planned";

    const taskIds = [...planContent.matchAll(/\b(T\d{2,})\b/g)].map((m) => m[1]!);
    const uniqueTaskIds = [...new Set(taskIds)];

    const acMappings = [...planContent.matchAll(/\b(AC\d+)\s*[-→>]+\s*(T\d{2,})\b/g)]
      .map((m) => `${m[1]}->${m[2]}`);

    const riskSection = extractSection(planContent, "Risk Gates") ?? extractSection(planContent, "Risks");
    const verifySection = extractSection(planContent, "Verification") ?? extractSection(planContent, "Commands");

    const lines: string[] = [];
    lines.push(`PLAN ${featureId} status:${status}`);

    if (uniqueTaskIds.length > 0) {
      lines.push(`tasks:${uniqueTaskIds.join(",")}`);
    }

    if (acMappings.length > 0 && mode !== "ultra") {
      lines.push(`ac:${acMappings.join(" ")}`);
    }

    if (riskSection) {
      const bullets = extractBullets(riskSection);
      if (bullets.length > 0) {
        lines.push("risk:");
        for (const b of bullets) lines.push(`- ${b}`);
      }
    }

    if (verifySection) {
      const bullets = extractBullets(verifySection);
      if (bullets.length > 0) {
        lines.push("verify:");
        for (const b of bullets.slice(0, 5)) lines.push(`- ${b}`);
      }
    }

    lines.push("next:");
    if (uniqueTaskIds.length > 0) {
      lines.push(`- compile-task ${featureId} ${uniqueTaskIds[0]}`);
    } else {
      lines.push(`- build ${featureId}`);
    }

    const content = lines.join("\n");
    const check = checkProtectedTokensPreserved(redacted, content, "plan.md");
    msgWarnings.push(...check.warnings);
    const tokens = extractCaveBusProtectedTokens(content, "plan.md");

    messages.push({
      type: "PLAN",
      content,
      source: "plan.md",
      protectedTokens: tokens.map((t) => t.value),
      warnings: msgWarnings,
    });
  }

  if (tasksContent) {
    const taskBlocks = [...tasksContent.matchAll(/^##\s+(T\d{2,})[\s:—–-]+(.+?)(?=\n##\s+T\d{2,}|\n##\s+[^T]|$)/gms)];

    for (const block of taskBlocks) {
      const taskId = block[1]!;
      const taskBody = block[2]!;
      const { redacted, hadSecrets } = redactSecrets(taskBody);
      const msgWarnings: string[] = [];
      if (hadSecrets) msgWarnings.push(`secret-like value redacted from tasks.md ${taskId}`);

      const titleMatch = taskBody.match(/^([^\n]+)/);
      const title = titleMatch?.[1]?.trim() ?? taskId;

      const acIds = [...taskBody.matchAll(/\b(AC\d+)\b/g)].map((m) => m[1]!);
      const fileSection = extractSection(taskBody, "Files") ?? extractSection(taskBody, "Expected Files");
      const readSection = extractSection(taskBody, "Read-Only") ?? extractSection(taskBody, "Context Files");
      const verifySection = extractSection(taskBody, "Verification") ?? extractSection(taskBody, "Commands");
      const riskSection = extractSection(taskBody, "Risk") ?? extractSection(taskBody, "Risks");

      const lines: string[] = [];
      lines.push(`TASK ${featureId} ${taskId}`);

      if (acIds.length > 0) {
        lines.push("ac:");
        for (const ac of [...new Set(acIds)]) {
          lines.push(`- ${ac}`);
        }
      }

      if (mode !== "ultra") {
        lines.push("goal:");
        lines.push(`- ${title}`);
      }

      if (fileSection) {
        const bullets = extractBullets(fileSection);
        if (bullets.length > 0) {
          lines.push("files:");
          for (const b of bullets.slice(0, mode === "ultra" ? 5 : 15)) {
            lines.push(`- ${b}`);
          }
        }
      }

      if (readSection && mode !== "ultra") {
        const bullets = extractBullets(readSection);
        if (bullets.length > 0) {
          lines.push("read:");
          for (const b of bullets.slice(0, 10)) {
            lines.push(`- ${b}`);
          }
        }
      }

      if (verifySection) {
        const bullets = extractBullets(verifySection);
        if (bullets.length > 0) {
          lines.push("verify:");
          for (const b of bullets.slice(0, 5)) {
            lines.push(`- ${b}`);
          }
        }
      }

      if (riskSection) {
        const bullets = extractBullets(riskSection);
        if (bullets.length > 0) {
          lines.push("risk:");
          for (const b of bullets) lines.push(`- ${b}`);
        }
      }

      lines.push("next:");
      lines.push(`- run-task ${taskId}`);

      const content = lines.join("\n");
      const check = checkProtectedTokensPreserved(redacted, content, `tasks.md:${taskId}`);
      msgWarnings.push(...check.warnings);
      const tokens = extractCaveBusProtectedTokens(content, `tasks.md:${taskId}`);

      messages.push({
        type: "TASK",
        content,
        source: `tasks.md:${taskId}`,
        protectedTokens: tokens.map((t) => t.value),
        warnings: msgWarnings,
      });
    }
  }

  return messages;
}

async function compressTasks(
  featureDir: string,
  featureId: string,
  mode: CompressionMode,
): Promise<CompressedMessage[]> {
  const tasksPath = path.join(featureDir, "tasks.md");
  const tasksContent = await readTextFile(tasksPath);
  if (!tasksContent) return [];

  return compressPlan(featureDir, featureId, mode).then((msgs) =>
    msgs.filter((m) => m.type === "TASK"),
  );
}

async function compressBuild(
  featureDir: string,
  featureId: string,
  mode: CompressionMode,
): Promise<CompressedMessage[]> {
  const messages: CompressedMessage[] = [];

  const summariesDir = path.join(featureDir, "task-summaries");
  if (await dirExists(summariesDir)) {
    const files = await listFiles(summariesDir);
    const mdFiles = files.filter((f) => f.endsWith(".md"));

    for (const file of mdFiles) {
      const content = await readTextFile(path.join(summariesDir, file));
      if (!content) continue;

      const { redacted, hadSecrets } = redactSecrets(content);
      const msgWarnings: string[] = [];
      if (hadSecrets) msgWarnings.push(`secret-like value redacted from task-summaries/${file}`);

      const taskIdMatch = file.match(/^(T\d{2,})/);
      const taskId = taskIdMatch?.[1] ?? "";

      const statusMatch = content.match(/^##\s+Status\s*\n\s*\n\s*(\S+)/m);
      const status = statusMatch?.[1] ?? "done";

      const addSection = extractSection(content, "Files Added") ?? extractSection(content, "Files Modified");
      const testSection = extractSection(content, "Tests");
      const passSection = extractSection(content, "Pass Evidence") ?? extractSection(content, "Evidence");

      const lines: string[] = [];
      lines.push(`SUM ${featureId} ${taskId} status:${status}`);

      if (addSection) {
        const bullets = extractBullets(addSection);
        if (bullets.length > 0) {
          lines.push("add:");
          for (const b of bullets.slice(0, mode === "ultra" ? 5 : 15)) {
            lines.push(`- ${b}`);
          }
        }
      }

      if (testSection) {
        const bullets = extractBullets(testSection);
        if (bullets.length > 0) {
          lines.push("test:");
          for (const b of bullets.slice(0, 5)) lines.push(`- ${b}`);
        }
      }

      if (passSection && mode !== "ultra") {
        const bullets = extractBullets(passSection);
        if (bullets.length > 0) {
          lines.push("pass:");
          for (const b of bullets.slice(0, 5)) lines.push(`- ${b}`);
        }
      }

      lines.push("next:");
      lines.push(`- check ${featureId}`);

      const msgContent = lines.join("\n");
      const check = checkProtectedTokensPreserved(redacted, msgContent, `task-summaries/${file}`);
      msgWarnings.push(...check.warnings);
      const tokens = extractCaveBusProtectedTokens(msgContent, `task-summaries/${file}`);

      messages.push({
        type: "SUM",
        content: msgContent,
        source: `task-summaries/${file}`,
        protectedTokens: tokens.map((t) => t.value),
        warnings: msgWarnings,
      });
    }
  }

  const eventsPath = path.join(featureDir, "events.jsonl");
  const eventsContent = await readTextFile(eventsPath);
  if (eventsContent) {
    const eventLines = eventsContent.trim().split("\n").filter(Boolean);
    for (const eventLine of eventLines) {
      try {
        const event = JSON.parse(eventLine) as Record<string, unknown>;
        const eventType = event["event"] as string | undefined;

        if (eventType === "task.run.completed" || eventType === "task.run.failed") {
          const taskId = (event["taskId"] as string) ?? "";
          const exitCode = event["exitCode"] as number | undefined;
          const cmd = event["command"] as string | undefined;

          if (exitCode !== undefined && exitCode !== 0) {
            const { redacted: redactedCmd } = cmd ? redactSecrets(cmd) : { redacted: "" };
            const lines: string[] = [];
            lines.push(`CMD ${featureId} ${taskId} result:fail`);
            if (redactedCmd) {
              lines.push("cmd:");
              lines.push(`- ${redactedCmd}`);
            }
            lines.push("next:");
            lines.push("- inspect failure");

            messages.push({
              type: "CMD",
              content: lines.join("\n"),
              source: "events.jsonl",
              protectedTokens: [],
              warnings: [],
            });
          }
        }
      } catch {
        // skip malformed event lines
      }
    }
  }

  return messages;
}

async function compressCheck(
  featureDir: string,
  featureId: string,
  mode: CompressionMode,
): Promise<CompressedMessage[]> {
  const messages: CompressedMessage[] = [];

  const checksPath = path.join(featureDir, "checks.md");
  const resultPath = path.join(featureDir, "result.md");
  const checksContent = await readTextFile(checksPath);
  const resultContent = await readTextFile(resultPath);

  const source = checksContent ? "checks.md" : (resultContent ? "result.md" : null);
  const content = checksContent ?? resultContent;

  if (!content || !source) return [];

  const { redacted, hadSecrets } = redactSecrets(content);
  const msgWarnings: string[] = [];
  if (hadSecrets) msgWarnings.push(`secret-like value redacted from ${source}`);

  const verdictMatch = content.match(/^##\s+Verdict\s*\n\s*\n\s*(\S+)/m)
    ?? content.match(/\*\*Verdict:\*\*\s*(\S+)/i);
  const verdict = verdictMatch?.[1] ?? "unknown";

  const acSection = extractSection(content, "Acceptance Criteria");
  const cmdSection = extractSection(content, "Verification Commands") ?? extractSection(content, "Commands");
  const missSection = extractSection(content, "Missing Evidence") ?? extractSection(content, "Issues");

  const lines: string[] = [];
  lines.push(`VERIFY ${featureId} verdict:${verdict}`);

  if (acSection) {
    const bullets = extractBullets(acSection);
    if (bullets.length > 0) {
      lines.push("ac:");
      for (const b of bullets.slice(0, mode === "ultra" ? 5 : 20)) {
        lines.push(`- ${b}`);
      }
    }
  }

  if (cmdSection) {
    const bullets = extractBullets(cmdSection);
    if (bullets.length > 0) {
      lines.push("cmd:");
      for (const b of bullets.slice(0, mode === "ultra" ? 3 : 10)) {
        lines.push(`- ${b}`);
      }
    }
  }

  if (missSection) {
    const bullets = extractBullets(missSection);
    if (bullets.length > 0) {
      lines.push("miss:");
      for (const b of bullets) {
        lines.push(`- ${b}`);
      }
    }
  }

  lines.push("next:");
  if (verdict === "pass") {
    lines.push(`- archive ${featureId}`);
  } else {
    lines.push(`- fix issues; rerun check ${featureId} --force`);
  }

  if (mode === "ultra") {
    msgWarnings.push("ultra mode may omit useful nuance for ambiguous source");
  }

  const verifyContent = lines.join("\n");
  const check = checkProtectedTokensPreserved(redacted, verifyContent, source);
  msgWarnings.push(...check.warnings);
  const tokens = extractCaveBusProtectedTokens(verifyContent, source);

  messages.push({
    type: "VERIFY",
    content: verifyContent,
    source,
    protectedTokens: tokens.map((t) => t.value),
    warnings: msgWarnings,
  });

  return messages;
}

async function compressMemory(
  root: string,
  mode: CompressionMode,
): Promise<CompressedMessage[]> {
  const messages: CompressedMessage[] = [];
  const memDir = memoryDir(root);

  if (!(await dirExists(memDir))) return [];

  const files = await listFiles(memDir);
  const mdFiles = files.filter((f) => f.endsWith(".md"));

  for (const file of mdFiles) {
    const content = await readTextFile(path.join(memDir, file));
    if (!content || content.trim().length === 0) continue;

    const { redacted, hadSecrets } = redactSecrets(content);
    const msgWarnings: string[] = [];
    if (hadSecrets) msgWarnings.push(`secret-like value redacted from memory/${file}`);

    const scope = file.replace(/\.md$/, "");
    const bullets = extractBullets(content);
    const headings = [...content.matchAll(/^##\s+(.+)/gm)].map((m) => m[1]!.trim());

    if (bullets.length === 0 && headings.length === 0) continue;

    const lines: string[] = [];
    lines.push(`MEM ${scope}`);
    lines.push("fact:");

    const items = bullets.length > 0 ? bullets : headings;
    for (const item of items.slice(0, mode === "ultra" ? 5 : 15)) {
      lines.push(`- ${item}`);
    }

    lines.push("src:");
    lines.push(`- .lh/memory/${file}`);

    if (mode === "lite") {
      lines.push("use:");
      lines.push("- context for feature work");
    }

    const memContent = lines.join("\n");
    const check = checkProtectedTokensPreserved(redacted, memContent, `memory/${file}`);
    msgWarnings.push(...check.warnings);
    const tokens = extractCaveBusProtectedTokens(memContent, `memory/${file}`);

    messages.push({
      type: "MEM",
      content: memContent,
      source: `memory/${file}`,
      protectedTokens: tokens.map((t) => t.value),
      warnings: msgWarnings,
    });
  }

  return messages;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractSection(content: string, heading: string): string | null {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `^#{1,4}\\s+${escapedHeading}\\s*$\\n([\\s\\S]*?)(?=^#{1,4}\\s|$)`,
    "m",
  );
  const match = re.exec(content);
  if (!match?.[1]) return null;
  const text = match[1].trim();
  return text || null;
}

function extractBullets(content: string): string[] {
  const bullets: string[] = [];
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const bullet = trimmed.slice(2).trim();
      if (bullet) bullets.push(bullet);
    } else if (/^- \[[ x]\]\s+/.test(trimmed)) {
      const bullet = trimmed.replace(/^- \[[ x]\]\s+/, "").trim();
      if (bullet) bullets.push(bullet);
    }
  }
  return bullets;
}

function extractArrayField(obj: Record<string, unknown>, field: string): unknown[] | null {
  const val = obj[field];
  if (Array.isArray(val)) return val;
  return null;
}
