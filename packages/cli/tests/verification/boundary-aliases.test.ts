import { describe, it, expect } from "vitest";
import {
  isPathAllowedByBoundary,
  reviewBoundaryCompliance,
  type ChangedFile,
} from "../../src/verification/changed-files.js";

describe("isPathAllowedByBoundary - touchFiles field", () => {
  it("returns 'in' when path matches an object entry in touchFiles", () => {
    const boundary = {
      touchFiles: [
        { path: "src/auth/login.ts", reason: "login flow", confidence: "high" },
      ],
    };
    expect(isPathAllowedByBoundary("src/auth/login.ts", boundary)).toBe("in");
  });

  it("returns 'in' when path matches a string entry in touchFiles", () => {
    const boundary = {
      touchFiles: ["src/auth/login.ts"],
    };
    expect(isPathAllowedByBoundary("src/auth/login.ts", boundary)).toBe("in");
  });

  it("returns 'unknown' when path is not in touchFiles", () => {
    const boundary = {
      touchFiles: [{ path: "src/auth/login.ts", reason: "x", confidence: "high" }],
    };
    expect(isPathAllowedByBoundary("src/other/file.ts", boundary)).toBe("unknown");
  });
});

describe("isPathAllowedByBoundary - touch field alias (docs/migration)", () => {
  it("returns 'in' when boundary has only 'touch' (string array)", () => {
    const boundary = { touch: ["src/cobranca/charge.ts"] };
    expect(isPathAllowedByBoundary("src/cobranca/charge.ts", boundary)).toBe("in");
  });

  it("returns 'unknown' when path is not in 'touch'", () => {
    const boundary = { touch: ["src/cobranca/charge.ts"] };
    expect(isPathAllowedByBoundary("src/other/file.ts", boundary)).toBe("unknown");
  });
});

describe("isPathAllowedByBoundary - files object fallback (older format)", () => {
  it("flattens files.modify + files.create + files.delete", () => {
    const boundary = {
      files: {
        modify: ["src/cobranca/charge.ts"],
        create: ["src/cobranca/charge.test.ts"],
        delete: ["src/legacy/old.ts"],
      },
    };
    expect(isPathAllowedByBoundary("src/cobranca/charge.ts", boundary)).toBe("in");
    expect(isPathAllowedByBoundary("src/cobranca/charge.test.ts", boundary)).toBe("in");
    expect(isPathAllowedByBoundary("src/legacy/old.ts", boundary)).toBe("in");
    expect(isPathAllowedByBoundary("src/other/file.ts", boundary)).toBe("unknown");
  });

  it("accepts files as a plain string array", () => {
    const boundary = { files: ["src/cobranca/charge.ts"] };
    expect(isPathAllowedByBoundary("src/cobranca/charge.ts", boundary)).toBe("in");
  });
});

describe("isPathAllowedByBoundary - blocked / doNotTouch", () => {
  it("returns 'out' when path matches a prefix-style blockedEditGlobs", () => {
    // The boundary glob matcher supports the "<dir>/**" form that the CLI
    // emits for BLOCKED_GLOBS (node_modules/**, dist/**, etc.).
    const boundary = {
      touchFiles: [],
      blockedEditGlobs: ["secrets/**"],
    };
    expect(isPathAllowedByBoundary("secrets/key.ts", boundary)).toBe("out");
  });

  it("returns 'out' when path is in doNotTouch", () => {
    const boundary = {
      touchFiles: [],
      doNotTouch: ["src/auth/session.ts"],
    };
    expect(isPathAllowedByBoundary("src/auth/session.ts", boundary)).toBe("out");
  });
});

describe("isPathAllowedByBoundary - priority order", () => {
  it("blockedEditGlobs wins over touchFiles", () => {
    const boundary = {
      touchFiles: [{ path: "secrets/key.ts", reason: "x", confidence: "high" }],
      blockedEditGlobs: ["secrets/**"],
    };
    expect(isPathAllowedByBoundary("secrets/key.ts", boundary)).toBe("out");
  });

  it("touchFiles takes priority over touch when both are present", () => {
    // When both fields are present, touchFiles wins (canonical). touch is
    // only consulted as a fallback when touchFiles is missing.
    const boundary = {
      touchFiles: [{ path: "src/a.ts", reason: "x", confidence: "high" }],
      touch: ["src/b.ts"],
    };
    expect(isPathAllowedByBoundary("src/a.ts", boundary)).toBe("in");
    expect(isPathAllowedByBoundary("src/b.ts", boundary)).toBe("unknown");
  });
});

describe("isPathAllowedByBoundary - edge cases", () => {
  it("returns 'unknown' when boundary is null or not an object", () => {
    expect(isPathAllowedByBoundary("src/x.ts", null)).toBe("unknown");
    expect(isPathAllowedByBoundary("src/x.ts", "not-an-object")).toBe("unknown");
  });

  it("returns 'unknown' when touchFiles is missing or non-array", () => {
    expect(isPathAllowedByBoundary("src/x.ts", {})).toBe("unknown");
    expect(isPathAllowedByBoundary("src/x.ts", { touchFiles: "not-array" })).toBe("unknown");
    expect(isPathAllowedByBoundary("src/x.ts", { touchFiles: null })).toBe("unknown");
  });

  it("normalizes backslashes to posix", () => {
    const boundary = {
      touchFiles: [{ path: "src/auth/login.ts", reason: "x", confidence: "high" }],
    };
    expect(isPathAllowedByBoundary("src\\auth\\login.ts", boundary)).toBe("in");
  });
});

describe("reviewBoundaryCompliance - field alias tolerance", () => {
  it("uses 'touch' as a fallback to detect in-boundary changes", () => {
    const boundary = { touch: ["src/cobranca/charge.ts"] };
    const changed: ChangedFile[] = [
      { path: "src/cobranca/charge.ts", changeType: "modified", source: "git", inBoundary: "unknown", notes: [] },
    ];
    const review = reviewBoundaryCompliance(changed, boundary);
    expect(review.status).toBe("pass");
    expect(review.violations.length).toBe(0);
  });

  it("flags doNotTouch violations regardless of touch alias", () => {
    // doNotTouch and blockedEditGlobs trigger "out" status, which is what
    // reviewBoundaryCompliance counts as a violation. "unknown" is not a
    // violation (the file might be allowed by allowedEditGlobs or be
    // outside the change scope).
    const boundary = {
      touch: ["src/cobranca/charge.ts"],
      doNotTouch: ["src/legacy/old.ts"],
    };
    const changed: ChangedFile[] = [
      { path: "src/legacy/old.ts", changeType: "modified", source: "git", inBoundary: "unknown", notes: [] },
    ];
    const review = reviewBoundaryCompliance(changed, boundary);
    expect(review.violations.length).toBe(1);
  });
});
