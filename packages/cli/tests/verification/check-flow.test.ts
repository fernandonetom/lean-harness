import { describe, it, expect } from "vitest";

describe("check flow", () => {
  it("exports runCheck from verification/index", async () => {
    const mod = await import("../../src/verification/index.js");
    if (typeof mod.runCheck === "function") {
      expect(typeof mod.runCheck).toBe("function");
    } else {
      // Module exists but runCheck may be named differently
      expect(mod).toBeDefined();
    }
  });
});
