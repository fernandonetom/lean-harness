import { describe, it, expect } from "vitest";
import {
  detectRiskGates,
  buildBoundary,
  renderDiscoveryMarkdown,
  renderDiscoveryCavebus,
  type BoundaryBuildInput,
  type DiscoveryRenderInput,
} from "../../src/discovery/boundary.js";
import type { ProjectDetection } from "../../src/discovery/project-detector.js";
import type { PackageDetection } from "../../src/discovery/package-detector.js";
import type { SearchResult, CandidateFile } from "../../src/discovery/search.js";
import type { TestDetection } from "../../src/discovery/test-detector.js";

function makeProject(overrides?: Partial<ProjectDetection>): ProjectDetection {
  return {
    root: "/tmp",
    packageManagers: [],
    languages: [],
    frameworks: [],
    importantFiles: [],
    sourceDirs: [],
    testDirs: [],
    configFiles: [],
    notes: [],
    ...overrides,
  };
}

function makePackageInfo(overrides?: Partial<PackageDetection>): PackageDetection {
  return {
    packageManager: null,
    scripts: {},
    dependencies: [],
    devDependencies: [],
    likelyCommands: [],
    notes: [],
    ...overrides,
  };
}

function makeSearch(overrides?: Partial<SearchResult>): SearchResult {
  return {
    candidates: [],
    scannedFiles: 10,
    skippedFiles: 0,
    notes: [],
    ...overrides,
  };
}

function makeTests(overrides?: Partial<TestDetection>): TestDetection {
  return {
    testFiles: [],
    testDirs: [],
    likelyTestCommands: [],
    notes: [],
    ...overrides,
  };
}

function makeBuildInput(overrides?: Partial<BoundaryBuildInput>): BoundaryBuildInput {
  return {
    featureId: "F001",
    featureTitle: "Test",
    depth: "D2",
    project: makeProject(),
    packageInfo: makePackageInfo(),
    search: makeSearch(),
    tests: makeTests(),
    hints: [],
    maxFiles: 25,
    ...overrides,
  };
}

describe("detectRiskGates", () => {
  it("triggers auth_rewrite when paths contain 'auth'", () => {
    const gates = detectRiskGates(["src/auth/login.ts"], []);

    const authGate = gates.find((g) => g.name === "auth_rewrite");
    expect(authGate).toBeDefined();
    expect(authGate!.status).toBe("triggered");
    expect(authGate!.reason).toContain("auth");
  });

  it("triggers payment_logic when keywords contain 'payment'", () => {
    const gates = detectRiskGates([], ["payment"]);

    const paymentGate = gates.find((g) => g.name === "payment_logic");
    expect(paymentGate).toBeDefined();
    expect(paymentGate!.status).toBe("triggered");
    expect(paymentGate!.reason).toContain("payment");
  });

  it("triggers destructive_migration when paths contain 'migration'", () => {
    const gates = detectRiskGates(["db/migration/001.sql"], []);

    const migrationGate = gates.find((g) => g.name === "destructive_migration");
    expect(migrationGate).toBeDefined();
    expect(migrationGate!.status).toBe("triggered");
    expect(migrationGate!.reason).toContain("migration");
  });

  it("returns empty array when no matching paths or keywords", () => {
    const gates = detectRiskGates(["src/utils/math.ts"], ["calculate"]);

    expect(gates).toHaveLength(0);
  });

  it("can trigger multiple gates at once", () => {
    const gates = detectRiskGates(
      ["src/auth/service.ts", "db/migration/001.sql"],
      ["payment"],
    );

    const names = gates.map((g) => g.name);
    expect(names).toContain("auth_rewrite");
    expect(names).toContain("payment_logic");
    expect(names).toContain("destructive_migration");
  });
});

