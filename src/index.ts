#!/usr/bin/env node

import { runCli } from "./cli.js";
import { CLIError } from "./core/errors.js";

runCli(process.argv.slice(2)).catch((err: unknown) => {
  if (err instanceof CLIError) {
    process.stderr.write(`[error] ${err.message}\n`);
    process.exitCode = err.exitCode;
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[error] ${message}\n`);
  process.stderr.write(
    `\nThis is a bug in LeanHarness. Please report it at:\n  https://github.com/leanharness/leanharness/issues\n`,
  );
  process.exitCode = 1;
});
