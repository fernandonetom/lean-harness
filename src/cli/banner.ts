import { createColors } from "../core/colors.js";
import { getVersion } from "../core/version.js";

export interface BannerOptions {
  color?: boolean;
}

const TAGLINE = "Claude Code-first harness for brownfield feature work";
const WORKFLOW = "Specify → Discover → Build → Check";
const HEADER_WIDTH = 56;

/** Whether help output should include the branded header (plain text when not a TTY). */
export function shouldShowHelpHeader(options?: { json?: boolean }): boolean {
  if (options?.json) return false;
  if (process.env.CI === "true" || process.env.CI === "1") return false;
  return true;
}

/** Whether ANSI colors are appropriate for the header. */
export function shouldUseBannerColors(): boolean {
  if (process.env.NO_COLOR !== undefined) return false;
  if (!process.stdout.isTTY) return false;
  return true;
}

/** @deprecated Use shouldShowHelpHeader for visibility and shouldUseBannerColors for color. */
export function shouldShowBanner(options?: { json?: boolean }): boolean {
  return shouldShowHelpHeader(options) && shouldUseBannerColors();
}

export function renderBanner(options?: BannerOptions): string {
  const useColor = options?.color ?? shouldUseBannerColors();
  const colors = createColors({ noColor: !useColor });
  const version = getVersion();
  const versionLabel = `v${version}`;
  const pad = Math.max(1, HEADER_WIDTH - "LeanHarness".length - versionLabel.length);

  const title = useColor
    ? `${colors.bold(colors.cyan("LeanHarness"))}${" ".repeat(pad)}${colors.dim(versionLabel)}`
    : `LeanHarness${" ".repeat(pad)}${versionLabel}`;

  const rule = useColor ? colors.dim("─".repeat(HEADER_WIDTH)) : "─".repeat(HEADER_WIDTH);
  const workflow = useColor ? colors.bold(WORKFLOW) : WORKFLOW;
  const tagline = useColor ? colors.dim(TAGLINE) : TAGLINE;

  return `${title}\n${rule}\n${workflow}\n${tagline}\n`;
}

export function printInitBanner(): void {
  if (!shouldShowHelpHeader()) return;
  process.stdout.write(renderBanner() + "\n");
}
