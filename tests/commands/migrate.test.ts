import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { runMigrateCommand } from "../../src/commands/migrate.js";
import { LEGACY_HOOK_COMMANDS } from "../../src/commands/uninstall.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "lh-migrate-"));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function silenceOutput() {
  return vi.spyOn(process.stdout, "write").mockImplementation(() => true);
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function captureJsonOutput() {
  const output: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    output.push(String(chunk));
    return true;
  });
  return output;
}

function parseJsonOutput(output: string[]): unknown {
  const combined = output.join("");
  return JSON.parse(combined);
}

/**
 * Create a minimal synthetic legacy v1.x fixture in tmpDir
 */
async function createLegacyFixture(options?: { withPlugin?: boolean }): Promise<void> {
  const withPlugin = options?.withPlugin ?? false;

  // Create .lh/state.json
  const lhDir = path.join(tmpDir, ".lh");
  await fs.mkdir(lhDir, { recursive: true });
  await fs.writeFile(
    path.join(lhDir, "state.json"),
    JSON.stringify({
      version: "1.5.2",
      schema: "leanharness-state",
      activeFeature: null,
      nextFeatureNumber: 1,
      features: [],
    }, null, 2)
  );

  // Create .lh/config.yml
  await fs.writeFile(
    path.join(lhDir, "config.yml"),
    'version: "1.5.2"\nworkflow:\n  require_worktree: false\n'
  );

  // Create .lh/policies/risk-gates.yml with placeholder content
  const policiesDir = path.join(lhDir, "policies");
  await fs.mkdir(policiesDir, { recursive: true });
  await fs.writeFile(
    path.join(policiesDir, "risk-gates.yml"),
    "# Placeholder policy file\nrisk_gates:\n  require_approval: []\n"
  );

  // Create legacy footprint files
  // .claude/skills/lh-build/SKILL.md
  const lhBuildSkillDir = path.join(tmpDir, ".claude", "skills", "lh-build");
  await fs.mkdir(lhBuildSkillDir, { recursive: true });
  await fs.writeFile(path.join(lhBuildSkillDir, "SKILL.md"), "# lh-build skill\n");

  // .claude/agents/lh-scout.md
  const claudeAgentsDir = path.join(tmpDir, ".claude", "agents");
  await fs.mkdir(claudeAgentsDir, { recursive: true });
  await fs.writeFile(path.join(claudeAgentsDir, "lh-scout.md"), "# lh-scout agent\n");

  // .claude/skills/my-own-skill/SKILL.md (user-authored skill to be preserved)
  const mySkillDir = path.join(tmpDir, ".claude", "skills", "my-own-skill");
  await fs.mkdir(mySkillDir, { recursive: true });
  await fs.writeFile(path.join(mySkillDir, "SKILL.md"), "# my own skill\n");

  // Create .claude/settings.json with permissions and hooks
  const settingsPath = path.join(tmpDir, ".claude", "settings.json");
  const settingsObj: Record<string, unknown> = {
    permissions: {
      allow: ["Read", "Bash(git status*)"],
      deny: ["Bash(rm -rf /)"],
    },
    hooks: {
      "on-tool-use": [
        {
          match: { toolName: "*" },
          hooks: Array.from(LEGACY_HOOK_COMMANDS).map((cmd) => ({ command: cmd })),
        },
      ],
    },
  };

  // Add enabledPlugins if withPlugin is true
  if (withPlugin) {
    settingsObj.enabledPlugins = {
      "lh@lean-harness": true,
    };
  }

  await fs.writeFile(settingsPath, JSON.stringify(settingsObj, null, 2));
}

