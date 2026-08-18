export type FeatureStatus =
  | "draft"
  | "specified"
  | "discovered"
  | "planned"
  | "building"
  | "needs-fix"
  | "blocked"
  | "verified"
  | "done"
  | "archived";

export type VerificationVerdict = "pass" | "needs-fix" | "blocked";

export type SupportedAgentHost = "claude-code" | "opencode";

export interface HostSupportSummary {
  defaultHost: SupportedAgentHost;
  supportedHosts: SupportedAgentHost[];
}

export interface HarnessState {
  version: string;
  schema: string;
  activeFeature: string | null;
  nextFeatureNumber: number;
  features: FeatureIndexEntry[];
  lastUpdated: string | null;
  notes?: string | undefined;
}

export interface FeatureIndexEntry {
  id: string;
  slug: string;
  title: string;
  path: string;
  status: FeatureStatus;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
  /** Worktree directory, posix, relative to the harness root. Absent = no worktree. */
  worktreePath?: string | undefined;
  /** Branch checked out in that worktree. */
  worktreeBranch?: string | undefined;
  worktreeCreatedAt?: string | undefined;
}

export interface HarnessConfigProject {
  name?: string;
  mode?: string;
}

export interface HarnessConfigHost {
  primary?: SupportedAgentHost | string;
  adapter?: string;
}

export interface HarnessConfigWorkflow {
  visible_steps?: string[];
  one_command?: string;
  require_worktree?: boolean;
  worktree_dir?: string;
  require_review?: boolean;
  require_verification?: boolean;
}

export interface HarnessConfigArtifacts {
  root?: string;
  features_dir?: string;
  templates_dir?: string;
  memory_dir?: string;
  event_log?: string;
  cavebus_log?: string;
}

export interface HarnessConfigDiscovery {
  strategy?: string;
  default_depth?: DiscoveryDepth | string;
  max_initial_files?: number;
}

export interface HarnessConfigContext {
  bounded_context?: boolean;
  compile_per_task?: boolean;
  include_full_repo_map?: boolean;
}

export interface HarnessConfigCompression {
  enabled?: boolean;
  protocol?: string;
  mode?: CompressionMode | string;
}

export interface HarnessConfigVerification {
  require_acceptance_trace?: boolean;
  require_changed_files?: boolean;
  require_review?: boolean;
  allow_self_review?: boolean;
}

export interface HarnessConfigRiskGates {
  require_approval?: string[];
}

export interface HarnessConfigMemory {
  store?: string;
  scope?: string;
  project_file?: string;
  decisions_file?: string;
  patterns_file?: string;
  cave_file?: string;
}

export interface HarnessConfigModels {
  agent?: string;
  subagent?: string;
  planner?: string;
  builder?: string;
  reviewer?: string;
  verifier?: string;
  compressor?: string;
  fix?: string;
  by_host?: {
    opencode?: Record<string, string>;
    "claude-code"?: Record<string, string>;
  };
  profiles?: Record<string, Record<string, string>>;
}

export interface HarnessConfigLogging {
  event_format?: string;
  write_events?: boolean;
  write_cavebus?: boolean;
  log_level?: string;
}

export interface HarnessConfigFeatures {
  commit?: boolean;
}

export interface HarnessConfigBuild {
  session_budget?: number;
  with_review?: boolean;
  max_fix_iterations?: number;
  model_profile?: string;
  exec_mode?: "subagents" | "current" | "ask";
  gates?: HarnessConfigGates;
}

export interface HarnessConfigGates {
  enabled?: boolean;
  when?: "after_task" | "before_review" | "both";
  fail_task_on?: "error" | "warning";
  include_globs?: string[];
  exclude_globs?: string[];
  typecheck?: "touched" | "project" | "off";
  lint?: "touched" | "project" | "off";
  test?: "related" | "off";
}

export interface HarnessConfigBoundaryEnforcement {
  mode?: 'strict' | 'warn' | 'off';
  always_allow?: string[];
  session_overrides?: string[];
}

