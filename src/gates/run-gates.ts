import { execFile } from "node:child_process";
import path from "node:path";
import { writeTextFile, fileExists } from "../core/fs.js";
import { nowIso } from "../core/state.js";
import type { RunGatesInput, GateArtifact, GateResult, GateDiagnostic } from "./types.js";

export async function runGates(input: RunGatesInput): Promise<GateArtifact> {
  const { root, featureDir, taskId, touchedFiles, gates } = input;

  if (!gates.enabled || touchedFiles.length === 0) {
    const artifact: GateArtifact = {
      schema: "v1",
      featureId: String(path.basename(featureDir)),
      passedAt: nowIso(),
      gates: [],
      overallResult: "pass",
      touchedFiles: [...touchedFiles],
    };
    if (taskId !== undefined) artifact.taskId = taskId;
    return artifact;
  }

  const filtered = filterFiles(touchedFiles, gates.include_globs, gates.exclude_globs);

  const results: GateResult[] = [];

  if (gates.typecheck !== "off") {
    const typecheckResult = await runTypecheckGate(root, filtered, gates);
    results.push(typecheckResult);
  }

  if (gates.lint !== "off") {
    const lintResult = await runLintGate(root, filtered, gates);
    results.push(lintResult);
  }

  if (gates.test !== "off") {
    const testResult = await runTestGate(root, filtered, gates);
    results.push(testResult);
  }

  const overallResult = computeOverallResult(results, gates.fail_task_on);

  const artifact: GateArtifact = {
    schema: "v1",
    featureId: String(path.basename(featureDir)),
    passedAt: nowIso(),
    gates: results,
    overallResult,
    touchedFiles: [...filtered],
  };
  if (taskId !== undefined) artifact.taskId = taskId;

  const artifactPath = path.join(featureDir, "gate-artifact.json");
  await writeTextFile(artifactPath, JSON.stringify(artifact, null, 2) + "\n", { overwrite: true });

  return artifact;
}

function computeOverallResult(
  results: GateResult[],
  failTaskOn: "error" | "warning",
): "pass" | "fail" | "error" {
  let hasError = false;
  let hasFail = false;

  for (const r of results) {
    if (r.result === "error") hasError = true;
    if (r.result === "fail") hasFail = true;
  }

  if (hasError) return "error";
  if (hasFail) return "fail";

  if (failTaskOn === "warning") {
    for (const r of results) {
      if (r.result === "pass" && r.diagnostics && r.diagnostics.length > 0) {
        const hasWarnings = r.diagnostics.some((d) => d.severity === "warning");
        if (hasWarnings) return "fail";
      }
    }
  }

  return "pass";
}

async function runTypecheckGate(
  root: string,
  filtered: string[],
  gates: RunGatesInput["gates"],
): Promise<GateResult> {
  const tsFiles = filtered.filter((f) => /\.(ts|tsx|mts|cts)$/i.test(f));

  if (gates.typecheck === "touched" && tsFiles.length === 0) {
    return {
      id: "typecheck",
      kind: "typecheck",
      result: "skipped",
      evidence: "no TypeScript files in touched set",
    };
  }

  try {
    const args = ["tsc", "--noEmit"];
    const { stdout, stderr, exitCode } = await execFileAsync("npx", args, { cwd: root });

    const allDiagnostics = parseTypeScriptDiagnostics(stderr || stdout);

    let relevant: GateDiagnostic[];
    if (gates.typecheck === "touched") {
      relevant = allDiagnostics.filter((d) => tsFiles.some((f) => f === d.file));
    } else {
      relevant = allDiagnostics;
    }

    if (relevant.length === 0 && exitCode !== 0) {
      return {
        id: "typecheck",
        kind: "typecheck",
        result: "fail",
        evidence: `tsc exited ${exitCode} with errors outside touched files`,
      };
    }

    if (relevant.length === 0) {
      return {
        id: "typecheck",
        kind: "typecheck",
        result: "pass",
        evidence: "no type errors in touched files",
      };
    }

    const hasErrors = relevant.some((d) => d.severity === "error");
    return {
      id: "typecheck",
      kind: "typecheck",
      result: hasErrors ? "fail" : "pass",
      evidence: `${relevant.length} diagnostic(s) in touched files`,
      diagnostics: relevant,
    };
  } catch (err: unknown) {
    return {
      id: "typecheck",
      kind: "typecheck",
      result: "error",
      evidence: err instanceof Error ? err.message : String(err),
    };
  }
}

