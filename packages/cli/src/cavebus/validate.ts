import {
  CAVEBUS_MESSAGE_TYPES,
  isCaveBusMessageType,
  isStatusValue,
  isConfidenceValue,
} from "./schema.js";
import type {
  CaveBusMessage,
  CaveBusMessageType,
  CaveBusValidationIssue,
  CaveBusValidationResult,
  CaveBusStats,
} from "./schema.js";

export interface ParseCaveBusOptions {
  includeManagedBlocks?: boolean;
}

const MESSAGE_TYPE_RE = new RegExp(`^(${CAVEBUS_MESSAGE_TYPES.join("|")})(?:\\s|$)`);
const MANAGED_BEGIN_RE = /^#\s*LH-COMPRESS-BEGIN\b/;
const MANAGED_END_RE = /^#\s*LH-COMPRESS-END\b/;

export function parseCaveBusLog(content: string, options?: ParseCaveBusOptions): CaveBusMessage[] {
  const lines = content.split("\n");
  const messages: CaveBusMessage[] = [];
  const includeManagedBlocks = options?.includeManagedBlocks !== false;

  let current: {
    type: CaveBusMessageType;
    header: string;
    bodyLines: string[];
    startLine: number;
    managed: boolean;
  } | null = null;

  let inManagedBlock = false;

  function flush(): void {
    if (!current) return;
    const body = current.bodyLines.join("\n").trimEnd();
    const raw = (current.header + (body ? "\n" + body : "")).trimEnd();
    const featureId = extractFeatureId(current.header);
    const taskId = extractTaskId(current.header);
    const msg: CaveBusMessage = {
      type: current.type,
      header: current.header,
      body,
      raw,
      startLine: current.startLine,
      endLine: current.startLine + 1 + current.bodyLines.length - 1,
    };
    if (featureId) msg.featureId = featureId;
    if (taskId) msg.taskId = taskId;
    if (current.managed) msg.managed = true;
    messages.push(msg);
    current = null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNum = i + 1;

    if (MANAGED_BEGIN_RE.test(line)) {
      flush();
      inManagedBlock = true;
      continue;
    }

    if (MANAGED_END_RE.test(line)) {
      flush();
      inManagedBlock = false;
      continue;
    }

    const typeMatch = MESSAGE_TYPE_RE.exec(line);
    if (typeMatch) {
      flush();
      const type = typeMatch[1] as CaveBusMessageType;
      current = {
        type,
        header: line,
        bodyLines: [],
        startLine: lineNum,
        managed: inManagedBlock && includeManagedBlocks,
      };
      continue;
    }

    if (current) {
      current.bodyLines.push(line);
    }
  }

  flush();
  return messages;
}

export function validateCaveBusLog(
  content: string,
  options?: { strict?: boolean | undefined },
): CaveBusValidationResult {
  const messages = parseCaveBusLog(content);
  const issues: CaveBusValidationIssue[] = [];
  const strict = options?.strict === true;

  for (const msg of messages) {
    const msgIssues = validateCaveBusMessage(msg);
    issues.push(...msgIssues);
  }

  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (MANAGED_BEGIN_RE.test(trimmed) || MANAGED_END_RE.test(trimmed)) continue;

    const firstWord = trimmed.split(/\s/)[0] ?? "";
    if (
      firstWord.length >= 2 &&
      firstWord === firstWord.toUpperCase() &&
      /^[A-Z]+$/.test(firstWord) &&
      !isCaveBusMessageType(firstWord) &&
      !trimmed.startsWith("#") &&
      !trimmed.startsWith("-") &&
      !trimmed.startsWith("*") &&
      !trimmed.includes(":") &&
      firstWord.length <= 10
    ) {
      issues.push({
        severity: "warning",
        line: i + 1,
        message: `Possible unknown message type: ${firstWord}`,
        code: "UNKNOWN_TYPE_HINT",
      });
    }
  }

  const stats = computeCaveBusStats(messages);
  const hasErrors = issues.some((i) => i.severity === "error");
  const hasWarnings = issues.some((i) => i.severity === "warning");
  const ok = !hasErrors && !(strict && hasWarnings);

  return { ok, issues, messages, stats };
}

