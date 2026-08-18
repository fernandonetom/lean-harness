import { describe, it, expect } from "vitest";
import {
  isCaveBusMessageType,
  normalizeCaveBusType,
  isStatusValue,
  isConfidenceValue,
} from "../../src/cavebus/schema.js";

describe("isCaveBusMessageType", () => {
  it("returns true for 'REQ'", () => {
    expect(isCaveBusMessageType("REQ")).toBe(true);
  });

  it("returns true for 'DISC'", () => {
    expect(isCaveBusMessageType("DISC")).toBe(true);
  });

  it("returns true for 'PLAN'", () => {
    expect(isCaveBusMessageType("PLAN")).toBe(true);
  });

  it("returns true for 'TASK'", () => {
    expect(isCaveBusMessageType("TASK")).toBe(true);
  });

  it("returns false for 'UNKNOWN'", () => {
    expect(isCaveBusMessageType("UNKNOWN")).toBe(false);
  });

  it("returns false for lowercase 'req' (case-sensitive)", () => {
    expect(isCaveBusMessageType("req")).toBe(false);
  });
});

describe("normalizeCaveBusType", () => {
  it("normalizes 'req' to 'REQ'", () => {
    expect(normalizeCaveBusType("req")).toBe("REQ");
  });

  it("normalizes 'disc' to 'DISC'", () => {
    expect(normalizeCaveBusType("disc")).toBe("DISC");
  });

  it("returns null for undefined", () => {
    expect(normalizeCaveBusType(undefined)).toBeNull();
  });

  it("returns null for 'UNKNOWN'", () => {
    expect(normalizeCaveBusType("UNKNOWN")).toBeNull();
  });
});

describe("isStatusValue", () => {
  it("returns true for 'draft'", () => {
    expect(isStatusValue("draft")).toBe(true);
  });

  it("returns true for 'done'", () => {
    expect(isStatusValue("done")).toBe(true);
  });

  it("returns true for 'pass'", () => {
    expect(isStatusValue("pass")).toBe(true);
  });

  it("returns false for 'garbage'", () => {
    expect(isStatusValue("garbage")).toBe(false);
  });
});

describe("isConfidenceValue", () => {
  it("returns true for 'low'", () => {
    expect(isConfidenceValue("low")).toBe(true);
  });

  it("returns true for 'med'", () => {
    expect(isConfidenceValue("med")).toBe(true);
  });

  it("returns true for 'high'", () => {
    expect(isConfidenceValue("high")).toBe(true);
  });

  it("returns false for 'medium'", () => {
    expect(isConfidenceValue("medium")).toBe(false);
  });
});