export function parseTypeScriptDiagnostics(output: string): GateDiagnostic[] {
  const lines = output.split("\n");
  const diagnostics: GateDiagnostic[] = [];
  const re = /^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s+TS\d+:\s*(.+)$/;

  for (const line of lines) {
    const m = re.exec(line.trim());
    if (!m) continue;
    const [, file, lineStr, colStr, severity, message] = m;
    diagnostics.push({
      file: file!,
      line: parseInt(lineStr!, 10),
      column: parseInt(colStr!, 10),
      severity: severity === "error" ? "error" : "warning",
      message: message!,
    });
  }

  return diagnostics;
}

async function runLintGate(
  root: string,
  filtered: string[],
  _gates: RunGatesInput["gates"],
): Promise<GateResult> {
  const lintable = filtered.filter((f) => /\.(ts|tsx|js|jsx|mts|cts)$/i.test(f));

  if (lintable.length === 0) {
    return {
      id: "lint",
      kind: "lint",
      result: "skipped",
      evidence: "no lintable files in touched set",
    };
  }

  const configExists =
    (await fileExists(path.join(root, ".eslintrc.js"))) ||
    (await fileExists(path.join(root, ".eslintrc.cjs"))) ||
    (await fileExists(path.join(root, ".eslintrc.json"))) ||
    (await fileExists(path.join(root, ".eslintrc.yaml"))) ||
    (await fileExists(path.join(root, ".eslintrc.yml"))) ||
    (await fileExists(path.join(root, ".eslintrc"))) ||
    (await fileExists(path.join(root, "eslint.config.js"))) ||
    (await fileExists(path.join(root, "eslint.config.mjs"))) ||
    (await fileExists(path.join(root, "eslint.config.cjs")));

  if (!configExists) {
    return {
      id: "lint",
      kind: "lint",
      result: "skipped",
      evidence: "no ESLint config found",
    };
  }

  try {
    const args = ["eslint", ...lintable];
    const { exitCode, stdout, stderr } = await execFileAsync("npx", args, { cwd: root });

    if (exitCode === 0) {
      return {
        id: "lint",
        kind: "lint",
        result: "pass",
        evidence: "no lint errors in touched files",
      };
    }

    const output = stdout || stderr || "";
    return {
      id: "lint",
      kind: "lint",
      result: "fail",
      evidence: `lint exited ${exitCode}`,
      diagnostics: parseLintOutput(output, lintable),
    };
  } catch (err: unknown) {
    return {
      id: "lint",
      kind: "lint",
      result: "error",
      evidence: err instanceof Error ? err.message : String(err),
    };
  }
}

function parseLintOutput(output: string, files: string[]): GateDiagnostic[] {
  const diagnostics: GateDiagnostic[] = [];
  const re = /^(.+?):(\d+):(\d+):\s*(error|warning)\s+(.+)$/;

  for (const line of output.split("\n")) {
    const m = re.exec(line.trim());
    if (!m) continue;
    const [, file, lineStr, colStr, severity, message] = m;
    if (!files.some((f) => f === file)) continue;
    diagnostics.push({
      file: file!,
      line: parseInt(lineStr!, 10),
      column: parseInt(colStr!, 10),
      severity: severity === "error" ? "error" : "warning",
      message: message!,
    });
  }

  return diagnostics;
}

