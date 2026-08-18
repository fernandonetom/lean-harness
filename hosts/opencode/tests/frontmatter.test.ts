import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const templatesDir = path.resolve(here, "../templates");

// Kept in sync with COMMAND_NAMES in packages/cli/src/commands/load-opencode-commands.ts —
// this is the list actually wired into a target repo's opencode.json "command" map by
// createOpenCodeCommandFiles(). Any file in templates/commands/ not in this list would be
// silently dead weight (as lh-builder-fix.md was, before it was removed for being a
// mis-copied agent-shaped file rather than a real command template).
const WIRED_COMMAND_NAMES = ["lh-spec.md", "lh-discover.md", "lh-plan.md", "lh-build.md", "lh-check.md", "lh-status.md", "lh-do.md"];

// Kept in sync with AGENT_NAMES in packages/cli/src/commands/load-opencode-agents.ts.
const WIRED_AGENT_NAMES = ["lh-scout.md", "lh-builder.md", "lh-builder-fix.md", "lh-reviewer.md", "lh-verifier.md", "lh-compressor.md"];

function readFrontmatter(filePath: string): Record<string, string> {
  const raw = readFileSync(filePath, "utf8");
  const match = /^---\n([\s\S]*?)\n---/.exec(raw);
  if (!match) return {};
  const fields: Record<string, string> = {};
  for (const line of (match[1] as string).split("\n")) {
    const fieldMatch = /^([a-zA-Z_]+):\s?(.*)$/.exec(line);
    if (fieldMatch && !line.startsWith(" ") && !line.startsWith("\t")) {
      fields[fieldMatch[1] as string] = (fieldMatch[2] as string).trim();
    }
  }
  return fields;
}

describe("OpenCode agent templates", () => {
  const dir = path.join(templatesDir, "agents");
  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));

  it("contains exactly the agent files wired into load-opencode-agents.ts", () => {
    expect(files.sort()).toEqual([...WIRED_AGENT_NAMES].sort());
  });

  for (const file of files) {
    it(`${file} has a non-empty description and a valid mode`, () => {
      const fm = readFrontmatter(path.join(dir, file));
      expect(fm["description"], `${file} missing description`).toBeTruthy();
      expect(["subagent", "primary"], `${file} has invalid mode: ${fm["mode"]}`).toContain(fm["mode"]);
    });
  }
});

describe("OpenCode command templates", () => {
  const dir = path.join(templatesDir, "commands");
  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));

  it("contains exactly the command files wired into load-opencode-commands.ts", () => {
    expect(files.sort()).toEqual([...WIRED_COMMAND_NAMES].sort());
  });

  for (const file of files) {
    it(`${file} has a non-empty description and references a real agent`, () => {
      const fm = readFrontmatter(path.join(dir, file));
      expect(fm["description"], `${file} missing description`).toBeTruthy();
      expect(fm["agent"], `${file} missing agent`).toBeTruthy();
      const expectedAgentFile = `${fm["agent"]}.md`;
      expect(WIRED_AGENT_NAMES, `${file} references unknown agent ${fm["agent"]}`).toContain(expectedAgentFile);
    });
  }
});
