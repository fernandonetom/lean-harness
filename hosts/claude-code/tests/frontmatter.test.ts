import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(here, "..");

/**
 * Regression guard for the bug this test suite was written to catch: lh-do/SKILL.md's
 * description contained an unquoted colon-space ("codebase: specify, ...") inside a plain YAML
 * scalar, which `claude plugin validate --strict` flags as a parse error — at runtime the skill
 * would load with ALL frontmatter fields silently dropped (no name, no description, unusable).
 * Parsing with the real YAML library here catches this class of bug for every skill/agent file,
 * not just the one instance already fixed.
 */
function readFrontmatter(filePath: string): Record<string, unknown> {
  const raw = readFileSync(filePath, "utf8");
  const match = /^---\n([\s\S]*?)\n---/.exec(raw);
  expect(match, `${filePath} has no --- frontmatter block`).not.toBeNull();
  const parsed = yaml.load((match as RegExpExecArray)[1] as string);
  expect(parsed, `${filePath} frontmatter did not parse to an object`).toBeTypeOf("object");
  return parsed as Record<string, unknown>;
}

const EXPECTED_SKILLS = ["lh-build", "lh-check", "lh-discover", "lh-do", "lh-plan", "lh-spec", "lh-status", "lh-worktree"];
const EXPECTED_AGENTS = ["lh-builder-fix.md", "lh-builder.md", "lh-compressor.md", "lh-reviewer.md", "lh-scout.md", "lh-verifier.md"];

describe("Claude Code skills", () => {
  const skillsDir = path.join(pluginRoot, "skills");
  const dirs = readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);

  it("contains exactly the expected skill directories", () => {
    expect(dirs.sort()).toEqual([...EXPECTED_SKILLS].sort());
  });

  for (const dir of dirs) {
    it(`${dir}/SKILL.md has valid YAML frontmatter with a name and non-empty description`, () => {
      const fm = readFrontmatter(path.join(skillsDir, dir, "SKILL.md"));
      expect(fm["name"]).toBe(dir);
      expect(typeof fm["description"]).toBe("string");
      expect((fm["description"] as string).length).toBeGreaterThan(0);
    });
  }
});

describe("Claude Code agents", () => {
  const agentsDir = path.join(pluginRoot, "agents");
  const files = readdirSync(agentsDir).filter((f) => f.endsWith(".md"));

  it("contains exactly the expected agent files", () => {
    expect(files.sort()).toEqual([...EXPECTED_AGENTS].sort());
  });

  for (const file of files) {
    it(`${file} has valid YAML frontmatter with name, description, and a valid permissionMode`, () => {
      const fm = readFrontmatter(path.join(agentsDir, file));
      expect(fm["name"]).toBe(file.replace(/\.md$/, ""));
      expect(typeof fm["description"]).toBe("string");
      expect((fm["description"] as string).length).toBeGreaterThan(0);
      expect(["default", "plan"]).toContain(fm["permissionMode"]);
      expect(typeof fm["maxTurns"]).toBe("number");
    });
  }
});

describe("plugin manifest", () => {
  it(".claude-plugin/plugin.json is valid JSON with required fields", () => {
    const manifest = JSON.parse(readFileSync(path.join(pluginRoot, ".claude-plugin", "plugin.json"), "utf8"));
    expect(typeof manifest.name).toBe("string");
    expect(typeof manifest.version).toBe("string");
    expect(typeof manifest.description).toBe("string");
  });

  it("hooks/hooks.json references only hook scripts that actually exist under hooks/", () => {
    const hooksJson = JSON.parse(readFileSync(path.join(pluginRoot, "hooks", "hooks.json"), "utf8"));
    const referenced = new Set<string>();
    for (const events of Object.values(hooksJson.hooks as Record<string, unknown>)) {
      for (const entry of events as Array<{ hooks: Array<{ command: string }> }>) {
        for (const hook of entry.hooks) {
          const match = /\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/([a-zA-Z0-9_-]+\.js)/.exec(hook.command);
          if (match) referenced.add(match[1] as string);
        }
      }
    }
    expect(referenced.size).toBeGreaterThan(0);
    const existing = new Set(readdirSync(path.join(pluginRoot, "hooks")).filter((f) => f.endsWith(".js")));
    for (const filename of referenced) {
      expect(existing.has(filename), `hooks.json references ${filename}, but it does not exist under hooks/`).toBe(true);
    }
  });
});
