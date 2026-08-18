const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const INTERVAL_MS = 80;

export interface Spinner {
  start(message?: string): void;
  stop(finalMessage?: string): void;
  update(message: string): void;
  isRunning(): boolean;
}

export function createSpinner(options?: { noTTY?: boolean }): Spinner {
  const isTTY =
    options?.noTTY !== true &&
    typeof process !== "undefined" &&
    process.stderr &&
    typeof process.stderr.isTTY === "boolean" &&
    process.stderr.isTTY;

  let timer: ReturnType<typeof setInterval> | null = null;
  let frameIdx = 0;
  let currentMessage = "";

  function clearLine(): void {
    process.stderr.write("\r\x1b[K");
  }

  function render(): void {
    clearLine();
    const frame = FRAMES[frameIdx % FRAMES.length]!;
    process.stderr.write(`${frame} ${currentMessage}`);
    frameIdx++;
  }

  return {
    start(message = "") {
      if (!isTTY) return;
      if (timer) return;
      currentMessage = message;
      frameIdx = 0;
      render();
      timer = setInterval(render, INTERVAL_MS);
    },

    stop(finalMessage?: string) {
      if (!isTTY) return;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      clearLine();
      if (finalMessage) {
        process.stderr.write(finalMessage + "\n");
      }
    },

    update(message: string) {
      currentMessage = message;
    },

    isRunning() {
      return timer !== null;
    },
  };
}

export async function withSpinner<T>(
  message: string,
  fn: () => Promise<T>,
  options?: { noTTY?: boolean; successMessage?: string; failMessage?: string },
): Promise<T> {
  const spinner = createSpinner(options?.noTTY ? { noTTY: true } : undefined);
  spinner.start(message);
  try {
    const result = await fn();
    spinner.stop(options?.successMessage);
    return result;
  } catch (err) {
    spinner.stop(options?.failMessage);
    throw err;
  }
}
