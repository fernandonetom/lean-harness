import { describe, it, expect } from "vitest";
import {
  parseCaveBusLog,
  validateCaveBusLog,
  filterCaveBusMessages,
} from "../../src/cavebus/validate.js";

describe("parseCaveBusLog", () => {
  it("parses a single message", () => {
    const content = "REQ F001 status:draft\ngoal:\n- test";
    const messages = parseCaveBusLog(content);
    expect(messages.length).toBe(1);
    expect(messages[0]!.type).toBe("REQ");
    expect(messages[0]!.featureId).toBe("F001");
  });

  it("parses multiple messages separated by new message types", () => {
    const content = [
      "REQ F001 status:draft",
      "goal:",
      "- test",
      "DISC F001 conf:med depth:D2",
      "touch:",
      "- src/auth.ts",
    ].join("\n");
    const messages = parseCaveBusLog(content);
    expect(messages.length).toBe(2);
    expect(messages[0]!.type).toBe("REQ");
    expect(messages[1]!.type).toBe("DISC");
  });

  it("handles managed blocks (LH-COMPRESS-BEGIN / LH-COMPRESS-END)", () => {
    const content = [
      "# LH-COMPRESS-BEGIN source:all mode:full generated:2025-01-01",
      "REQ F001 status:draft",
      "goal:",
      "- compressed",
      "# LH-COMPRESS-END",
    ].join("\n");
    const messages = parseCaveBusLog(content);
    expect(messages.length).toBe(1);
    expect(messages[0]!.managed).toBe(true);
  });

  it("returns empty array for empty content", () => {
    expect(parseCaveBusLog("")).toEqual([]);
    expect(parseCaveBusLog("   \n  \n")).toEqual([]);
  });
});

describe("validateCaveBusLog", () => {
  it("valid log returns ok: true", () => {
    const content = "REQ F001 status:draft\ngoal:\n- implement feature";
    const result = validateCaveBusLog(content);
    expect(result.ok).toBe(true);
  });

  it("missing feature ID on non-MEM/NOTE message produces warning", () => {
    const content = "REQ status:draft\ngoal:\n- implement feature";
    const result = validateCaveBusLog(content);
    const featureIdWarning = result.issues.find((i) => i.code === "MISSING_FEATURE_ID");
    expect(featureIdWarning).toBeDefined();
  });

  it("invalid confidence value produces warning", () => {
    const content = "DISC F001 conf:maybe\ntouch:\n- src/file.ts";
    const result = validateCaveBusLog(content);
    const confWarning = result.issues.find((i) => i.code === "INVALID_CONFIDENCE");
    expect(confWarning).toBeDefined();
  });

  it("ERR without 'err:' in body produces warning", () => {
    const content = "ERR F001\nsomething went wrong";
    const result = validateCaveBusLog(content);
    const errWarning = result.issues.find((i) => i.code === "ERR_NO_ERR");
    expect(errWarning).toBeDefined();
  });
});

describe("filterCaveBusMessages", () => {
  it("filters by type", () => {
    const content = [
      "REQ F001 status:draft",
      "goal:",
      "- test",
      "DISC F001 conf:med",
      "touch:",
      "- src/file.ts",
    ].join("\n");
    const messages = parseCaveBusLog(content);
    const filtered = filterCaveBusMessages(messages, { type: "REQ" });
    expect(filtered.length).toBe(1);
    expect(filtered[0]!.type).toBe("REQ");
  });

  it("limits with tail", () => {
    const content = [
      "REQ F001 status:draft",
      "goal:",
      "- a",
      "DISC F001 conf:med",
      "touch:",
      "- b",
      "PLAN F001 status:planned",
      "tasks:T01",
    ].join("\n");
    const messages = parseCaveBusLog(content);
    const filtered = filterCaveBusMessages(messages, { tail: 1 });
    expect(filtered.length).toBe(1);
    expect(filtered[0]!.type).toBe("PLAN");
  });
});
