import path from "node:path";
import {
  projectRoot, worktreeRoot, nowIso, safeString, findActiveFeature, resolveFeatureDir, loadBoundary,
  extractToolName, extractToolArgs, extractCommand, extractPaths,
  isHarnessBootstrapPath, isSecretPath, redactSecrets, classifyCommand, classifyPathRisk,
  isPathInsideBoundary, logPluginEvent, appendCaveBusNote, findActiveTask, makeBlockError,
} from "./shared.js";

export const LeanHarnessGuardrails = async (context) => {
  const root = projectRoot(context);
  const wtRoot = worktreeRoot(context);
  const roots = { harnessRoot: root, worktreeRoot: wtRoot, isLinkedWorktree: path.resolve(root) !== path.resolve(wtRoot) };
  return {
    "tool.execute.before": async (input, output) => {
      try { await handleBefore(root, input, output, roots); } catch (err) { if (err && err.name === "LeanHarnessGuardrailBlock") throw err; }
    },
    "tool.execute.after": async (input, output) => {
      try { await handleAfter(root, input, output); } catch {}
    },
    event: async ({ event }) => {
      try { await handleEvent(root, event); } catch {}
    },
  };
};
export default LeanHarnessGuardrails;

function getFeatureContext(root) {
  const featureRef = findActiveFeature(root);
  const featureDir = featureRef ? resolveFeatureDir(root, featureRef) : null;
  const boundary = featureDir ? loadBoundary(root, featureDir) : null;
  const taskId = findActiveTask(root, featureDir);
  return { featureRef, featureDir, boundary, taskId };
}

function featureLabel(ctx) { return ctx.featureRef ? (ctx.featureRef.includes("-") ? ctx.featureRef.split("-")[0] : ctx.featureRef) : "no-feature"; }
function isShellTool(n) { return n && ["bash","shell","terminal","command","exec","run"].some(x => n.includes(x)); }
function isReadTool(n) { return n && ["read","search","list","glob","grep","find","cat","view"].some(x => n.includes(x)); }
function isEditTool(n) { return n && ["edit","write","create","delete","remove","patch","replace","insert","append"].some(x => n.includes(x)); }

async function handleBefore(root, input, output, roots) {
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

async function handleAfter(root, input, output) {
  const ctx = getFeatureContext(root);
  if (!ctx.featureDir) return;
  const toolName = extractToolName(input);
  const command = extractCommand(input, output);
  const paths = extractPaths(input, output, root);
  logPluginEvent(root, ctx.featureDir, { event: "tool.execute.after", tool: toolName || "unknown", feature: ctx.featureRef, paths: paths.map(p => redactSecrets(p)), command: command ? redactSecrets(safeString(command, 200)) : null });
}

async function handleEvent(root, event) {
  if (!event || typeof event !== "object") return;
  const ctx = getFeatureContext(root);
  if (!ctx.featureDir) return;
  const eventType = event.type || event.event || event.name || "";
  if (eventType === "session.error") {
    const errMsg = event.error || event.message || "unknown error";
    appendCaveBusNote(root, ctx.featureDir, "ERR " + featureLabel(ctx) + " session\nerr:\n- " + redactSecrets(safeString(errMsg, 200)) + "\nnext:\n- inspect session logs");
  } else if (eventType === "session.compacted") {
    appendCaveBusNote(root, ctx.featureDir, "NOTE " + featureLabel(ctx) + " event:session.compacted");
  }
  logPluginEvent(root, ctx.featureDir, { event: eventType, feature: ctx.featureRef });
}
