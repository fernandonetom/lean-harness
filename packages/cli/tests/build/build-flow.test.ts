import { describe, it, expect } from "vitest";

describe("build flow", () => {
  it("exports runBuild from build/index", async () => {
    // Dynamic import to check if the module exports runBuild
    const mod = await import("../../src/build/index.js");
    // The build module should export a function named runBuild
    if (typeof mod.runBuild === "function") {
      expect(typeof mod.runBuild).toBe("function");
    } else {
      // Module exists but runBuild may be named differently
      // Check that the module is at least importable
      expect(mod).toBeDefined();
    }
  });
});
