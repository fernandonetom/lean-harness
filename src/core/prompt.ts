import { createInterface, type Interface as ReadlineInterface } from "node:readline";
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

export async function promptSelect<T extends string>(
  message: string,
  choices: Array<{ label: string; value: T }>,
  options?: PromptOptions,
): Promise<T> {
  const colors = createColors(options?.noColor ? { noColor: true } : undefined);
  const out = options?.output ?? process.stdout;

  out.write(`${colors.cyan("?")} ${message}\n`);
  for (let i = 0; i < choices.length; i++) {
    const choice = choices[i]!;
    out.write(`  ${colors.dim(`${i + 1})`)} ${choice.label}\n`);
  }

  const rl = createRl(options);

  return new Promise<T>((resolve) => {
    rl.question(`${colors.dim("Enter choice (number):")} `, (answer) => {
      rl.close();
      const trimmed = answer.trim();
      const idx = parseInt(trimmed, 10);
      if (idx >= 1 && idx <= choices.length) {
        resolve(choices[idx - 1]!.value);
      } else {
        const match = choices.find(
          (c) => c.value === trimmed || c.label.toLowerCase() === trimmed.toLowerCase(),
        );
        if (match) {
          resolve(match.value);
        } else {
          resolve(choices[0]!.value);
        }
      }
    });
  });
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
