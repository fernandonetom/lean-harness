import { getVersion } from "../../src/core/version.js";
import type { HarnessState, FeatureIndexEntry } from "../../src/core/types.js";

export function createTestState(overrides?: Partial<HarnessState>): HarnessState {
  return {
    version: getVersion(),
    schema: "leanharness-state",
    activeFeature: null,
    nextFeatureNumber: 1,
    features: [],
    lastUpdated: null,
    notes: "test state",
    ...overrides,
  };
}

export function createTestFeatureEntry(overrides?: Partial<FeatureIndexEntry>): FeatureIndexEntry {
  return {
    id: "F001",
    slug: "test-feature",
    title: "Test Feature",
    path: "F001-test-feature",
    status: "draft",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export const SAMPLE_SPEC_MD = `# Spec: F001 — Add password reset

**Status:** draft

## Original Request

Add password reset functionality to the auth system

## Goal

Add password reset

## Non-Goals

_Define what this feature explicitly does not cover._

## Users / Actors

_Who interacts with this feature?_

## Acceptance Criteria

- [ ] AC1: Users can request a password reset email
- [ ] AC2: Reset tokens expire after 24 hours
- [ ] AC3: Users can set a new password with a valid token

## Constraints

- Must use existing email service
- Must not break existing login flow

## Assumptions

_What this feature assumes about the existing system._

## Verification Expectations

_How should verification confirm this feature works?_

## Risk Notes

_None identified._

## Clarifying Questions

_Open questions to resolve before or during discovery._

## Notes

_Additional context for discovery and planning._
`;

export const SAMPLE_BOUNDARY_JSON = {
  featureId: "F001",
  featureTitle: "Add password reset",
  status: "discovered",
  confidence: "medium",
  discoveryDepth: "D2",
  touchFiles: [
    { path: "src/auth/password.ts", reason: "matches: password", confidence: "high" },
    { path: "src/auth/session.ts", reason: "matches: auth, session", confidence: "medium" },
  ],
  readOnlyFiles: [
    { path: "package.json", reason: "important project file", confidence: "low" },
  ],
  relevantTests: [
    { path: "tests/auth/password.test.ts", reason: "test file", confidence: "medium" },
  ],
  commands: [
    { command: "npm test", purpose: "run tests", confidence: "high", source: "package.json" },
    { command: "npm run typecheck", purpose: "typecheck", confidence: "high", source: "package.json" },
  ],
  allowedEditGlobs: ["src/auth/password.ts", "src/auth/session.ts"],
  blockedEditGlobs: ["node_modules/**", "dist/**"],
  riskGates: [
    { name: "auth_rewrite", reason: "path contains \"auth\"", status: "triggered" },
  ],
  unknowns: [],
  doNotTouch: ["node_modules/", "dist/"],
  protectedTokens: ["F001", "src/auth/password.ts", "npm test"],
  lastUpdated: "2024-01-01T00:00:00.000Z",
};

export const SAMPLE_TASKS_MD = `# F001 Tasks

## Status

planned

## Task Rules

- Each task must map to acceptance criteria or a technical prerequisite.

## Tasks

### T01: Implement password reset request

- Status: planned
- Acceptance criteria:
  - AC1
- Slice: Implementation
- Goal: Implement changes in src/auth/password.ts.
- Expected files:
  - src/auth/password.ts
- Read-only context:
  - package.json
- Test expectation: Tests in tests/auth/password.test.ts should pass after changes.
- Verification commands:
  - npm test
  - npm run typecheck
- Risk notes:
  - Risk gate: auth_rewrite
- Dependencies: none
- Summary file: .lh/features/F001-add-password-reset/task-summaries/T01.md

### T02: Implement token validation and password update

- Status: planned
- Acceptance criteria:
  - AC2
  - AC3
- Slice: Implementation
- Goal: Implement changes in src/auth/session.ts.
- Expected files:
  - src/auth/session.ts
- Read-only context:
  - package.json
- Test expectation: Add or update tests for changed behavior.
- Verification commands:
  - npm test
- Risk notes: none
- Dependencies:
  - T01
- Summary file: .lh/features/F001-add-password-reset/task-summaries/T02.md
`;
