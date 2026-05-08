import {
  projectRoot,
  nowIso,
  safeString,
  findActiveFeature,
  resolveFeatureDir,
  loadBoundary,
  extractToolName,
  extractToolArgs,
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
} from "./shared.js";

// --- plugin entry ---

export const LeanHarnessGuardrails = async (context) => {
  const root = projectRoot(context);

  return {
    "tool.execute.before": async (input, output) => {
      try {
        await handleBefore(root, input, output);
      } catch (err) {
        if (err && err.name === "LeanHarnessGuardrailBlock") {
          throw err;
        }
        // non-block errors: log and continue
      }
    },

    "tool.execute.after": async (input, output) => {
      try {
        await handleAfter(root, input, output);
      } catch {
        // after-hook errors should not crash the session
      }
    },

    event: async ({ event }) => {
      try {
        await handleEvent(root, event);
      } catch {
        // event handler errors should not crash the session
      }
    },
  };
};

export default LeanHarnessGuardrails;

// --- context helpers ---

function getFeatureContext(root) {
  const featureRef = findActiveFeature(root);
  const featureDir = featureRef ? resolveFeatureDir(root, featureRef) : null;
  const boundary = featureDir ? loadBoundary(root, featureDir) : null;
  const taskId = findActiveTask(root, featureDir);
  return { featureRef, featureDir, boundary, taskId };
}

function featureLabel(ctx) {
  if (!ctx.featureRef) return "no-feature";
  const ref = ctx.featureRef;
  return ref.includes("-") ? ref.split("-")[0] : ref;
}

// --- tool type classification ---

function isShellTool(toolName) {
  if (!toolName) return false;
  const names = ["bash", "shell", "terminal", "command", "exec", "run"];
  return names.some((n) => toolName.includes(n));
}

function isReadTool(toolName) {
  if (!toolName) return false;
  const names = ["read", "search", "list", "glob", "grep", "find", "cat", "view"];
  return names.some((n) => toolName.includes(n));
}

function isEditTool(toolName) {
  if (!toolName) return false;
  const names = ["edit", "write", "create", "delete", "remove", "patch", "replace", "insert", "append"];
  return names.some((n) => toolName.includes(n));
}

// --- before hook ---

async function handleBefore(root, input, output) {
  const toolName = extractToolName(input);
  const args = extractToolArgs(input, output);
  const command = extractCommand(input, output);
  const paths = extractPaths(input, output, root);
  const ctx = getFeatureContext(root);

  // block secret file reads/writes for any tool
  for (const p of paths) {
    if (isSecretPath(p)) {
      logBlock(root, ctx, "secret_path", toolName, p);
      throw makeBlockError(
        `LeanHarness blocked this OpenCode tool call because it attempted to access a secret path: ${p}.`
      );
    }
  }

  if (isShellTool(toolName) && command) {
    handleCommandBefore(root, ctx, toolName, command);
    return;
  }

  if (isReadTool(toolName)) {
    // reads are generally allowed — secret paths already blocked above
    return;
  }

  if (isEditTool(toolName)) {
    handleEditBefore(root, ctx, toolName, paths);
    return;
  }

  // for unknown tool types, check paths for edits if paths exist
  if (paths.length > 0) {
    handleEditBefore(root, ctx, toolName, paths);
  }
}

function handleCommandBefore(root, ctx, toolName, command) {
  const classification = classifyCommand(command);

  if (classification.decision === "block") {
    logBlock(root, ctx, "dangerous_command", toolName, command);
    throw makeBlockError(
      `LeanHarness blocked this OpenCode command because it is destructive: ${redactSecrets(safeString(command, 200))}.`
    );
  }

  if (classification.decision === "warn") {
    logWarn(root, ctx, "risky_command", toolName, command, classification.reason, classification.riskGate);
  }
}

function handleEditBefore(root, ctx, toolName, paths) {
  for (const p of paths) {
    // bootstrap paths always allowed
    if (isHarnessBootstrapPath(p)) continue;

    if (ctx.boundary) {
      // active boundary exists — enforce deterministically
      const check = isPathInsideBoundary(p, ctx.boundary);

      if (check.blocked) {
        logBlock(root, ctx, "blocked_path", toolName, p);
        throw makeBlockError(
          `LeanHarness blocked this OpenCode edit because ${p} is in the blocked list for ${featureLabel(ctx)}.`
        );
      }

      if (!check.inside) {
        logBlock(root, ctx, "out_of_boundary", toolName, p);
        throw makeBlockError(
          `LeanHarness blocked this OpenCode edit because ${p} is outside the active change boundary for ${featureLabel(ctx)}.`
        );
      }
    } else {
      // no boundary — block only clearly high-risk edits
      const risk = classifyPathRisk(p);
      if (risk.riskGate) {
        const highRisk = ["auth_rewrite", "payment_logic", "destructive_migration", "security_sensitive_change"];
        if (highRisk.includes(risk.riskGate)) {
          logWarn(root, ctx, "risk_gate_no_boundary", toolName, p, risk.reason, risk.riskGate);
        }
      }
    }
  }
}