export function validateCaveBusMessage(message: CaveBusMessage): CaveBusValidationIssue[] {
  const issues: CaveBusValidationIssue[] = [];
  const line = message.startLine;

  if (!isCaveBusMessageType(message.type)) {
    issues.push({
      severity: "error",
      line,
      message: `Unknown message type: ${message.type}`,
      code: "UNKNOWN_TYPE",
    });
    return issues;
  }

  if (message.type !== "MEM" && message.type !== "NOTE" && !message.featureId) {
    issues.push({
      severity: "warning",
      line,
      message: `Missing feature ID for ${message.type} message`,
      code: "MISSING_FEATURE_ID",
    });
  }

  const headerParts = message.header.split(/\s+/);
  for (const part of headerParts) {
    if (part.startsWith("conf:")) {
      const val = part.slice(5);
      if (!isConfidenceValue(val)) {
        issues.push({
          severity: "warning",
          line,
          message: `Invalid confidence value: ${val}`,
          code: "INVALID_CONFIDENCE",
        });
      }
    }
    if (part.startsWith("status:")) {
      const val = part.slice(7);
      if (!isStatusValue(val)) {
        issues.push({
          severity: "warning",
          line,
          message: `Invalid status value: ${val}`,
          code: "INVALID_STATUS",
        });
      }
    }
    if (part.startsWith("verdict:")) {
      const val = part.slice(8);
      if (!isStatusValue(val)) {
        issues.push({
          severity: "warning",
          line,
          message: `Invalid verdict value: ${val}`,
          code: "INVALID_VERDICT",
        });
      }
    }
  }

  const body = message.body;

  if (message.type === "VERIFY") {
    const verdictMatch = message.header.match(/verdict:(\S+)/);
    if (verdictMatch && verdictMatch[1] === "pass") {
      if (!body.includes("ac:") && !body.includes("cmd:")) {
        issues.push({
          severity: "warning",
          line,
          message: "VERIFY with verdict:pass should include ac: or cmd: evidence",
          code: "VERIFY_PASS_NO_EVIDENCE",
        });
      }
    }
  }

  if (message.type === "SUM") {
    const statusMatch = message.header.match(/status:(\S+)/);
    if (statusMatch && statusMatch[1] === "done") {
      if (!body.includes("pass:") && !body.includes("next:")) {
        issues.push({
          severity: "warning",
          line,
          message: "SUM with status:done should include pass: or next:",
          code: "SUM_DONE_NO_PASS",
        });
      }
    }
  }

  if (message.type === "ERR" && !body.includes("err:")) {
    issues.push({
      severity: "warning",
      line,
      message: "ERR message should include err:",
      code: "ERR_NO_ERR",
    });
  }

  if (message.type === "BLOCK" && !body.includes("reason:") && !body.includes("need:")) {
    issues.push({
      severity: "warning",
      line,
      message: "BLOCK message should include reason: or need:",
      code: "BLOCK_NO_REASON",
    });
  }

  if (message.type === "DISC") {
    if (!body.includes("touch:") && !body.includes("read:") && !body.includes("unknown:") && !body.includes("next:")) {
      issues.push({
        severity: "warning",
        line,
        message: "DISC message should include touch:, read:, unknown:, or next:",
        code: "DISC_NO_CONTENT",
      });
    }
  }

  if (/\bpass\b/.test(body) && /\bfail\b/.test(body)) {
    const passCtx = body.match(/.{0,20}pass.{0,20}/)?.[0] ?? "";
    const failCtx = body.match(/.{0,20}fail.{0,20}/)?.[0] ?? "";
    if (!passCtx.includes("pass:") && !failCtx.includes("fail:") &&
        !passCtx.includes("password") && !failCtx.includes("failover")) {
      issues.push({
        severity: "warning",
        line,
        message: "Message contains both 'pass' and 'fail' ambiguously",
        code: "AMBIGUOUS_PASS_FAIL",
      });
    }
  }

  return issues;
}

export function computeCaveBusStats(messages: CaveBusMessage[]): CaveBusStats {
  const byType: Record<string, number> = {};
  let managedBlocks = 0;
  let manualMessages = 0;
  const managedBlockIds = new Set<number>();

  for (const msg of messages) {
    byType[msg.type] = (byType[msg.type] ?? 0) + 1;
    if (msg.managed) {
      managedBlockIds.add(msg.startLine);
    } else {
      manualMessages++;
    }
  }

  managedBlocks = managedBlockIds.size > 0 ? 1 : 0;

  return {
    totalMessages: messages.length,
    byType,
    managedBlocks,
    manualMessages,
  };
}

export function filterCaveBusMessages(
  messages: CaveBusMessage[],
  options?: { type?: CaveBusMessageType | undefined; tail?: number | undefined },
): CaveBusMessage[] {
  let filtered = messages;

  if (options?.type) {
    filtered = filtered.filter((m) => m.type === options.type);
  }

  if (options?.tail !== undefined && options.tail > 0) {
    filtered = filtered.slice(-options.tail);
  }

  return filtered;
}

function extractFeatureId(header: string): string | null {
  const match = /\bF\d{3,}\b/.exec(header);
  return match ? match[0] : null;
}

function extractTaskId(header: string): string | null {
  const match = /\bT\d{2,}\b/.exec(header);
  return match ? match[0] : null;
}