export interface HarnessConfigCommandEnforcement {
  force_push?: 'deny' | 'warn' | 'off';
}

export interface HarnessConfigAdapter {
  skills_dir?: string;
  hooks_enabled?: boolean;
  settings_file?: string;
  [key: string]: unknown;
}

export interface HarnessConfig {
  version?: string | number;
  project?: HarnessConfigProject;
  host?: HarnessConfigHost;
  workflow?: HarnessConfigWorkflow;
  artifacts?: HarnessConfigArtifacts;
  discovery?: HarnessConfigDiscovery;
  context?: HarnessConfigContext;
  compression?: HarnessConfigCompression;
  verification?: HarnessConfigVerification;
  risk_gates?: HarnessConfigRiskGates;
  models?: HarnessConfigModels;
  memory?: HarnessConfigMemory;
  logging?: HarnessConfigLogging;
  features?: HarnessConfigFeatures;
  build?: HarnessConfigBuild;
  boundary_enforcement?: HarnessConfigBoundaryEnforcement;
  command_enforcement?: HarnessConfigCommandEnforcement;
  adapters?: Record<string, HarnessConfigAdapter>;
}

export interface FeatureArtifactStatus {
  name: string;
  path: string;
  exists: boolean;
  kind: "file" | "directory";
}

export interface FeatureSummary {
  id: string;
  slug: string;
  title: string;
  folderName: string;
  path: string;
  status: FeatureStatus;
  artifacts: FeatureArtifactStatus[];
  missingArtifacts: string[];
  nextAction: string;
  active: boolean;
}

export interface CommandResult<T = unknown> {
  ok: boolean;
  data?: T | undefined;
  warnings?: string[] | undefined;
}

export interface CommandContext {
  cwd: string;
  json: boolean;
}

export interface DoctorCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
}

export type DiscoveryDepth = "D0" | "D1" | "D2" | "D3" | "D4";
export type Confidence = "low" | "medium" | "high" | "unknown";
export type CompactConfidence = "low" | "med" | "high" | "unknown";

export interface DiscoveryArtifactSummary {
  discoveryExists: boolean;
  boundaryExists: boolean;
  confidence?: Confidence | undefined;
  depth?: DiscoveryDepth | undefined;
  riskGates?: string[] | undefined;
  unknowns?: string[] | undefined;
}

export interface TaskContextArtifactSummary {
  taskContextDirExists: boolean;
  compiledContexts: number;
  runResults: number;
}

export type PlanStatus = "draft" | "planned" | "blocked";

export interface PlanningArtifactSummary {
  planExists: boolean;
  tasksExists: boolean;
  taskCount?: number | undefined;
  firstTaskId?: string | undefined;
  status?: PlanStatus | undefined;
  riskGates?: string[] | undefined;
  unknowns?: string[] | undefined;
}

export interface PlannedTaskSummary {
  id: string;
  title: string;
  status: "planned" | "blocked" | "building" | "needs-fix" | "verified" | "done";
  acceptanceCriteria: string[];
  expectedFiles: string[];
  verificationCommands: string[];
}

export interface TaskRunSummary {
  featureId: string;
  taskId: string;
  host: SupportedAgentHost;
  dryRun: boolean;
  contextPath: string;
  resultPath?: string | undefined;
  exitCode?: number | null | undefined;
  durationMs?: number | undefined;
}

export type BuildRunStatus = "done" | "needs-fix" | "blocked" | "dry-run";

export type CheckVerdict = "pass" | "needs-fix" | "blocked";
export type AcceptanceCheckStatus = "pass" | "fail" | "partial" | "not checked";
export type VerificationCommandStatus = "pass" | "fail" | "skipped" | "not run";

export interface CheckArtifactSummary {
  checksExists: boolean;
  resultExists: boolean;
  verdict?: CheckVerdict | undefined;
  unresolvedIssues?: number | undefined;
}

