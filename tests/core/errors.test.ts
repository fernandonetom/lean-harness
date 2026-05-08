import { describe, it, expect } from "vitest";
import { CLIError, ConfigError, FeatureNotFoundError } from "../../src/core/errors.js";

describe("CLIError", () => {
  it("sets message and default exitCode", () => {
    const err = new CLIError("something broke");
    expect(err.message).toBe("something broke");
    expect(err.exitCode).toBe(1);
    expect(err.name).toBe("CLIError");
    expect(err).toBeInstanceOf(Error);
  });

  it("accepts custom exitCode", () => {
    const err = new CLIError("bad", 2);
    expect(err.exitCode).toBe(2);
  });
});

describe("ConfigError", () => {
  it("extends CLIError", () => {
    const err = new ConfigError("bad config");
    expect(err).toBeInstanceOf(CLIError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("ConfigError");
    expect(err.exitCode).toBe(1);
  });
});

describe("FeatureNotFoundError", () => {
  it("extends CLIError with formatted message", () => {
    const err = new FeatureNotFoundError("F001");
    expect(err).toBeInstanceOf(CLIError);
    expect(err.message).toBe("Could not find feature: F001");
    expect(err.name).toBe("FeatureNotFoundError");
  });
});
