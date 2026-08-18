import { spawn } from "node:child_process";

export type CommandResultStatus = "pass" | "fail" | "skipped" | "not run";

export interface VerificationCommand {
  command: string;
  source: string;
  purpose: string;
  required: boolean;
}

export interface VerificationCommandResult {
  command: string;
  source: string;
  purpose: string;
  required: boolean;
  result: CommandResultStatus;
  exitCode: number | null;
  stdoutPreview: string;
  stderrPreview: string;
  durationMs: number;
  evidence: string;
  notes: string[];
}

export interface RunVerificationCommandsOptions {
  root: string;
  commands: VerificationCommand[];
  run: boolean;
  maxCommandMs: number;
}

const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\brm\s+-rf\b/i, reason: "recursive file deletion" },
  { pattern: /\brm\s+-r\b/i, reason: "recursive file deletion" },
  { pattern: /\bgit\s+reset\s+--hard\b/i, reason: "destructive git reset" },
  { pattern: /\bgit\s+clean\s+-fd\b/i, reason: "destructive git clean" },
  { pattern: /\bgit\s+push\b/i, reason: "pushes to remote" },
  { pattern: /\bgit\s+push\s+/i, reason: "pushes to remote" },
  { pattern: /\bdeploy\b/i, reason: "deployment command" },
  { pattern: /\bnpm\s+install\b/i, reason: "installs dependencies" },
  { pattern: /\bnpm\s+i\b/i, reason: "installs dependencies" },
  { pattern: /\bpnpm\s+(add|install)\b/i, reason: "installs dependencies" },
  { pattern: /\byarn\s+add\b/i, reason: "installs dependencies" },
  { pattern: /\byarn\s+install\b/i, reason: "installs dependencies" },
  { pattern: /\bbun\s+add\b/i, reason: "installs dependencies" },
  { pattern: /\bbun\s+install\b/i, reason: "installs dependencies" },
  { pattern: /\bpip\s+install\b/i, reason: "installs dependencies" },
  { pattern: /\bDROP\s+(DATABASE|TABLE)\b/i, reason: "destructive database operation" },
  { pattern: /\bmigrate\s+reset\b/i, reason: "destructive migration reset" },
  { pattern: /\bdb\s+reset\b/i, reason: "destructive database reset" },
  { pattern: /\bcat\s+\.env\b/i, reason: "reads environment secrets" },
  { pattern: /\bprintenv\b/i, reason: "prints environment variables" },
  { pattern: /^env$/i, reason: "prints environment variables" },
  { pattern: /\bmkfs\b/i, reason: "formats filesystem" },
  { pattern: /\bdd\s+if=/i, reason: "raw disk write" },
  { pattern: /\bcurl\s+.*\|\s*(sh|bash)\b/i, reason: "pipes remote content to shell" },
];

const SAFE_PATTERNS: RegExp[] = [
  /^npm\s+test$/i,
  /^npm\s+run\s+(test|lint|typecheck|check|build)$/i,
  /^npx\s+(jest|vitest|playwright|cypress)\b/i,
  /^pnpm\s+(test|lint|typecheck|run\s+(test|lint|typecheck))$/i,
  /^yarn\s+(test|lint|typecheck|run\s+(test|lint|typecheck))$/i,
  /^bun\s+test$/i,
  /^pytest\b/i,
  /^python\s+-m\s+pytest\b/i,
  /^go\s+test\b/i,
  /^cargo\s+test\b/i,
  /^mvn\s+test\b/i,
  /^\.\/gradlew\s+test\b/i,
  /^gradle\s+test\b/i,
  /^composer\s+test\b/i,
  /^make\s+test\b/i,
  /^git\s+diff\b/i,
  /^git\s+status\b/i,
  /^git\s+log\b/i,
  /^node\s+--test\b/i,
  /^tsc\s+--noEmit\b/i,
  /^tsc\b.*--noEmit\b/i,
  /^eslint\b/i,
  /^prettier\s+--check\b/i,
];

export function isClearlyDangerousCommand(command: string): { dangerous: boolean; reason?: string } {
  const trimmed = command.trim();
  for (const { pattern, reason } of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { dangerous: true, reason };
    }
  }
  return { dangerous: false };
}