export interface CheckRunSummary {
  featureId: string;
  verdict: CheckVerdict;
  checksPath: string;
  resultPath: string;
  acceptance: {
    pass: number;
    fail: number;
    partial: number;
    notChecked: number;
  };
  commands: {
    pass: number;
    fail: number;
    skipped: number;
    notRun: number;
  };
  changedFiles: number;
  boundaryViolations: number;
  unresolvedIssues: number;
}

export type CompressionMode = "lite" | "full" | "ultra";
export type CompressionSource = "all" | "discovery" | "plan" | "tasks" | "build" | "check" | "memory";

export interface CaveBusArtifactSummary {
  exists: boolean;
  messageCount: number;
  validationOk?: boolean;
  lastType?: string;
  warnings?: string[];
}

export interface CompressionRunSummary {
  featureId: string;
  mode: CompressionMode;
  source: CompressionSource;
  outputPath: string;
  messages: number;
  validationOk: boolean;
  warnings: number;
}

export interface BuildArtifactSummary {
  taskSummaries: number;
  compiledContexts: number;
  runResults: number;
  nextRunnableTask?: string | undefined;
  runnableTasks: number;
  completedTasks: number;
}

export interface OpenCodePluginSummary {
  pluginsDirExists: boolean;
  guardrailPluginExists: boolean;
  sharedHelperExists: boolean;
  policyExists: boolean;
}

export interface OpenCodeIntegrationSummary {
  configExists: boolean;
  directoryExists: boolean;
  agentsDirExists: boolean;
  agents: {
    scout: boolean;
    builder: boolean;
    reviewer: boolean;
    verifier: boolean;
    compressor: boolean;
  };
  pluginInstalled: boolean;
  plugin?: OpenCodePluginSummary;
}

export interface BuildTaskRunSummary {
  taskId: string;
  taskTitle: string;
  host: SupportedAgentHost;
  status: BuildRunStatus;
  contextPath: string;
  resultPath?: string | undefined;
  summaryPath?: string | undefined;
  exitCode?: number | null | undefined;
  durationMs?: number | undefined;
}

export interface ReviewFinding {
  severity: "critical" | "major" | "minor" | "note";
  file?: string;
  symbol?: string;
  evidence?: string;
  fix?: string;
}

export interface ReviewChecklist {
  acceptanceCriteria: "pass" | "fail" | "partial";
  boundary: "pass" | "fail";
  tests: "pass" | "fail" | "missing";
  security: "pass" | "fail" | "n/a";
  riskGates: "pass" | "fail" | "n/a";
}

export interface ReviewArtifact {
  schema: "v1";
  featureId: string;
  taskId: string;
  verdict: "pass" | "needs-fix" | "blocked";
  model: string;
  mode: "independent" | "cli" | "self";
  reviewedAt: string;
  iteration: number;
  filesReviewed: string[];
  findings: ReviewFinding[];
  checklist: ReviewChecklist;
}

export interface ResolvedModelConfig {
  planner: string | null;
  builder: string | null;
  reviewer: string | null;
  verifier: string | null;
  compressor: string | null;
  fix: string | null;
}

export function resolveModelForRole(
  models: HarnessConfigModels | undefined,
  role: "planner" | "builder" | "reviewer" | "verifier" | "compressor" | "fix",
  host?: string,
  cliOverride?: string,
  profile?: string,
): string | null {
  if (cliOverride) return cliOverride;
  if (profile && models?.profiles?.[profile]?.[role]) {
    return models.profiles[profile][role]!;
  }
  if (host) {
    const byHost = models?.by_host?.[host as keyof typeof models.by_host] as Record<string, string> | undefined;
    if (byHost?.[role]) return byHost[role]!;
  }
  const roleVal = models?.[role];
  if (typeof roleVal === "string" && roleVal !== "auto") return roleVal;
  if (role === "builder" && typeof models?.agent === "string" && models.agent !== "auto") return models.agent;
  if (role !== "builder" && typeof models?.subagent === "string" && models.subagent !== "auto") return models.subagent;
  return null;
}

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
