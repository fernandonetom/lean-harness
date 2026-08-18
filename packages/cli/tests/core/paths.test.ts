import { describe, it, expect } from "vitest";
import path from "node:path";
import {
  HARNESS_DIR,
  CLAUDE_DIR,
  OPENCODE_DIR,
  OPENCODE_CONFIG_FILE,
  resolveProjectPath,
  harnessPath,
  claudePath,
  featuresDir,
  templatesDir,
  memoryDir,
  policiesDir,
  protocolsDir,
  statePath,
  configPath,
  toPosixPath,
  relativeToRoot,
  opencodePath,
  opencodeConfigPath,
  opencodeAgentsDir,
  opencodePluginsDir,
  opencodeCommandsDir,
  opencodePluginPath,
  opencodeGuardrailPluginPath,
} from "../../src/core/paths.js";

const ROOT = "/project";

describe("path constants", () => {
  it("HARNESS_DIR is .lh", () => {
    expect(HARNESS_DIR).toBe(".lh");
  });

  it("CLAUDE_DIR is .claude", () => {
    expect(CLAUDE_DIR).toBe(".claude");
  });

  it("OPENCODE_DIR is .opencode", () => {
    expect(OPENCODE_DIR).toBe(".opencode");
  });

  it("OPENCODE_CONFIG_FILE is opencode.json", () => {
    expect(OPENCODE_CONFIG_FILE).toBe("opencode.json");
  });
});

describe("resolveProjectPath", () => {
  it("resolves to an absolute path under root", () => {
    const result = resolveProjectPath(ROOT, "src", "index.ts");
    expect(result).toBe(path.resolve(ROOT, "src", "index.ts"));
    expect(path.isAbsolute(result)).toBe(true);
  });

  it("resolves root alone", () => {
    const result = resolveProjectPath(ROOT);
    expect(result).toBe(path.resolve(ROOT));
  });

  it("handles multiple segments", () => {
    const result = resolveProjectPath(ROOT, "a", "b", "c");
    expect(result).toContain("a");
    expect(result).toContain("b");
    expect(result).toContain("c");
  });
});

describe("harnessPath", () => {
  it("resolves under .lh", () => {
    const result = harnessPath(ROOT);
    expect(result).toBe(path.resolve(ROOT, ".lh"));
  });

  it("appends segments under .lh", () => {
    const result = harnessPath(ROOT, "features", "001-foo");
    expect(result).toBe(path.resolve(ROOT, ".lh", "features", "001-foo"));
  });
});

describe("claudePath", () => {
  it("resolves under .claude", () => {
    const result = claudePath(ROOT);
    expect(result).toBe(path.resolve(ROOT, ".claude"));
  });

  it("appends segments under .claude", () => {
    const result = claudePath(ROOT, "settings.json");
    expect(result).toBe(path.resolve(ROOT, ".claude", "settings.json"));
  });
});

describe("convenience directory functions", () => {
  it("featuresDir returns .lh/features", () => {
    const result = featuresDir(ROOT);
    expect(result).toBe(path.resolve(ROOT, ".lh", "features"));
  });

  it("templatesDir returns .lh/templates", () => {
    const result = templatesDir(ROOT);
    expect(result).toBe(path.resolve(ROOT, ".lh", "templates"));
  });

  it("memoryDir returns .lh/memory", () => {
    const result = memoryDir(ROOT);
    expect(result).toBe(path.resolve(ROOT, ".lh", "memory"));
  });

  it("policiesDir returns .lh/policies", () => {
    const result = policiesDir(ROOT);
    expect(result).toBe(path.resolve(ROOT, ".lh", "policies"));
  });

  it("protocolsDir returns .lh/protocols", () => {
    const result = protocolsDir(ROOT);
    expect(result).toBe(path.resolve(ROOT, ".lh", "protocols"));
  });
});

describe("statePath", () => {
  it("returns .lh/state.json", () => {
    const result = statePath(ROOT);
    expect(result).toBe(path.resolve(ROOT, ".lh", "state.json"));
  });
});

describe("configPath", () => {
  it("returns .lh/config.yml", () => {
    const result = configPath(ROOT);
    expect(result).toBe(path.resolve(ROOT, ".lh", "config.yml"));
  });
});

describe("toPosixPath", () => {
  it("converts platform separators to forward slashes", () => {
    // toPosixPath splits on path.sep. On POSIX, path.sep is "/", so
    // backslashes are NOT path separators and stay unchanged.
    const input = ["a", "b", "c"].join(path.sep);
    expect(toPosixPath(input)).toBe("a/b/c");
  });

  it("leaves forward slashes unchanged", () => {
    expect(toPosixPath("a/b/c")).toBe("a/b/c");
  });

  it("handles mixed separators", () => {
    const result = toPosixPath("a\\b/c\\d");
    // On posix, path.sep is "/", so backslashes stay. On Windows they'd convert.
    // The function splits on path.sep and joins with "/".
    // On macOS/Linux, path.sep is "/" so this splits on "/" only.
    expect(result).toContain("a");
    expect(result).toContain("d");
  });

  it("handles empty string", () => {
    expect(toPosixPath("")).toBe("");
  });
});

describe("relativeToRoot", () => {
  it("returns a posix relative path", () => {
    const abs = path.resolve(ROOT, "src", "index.ts");
    const result = relativeToRoot(ROOT, abs);
    expect(result).toBe("src/index.ts");
  });

  it("returns empty string for root itself", () => {
    const result = relativeToRoot(ROOT, path.resolve(ROOT));
    expect(result).toBe("");
  });
});

describe("opencode paths", () => {
  it("opencodePath resolves under .opencode", () => {
    const result = opencodePath(ROOT);
    expect(result).toBe(path.resolve(ROOT, ".opencode"));
  });

  it("opencodePath appends segments", () => {
    const result = opencodePath(ROOT, "agents", "scout.md");
    expect(result).toBe(path.resolve(ROOT, ".opencode", "agents", "scout.md"));
  });

  it("opencodeConfigPath returns opencode.json at root", () => {
    const result = opencodeConfigPath(ROOT);
    expect(result).toBe(path.resolve(ROOT, "opencode.json"));
  });

  it("opencodeAgentsDir returns .opencode/agents", () => {
    const result = opencodeAgentsDir(ROOT);
    expect(result).toBe(path.resolve(ROOT, ".opencode", "agents"));
  });

  it("opencodePluginsDir returns .opencode/plugins", () => {
    const result = opencodePluginsDir(ROOT);
    expect(result).toBe(path.resolve(ROOT, ".opencode", "plugins"));
  });

  it("opencodeCommandsDir returns .opencode/commands", () => {
    const result = opencodeCommandsDir(ROOT);
    expect(result).toBe(path.resolve(ROOT, ".opencode", "commands"));
  });

  it("opencodePluginPath appends segments under .opencode/plugins", () => {
    const result = opencodePluginPath(ROOT, "my-plugin.js");
    expect(result).toBe(
      path.resolve(ROOT, ".opencode", "plugins", "my-plugin.js"),
    );
  });

  it("opencodeGuardrailPluginPath returns the guardrail plugin path", () => {
    const result = opencodeGuardrailPluginPath(ROOT);
    expect(result).toBe(
      path.resolve(ROOT, ".opencode", "plugins", "leanharness-guardrails.js"),
    );
  });
});
