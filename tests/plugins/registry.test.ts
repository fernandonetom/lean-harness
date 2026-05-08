import { describe, it, expect, vi } from "vitest";
import { createPluginRegistry, createEmptyRegistry } from "../../src/plugins/registry.js";
import type { LHPlugin, PluginHookContext } from "../../src/plugins/types.js";

function makeCtx(): PluginHookContext {
  return { root: "/tmp/test", featureId: "F001", featureDir: "/tmp/test/.lh/features/F001-test" };
}

describe("createPluginRegistry", () => {
  it("registers plugins and retrieves by name", () => {
    const p: LHPlugin = { name: "test-plugin", version: "1.0.0" };
    const registry = createPluginRegistry([p]);
    expect(registry.hasPlugins()).toBe(true);
    expect(registry.getPlugin("test-plugin")).toBe(p);
    expect(registry.getPlugin("unknown")).toBeUndefined();
  });

  it("reports multiple plugins", () => {
    const a: LHPlugin = { name: "alpha", version: "1.0.0" };
    const b: LHPlugin = { name: "beta", version: "2.0.0" };
    const registry = createPluginRegistry([a, b]);
    expect(registry.plugins).toHaveLength(2);
  });

  it("runs hooks in registration order", async () => {
    const order: string[] = [];
    const a: LHPlugin = {
      name: "alpha",
      version: "1.0.0",
      hooks: { beforeBuild: async () => { order.push("alpha"); } },
    };
    const b: LHPlugin = {
      name: "beta",
      version: "1.0.0",
      hooks: { beforeBuild: async () => { order.push("beta"); } },
    };
    const registry = createPluginRegistry([a, b]);
    await registry.runHook("beforeBuild", makeCtx());
    expect(order).toEqual(["alpha", "beta"]);
  });

  it("skips plugins without the requested hook", async () => {
    const called = vi.fn();
    const a: LHPlugin = { name: "no-hooks", version: "1.0.0" };
    const b: LHPlugin = {
      name: "has-hook",
      version: "1.0.0",
      hooks: { afterCheck: called },
    };
    const registry = createPluginRegistry([a, b]);
    await registry.runHook("afterCheck", makeCtx());
    expect(called).toHaveBeenCalledOnce();
  });

  it("passes context to hooks", async () => {
    const ctx = makeCtx();
    let received: PluginHookContext | null = null;
    const p: LHPlugin = {
      name: "ctx-test",
      version: "1.0.0",
      hooks: { beforeDiscover: (c) => { received = c; } },
    };
    const registry = createPluginRegistry([p]);
    await registry.runHook("beforeDiscover", ctx);
    expect(received).toBe(ctx);
  });

  it("exposes load errors", () => {
    const errors = [{ dir: "/tmp/bad", error: "missing plugin.json" }];
    const registry = createPluginRegistry([], errors);
    expect(registry.errors).toHaveLength(1);
    expect(registry.hasPlugins()).toBe(false);
  });
});

describe("createEmptyRegistry", () => {
  it("has no plugins and no errors", () => {
    const registry = createEmptyRegistry();
    expect(registry.hasPlugins()).toBe(false);
    expect(registry.plugins).toHaveLength(0);
    expect(registry.errors).toHaveLength(0);
  });

  it("runs hooks without error on empty registry", async () => {
    const registry = createEmptyRegistry();
    await registry.runHook("afterBuild", makeCtx());
  });
});
