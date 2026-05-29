import { describe, expect, it } from "vitest";
import {
  listBundledScaffoldFiles,
  resolvePackageLhRoot,
} from "../../src/core/bundled-scaffold.js";

describe("bundled scaffold", () => {
  it("resolves package .lh root with templates", () => {
    const lhRoot = resolvePackageLhRoot();
    expect(lhRoot.endsWith(".lh")).toBe(true);
    const files = listBundledScaffoldFiles();
    expect(files.some((f) => f.relativePath === "templates/spec.md")).toBe(true);
  });

  it("lists templates, protocols, and host-neutral policies", () => {
    const files = listBundledScaffoldFiles();
    const paths = new Set(files.map((f) => f.relativePath));

    expect(files.length).toBeGreaterThanOrEqual(19);

    expect(paths.has("templates/spec.md")).toBe(true);
    expect(paths.has("templates/discovery.md")).toBe(true);
    expect(paths.has("templates/boundary.json")).toBe(true);
    expect(paths.has("templates/cavebus-message.md")).toBe(true);
    expect(paths.has("templates/cavebus/discovery.cave")).toBe(true);
    expect(paths.has("protocols/cavebus.yml")).toBe(true);
    expect(paths.has("policies/risk-gates.yml")).toBe(true);
    expect(paths.has("policies/boundary.yml")).toBe(true);
    expect(paths.has("policies/commands.yml")).toBe(true);

    expect(paths.has("policies/claude-code.yml")).toBe(false);
    expect(paths.has("policies/opencode.yml")).toBe(false);
  });
});
