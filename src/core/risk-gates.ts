import path from "node:path";
import { readJsonFile, writeJsonFile, fileExists } from "./fs.js";
import { featuresDir } from "./paths.js";
import type { ResolvedConfig } from "./resolved-config.js";

export interface RiskGateMatch {
  gate: string;
  source: "file" | "note" | "boundary";
  detail: string;
}

export interface RiskApproval {
  gate: string;
  approvedAt: string;
  approvedBy: string;
}

export interface RiskApprovalsFile {
  approvals: RiskApproval[];
}

export interface RiskGateResult {
  gate: string;
  triggered: boolean;
  approved: boolean;
  matches: RiskGateMatch[];
}

export interface RiskGateEnforcementResult {
  results: RiskGateResult[];
  blocked: string[];
  warnings: string[];
  allClear: boolean;
}

const GATE_FILE_PATTERNS: Record<string, RegExp[]> = {
  destructive_migration: [/migration/i, /\.sql$/i, /schema/i, /migrate/i],
  auth_rewrite: [/auth/i, /login/i, /session/i, /oauth/i, /jwt/i, /token/i],
  payment_logic: [/payment/i, /billing/i, /charge/i, /stripe/i, /invoice/i],
  new_dependency: [/package\.json$/, /package-lock\.json$/, /yarn\.lock$/, /pnpm-lock\.yaml$/],
  public_api_break: [/api/i, /route/i, /endpoint/i, /handler/i, /controller/i],
  broad_refactor: [],
  security_sensitive_change: [/security/i, /crypto/i, /encrypt/i, /secret/i, /credential/i, /password/i],
};

const GATE_NOTE_PATTERNS: Record<string, RegExp[]> = {
  destructive_migration: [/destructive/i, /drop\s+table/i, /delete.*migration/i],
  auth_rewrite: [/auth.*rewrite/i, /authentication.*change/i, /authorization.*change/i],
  payment_logic: [/payment/i, /billing.*change/i, /charge/i],
  new_dependency: [/new.*dependenc/i, /add.*package/i, /install.*lib/i],
  public_api_break: [/breaking.*change/i, /api.*break/i, /remove.*endpoint/i],
  broad_refactor: [/broad.*refactor/i, /large.*refactor/i, /major.*restructur/i],
  security_sensitive_change: [/security/i, /vulnerabilit/i, /exploit/i, /inject/i],
};

export function checkRiskGates(
  configGates: string[],
  taskFiles: string[],
  taskNotes: string[],
  boundaryRiskGates: string[],
): RiskGateMatch[] {
  const matches: RiskGateMatch[] = [];

  for (const gate of configGates) {
    for (const riskName of boundaryRiskGates) {
      if (riskName.toLowerCase() === gate.toLowerCase() || riskName.toLowerCase().includes(gate.toLowerCase())) {
        matches.push({ gate, source: "boundary", detail: `boundary risk: ${riskName}` });
      }
    }

    const filePatterns = GATE_FILE_PATTERNS[gate];
    if (filePatterns) {
      for (const filePath of taskFiles) {
        for (const pattern of filePatterns) {
          if (pattern.test(filePath)) {
            matches.push({ gate, source: "file", detail: filePath });
            break;
          }
        }
      }
    }

    const notePatterns = GATE_NOTE_PATTERNS[gate];
    if (notePatterns) {
      for (const note of taskNotes) {
        for (const pattern of notePatterns) {
          if (pattern.test(note)) {
            matches.push({ gate, source: "note", detail: note.slice(0, 100) });
            break;
          }
        }
      }
    }
  }

  return deduplicateMatches(matches);
}

function deduplicateMatches(matches: RiskGateMatch[]): RiskGateMatch[] {
  const seen = new Set<string>();
  return matches.filter((m) => {
    const key = `${m.gate}:${m.source}:${m.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function loadApprovals(
  root: string,
  featurePath: string,
): Promise<RiskApproval[]> {
  const approvalsPath = path.join(featuresDir(root), featurePath, "risk-approvals.json");
  const data = await readJsonFile<RiskApprovalsFile>(approvalsPath);
  if (!data || !Array.isArray(data.approvals)) return [];
  return data.approvals;
}

export async function saveApproval(
  root: string,
  featurePath: string,
  gate: string,
): Promise<void> {
  const approvalsPath = path.join(featuresDir(root), featurePath, "risk-approvals.json");
  const existing = await readJsonFile<RiskApprovalsFile>(approvalsPath);
  const approvals = existing?.approvals ?? [];

  if (!approvals.some((a) => a.gate === gate)) {
    approvals.push({
      gate,
      approvedAt: new Date().toISOString(),
      approvedBy: "cli",
    });
  }

  const alreadyExists = await fileExists(approvalsPath);
  await writeJsonFile(approvalsPath, { approvals }, { overwrite: alreadyExists });
}

export function enforceRiskGates(
  matches: RiskGateMatch[],
  approvals: RiskApproval[],
  strict: boolean,
): RiskGateEnforcementResult {
  const approvedGates = new Set(approvals.map((a) => a.gate));
  const gateGroups = new Map<string, RiskGateMatch[]>();

  for (const match of matches) {
    const existing = gateGroups.get(match.gate) ?? [];
    existing.push(match);
    gateGroups.set(match.gate, existing);
  }

  const results: RiskGateResult[] = [];
  const blocked: string[] = [];
  const warnings: string[] = [];

  for (const [gate, gateMatches] of gateGroups) {
    const approved = approvedGates.has(gate);
    results.push({ gate, triggered: true, approved, matches: gateMatches });

    if (approved) {
      warnings.push(`Risk gate "${gate}" triggered but approved.`);
    } else if (strict) {
      blocked.push(gate);
    } else {
      warnings.push(`Risk gate "${gate}" triggered — use --approve-risk ${gate} to approve.`);
    }
  }

  return {
    results,
    blocked,
    warnings,
    allClear: blocked.length === 0,
  };
}
