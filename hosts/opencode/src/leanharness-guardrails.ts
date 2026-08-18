import path from "node:path";
import type { Plugin } from "@opencode-ai/plugin";
import {
  projectRoot,
  worktreeRoot,
  safeString,
  findActiveFeature,
  resolveFeatureDir,
  loadBoundary,
  extractToolName,
  extractCommand,
  extractPaths,
  isHarnessBootstrapPath,
  isSecretPath,
  redactSecrets,
  classifyCommand,
  classifyPathRisk,
  isPathInsideBoundary,
  logPluginEvent,
  appendCaveBusNote,
  findActiveTask,
  makeBlockError,
  type Roots,
  type Boundary,
} from "./shared.js";

interface FeatureContext {
  featureRef: string | null;
  featureDir: string | null;
  boundary: Boundary | null;
  taskId: string | null;
}

export const LeanHarnessGuardrails: Plugin = async (context) => {
  const root = projectRoot(context as Record<string, unknown>);
  const wtRoot = worktreeRoot(context as Record<string, unknown>);
  const roots: Roots = { harnessRoot: root, worktreeRoot: wtRoot, isLinkedWorktree: path.resolve(root) !== path.resolve(wtRoot) };
  return {
    "tool.execute.before": async (input, output) => {
      try {
        await handleBefore(root, input, output, roots);
      } catch (err) {
        if (err instanceof Error && err.name === "LeanHarnessGuardrailBlock") throw err;
      }
    },
    "tool.execute.after": async (input, output) => {
      try {
        await handleAfter(root, input, output);
      } catch {
        /* logging must never break the tool call */
      }
    },
    // Additive, spec-documented deny layer alongside the throw-based block above (see handleBefore).
    // The exact shape of OpenCode's `Permission` input is not published in the plugin docs at the
    // time this was written, so extraction here is deliberately defensive/best-effort — this hook
    // only fires for calls OpenCode's static permission config marks "ask"; it does NOT replace the
    // throw-based blocking above, which remains the enforcement backbone (see docs/hosts/opencode.md).
    "permission.ask": async (input, output) => {
      try {
        const shouldDeny = await evaluatePermissionAsk(root, input, roots);
        if (shouldDeny) output.status = "deny";
      } catch {
        /* best-effort: never let this hook itself throw or crash the session */
      }
    },
    event: async ({ event }) => {
      try {
        await handleEvent(root, event);
      } catch {
        /* logging must never break the session */
      }
    },
  };
};
export default LeanHarnessGuardrails;

function getFeatureContext(root: string): FeatureContext {
  const featureRef = findActiveFeature(root);
  const featureDir = featureRef ? resolveFeatureDir(root, featureRef) : null;
  const boundary = featureDir ? loadBoundary(root, featureDir) : null;
  const taskId = findActiveTask(root, featureDir);
  return { featureRef, featureDir, boundary, taskId };
}

function featureLabel(ctx: FeatureContext): string {
  return ctx.featureRef ? (ctx.featureRef.includes("-") ? (ctx.featureRef.split("-")[0] as string) : ctx.featureRef) : "no-feature";
}
function isShellTool(n: string | null): boolean {
  return !!n && ["bash", "shell", "terminal", "command", "exec", "run"].some((x) => n.includes(x));
}
function isReadTool(n: string | null): boolean {
  return !!n && ["read", "search", "list", "glob", "grep", "find", "cat", "view"].some((x) => n.includes(x));
}
function isEditTool(n: string | null): boolean {
  return !!n && ["edit", "write", "create", "delete", "remove", "patch", "replace", "insert", "append"].some((x) => n.includes(x));
}

