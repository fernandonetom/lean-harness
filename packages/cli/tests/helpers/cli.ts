import { runCli } from "../../src/cli.js";
import { CLIError } from "../../src/core/errors.js";

export interface CliRunResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export async function runCliInProcess(argv: string[]): Promise<CliRunResult> {
  let stdout = "";
  let stderr = "";
  let exitCode: number | null = null;

  const origStdoutWrite = process.stdout.write.bind(process.stdout);
  const origStderrWrite = process.stderr.write.bind(process.stderr);

  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
    return true;
  }) as typeof process.stdout.write;

  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
    return true;
  }) as typeof process.stderr.write;

  try {
    await runCli(argv);
  } catch (err: unknown) {
    if (err instanceof CLIError) {
      stderr += `[error] ${err.message}\n`;
      exitCode = err.exitCode;
    } else {
      throw err;
    }
  } finally {
    process.stdout.write = origStdoutWrite;
    process.stderr.write = origStderrWrite;
  }

  return { stdout, stderr, exitCode };
}
