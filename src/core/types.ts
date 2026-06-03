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
}

export interface HarnessConfigBoundaryEnforcement {
  mode?: 'strict' | 'warn' | 'off';
  always_allow?: string[];
  session_overrides?: string[];
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
