export class CLIError extends Error {
  override readonly name: string = "CLIError";
  readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

export class ConfigError extends CLIError {
  override readonly name: string = "ConfigError";
}

export class FeatureNotFoundError extends CLIError {
  override readonly name: string = "FeatureNotFoundError";

  constructor(ref: string) {
    super(`Could not find feature: ${ref}`);
  }
}