describe("lh migrate", () => {
  describe("case 1: plugin not installed, no --force", () => {
    it("does not delete legacy files without --force when plugin is not installed", async () => {
      await createLegacyFixture({ withPlugin: false });

      const spy = silenceOutput();
      await runMigrateCommand({ cwd: tmpDir, yes: true, json: true });
      spy.mockRestore();

      // Legacy files should still exist
      expect(await exists(path.join(tmpDir, ".claude", "skills", "lh-build"))).toBe(true);
      expect(await exists(path.join(tmpDir, ".claude", "agents", "lh-scout.md"))).toBe(true);
    });
  });

  describe("case 2: plugin installed, migration proceeds", () => {
    it("deletes legacy files, preserves user skills and config, strips hooks", async () => {
      await createLegacyFixture({ withPlugin: true });

      const output = captureJsonOutput();
      await runMigrateCommand({ cwd: tmpDir, yes: true, json: true });
      vi.restoreAllMocks();

      const result = parseJsonOutput(output) as Record<string, unknown>;
      expect(result.status).toBe("migrated");

      // Legacy files should be gone
      expect(await exists(path.join(tmpDir, ".claude", "skills", "lh-build"))).toBe(false);
      expect(await exists(path.join(tmpDir, ".claude", "agents", "lh-scout.md"))).toBe(false);

      // User-authored skill should still exist
      expect(await exists(path.join(tmpDir, ".claude", "skills", "my-own-skill", "SKILL.md"))).toBe(
        true
      );

      // .lh files should still exist with content intact
      expect(await exists(path.join(tmpDir, ".lh", "config.yml"))).toBe(true);
      expect(await exists(path.join(tmpDir, ".lh", "state.json"))).toBe(true);
      expect(await exists(path.join(tmpDir, ".lh", "policies", "risk-gates.yml"))).toBe(true);

      // .claude/settings.json permissions should be unchanged
      const settingsContent = JSON.parse(
        await fs.readFile(path.join(tmpDir, ".claude", "settings.json"), "utf-8")
      );
      expect(settingsContent.permissions.allow).toContain("Read");
      expect(settingsContent.permissions.allow).toContain("Bash(git status*)");
      expect(settingsContent.permissions.deny).toContain("Bash(rm -rf /)");

      // Legacy hooks should be stripped
      const hooks = settingsContent.hooks?.["on-tool-use"] ?? [];
      if (Array.isArray(hooks) && hooks.length > 0) {
        const firstHook = hooks[0] as Record<string, unknown>;
        const hookList = (firstHook.hooks as unknown[]) ?? [];
        for (const h of hookList) {
          const hObj = h as Record<string, unknown>;
          expect(LEGACY_HOOK_COMMANDS.has(hObj.command as string)).toBe(false);
        }
      }
    });
  });

  describe("case 3: --dry-run", () => {
    it("does not delete anything with --dry-run", async () => {
      await createLegacyFixture({ withPlugin: true });

      const output = captureJsonOutput();
      await runMigrateCommand({ cwd: tmpDir, yes: true, dryRun: true, json: true });
      vi.restoreAllMocks();

      const result = parseJsonOutput(output) as Record<string, unknown>;
      expect(result.status).toBe("dry-run");

      // Legacy files should still exist after dry-run
      expect(await exists(path.join(tmpDir, ".claude", "skills", "lh-build"))).toBe(true);
      expect(await exists(path.join(tmpDir, ".claude", "agents", "lh-scout.md"))).toBe(true);
      expect(await exists(path.join(tmpDir, ".lh", "config.yml"))).toBe(true);
    });
  });

  describe("case 4: --force bypasses plugin check", () => {
    it("deletes legacy files with --force even when plugin is not installed", async () => {
      await createLegacyFixture({ withPlugin: false });

      const output = captureJsonOutput();
      await runMigrateCommand({ cwd: tmpDir, yes: true, force: true, json: true });
      vi.restoreAllMocks();

      const result = parseJsonOutput(output) as Record<string, unknown>;
      expect(result.status).toBe("migrated");

      // Legacy files should be gone
      expect(await exists(path.join(tmpDir, ".claude", "skills", "lh-build"))).toBe(false);
      expect(await exists(path.join(tmpDir, ".claude", "agents", "lh-scout.md"))).toBe(false);

      // .lh files should still exist
      expect(await exists(path.join(tmpDir, ".lh", "config.yml"))).toBe(true);
      expect(await exists(path.join(tmpDir, ".lh", "state.json"))).toBe(true);
    });
  });

  describe("case 5: already on v2 (empty footprint)", () => {
    it("returns without error when nothing to migrate", async () => {
      // Create only minimal .lh structure without legacy footprint
      const lhDir = path.join(tmpDir, ".lh");
      await fs.mkdir(lhDir, { recursive: true });
      await fs.writeFile(
        path.join(lhDir, "state.json"),
        JSON.stringify({
          version: "2.0.0",
          schema: "leanharness-state",
          activeFeature: null,
          nextFeatureNumber: 1,
          features: [],
        }, null, 2)
      );
      await fs.writeFile(
        path.join(lhDir, "config.yml"),
        'version: "2.0.0"\nworkflow:\n  require_worktree: false\n'
      );

      const output = captureJsonOutput();
      await runMigrateCommand({ cwd: tmpDir, yes: true, json: true });
      vi.restoreAllMocks();

      const result = parseJsonOutput(output) as Record<string, unknown>;
      expect(result.status).toBe("up-to-date");
    });
  });
});
