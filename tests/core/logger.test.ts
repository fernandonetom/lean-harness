import { describe, it, expect, vi, afterEach } from "vitest";
import { createLogger } from "../../src/core/logger.js";

describe("createLogger", () => {
  const originalWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  let stdoutOutput: string;
  let stderrOutput: string;

  function captureOutput() {
    stdoutOutput = "";
    stderrOutput = "";
    process.stdout.write = ((chunk: string) => {
      stdoutOutput += chunk;
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string) => {
      stderrOutput += chunk;
      return true;
    }) as typeof process.stderr.write;
  }

  afterEach(() => {
    process.stdout.write = originalWrite;
    process.stderr.write = originalStderrWrite;
  });

  it("info writes to stdout", () => {
    const log = createLogger();
    captureOutput();
    log.info("hello");
    expect(stdoutOutput).toBe("hello\n");
  });

  it("success prefixes with [ok]", () => {
    const log = createLogger();
    captureOutput();
    log.success("done");
    expect(stdoutOutput).toContain("[ok]");
    expect(stdoutOutput).toContain("done");
  });

  it("warn writes to stderr with [warn]", () => {
    const log = createLogger();
    captureOutput();
    log.warn("careful");
    expect(stderrOutput).toContain("[warn]");
    expect(stderrOutput).toContain("careful");
  });

  it("error writes to stderr with [error]", () => {
    const log = createLogger();
    captureOutput();
    log.error("bad");
    expect(stderrOutput).toContain("[error]");
    expect(stderrOutput).toContain("bad");
  });

  it("quiet mode suppresses info, warn, and success", () => {
    const log = createLogger({ quiet: true });
    captureOutput();
    log.info("hidden");
    log.warn("hidden");
    log.success("hidden");
    expect(stdoutOutput).toBe("");
    expect(stderrOutput).toBe("");
  });

  it("quiet mode still outputs errors", () => {
    const log = createLogger({ quiet: true });
    captureOutput();
    log.error("visible");
    expect(stderrOutput).toContain("visible");
  });

  it("json mode disables colors", () => {
    const log = createLogger({ json: true });
    expect(log.colors.enabled).toBe(false);
  });

  it("exposes colors object", () => {
    const log = createLogger();
    expect(log.colors).toBeDefined();
    expect(typeof log.colors.green).toBe("function");
  });

  it("raw writes directly without newline", () => {
    const log = createLogger();
    captureOutput();
    log.raw("direct");
    expect(stdoutOutput).toBe("direct");
  });
});
