import { describe, it, expect } from "vitest";
import { resolveConfig } from "../../src/core/resolved-config.js";
import type { HarnessConfig } from "../../src/core/types.js";

describe("resolveConfig", () => {
  it("returns defaults when config is null", () => {
    const result = resolveConfig(null);
    expect(result.host.primary).toBe("claude-code");
    expect(result.discovery.default_depth).toBe("D2");
    expect(result.discovery.max_initial_files).toBe(25);
    expect(result.compression.enabled).toBe(true);
    expect(result.compression.mode).toBe("full");
    expect(result.verification.require_acceptance_trace).toBe(true);
    expect(result.verification.require_changed_files).toBe(true);
    expect(result.verification.require_review).toBe(true);
    expect(result.risk_gates.require_approval).toEqual([]);
  });

  it("reads values from config", () => {
    const config: HarnessConfig = {
      host: { primary: "opencode" },
      discovery: { default_depth: "D3", max_initial_files: 50 },
      compression: { enabled: false, mode: "lite" },
      verification: {
        require_acceptance_trace: false,
        require_changed_files: false,
        require_review: false,
      },
      risk_gates: {
        require_approval: ["auth_rewrite", "payment_logic"],
      },
    };
    const result = resolveConfig(config);
    expect(result.host.primary).toBe("opencode");
    expect(result.discovery.default_depth).toBe("D3");
    expect(result.discovery.max_initial_files).toBe(50);
    expect(result.compression.enabled).toBe(false);
    expect(result.compression.mode).toBe("lite");
    expect(result.verification.require_acceptance_trace).toBe(false);
    expect(result.verification.require_changed_files).toBe(false);
    expect(result.verification.require_review).toBe(false);
    expect(result.risk_gates.require_approval).toEqual(["auth_rewrite", "payment_logic"]);
  });

  it("CLI overrides beat config values", () => {
    const config: HarnessConfig = {
      host: { primary: "opencode" },
      discovery: { default_depth: "D3", max_initial_files: 50 },
      compression: { mode: "lite" },
    };
    const result = resolveConfig(config, {
      host: "claude-code",
      depth: "D1",
      maxFiles: 10,
      mode: "ultra",
    });
    expect(result.host.primary).toBe("claude-code");
    expect(result.discovery.default_depth).toBe("D1");
    expect(result.discovery.max_initial_files).toBe(10);
    expect(result.compression.mode).toBe("ultra");
  });

  it("ignores invalid CLI override values and falls back to config", () => {
    const config: HarnessConfig = {
      host: { primary: "opencode" },
      discovery: { default_depth: "D3" },
      compression: { mode: "lite" },
    };
    const result = resolveConfig(config, {
      host: "invalid-host",
      depth: "D9",
      mode: "extreme",
    });
    expect(result.host.primary).toBe("opencode");
    expect(result.discovery.default_depth).toBe("D3");
    expect(result.compression.mode).toBe("lite");
  });

  it("strict override forces require_review to true", () => {
    const config: HarnessConfig = {
      verification: { require_review: false },
    };
    const result = resolveConfig(config, { strict: true });
    expect(result.verification.require_review).toBe(true);
  });

  it("handles depth case-insensitively", () => {
    const result = resolveConfig(null, { depth: "d4" });
    expect(result.discovery.default_depth).toBe("D4");
  });

  it("filters non-string entries from risk_gates.require_approval", () => {
    const config: HarnessConfig = {
      risk_gates: {
        require_approval: ["auth_rewrite", 42 as unknown as string, "payment_logic"],
      },
    };
    const result = resolveConfig(config);
    expect(result.risk_gates.require_approval).toEqual(["auth_rewrite", "payment_logic"]);
  });

  it("returns empty risk_gates when not an array", () => {
    const config: HarnessConfig = {
      risk_gates: { require_approval: "not-an-array" as unknown as string[] },
    };
    const result = resolveConfig(config);
    expect(result.risk_gates.require_approval).toEqual([]);
  });

  it("handles empty config object", () => {
    const result = resolveConfig({});
    expect(result.host.primary).toBe("claude-code");
    expect(result.discovery.default_depth).toBe("D2");
    expect(result.discovery.max_initial_files).toBe(25);
  });

  it("returns null models when config has no models section", () => {
    const result = resolveConfig(null);
    expect(result.models.agent).toBeNull();
    expect(result.models.subagent).toBeNull();
  });

  it("reads models from config", () => {
    const config: HarnessConfig = {
      models: { agent: "claude-opus-4-20250514", subagent: "claude-sonnet-4-20250514" },
    };
    const result = resolveConfig(config);
    expect(result.models.agent).toBe("claude-opus-4-20250514");
    expect(result.models.subagent).toBe("claude-sonnet-4-20250514");
  });

  it("CLI model override beats config models.agent", () => {
    const config: HarnessConfig = {
      models: { agent: "claude-opus-4-20250514" },
    };
    const result = resolveConfig(config, { model: "claude-sonnet-4-20250514" });
    expect(result.models.agent).toBe("claude-sonnet-4-20250514");
  });

  it("subagent model not overridden by CLI model", () => {
    const config: HarnessConfig = {
      models: { subagent: "claude-haiku-4-5-20251001" },
    };
    const result = resolveConfig(config, { model: "claude-opus-4-20250514" });
    expect(result.models.subagent).toBe("claude-haiku-4-5-20251001");
  });
});
