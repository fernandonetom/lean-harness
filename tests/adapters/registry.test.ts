import { describe, it, expect } from "vitest";
import {
  normalizeAgentHost,
  getAgentAdapter,
  listAgentHosts,
} from "../../src/adapters/registry.js";

describe("normalizeAgentHost", () => {
  it("normalizes 'claude' to 'claude-code'", () => {
    expect(normalizeAgentHost("claude")).toBe("claude-code");
  });

  it("normalizes 'opencode' to 'opencode'", () => {
    expect(normalizeAgentHost("opencode")).toBe("opencode");
  });

  it("normalizes 'claude-code' to 'claude-code'", () => {
    expect(normalizeAgentHost("claude-code")).toBe("claude-code");
  });

  it("defaults to 'claude-code' for undefined", () => {
    expect(normalizeAgentHost(undefined)).toBe("claude-code");
  });

  it("throws for unknown host", () => {
    expect(() => normalizeAgentHost("gpt-4")).toThrow("Unknown agent host");
  });
});

describe("getAgentAdapter", () => {
  it("returns adapter for claude-code", () => {
    const adapter = getAgentAdapter("claude-code");
    expect(adapter.host).toBe("claude-code");
    expect(typeof adapter.run).toBe("function");
    expect(typeof adapter.detect).toBe("function");
  });

  it("returns adapter for opencode", () => {
    const adapter = getAgentAdapter("opencode");
    expect(adapter.host).toBe("opencode");
    expect(typeof adapter.run).toBe("function");
    expect(typeof adapter.detect).toBe("function");
  });

  it("throws for unknown host", () => {
    expect(() => getAgentAdapter("unknown" as any)).toThrow("No adapter registered");
  });
});

describe("listAgentHosts", () => {
  it("returns both known hosts", () => {
    const hosts = listAgentHosts();
    expect(hosts).toContain("claude-code");
    expect(hosts).toContain("opencode");
    expect(hosts.length).toBe(2);
  });
});