async function handleBefore(root: string, input: unknown, output: unknown, roots: Roots): Promise<void> {
  const toolName = extractToolName(input);
  const command = extractCommand(input, output);
  const paths = extractPaths(input, output, roots || root);
  const ctx = getFeatureContext(root);

  for (const p of paths) {
    if (isSecretPath(p)) {
      if (ctx.featureDir) logPluginEvent(root, ctx.featureDir, { event: "guardrail.block", reason: "secret_path", tool: toolName, target: p });
      throw makeBlockError("LeanHarness blocked this OpenCode tool call because it attempted to access a secret path: " + p + ".");
    }
  }

  if (isShellTool(toolName) && command) {
    const c = classifyCommand(command, root);
    if (c.decision === "block") {
      if (ctx.featureDir) logPluginEvent(root, ctx.featureDir, { event: "guardrail.block", reason: "dangerous_command", tool: toolName, target: redactSecrets(safeString(command, 200)) });
      throw makeBlockError("LeanHarness blocked this OpenCode command because it is destructive: " + redactSecrets(safeString(command, 200)) + ".");
    }
    if (c.decision === "warn" && ctx.featureDir) {
      logPluginEvent(root, ctx.featureDir, { event: "guardrail.warn", reason: "risky_command", tool: toolName, riskGate: c.riskGate });
    }
    return;
  }

  if (isReadTool(toolName)) return;

  if (isEditTool(toolName) || paths.length > 0) {
    for (const p of paths) {
      if (isHarnessBootstrapPath(p)) continue;
      if (ctx.boundary) {
        const check = isPathInsideBoundary(p, ctx.boundary);
        if (check.blocked) throw makeBlockError("LeanHarness blocked this OpenCode edit because " + p + " is in the blocked list for " + featureLabel(ctx) + ".");
        if (!check.inside) throw makeBlockError("LeanHarness blocked this OpenCode edit because " + p + " is outside the active change boundary for " + featureLabel(ctx) + ".");
      } else {
        const risk = classifyPathRisk(p);
        if (risk.riskGate && ctx.featureDir) logPluginEvent(root, ctx.featureDir, { event: "guardrail.warn", reason: "risk_gate_no_boundary", riskGate: risk.riskGate, target: p });
      }
    }
  }
}

async function handleAfter(root: string, input: unknown, output: unknown): Promise<void> {
  const ctx = getFeatureContext(root);
  if (!ctx.featureDir) return;
  const toolName = extractToolName(input);
  const command = extractCommand(input, output);
  const paths = extractPaths(input, output, root);
  logPluginEvent(root, ctx.featureDir, {
    event: "tool.execute.after",
    tool: toolName || "unknown",
    feature: ctx.featureRef,
    paths: paths.map((p) => redactSecrets(p)),
    command: command ? redactSecrets(safeString(command, 200)) : null,
  });
}

/**
 * Best-effort re-evaluation of the same block conditions as `handleBefore`, expressed against
 * OpenCode's `permission.ask` input instead of `tool.execute.before`'s (input, output) shape.
 * Returns true when the permission request should be denied.
 */
async function evaluatePermissionAsk(root: string, permission: unknown, roots: Roots): Promise<boolean> {
  if (!permission || typeof permission !== "object") return false;
  const rec = permission as Record<string, unknown>;
  const ctx = getFeatureContext(root);

  const command = typeof rec["pattern"] === "string" ? (rec["pattern"] as string) : typeof rec["command"] === "string" ? (rec["command"] as string) : null;
  if (command) {
    const c = classifyCommand(command, root);
    if (c.decision === "block") {
      if (ctx.featureDir) logPluginEvent(root, ctx.featureDir, { event: "guardrail.block", reason: "dangerous_command", source: "permission.ask", target: redactSecrets(safeString(command, 200)) });
      return true;
    }
  }

  const candidatePath = [rec["filePath"], rec["file_path"], rec["path"]].find((v) => typeof v === "string") as string | undefined;
  if (candidatePath) {
    const relPath = extractPaths({ args: { path: candidatePath } }, undefined, roots)[0] ?? candidatePath;
    if (isSecretPath(relPath)) {
      if (ctx.featureDir) logPluginEvent(root, ctx.featureDir, { event: "guardrail.block", reason: "secret_path", source: "permission.ask", target: relPath });
      return true;
    }
    if (!isHarnessBootstrapPath(relPath) && ctx.boundary) {
      const check = isPathInsideBoundary(relPath, ctx.boundary);
      if (check.blocked || !check.inside) {
        logPluginEvent(root, ctx.featureDir as string, { event: "guardrail.block", reason: "boundary", source: "permission.ask", target: relPath });
        return true;
      }
    }
  }

  return false;
}

async function handleEvent(root: string, event: unknown): Promise<void> {
  if (!event || typeof event !== "object") return;
  const ctx = getFeatureContext(root);
  if (!ctx.featureDir) return;
  const rec = event as Record<string, unknown>;
  const eventType = (rec["type"] as string) || (rec["event"] as string) || (rec["name"] as string) || "";
  if (eventType === "session.error") {
    const errMsg = rec["error"] || rec["message"] || "unknown error";
    appendCaveBusNote(root, ctx.featureDir, "ERR " + featureLabel(ctx) + " session\nerr:\n- " + redactSecrets(safeString(errMsg, 200)) + "\nnext:\n- inspect session logs");
  } else if (eventType === "session.compacted") {
    appendCaveBusNote(root, ctx.featureDir, "NOTE " + featureLabel(ctx) + " event:session.compacted");
  }
  logPluginEvent(root, ctx.featureDir, { event: eventType, feature: ctx.featureRef });
}