// --- after hook ---

async function handleAfter(root, input, output) {
  const toolName = extractToolName(input);
  const command = extractCommand(input, output);
  const paths = extractPaths(input, output, root);
  const ctx = getFeatureContext(root);

  if (!ctx.featureDir) return;

  const resultStatus = extractResultStatus(output);

  logPluginEvent(root, ctx.featureDir, {
    event: "tool.execute.after",
    tool: toolName || "unknown",
    feature: ctx.featureRef || null,
    task: ctx.taskId || null,
    paths: paths.map((p) => redactSecrets(p)),
    command: command ? redactSecrets(safeString(command, 200)) : null,
    result: resultStatus,
    notes: [],
  });

  // check for out-of-boundary edits after the fact
  if (ctx.boundary && isEditTool(toolName)) {
    for (const p of paths) {
      if (isHarnessBootstrapPath(p)) continue;
      const check = isPathInsideBoundary(p, ctx.boundary);
      if (!check.inside && !check.blocked) {
        appendCaveBusNote(root, ctx.featureDir,
          `BOUNDARY ${featureLabel(ctx)} status:needs-update\nadd:\n- ${p} reason:OpenCode edit outside boundary\nnext:\n- update discovery.md and boundary.json before continuing`
        );
      }
    }
  }

  // log command results
  if (isShellTool(toolName) && command) {
    const classification = classifyCommand(command);
    if (resultStatus === "fail" || resultStatus === "error") {
      appendCaveBusNote(root, ctx.featureDir,
        `CMD ${featureLabel(ctx)}${ctx.taskId ? " " + ctx.taskId : ""} result:fail\ncmd:\n- ${redactSecrets(safeString(command, 200))}\nevidence:\n- OpenCode command event\nnext:\n- inspect failure`
      );
    } else if (classification.decision === "warn") {
      appendCaveBusNote(root, ctx.featureDir,
        `RISK ${featureLabel(ctx)} gate:${classification.riskGate || "risky_command"} status:executed\nreason:\n- ${classification.reason}\nevidence:\n- tool.execute.after ${toolName}\nnext:\n- verify outcome`
      );
    }
  }
}

function extractResultStatus(output) {
  if (!output) return "unknown";
  if (output.error || output.stderr) return "fail";
  if (output.exitCode !== undefined && output.exitCode !== null && output.exitCode !== 0) return "fail";
  if (output.exit_code !== undefined && output.exit_code !== null && output.exit_code !== 0) return "fail";
  if (output.success === false) return "fail";
  if (output.status === "error" || output.status === "fail") return output.status;
  return "success";
}

// --- event handler ---

async function handleEvent(root, event) {
  if (!event || typeof event !== "object") return;
  const ctx = getFeatureContext(root);
  if (!ctx.featureDir) return;

  const eventType = event.type || event.event || event.name || "";

  switch (eventType) {
    case "command.executed":
      handleCommandEvent(root, ctx, event);
      break;
    case "file.edited":
      handleFileEditedEvent(root, ctx, event);
      break;
    case "permission.asked":
      logPluginEvent(root, ctx.featureDir, {
        event: "permission.asked",
        feature: ctx.featureRef,
        tool: event.tool || event.toolName || null,
      });
      break;
    case "session.error":
      handleSessionError(root, ctx, event);
      break;
    case "session.compacted":
      appendCaveBusNote(root, ctx.featureDir,
        `NOTE ${featureLabel(ctx)} event:session.compacted\nreason:\n- OpenCode compacted the session context\nnext:\n- verify active task context is still loaded`
      );
      logPluginEvent(root, ctx.featureDir, {
        event: "session.compacted",
        feature: ctx.featureRef,
      });
      break;
    case "session.idle":
      handleSessionIdle(root, ctx, event);
      break;
    case "session.created":
    case "session.updated":
    case "session.diff":
      logPluginEvent(root, ctx.featureDir, {
        event: eventType,
        feature: ctx.featureRef,
      });
      break;
    default:
      // log unknown events without noise
      if (eventType) {
        logPluginEvent(root, ctx.featureDir, {
          event: eventType,
          feature: ctx.featureRef,
        });
      }
      break;
  }
}

function handleCommandEvent(root, ctx, event) {
  const command = event.command || event.cmd || "";
  const exitCode = event.exitCode ?? event.exit_code ?? null;
  const resultStatus = exitCode === 0 ? "success" : exitCode !== null ? "fail" : "unknown";

  logPluginEvent(root, ctx.featureDir, {
    event: "command.executed",
    feature: ctx.featureRef,
    task: ctx.taskId,
    command: redactSecrets(safeString(command, 200)),
    result: resultStatus,
  });

  if (resultStatus === "fail" && command) {
    appendCaveBusNote(root, ctx.featureDir,
      `CMD ${featureLabel(ctx)}${ctx.taskId ? " " + ctx.taskId : ""} result:fail\ncmd:\n- ${redactSecrets(safeString(command, 200))}\nevidence:\n- OpenCode command event exit:${exitCode}\nnext:\n- inspect failure`
    );
  }
}