async function runTestGate(
  root: string,
  filtered: string[],
  gates: RunGatesInput["gates"],
): Promise<GateResult> {
  if (gates.test === "related") {
    const testFiles = filtered.filter((f) => /\.(test|spec)\.(ts|tsx|js|jsx|mts|cts)$/i.test(f));

    if (testFiles.length === 0) {
      return {
        id: "test",
        kind: "test",
        result: "skipped",
        evidence: "no test files in touched set",
      };
    }

    try {
      const args = ["vitest", "run", ...testFiles];
      const { exitCode, stdout, stderr } = await execFileAsync("npx", args, { cwd: root });

      const output = stdout || stderr || "";
      if (exitCode === 0) {
        const passed = extractTestCount(output, "passed");
        return {
          id: "test",
          kind: "test",
          result: "pass",
          evidence: `${testFiles.length} test file(s), ${passed} test(s) passed`,
        };
      }

      const failed = extractTestCount(output, "failed");
      return {
        id: "test",
        kind: "test",
        result: "fail",
        evidence: `${testFiles.length} test file(s), ${failed} test(s) failed`,
        diagnostics: parseVitestFailures(output),
      };
    } catch (err: unknown) {
      return {
        id: "test",
        kind: "test",
        result: "error",
        evidence: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return {
    id: "test",
    kind: "test",
    result: "skipped",
    evidence: "test gate disabled",
  };
}

function extractTestCount(output: string, kind: string): number {
  const re = new RegExp(`Tests\\s+\\d+\\s+${kind}\\s*\\(\\d+\\)`, "i");
  const m = re.exec(output);
  if (!m) return 0;
  const numRe = /Tests\s+(\d+)\s+/i.exec(m[0]);
  return numRe ? parseInt(numRe[1]!, 10) : 0;
}

function parseVitestFailures(output: string): GateDiagnostic[] {
  const diagnostics: GateDiagnostic[] = [];
  const lines = output.split("\n");

  for (const line of lines) {
    const m = /^\s*[×x]\s+(.+?)\s+>\s+(.+?)$/i.exec(line.trim());
    if (m) {
      diagnostics.push({
        file: m[1]!,
        severity: "error",
        message: m[2]!,
      });
      continue;
    }

    const failRe = /^(.+?):(\d+):(\d+)\s+-\s+(.+)$/;
    const fm = failRe.exec(line.trim());
    if (fm) {
      diagnostics.push({
        file: fm[1]!,
        line: parseInt(fm[2]!, 10),
        column: parseInt(fm[3]!, 10),
        severity: "error",
        message: fm[4]!,
      });
    }
  }

  return diagnostics;
}

interface ExecFileResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function execFileAsync(
  file: string,
  args: string[],
  options: { cwd: string },
): Promise<ExecFileResult> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { cwd: options.cwd, timeout: 120_000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        const exitCode = (error as NodeJS.ErrnoException & { code?: unknown }).code;
        if (typeof exitCode === "number") {
          resolve({ stdout: stdout.toString(), stderr: stderr.toString(), exitCode });
        } else if ("killed" in error && error.killed) {
          reject(new Error(`Command timed out: ${file} ${args.join(" ")}`));
        } else {
          const exitCodeNum = typeof (error as Record<string, unknown>)["status"] === "number"
            ? (error as Record<string, unknown>)["status"] as number
            : 1;
          resolve({ stdout: stdout.toString(), stderr: stderr.toString(), exitCode: exitCodeNum });
        }
      } else {
        resolve({ stdout: stdout.toString(), stderr: stderr.toString(), exitCode: 0 });
      }
    });
  });
}

export function filterFiles(
  paths: string[],
  includeGlobs: string[],
  excludeGlobs: string[],
): string[] {
  return paths.filter((p) => {
    if (!matchesAnyGlob(p, includeGlobs)) return false;
    if (matchesAnyGlob(p, excludeGlobs)) return false;
    return true;
  });
}

export function matchesAnyGlob(file: string, globs: string[]): boolean {
  if (globs.length === 0) return false;
  return globs.some((g) => matchesGlob(file, g));
}

function matchesGlob(file: string, pattern: string): boolean {
  const re = globToRegex(pattern);
  return re.test(file);
}

function globToRegex(pattern: string): RegExp {
  let processed = pattern.replace(/\{([^}]+)\}/g, (_full: string, inner: string) => {
    const options = inner.split(",");
    return `(${options.join("|")})`;
  });

  processed = processed
    .replace(/[.+^${}[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "<<<GLOBSTAR>>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<<GLOBSTAR>>>/g, ".*")
    .replace(/\?/g, ".");

  return new RegExp(`^${processed}$`);
}
