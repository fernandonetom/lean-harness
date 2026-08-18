import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import * as clack from "@clack/prompts";
import { createColors } from "./colors.js";

export interface PromptOptions {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  noColor?: boolean;
}

function createRl(options?: PromptOptions): ReadlineInterface {
  return createInterface({
    input: options?.input ?? process.stdin,
    output: options?.output ?? process.stdout,
  });
}

export async function promptConfirm(
  message: string,
  defaultValue = true,
  options?: PromptOptions,
): Promise<boolean> {
  const colors = createColors(options?.noColor ? { noColor: true } : undefined);
  const hint = defaultValue ? "Y/n" : "y/N";
  const rl = createRl(options);

  return new Promise<boolean>((resolve) => {
    rl.question(`${colors.cyan("?")} ${message} ${colors.dim(`(${hint})`)} `, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === "") {
        resolve(defaultValue);
      } else {
        resolve(trimmed === "y" || trimmed === "yes");
      }
    });
  });
}

export async function promptMultiSelect<T extends string>(
  message: string,
  choices: Array<{ label: string; value: T }>,
  options?: PromptOptions & { required?: boolean },
): Promise<T[]> {
  const noColor = options?.noColor ?? process.env.NO_COLOR !== undefined;

  clack.intro(message);

  const selectOptions = choices.map((c) => ({ value: c.value, label: c.label }));
  const result = await clack.multiselect({
    message: "Select agent hosts (space to toggle, enter to confirm)",
    // Clack Option<T> expects value: T; mapped literals satisfy runtime but not strict generics
    options: selectOptions as { value: string; label: string }[],
    required: options?.required ?? true,
  });

  if (clack.isCancel(result)) {
    clack.cancel("Setup cancelled.");
    process.exit(0);
  }

  const selected = result as T[];

  if (!noColor) {
    clack.outro(`${selected.length} host(s) selected`);
  }

  return selected;
}

export async function promptText(
  message: string,
  defaultValue?: string,
  options?: PromptOptions,
): Promise<string> {
  const colors = createColors(options?.noColor ? { noColor: true } : undefined);
  const hint = defaultValue ? ` ${colors.dim(`(${defaultValue})`)}` : "";
  const rl = createRl(options);

  return new Promise<string>((resolve) => {
    rl.question(`${colors.cyan("?")} ${message}${hint} `, (answer) => {
      rl.close();
      const trimmed = answer.trim();
      resolve(trimmed || defaultValue || "");
    });
  });
}
