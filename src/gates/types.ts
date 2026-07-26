export interface GateArtifact {
  schema: "v1";
  featureId: string;
  taskId?: string;
  passedAt: string;
  gates: GateResult[];
  overallResult: "pass" | "fail" | "error";
  touchedFiles: string[];
}

export interface GateResult {
  id: string;
  kind: "typecheck" | "lint" | "test";
  result: "pass" | "fail" | "error" | "skipped";
  evidence: string;
  diagnostics?: GateDiagnostic[];
}

export interface GateDiagnostic {
  file: string;
  line?: number;
  column?: number;
  severity: "error" | "warning";
  message: string;
}

export interface RunGatesInput {
  root: string;
  featureDir: string;
  taskId?: string;
  touchedFiles: string[];
  gates: GateConfig;
}

export interface GateConfig {
  enabled: boolean;
  when: "after_task" | "before_review" | "both";
  fail_task_on: "error" | "warning";
  include_globs: string[];
  exclude_globs: string[];
  typecheck: "touched" | "project" | "off";
  lint: "touched" | "off";
  test: "related" | "off";
}

export function defaultGateConfig(): GateConfig {
  return {
    enabled: true,
    when: "after_task",
    fail_task_on: "error",
    include_globs: ["**/*.{ts,tsx,js,jsx,mts,cts}", "**/*.{test,spec}.{ts,tsx,js,jsx,mts,cts}"],
    exclude_globs: ["dist/**", "node_modules/**"],
    typecheck: "touched",
    lint: "touched",
    test: "related",
  };
}