export function isSafeVerificationCommand(command: string): boolean {
  const trimmed = command.trim();
  return SAFE_PATTERNS.some((p) => p.test(trimmed));
}

export function extractVerificationCommands(input: {
  boundary: unknown | null;
  planMarkdown: string | null;
  tasksMarkdown: string | null;
  taskSummaries: Array<{ path: string; content: string }>;
  explicitCommands: string[];
}): VerificationCommand[] {
  const seen = new Set<string>();
  const commands: VerificationCommand[] = [];

  function add(cmd: string, source: string, purpose: string, required: boolean): void {
    const trimmed = cmd.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    commands.push({ command: trimmed, source, purpose, required });
  }

  if (input.boundary && typeof input.boundary === "object") {
    const b = input.boundary as Record<string, unknown>;
    const cmds = b["commands"];
    if (Array.isArray(cmds)) {
      for (const c of cmds) {
        if (typeof c === "object" && c !== null) {
          const entry = c as Record<string, unknown>;
          if (typeof entry["command"] === "string") {
            add(
              entry["command"] as string,
              "boundary.json",
              (typeof entry["purpose"] === "string" ? entry["purpose"] as string : "discovered command"),
              false,
            );
          }
        }
      }
    }
  }

  if (input.planMarkdown) {
    const verifySection = extractSection(input.planMarkdown, "verification");
    const testSection = extractSection(input.planMarkdown, "test strategy");
    for (const section of [verifySection, testSection]) {
      const codeBlocks = extractCodeBlocks(section);
      for (const block of codeBlocks) {
        for (const line of block.split("\n")) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith("#") && !trimmed.startsWith("//")) {
            add(trimmed, "plan.md", "verification command from plan", false);
          }
        }
      }
      const inlineCommands = extractInlineCommands(section);
      for (const cmd of inlineCommands) {
        add(cmd, "plan.md", "verification command from plan", false);
      }
    }
  }

  if (input.tasksMarkdown) {
    const lines = input.tasksMarkdown.split("\n");
    let inVerifSection = false;
    for (const line of lines) {
      if (/^\s*-\s+Verification commands:/i.test(line)) {
        inVerifSection = true;
        const inline = line.replace(/^\s*-\s+Verification commands:\s*/i, "").trim();
        if (inline) add(inline, "tasks.md", "task verification command", false);
        continue;
      }
      if (inVerifSection) {
        if (/^\s+-\s+/.test(line)) {
          const cmd = line.replace(/^\s+-\s+/, "").trim().replace(/^`|`$/g, "");
          if (cmd) add(cmd, "tasks.md", "task verification command", false);
        } else if (line.trim() === "" || /^\s*-\s+\w+:/i.test(line) || /^#/.test(line)) {
          inVerifSection = false;
        }
      }
    }
  }

  for (const summary of input.taskSummaries) {
    const cmdSection = extractSection(summary.content, "commands run");
    const items = extractListBullets(cmdSection);
    for (const item of items) {
      const cmd = item.replace(/^`|`$/g, "").trim();
      if (cmd && !cmd.startsWith("No ") && !cmd.startsWith("Unknown")) {
        add(cmd, `task-summary:${summary.path}`, "previously run command", false);
      }
    }
  }

  for (const cmd of input.explicitCommands) {
    add(cmd, "explicit --command flag", "user-provided verification command", true);
  }

  return commands;
}

