import { spawn } from "node:child_process";
import type { AgentAdapter, AgentDetection, AgentRunInput, AgentRunResult } from "./types.js";

export type ClaudeCodeRunOptions = AgentRunInput;

function killClaudeProcess(proc: ReturnType<typeof spawn>, signal: NodeJS.Signals): void {
  if (!proc.pid) return;

  // On POSIX, kill the whole process group so wrapper scripts cannot leave children running.
  if (process.platform !== "win32") {
    try {
      process.kill(-proc.pid, signal);
      return;
    } catch {
      // Fall back to direct child kill below.
    }
  }

  try {
    proc.kill(signal);
  } catch {
    // Process already exited.
  }
}

export function buildClaudeCodeArgs(input: AgentRunInput): string[] {
  const args: string[] = [];

  args.push("-p", input.prompt);
  args.push("--cwd", input.workingDir ?? input.root);

  if (input.allowedTools && input.allowedTools.length > 0) {
    args.push("--allowedTools", input.allowedTools.join(","));
  }

  if (input.permissionMode) {
    args.push("--permission-mode", input.permissionMode);
  }

  if (input.outputFormat) {
    args.push("--output-format", input.outputFormat);
  }

  if (input.model) {
    args.push("--model", input.model);
  }

  return args;
}

export async function detectClaudeCode(
  _root: string,
  claudeCommand?: string,
): Promise<AgentDetection> {
  const cmd = claudeCommand ?? "claude";

  return new Promise((resolve) => {
    const proc = spawn(cmd, ["--version"], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err: Error) => {
      resolve({
        host: "claude-code",
        available: false,
        command: cmd,
        error: err.message,
      });
    });

    proc.on("close", (code) => {
      if (code === 0 && stdout.trim()) {
        resolve({
          host: "claude-code",
          available: true,
          command: cmd,
          version: stdout.trim().split("\n")[0],
        });
      } else {
        resolve({
          host: "claude-code",
          available: false,
          command: cmd,
          error: stderr.trim() || `exited with code ${code}`,
        });
      }
    });
  });
}

export async function runClaudeCode(input: ClaudeCodeRunOptions): Promise<AgentRunResult> {
  const cmd = input.claudeCommand ?? "claude";
  const args = buildClaudeCodeArgs(input);
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  if (input.dryRun) {
    return {
      host: "claude-code",
      ok: true,
      command: [cmd, ...args],
      stdout: "",
      stderr: "",
      exitCode: null,
      signal: null,
      startedAt,
      finishedAt: startedAt,
      durationMs: 0,
      dryRun: true,
      timedOut: false,
      aborted: false,
    };
  }

  // If already aborted, return immediately
  if (input.signal?.aborted) {
    return {
      host: "claude-code",
      ok: false,
      command: [cmd, ...args],
      stdout: "",
      stderr: "aborted before start",
      exitCode: null,
      signal: null,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startMs,
      dryRun: false,
      timedOut: false,
      aborted: true,
    };
  }

  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: input.workingDir ?? input.root,
      detached: process.platform !== "win32",
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let aborted = false;
    let settled = false;

    // Timeout enforcement
    const timer = setTimeout(() => {
      timedOut = true;
      killClaudeProcess(proc, "SIGTERM");
      setTimeout(() => {
        killClaudeProcess(proc, "SIGKILL");
      }, 5000);
    }, input.timeout ?? 1_800_000);

    // AbortSignal handling
    if (input.signal) {
      input.signal.addEventListener("abort", () => {
        aborted = true;
        killClaudeProcess(proc, "SIGTERM");
        setTimeout(() => {
          killClaudeProcess(proc, "SIGKILL");
        }, 5000);
      }, { once: true });
    }

    // Signal forwarding
    const forwardSignal = (sig: NodeJS.Signals) => { killClaudeProcess(proc, sig); };
    process.on("SIGINT", forwardSignal);
    process.on("SIGTERM", forwardSignal);

    proc.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      input.onStdout?.(text);
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      input.onStderr?.(text);
    });

    proc.on("error", (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      process.removeListener("SIGINT", forwardSignal);
      process.removeListener("SIGTERM", forwardSignal);
      const finishedAt = new Date().toISOString();
      resolve({
        host: "claude-code",
        ok: false,
        command: [cmd, ...args],
        stdout,
        stderr: stderr + "\n" + err.message,
        exitCode: null,
        signal: null,
        startedAt,
        finishedAt,
        durationMs: Date.now() - startMs,
        dryRun: false,
        timedOut,
        aborted,
      });
    });

    proc.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      process.removeListener("SIGINT", forwardSignal);
      process.removeListener("SIGTERM", forwardSignal);
      const finishedAt = new Date().toISOString();
      resolve({
        host: "claude-code",
        ok: !timedOut && !aborted && code === 0,
        command: [cmd, ...args],
        stdout,
        stderr,
        exitCode: code,
        signal: signal as NodeJS.Signals | null,
        startedAt,
        finishedAt,
        durationMs: Date.now() - startMs,
        dryRun: false,
        timedOut,
        aborted,
      });
    });
  });
}

export const claudeCodeAdapter: AgentAdapter = {
  host: "claude-code",
  run: runClaudeCode,
  detect: detectClaudeCode,
};
