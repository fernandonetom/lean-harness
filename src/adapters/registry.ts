import { CLIError } from "../core/errors.js";
import type { AgentAdapter, AgentHost, AgentDetection } from "./types.js";
import { claudeCodeAdapter } from "./claude-code.js";
import { opencodeAdapter } from "./opencode.js";

export const DEFAULT_AGENT_HOST: AgentHost = "claude-code";

const HOST_ALIASES: Record<string, AgentHost> = {
  "claude": "claude-code",
  "claude-code": "claude-code",
  "claudecode": "claude-code",
  "opencode": "opencode",
  "open-code": "opencode",
};

const ADAPTERS: Record<AgentHost, AgentAdapter> = {
  "claude-code": claudeCodeAdapter,
  "opencode": opencodeAdapter,
};

export function normalizeAgentHost(value: string | undefined): AgentHost {
  if (value === undefined) return DEFAULT_AGENT_HOST;

  const normalized = value.toLowerCase().trim();
  const host = HOST_ALIASES[normalized];

  if (!host) {
    const known = listAgentHosts().join(" or ");
    throw new CLIError(`Unknown agent host: ${value}. Expected ${known}.`);
  }

  return host;
}

export function getAgentAdapter(host: AgentHost): AgentAdapter {
  const adapter = ADAPTERS[host];
  if (!adapter) {
    const known = listAgentHosts().join(" or ");
    throw new CLIError(`No adapter registered for host: ${host}. Expected ${known}.`);
  }
  return adapter;
}

export function listAgentHosts(): AgentHost[] {
  return Object.keys(ADAPTERS) as AgentHost[];
}

export async function detectAgentHost(
  root: string,
  host: AgentHost,
  commandOverride?: string,
): Promise<AgentDetection> {
  const adapter = getAgentAdapter(host);
  return adapter.detect(root, commandOverride);
}

export async function detectAllAgentHosts(
  root: string,
  options?: { claudeCommand?: string; opencodeCommand?: string },
): Promise<AgentDetection[]> {
  const results = await Promise.all([
    detectAgentHost(root, "claude-code", options?.claudeCommand),
    detectAgentHost(root, "opencode", options?.opencodeCommand),
  ]);
  return results;
}
