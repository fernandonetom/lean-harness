export const CAVEBUS_MESSAGE_TYPES = [
  "REQ",
  "DISC",
  "PLAN",
  "TASK",
  "SUM",
  "REV",
  "VERIFY",
  "ERR",
  "BLOCK",
  "MEM",
  "NOTE",
  "RISK",
  "BOUNDARY",
  "CMD",
] as const;

export type CaveBusMessageType = typeof CAVEBUS_MESSAGE_TYPES[number];

export const CAVEBUS_STATUS_VALUES = [
  "draft",
  "specified",
  "discovered",
  "planned",
  "building",
  "done",
  "needs-fix",
  "blocked",
  "verified",
  "archived",
  "pass",
  "fail",
  "partial",
  "not-checked",
  "skipped",
  "unknown",
] as const;

export type CaveBusStatus = typeof CAVEBUS_STATUS_VALUES[number];

export const CAVEBUS_CONFIDENCE_VALUES = [
  "low",
  "med",
  "high",
  "unknown",
] as const;

export type CaveBusConfidence = typeof CAVEBUS_CONFIDENCE_VALUES[number];

export const CAVEBUS_DISCOVERY_DEPTHS = ["D0", "D1", "D2", "D3", "D4"] as const;

export interface CaveBusMessage {
  type: CaveBusMessageType;
  featureId?: string | undefined;
  taskId?: string | undefined;
  header: string;
  body: string;
  raw: string;
  startLine: number;
  endLine: number;
  managed?: boolean | undefined;
}

export interface CaveBusValidationIssue {
  severity: "error" | "warning";
  line: number;
  message: string;
  code: string;
}

export interface CaveBusValidationResult {
  ok: boolean;
  issues: CaveBusValidationIssue[];
  messages: CaveBusMessage[];
  stats: CaveBusStats;
}

export interface CaveBusStats {
  totalMessages: number;
  byType: Record<string, number>;
  managedBlocks: number;
  manualMessages: number;
}

const messageTypeSet = new Set<string>(CAVEBUS_MESSAGE_TYPES);
const statusSet = new Set<string>(CAVEBUS_STATUS_VALUES);
const confidenceSet = new Set<string>(CAVEBUS_CONFIDENCE_VALUES);

export function isCaveBusMessageType(value: string): value is CaveBusMessageType {
  return messageTypeSet.has(value);
}

export function normalizeCaveBusType(value: string | undefined): CaveBusMessageType | null {
  if (!value) return null;
  const upper = value.toUpperCase();
  if (isCaveBusMessageType(upper)) return upper;
  return null;
}

export function isStatusValue(value: string): boolean {
  return statusSet.has(value);
}

export function isConfidenceValue(value: string): boolean {
  return confidenceSet.has(value);
}