describe("buildBoundary", () => {
  it("populates touchFiles from source candidates with score >= 3", () => {
    const candidates: CandidateFile[] = [
      {
        path: "src/auth/password.ts",
        reason: "matches: password",
        confidence: "high",
        score: 8,
        kind: "source",
        matchedTerms: ["password"],
      },
      {
        path: "src/utils/math.ts",
        reason: "scanned",
        confidence: "low",
        score: 1,
        kind: "source",
        matchedTerms: [],
      },
      {
        path: "README.md",
        reason: "scanned",
        confidence: "low",
        score: 2,
        kind: "docs",
        matchedTerms: [],
      },
    ];

    const input = makeBuildInput({
      search: makeSearch({ candidates }),
    });

    const boundary = buildBoundary(input);

    // Only the high-scoring source file should be a touch file
    expect(boundary.touchFiles).toHaveLength(1);
    expect(boundary.touchFiles[0]!.path).toBe("src/auth/password.ts");

    // Low-scoring source file should NOT be a touch file
    const mathFile = boundary.touchFiles.find((f) => f.path.includes("math"));
    expect(mathFile).toBeUndefined();
  });

  it("sets confidence based on touchFiles and tests count", () => {
    // No touch files, no tests -> unknown
    const emptyInput = makeBuildInput();
    const emptyBoundary = buildBoundary(emptyInput);
    expect(emptyBoundary.confidence).toBe("unknown");

    // A few touch files, no tests -> low or medium
    const lowCandidates: CandidateFile[] = [
      {
        path: "src/a.ts",
        reason: "matches",
        confidence: "med",
        score: 5,
        kind: "source",
        matchedTerms: ["a"],
      },
    ];
    const lowInput = makeBuildInput({
      search: makeSearch({ candidates: lowCandidates }),
    });
    const lowBoundary = buildBoundary(lowInput);
    expect(["low", "medium"]).toContain(lowBoundary.confidence);

    // 3+ touch files and 1+ test -> high
    const highCandidates: CandidateFile[] = Array.from({ length: 4 }, (_, i) => ({
      path: `src/file${i}.ts`,
      reason: "matches",
      confidence: "high" as const,
      score: 5,
      kind: "source" as const,
      matchedTerms: ["test"],
    }));
    const highInput = makeBuildInput({
      search: makeSearch({ candidates: highCandidates }),
      tests: makeTests({
        testFiles: [
          {
            path: "tests/file0.test.ts",
            reason: "test file",
            confidence: "high",
            score: 3,
            kind: "test",
            matchedTerms: ["test"],
          },
        ],
      }),
    });
    const highBoundary = buildBoundary(highInput);
    expect(highBoundary.confidence).toBe("high");
  });

  it("populates riskGates from detected paths and keywords", () => {
    const candidates: CandidateFile[] = [
      {
        path: "src/auth/login.ts",
        reason: "matches: auth",
        confidence: "high",
        score: 8,
        kind: "source",
        matchedTerms: ["auth"],
      },
    ];

    const input = makeBuildInput({
      search: makeSearch({ candidates }),
    });

    const boundary = buildBoundary(input);

    const authGate = boundary.riskGates.find((g) => g.name === "auth_rewrite");
    expect(authGate).toBeDefined();
  });

  it("emits riskGates entries in the canonical { name, reason, status } shape", () => {
    const candidates: CandidateFile[] = [
      {
        path: "src/cobranca/charge.ts",
        reason: "matches: billing",
        confidence: "high",
        score: 8,
        kind: "source",
        matchedTerms: ["billing", "payment"],
      },
    ];

    const input = makeBuildInput({
      search: makeSearch({ candidates }),
    });

    const boundary = buildBoundary(input);

    // payment_logic should trigger from billing + payment keywords.
    const paymentGate = boundary.riskGates.find(
      (g) => g.name === "payment_logic",
    );
    expect(paymentGate).toBeDefined();
    expect(paymentGate).not.toBeNull();
    // canonical shape — never the legacy { gate, notes } shape
    expect(paymentGate).toHaveProperty("name", "payment_logic");
    expect(paymentGate).toHaveProperty("reason");
    expect(paymentGate).toHaveProperty("status", "triggered");
    expect(paymentGate).not.toHaveProperty("gate");
    expect(paymentGate).not.toHaveProperty("notes");
  });

  it("every emitted riskGates status is a known value", () => {
    const candidates: CandidateFile[] = [
      {
        path: "src/auth/login.ts",
        reason: "matches: auth",
        confidence: "high",
        score: 8,
        kind: "source",
        matchedTerms: ["auth"],
      },
      {
        path: "src/billing/invoice.ts",
        reason: "matches: billing",
        confidence: "high",
        score: 8,
        kind: "source",
        matchedTerms: ["billing"],
      },
    ];

    const input = makeBuildInput({
      search: makeSearch({ candidates }),
    });

    const boundary = buildBoundary(input);

    const validStatuses = new Set([
      "triggered",
      "approved",
      "resolved",
      "unresolved",
    ]);
    for (const gate of boundary.riskGates) {
      expect(validStatuses.has(gate.status)).toBe(true);
    }
  });

  it("populates unknowns when no touch files found", () => {
    const input = makeBuildInput();
    const boundary = buildBoundary(input);

    expect(boundary.unknowns.some((u) => u.includes("No likely touch files"))).toBe(true);
  });

  it("includes doNotTouch and blockedEditGlobs", () => {
    const input = makeBuildInput();
    const boundary = buildBoundary(input);

    expect(boundary.doNotTouch.length).toBeGreaterThan(0);
    expect(boundary.doNotTouch).toContain("node_modules/");
    expect(boundary.blockedEditGlobs.length).toBeGreaterThan(0);
    expect(boundary.blockedEditGlobs).toContain("node_modules/**");
  });

  it("sets featureId and featureTitle from input", () => {
    const input = makeBuildInput({
      featureId: "F042",
      featureTitle: "My Feature",
    });

    const boundary = buildBoundary(input);

    expect(boundary.featureId).toBe("F042");
    expect(boundary.featureTitle).toBe("My Feature");
    expect(boundary.status).toBe("discovered");
  });

  it("respects maxFiles limit", () => {
    const candidates: CandidateFile[] = Array.from({ length: 50 }, (_, i) => ({
      path: `src/file${i}.ts`,
      reason: "matches",
      confidence: "high" as const,
      score: 5,
      kind: "source" as const,
      matchedTerms: ["test"],
    }));

    const input = makeBuildInput({
      search: makeSearch({ candidates }),
      maxFiles: 3,
    });

    const boundary = buildBoundary(input);
    expect(boundary.touchFiles.length).toBeLessThanOrEqual(3);
  });
});

