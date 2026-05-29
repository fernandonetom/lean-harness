import { CLIError } from "../core/errors.js";

export interface InitHostSelection {
  claudeCode: boolean;
  openCode: boolean;
}

const VALID_HOST_TOKENS = new Set(["claude-code", "opencode", "all"]);

export function normalizeInitHosts(input: string[]): InitHostSelection {
  const selection: InitHostSelection = { claudeCode: false, openCode: false };

  for (const raw of input) {
    const token = raw.trim().toLowerCase();
    if (!VALID_HOST_TOKENS.has(token)) {
      throw new CLIError(
        `Invalid --host value for init: ${raw}. Expected claude-code, opencode, all, or omit the flag.`,
      );
    }
    if (token === "all") {
      selection.claudeCode = true;
      selection.openCode = true;
    } else if (token === "claude-code") {
      selection.claudeCode = true;
    } else if (token === "opencode") {
      selection.openCode = true;
    }
  }

  return selection;
}

export function hasAnyInitHost(selection: InitHostSelection): boolean {
  return selection.claudeCode || selection.openCode;
}

/** Legacy single-host string for update/detect paths that expect InitHost | undefined */
export type InitHost = "claude-code" | "opencode" | "all";

export function selectionToLegacyHost(selection: InitHostSelection): InitHost | undefined {
  if (selection.claudeCode && selection.openCode) return "all";
  if (selection.claudeCode) return "claude-code";
  if (selection.openCode) return "opencode";
  return undefined;
}

export function legacyHostToSelection(host: InitHost | undefined): InitHostSelection {
  if (host === undefined) return { claudeCode: false, openCode: false };
  return normalizeInitHosts([host]);
}
