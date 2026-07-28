export type AgentHost = "claude-code" | "opencode";

export interface AgentDetection {
  host: AgentHost;
  available: boolean;
  command: string;
  version?: string | undefined;
  error?: string | undefined;
}

export interface AgentRunInput {
  host?: AgentHost | undefined;
  root: string;
  /** Directory the agent process runs in. Defaults to `root`. Set when building inside a git worktree. */
  workingDir?: string | undefined;
  prompt: string;
  featureRef: string;
  taskId: string;

  // shared
  dryRun?: boolean | undefined;
  model?: string | undefined;

  // Claude Code-specific
  allowedTools?: string[] | undefined;
  permissionMode?: string | undefined;
  outputFormat?: "text" | "json" | "stream-json" | undefined;
  claudeCommand?: string | undefined;

  // OpenCode-specific
  opencodeCommand?: string | undefined;
  opencodeAgent?: string | undefined;
  opencodeFormat?: "default" | "json" | undefined;
  attach?: string | undefined;
  session?: string | undefined;

  // subprocess control
  timeout?: number | undefined;       // ms, default 1800000 (30min)
  signal?: AbortSignal | undefined;    // AbortController signal
  onStdout?: ((chunk: string) => void) | undefined;
  onStderr?: ((chunk: string) => void) | undefined;
}

export interface AgentRunResult {
  host: AgentHost;
  ok: boolean;
  command: string[];
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  outputPath?: string | undefined;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  dryRun: boolean;
  timedOut: boolean;
  aborted: boolean;
  warnings?: string[] | undefined;
}

export interface AgentAdapter {
  host: AgentHost;
  run(input: AgentRunInput): Promise<AgentRunResult>;
  detect(root: string, commandOverride?: string): Promise<AgentDetection>;
}