function handleFileEditedEvent(root, ctx, event) {
  const filePath = event.path || event.filePath || event.file_path || "";
  if (!filePath) return;

  const relPath = filePath.startsWith("/")
    ? filePath.replace(root + "/", "").replace(root, "")
    : filePath;

  logPluginEvent(root, ctx.featureDir, {
    event: "file.edited",
    feature: ctx.featureRef,
    task: ctx.taskId,
    path: relPath,
  });

  if (ctx.boundary && !isHarnessBootstrapPath(relPath)) {
    const check = isPathInsideBoundary(relPath, ctx.boundary);
    if (!check.inside) {
      appendCaveBusNote(root, ctx.featureDir,
        `BOUNDARY ${featureLabel(ctx)} status:needs-update\nadd:\n- ${relPath} reason:OpenCode edit outside boundary\nnext:\n- update discovery.md and boundary.json before continuing`
      );
    }
  }
}

function handleSessionError(root, ctx, event) {
  const errMsg = event.error || event.message || "unknown error";
  appendCaveBusNote(root, ctx.featureDir,
    `ERR ${featureLabel(ctx)} session\nerr:\n- ${redactSecrets(safeString(errMsg, 200))}\nnext:\n- inspect session logs and mark task needs-fix or blocked`
  );
  logPluginEvent(root, ctx.featureDir, {
    event: "session.error",
    feature: ctx.featureRef,
    error: redactSecrets(safeString(errMsg, 200)),
  });
}

function handleSessionIdle(root, ctx, event) {
  logPluginEvent(root, ctx.featureDir, {
    event: "session.idle",
    feature: ctx.featureRef,
    task: ctx.taskId,
  });

  if (ctx.taskId) {
    appendCaveBusNote(root, ctx.featureDir,
      `NOTE ${featureLabel(ctx)} ${ctx.taskId} event:session.idle\nreason:\n- OpenCode session idle during active task\nnext:\n- write task summary if edits complete, or continue building`
    );
  }
}

// --- logging helpers ---

function logBlock(root, ctx, reason, toolName, target) {
  if (!ctx.featureDir) return;

  logPluginEvent(root, ctx.featureDir, {
    event: "guardrail.block",
    feature: ctx.featureRef,
    task: ctx.taskId,
    tool: toolName,
    reason,
    target: redactSecrets(safeString(target, 200)),
  });

  const riskInfo = classifyPathRisk(target);
  if (reason === "out_of_boundary") {
    appendCaveBusNote(root, ctx.featureDir,
      `BOUNDARY ${featureLabel(ctx)} status:blocked\nadd:\n- ${redactSecrets(target)} reason:OpenCode edit outside boundary\nnext:\n- update discovery.md and boundary.json or avoid edit`
    );
  } else if (reason === "dangerous_command") {
    appendCaveBusNote(root, ctx.featureDir,
      `RISK ${featureLabel(ctx)} gate:dangerous_command status:blocked\nreason:\n- OpenCode attempted destructive command\nevidence:\n- tool.execute.before ${toolName}\nnext:\n- use safe alternative`
    );
  } else if (reason === "secret_path") {
    appendCaveBusNote(root, ctx.featureDir,
      `RISK ${featureLabel(ctx)} gate:secret_access status:blocked\nreason:\n- OpenCode attempted access to secret path\nevidence:\n- tool.execute.before ${toolName}\nnext:\n- do not access secret files`
    );
  } else if (riskInfo.riskGate) {
    appendCaveBusNote(root, ctx.featureDir,
      `RISK ${featureLabel(ctx)} gate:${riskInfo.riskGate} status:blocked\nreason:\n- ${riskInfo.reason}\nevidence:\n- tool.execute.before ${toolName}\nnext:\n- update boundary or avoid edit`
    );
  }
}

function logWarn(root, ctx, reason, toolName, target, detail, riskGate) {
  if (!ctx.featureDir) return;

  logPluginEvent(root, ctx.featureDir, {
    event: "guardrail.warn",
    feature: ctx.featureRef,
    task: ctx.taskId,
    tool: toolName,
    reason,
    target: redactSecrets(safeString(target, 200)),
    detail: detail || null,
    riskGate: riskGate || null,
  });

  if (riskGate) {
    appendCaveBusNote(root, ctx.featureDir,
      `RISK ${featureLabel(ctx)} gate:${riskGate} status:triggered\nreason:\n- ${redactSecrets(safeString(detail || target, 200))}\nevidence:\n- tool.execute.before ${toolName}\nnext:\n- update boundary or avoid edit`
    );
  }
}
