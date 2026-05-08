import { createColors, type Colors } from "./colors.js";

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  success(message: string): void;
  raw(message: string): void;
  colors: Colors;
}

export function createLogger(options?: { json?: boolean; quiet?: boolean }): Logger {
  const quiet = options?.quiet === true;
  const colors = createColors({ noColor: options?.json === true });

  return {
    info(message: string) {
      if (!quiet) process.stdout.write(message + "\n");
    },
    warn(message: string) {
      if (!quiet) process.stderr.write(colors.yellow("[warn]") + " " + message + "\n");
    },
    error(message: string) {
      process.stderr.write(colors.red("[error]") + " " + message + "\n");
    },
    success(message: string) {
      if (!quiet) process.stdout.write(colors.green("[ok]") + " " + message + "\n");
    },
    raw(message: string) {
      process.stdout.write(message);
    },
    colors,
  };
}

export function printJson(value: unknown): void {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}
