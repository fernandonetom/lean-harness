export interface Colors {
  green(text: string): string;
  yellow(text: string): string;
  red(text: string): string;
  cyan(text: string): string;
  bold(text: string): string;
  dim(text: string): string;
  magenta(text: string): string;
  reset(text: string): string;
  enabled: boolean;
}

function shouldUseColor(options?: { forceColor?: boolean; noColor?: boolean }): boolean {
  if (options?.noColor) return false;
  if (options?.forceColor) return true;
  if (typeof process !== "undefined") {
    if (process.env["NO_COLOR"] !== undefined) return false;
    if (process.env["FORCE_COLOR"] !== undefined) return true;
    if (process.stdout && typeof process.stdout.isTTY === "boolean") {
      return process.stdout.isTTY;
    }
  }
  return false;
}

function ansi(open: number, close: number): (text: string) => string {
  return (text: string) => `\x1b[${open}m${text}\x1b[${close}m`;
}

const identity = (text: string): string => text;

export function createColors(options?: { forceColor?: boolean; noColor?: boolean }): Colors {
  const enabled = shouldUseColor(options);

  if (!enabled) {
    return {
      green: identity,
      yellow: identity,
      red: identity,
      cyan: identity,
      bold: identity,
      dim: identity,
      magenta: identity,
      reset: identity,
      enabled: false,
    };
  }

  return {
    green: ansi(32, 39),
    yellow: ansi(33, 39),
    red: ansi(31, 39),
    cyan: ansi(36, 39),
    bold: ansi(1, 22),
    dim: ansi(2, 22),
    magenta: ansi(35, 39),
    reset: ansi(0, 0),
    enabled: true,
  };
}

export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[\d+m/g, "");
}