describe("renderDiscoveryMarkdown", () => {
  it("contains expected headings", () => {
    const boundary = buildBoundary(makeBuildInput());
    const renderInput: DiscoveryRenderInput = {
      featureId: "F001",
      featureTitle: "Test Feature",
      depth: "D2",
      confidence: boundary.confidence,
      project: makeProject(),
      packageInfo: makePackageInfo(),
      boundary,
      search: makeSearch(),
      tests: makeTests(),
      specSummary: "Test summary",
      warnings: [],
      nextAction: "Review boundary then plan.",
    };

    const md = renderDiscoveryMarkdown(renderInput);

    expect(md).toContain("# F001 Discovery");
    expect(md).toContain("## Status");
    expect(md).toContain("## Discovery Goal");
    expect(md).toContain("## Summary");
    expect(md).toContain("## Likely Touch Files");
    expect(md).toContain("## Read-Only Reference Files");
    expect(md).toContain("## Relevant Tests");
    expect(md).toContain("## Commands Discovered");
    expect(md).toContain("## Change Boundary Summary");
    expect(md).toContain("## Risks");
    expect(md).toContain("## Unknowns");
    expect(md).toContain("## Do Not Touch");
    expect(md).toContain("## Next Step Recommendation");
  });

  it("includes spec summary in discovery goal", () => {
    const boundary = buildBoundary(makeBuildInput());
    const renderInput: DiscoveryRenderInput = {
      featureId: "F001",
      featureTitle: "Test Feature",
      depth: "D2",
      confidence: boundary.confidence,
      project: makeProject(),
      packageInfo: makePackageInfo(),
      boundary,
      search: makeSearch(),
      tests: makeTests(),
      specSummary: "Add password reset to auth system",
      warnings: [],
      nextAction: "Review boundary.",
    };

    const md = renderDiscoveryMarkdown(renderInput);
    expect(md).toContain("Add password reset to auth system");
  });
});

describe("renderDiscoveryCavebus", () => {
  it("starts with 'DISC F001'", () => {
    const boundary = buildBoundary(makeBuildInput());
    const renderInput: DiscoveryRenderInput = {
      featureId: "F001",
      featureTitle: "Test Feature",
      depth: "D2",
      confidence: boundary.confidence,
      project: makeProject(),
      packageInfo: makePackageInfo(),
      boundary,
      search: makeSearch(),
      tests: makeTests(),
      specSummary: "Test",
      warnings: [],
      nextAction: "Plan next.",
    };

    const cavebus = renderDiscoveryCavebus(renderInput);

    expect(cavebus.startsWith("DISC F001")).toBe(true);
    expect(cavebus).toContain("touch:");
    expect(cavebus).toContain("read:");
    expect(cavebus).toContain("tests:");
    expect(cavebus).toContain("cmd:");
    expect(cavebus).toContain("risk:");
    expect(cavebus).toContain("unknown:");
    expect(cavebus).toContain("avoid:");
    expect(cavebus).toContain("next:");
  });
});
