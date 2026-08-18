import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { detectLegacyFootprint } from "../../src/commands/legacy-footprint.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lh-legacy-footprint-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("detectLegacyFootprint", () => {
  it("returns empty paths and null configVersion for fresh directory", async () => {
    const result = await detectLegacyFootprint(tmpDir);

    expect(result.paths).toEqual([]);
    expect(result.configVersion).toBe(null);
  });

  it("detects legacy files in a synthetic layout", async () => {
    // Create .claude/skills/lh-build directory
    const lhBuildSkillDir = path.join(tmpDir, ".claude", "skills", "lh-build");
    await fs.mkdir(lhBuildSkillDir, { recursive: true });
    await fs.writeFile(path.join(lhBuildSkillDir, "SKILL.md"), "# lh-build skill\n");

    // Create .claude/agents/lh-scout.md file
    const claudeAgentsDir = path.join(tmpDir, ".claude", "agents");
    await fs.mkdir(claudeAgentsDir, { recursive: true });
    await fs.writeFile(path.join(claudeAgentsDir, "lh-scout.md"), "# lh-scout agent\n");

    // Create .lh/scripts/hooks directory
    const scriptsHooksDir = path.join(tmpDir, ".lh", "scripts", "hooks");
    await fs.mkdir(scriptsHooksDir, { recursive: true });
    await fs.writeFile(path.join(scriptsHooksDir, "shared.js"), "// shared hooks\n");

    // Create .lh/config.yml with version 1.5.2
    const configDir = path.join(tmpDir, ".lh");
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(path.join(configDir, "config.yml"), 'version: "1.5.2"\nhost: claude-code\n');

    const result = await detectLegacyFootprint(tmpDir);

    // Check that the legacy paths were detected
    expect(result.paths).toContain(lhBuildSkillDir);
    expect(result.paths).toContain(path.join(claudeAgentsDir, "lh-scout.md"));
    expect(result.paths).toContain(scriptsHooksDir);

    // Check that configVersion was correctly extracted
    expect(result.configVersion).toBe("1.5.2");
  });

  it("does not include non-lh skills in detected paths", async () => {
    // Create a non-lh skill (my-own-skill)
    const mySkillDir = path.join(tmpDir, ".claude", "skills", "my-own-skill");
    await fs.mkdir(mySkillDir, { recursive: true });
    await fs.writeFile(path.join(mySkillDir, "SKILL.md"), "# my own skill\n");

    // Create an lh-build skill as well
    const lhBuildSkillDir = path.join(tmpDir, ".claude", "skills", "lh-build");
    await fs.mkdir(lhBuildSkillDir, { recursive: true });
    await fs.writeFile(path.join(lhBuildSkillDir, "SKILL.md"), "# lh-build skill\n");

    const result = await detectLegacyFootprint(tmpDir);

    // The lh-build skill should be detected
    expect(result.paths).toContain(lhBuildSkillDir);

    // The my-own-skill should NOT be detected
    expect(result.paths).not.toContain(mySkillDir);
  });
});
