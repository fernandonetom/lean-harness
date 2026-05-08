import { describe, it, expect, vi, afterEach } from "vitest";
import { createSpinner, withSpinner } from "../../src/core/spinner.js";

describe("createSpinner", () => {
  it("does nothing when noTTY is true", () => {
    const spinner = createSpinner({ noTTY: true });
    spinner.start("loading");
    expect(spinner.isRunning()).toBe(false);
    spinner.stop();
  });

  it("update changes message without error when not running", () => {
    const spinner = createSpinner({ noTTY: true });
    spinner.update("new message");
    expect(spinner.isRunning()).toBe(false);
  });

  it("stop is safe to call when not started", () => {
    const spinner = createSpinner({ noTTY: true });
    expect(() => spinner.stop("done")).not.toThrow();
  });
});

describe("withSpinner", () => {
  it("returns the result of the async function", async () => {
    const result = await withSpinner(
      "working",
      async () => 42,
      { noTTY: true },
    );
    expect(result).toBe(42);
  });

  it("rethrows errors from the async function", async () => {
    await expect(
      withSpinner(
        "working",
        async () => { throw new Error("boom"); },
        { noTTY: true },
      ),
    ).rejects.toThrow("boom");
  });
});
