import { CLIError } from "../core/errors.js";

export function collectString(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

export function parseOutputFormat(
  value: string | undefined,
): "text" | "json" | "stream-json" | undefined {
  if (!value) return undefined;
  if (value === "text" || value === "json" || value === "stream-json") return value;
  return undefined;
}

export function parseOpenCodeFormat(value: string | undefined): "default" | "json" | undefined {
  if (!value) return undefined;
  if (value === "default" || value === "json") return value;
  throw new CLIError(`Invalid OpenCode format: ${value}. Expected default or json.`);
}

export interface GlobalOpts {
  cwd?: string;
}

export function resolveCwd(opts: GlobalOpts): string {
  return opts.cwd ?? process.cwd();
}
