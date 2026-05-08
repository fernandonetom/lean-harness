import { spawn } from "node:child_process";
import type { AgentAdapter, AgentDetection, AgentRunInput, AgentRunResult } from "./types.js";

export type OpenCodeRunOptions = AgentRunInput;

export function buildOpenCodeArgs(input: AgentRunInput): string[] {
  const args: string[] = ["run"];

  if (input.opencodeAgent) {
    args.push("--agent", input.opencodeAgent);
  }

  const format = input.opencodeFormat ?? "json";
  args.push("--format", format);

  if (input.model) {
    args.push("--model", input.model);
  }

  if (input.attach) {
    args.push("--attach", input.attach);
  }

  if (input.session) {
    args.push("--session", input.session);
  }

  const title = `LeanHarness ${input.featureRef} ${input.taskId}`;
  args.push("--title", title);

  args.push(input.prompt);

  return args;
}

export async function detectOpenCode(
  _root: string,
  opencodeCommand?: string,
): Promise<AgentDetection> {
  const cmd = opencodeCommand ?? "opencode";

  const tryVersionFlag = (flag: string): Promise<AgentDetection | null> =>
    new Promise((resolve) => {
      const proc = spawn(cmd, [flag], {
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

      proc.on("error", () => {
        resolve(null);
      });

      proc.on("close", (code) => {
        if (code === 0 && stdout.trim()) {
          resolve({
            host: "opencode",
            available: true,
            command: cmd,
            version: stdout.trim().split("\n")[0],
          });
        } else {
          resolve(null);
        }
      });
    });

  const result = await tryVersionFlag("--version");
  if (result) return result;

  const fallback = await tryVersionFlag("version");
  if (fallback) return fallback;

  return {
    host: "opencode",
    available: false,
    command: cmd,
    error: `${cmd} not found or does not support --version / version`,
  };
}

export async function runOpenCode(input: OpenCodeRunOptions): Promise<AgentRunResult> {
  const cmd = input.opencodeCommand ?? "opencode";
  const args = buildOpenCodeArgs(input);
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  if (input.dryRun) {
    return {
      host: "opencode",
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
      host: "opencode",
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
      cwd: input.root,
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let aborted = false;
    let settled = false;

    // Timeout enforcement
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
      setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch { /* already dead */ }
      }, 5000);
    }, input.timeout ?? 1_800_000);

    // AbortSignal handling
    if (input.signal) {
      input.signal.addEventListener("abort", () => {
        aborted = true;
        proc.kill("SIGTERM");
        setTimeout(() => {
          try { proc.kill("SIGKILL"); } catch { /* already dead */ }
        }, 5000);
      }, { once: true });
    }

    // Signal forwarding
    const forwardSignal = (sig: NodeJS.Signals) => { try { proc.kill(sig); } catch { /* already dead */ } };
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
        host: "opencode",
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
        host: "opencode",
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

export const opencodeAdapter: AgentAdapter = {
  host: "opencode",
  run: runOpenCode,
  detect: detectOpenCode,
};