export async function runVerificationCommands(
  options: RunVerificationCommandsOptions,
): Promise<VerificationCommandResult[]> {
  const results: VerificationCommandResult[] = [];

  for (const cmd of options.commands) {
    if (!options.run) {
      results.push({
        ...cmd,
        result: "not run",
        exitCode: null,
        stdoutPreview: "",
        stderrPreview: "",
        durationMs: 0,
        evidence: "command not run (--no-run or default safe mode)",
        notes: [],
      });
      continue;
    }

    const danger = isClearlyDangerousCommand(cmd.command);
    if (danger.dangerous) {
      results.push({
        ...cmd,
        result: "skipped",
        exitCode: null,
        stdoutPreview: "",
        stderrPreview: "",
        durationMs: 0,
        evidence: `skipped: ${danger.reason}`,
        notes: [`Dangerous command skipped: ${danger.reason}`],
      });
      continue;
    }

    const safe = isSafeVerificationCommand(cmd.command);
    if (!safe && cmd.source !== "explicit --command flag") {
      results.push({
        ...cmd,
        result: "skipped",
        exitCode: null,
        stdoutPreview: "",
        stderrPreview: "",
        durationMs: 0,
        evidence: "skipped: command not recognized as safe and not explicitly provided",
        notes: ["Use --command to explicitly approve this command."],
      });
      continue;
    }

    try {
      const runResult = await executeCommand(cmd.command, options.root, options.maxCommandMs);
      const passed = runResult.exitCode === 0;
      results.push({
        ...cmd,
        result: passed ? "pass" : "fail",
        exitCode: runResult.exitCode,
        stdoutPreview: truncate(runResult.stdout, 2000),
        stderrPreview: truncate(runResult.stderr, 1000),
        durationMs: runResult.durationMs,
        evidence: passed
          ? `command exited 0 in ${runResult.durationMs}ms`
          : `command exited ${runResult.exitCode} in ${runResult.durationMs}ms`,
        notes: runResult.timedOut ? ["Command timed out"] : [],
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        ...cmd,
        result: "fail",
        exitCode: null,
        stdoutPreview: "",
        stderrPreview: msg.slice(0, 500),
        durationMs: 0,
        evidence: `execution error: ${msg.slice(0, 200)}`,
        notes: [`Failed to execute: ${msg.slice(0, 200)}`],
      });
    }
  }

  return results;
}

interface CommandExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

function executeCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
): Promise<CommandExecResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    const proc = spawn(command, [], { cwd, shell: true, stdio: "pipe" });

    proc.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
      if (stdout.length > 50000) stdout = stdout.slice(0, 50000);
    });

    proc.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
      if (stderr.length > 50000) stderr = stderr.slice(0, 50000);
    });

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
      setTimeout(() => {
        try { proc.kill("SIGKILL"); } catch { /* already dead */ }
      }, 3000);
    }, timeoutMs);

    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        timedOut,
      });
    });

    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode: 1,
        stdout,
        stderr: stderr + "\n" + err.message,
        durationMs: Date.now() - start,
        timedOut: false,
      });
    });
  });
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "\n[truncated]";
}

function extractSection(markdown: string, heading: string): string {
  const lines = markdown.split("\n");
  const lower = heading.toLowerCase();
  let capturing = false;
  let level = 0;
  const result: string[] = [];

  for (const line of lines) {
    const hm = /^(#{1,6})\s+(.*)$/.exec(line);
    if (hm) {
      if (capturing && hm[1]!.length <= level) break;
      if (!capturing && hm[2]!.trim().toLowerCase().includes(lower)) {
        capturing = true;
        level = hm[1]!.length;
        continue;
      }
    }
    if (capturing) result.push(line);
  }

  return result.join("\n");
}

function extractCodeBlocks(text: string): string[] {
  const blocks: string[] = [];
  const re = /```(?:\w*)\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) blocks.push(m[1]);
  }
  return blocks;
}

function extractInlineCommands(text: string): string[] {
  const commands: string[] = [];
  const re = /`([^`]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const cmd = m[1]!.trim();
    if (cmd.includes(" ") && (cmd.startsWith("npm") || cmd.startsWith("pnpm") || cmd.startsWith("yarn") ||
        cmd.startsWith("pytest") || cmd.startsWith("go ") || cmd.startsWith("cargo ") ||
        cmd.startsWith("bun ") || cmd.startsWith("node ") || cmd.startsWith("make "))) {
      commands.push(cmd);
    }
  }
  return commands;
}

function extractListBullets(text: string): string[] {
  const items: string[] = [];
  for (const line of text.split("\n")) {
    const m = /^\s*-\s+(.+)$/.exec(line);
    if (m) items.push(m[1]!.trim());
  }
  return items;
}
