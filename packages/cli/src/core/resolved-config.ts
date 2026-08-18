import type {
  HarnessConfig,
  DiscoveryDepth,
  CompressionMode,
  SupportedAgentHost,
} from "./types.js";
import { loadHarnessConfig } from "./config.js";

export interface ResolvedConfig {
  host: {
    primary: SupportedAgentHost;
  };
  discovery: {
    default_depth: DiscoveryDepth;
    max_initial_files: number;
  };
  compression: {
    enabled: boolean;
    mode: CompressionMode;
  };
  workflow: {
    require_worktree: boolean;
    worktree_dir: string | null;
  };
  verification: {
    require_acceptance_trace: boolean;
    require_changed_files: boolean;
    require_review: boolean;
    allow_self_review: boolean;
  };
  risk_gates: {
    require_approval: string[];
  };
  models: {
    agent: string | null;
    subagent: string | null;
  };
  build: {
    session_budget: number;
    with_review: boolean;
    max_fix_iterations: number;
    model_profile: string | null;
    exec_mode: "subagents" | "current" | "ask";
  };
}

export interface CLIOverrides {
  host?: string | undefined;
  depth?: string | undefined;
  maxFiles?: number | undefined;
  mode?: string | undefined;
  strict?: boolean | undefined;
  model?: string | undefined;
}

const VALID_HOSTS = new Set<string>(["claude-code", "opencode"]);
const VALID_DEPTHS = new Set<string>(["D0", "D1", "D2", "D3", "D4"]);
const VALID_MODES = new Set<string>(["lite", "full", "ultra"]);

export function resolveConfig(
  config: HarnessConfig | null,
  overrides?: CLIOverrides,
): ResolvedConfig {
  const c = config ?? {};

  const hostPrimary = resolveHost(c, overrides?.host);
  const depth = resolveDepth(c, overrides?.depth);
  const maxFiles = resolveMaxFiles(c, overrides?.maxFiles);
  const compressionEnabled = c.compression?.enabled !== false;
  const compressionMode = resolveCompressionMode(c, overrides?.mode);
  const requireWorktree = c.workflow?.require_worktree === true;
  const worktreeDir = typeof c.workflow?.worktree_dir === "string" && c.workflow.worktree_dir.length > 0
    ? c.workflow.worktree_dir
    : null;
  const requireAcceptanceTrace = c.verification?.require_acceptance_trace !== false;
  const requireChangedFiles = c.verification?.require_changed_files !== false;
  const requireReview = overrides?.strict
    ? true
    : c.verification?.require_review !== false;
  const allowSelfReview = c.verification?.allow_self_review !== false;

  const requireApproval = Array.isArray(c.risk_gates?.require_approval)
    ? c.risk_gates.require_approval.filter((v): v is string => typeof v === "string")
    : [];

  const agentModel = overrides?.model
    ?? (typeof c.models?.agent === "string" ? c.models.agent : null);
  const subagentModel = typeof c.models?.subagent === "string" ? c.models.subagent : null;

  const sessionBudget = typeof c.build?.session_budget === "number" && c.build.session_budget > 0
    ? c.build.session_budget
    : 15;
  const withReview = c.build?.with_review === true;
  const maxFixIterations = typeof c.build?.max_fix_iterations === "number" && c.build.max_fix_iterations >= 0
    ? c.build.max_fix_iterations
    : 3;
  const modelProfile = typeof c.build?.model_profile === "string" ? c.build.model_profile : null;
  const execMode = (c.build?.exec_mode === "subagents" || c.build?.exec_mode === "current" || c.build?.exec_mode === "ask")
    ? c.build.exec_mode
    : "subagents";

  return {
    host: { primary: hostPrimary },
    discovery: { default_depth: depth, max_initial_files: maxFiles },
    compression: { enabled: compressionEnabled, mode: compressionMode },
    workflow: { require_worktree: requireWorktree, worktree_dir: worktreeDir },
    verification: {
      require_acceptance_trace: requireAcceptanceTrace,
      require_changed_files: requireChangedFiles,
      require_review: requireReview,
      allow_self_review: allowSelfReview,
    },
    risk_gates: { require_approval: requireApproval },
    models: { agent: agentModel, subagent: subagentModel },
    build: {
      session_budget: sessionBudget,
      with_review: withReview,
      max_fix_iterations: maxFixIterations,
      model_profile: modelProfile,
      exec_mode: execMode,
    },
  };
}

export async function loadResolvedConfig(
  root: string,
  overrides?: CLIOverrides,
): Promise<ResolvedConfig> {
  const { parsed } = await loadHarnessConfig(root);
  return resolveConfig(parsed, overrides);
}

function resolveHost(
  config: HarnessConfig,
  override?: string,
): SupportedAgentHost {
  if (override && VALID_HOSTS.has(override)) return override as SupportedAgentHost;
  const fromConfig = config.host?.primary;
  if (typeof fromConfig === "string" && VALID_HOSTS.has(fromConfig)) {
    return fromConfig as SupportedAgentHost;
  }
  return "claude-code";
}

function resolveDepth(
  config: HarnessConfig,
  override?: string,
): DiscoveryDepth {
  if (override) {
    const upper = override.toUpperCase();
    if (VALID_DEPTHS.has(upper)) return upper as DiscoveryDepth;
  }
  const fromConfig = config.discovery?.default_depth;
  if (typeof fromConfig === "string" && VALID_DEPTHS.has(fromConfig.toUpperCase())) {
    return fromConfig.toUpperCase() as DiscoveryDepth;
  }
  return "D2";
}

function resolveMaxFiles(
  config: HarnessConfig,
  override?: number,
): number {
  if (override !== undefined && override > 0) return override;
  const fromConfig = config.discovery?.max_initial_files;
  if (typeof fromConfig === "number" && fromConfig > 0) return fromConfig;
  return 25;
}

function resolveCompressionMode(
  config: HarnessConfig,
  override?: string,
): CompressionMode {
  if (override && VALID_MODES.has(override)) return override as CompressionMode;
  const fromConfig = config.compression?.mode;
  if (typeof fromConfig === "string" && VALID_MODES.has(fromConfig)) {
    return fromConfig as CompressionMode;
  }
  return "full";
}
