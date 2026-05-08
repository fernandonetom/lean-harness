import { describe, it, expect } from "vitest";
import {
  isClearlyDangerousCommand,
  isSafeVerificationCommand,
  extractVerificationCommands,
} from "../../src/verification/commands.js";

describe("isClearlyDangerousCommand", () => {
  it("flags 'rm -rf /' as dangerous with reason", () => {
    const result = isClearlyDangerousCommand("rm -rf /");
    expect(result.dangerous).toBe(true);
    expect(result.reason).toContain("recursive file deletion");
  });

  it("flags 'git push' as dangerous", () => {
    const result = isClearlyDangerousCommand("git push");
    expect(result.dangerous).toBe(true);
  });

  it("flags 'npm install' as dangerous", () => {
    const result = isClearlyDangerousCommand("npm install");
    expect(result.dangerous).toBe(true);
  });

  it("flags 'DROP TABLE users' as dangerous", () => {
    const result = isClearlyDangerousCommand("DROP TABLE users");
    expect(result.dangerous).toBe(true);
  });

  it("does not flag 'npm test' as dangerous", () => {
    const result = isClearlyDangerousCommand("npm test");
    expect(result.dangerous).toBe(false);
  });

  it("does not flag 'tsc --noEmit' as dangerous", () => {
    const result = isClearlyDangerousCommand("tsc --noEmit");
    expect(result.dangerous).toBe(false);
  });
});

describe("isSafeVerificationCommand", () => {
  it("recognizes 'npm test'", () => {
    expect(isSafeVerificationCommand("npm test")).toBe(true);
  });

  it("recognizes 'npm run lint'", () => {
    expect(isSafeVerificationCommand("npm run lint")).toBe(true);
  });

  it("recognizes 'pytest'", () => {
    expect(isSafeVerificationCommand("pytest")).toBe(true);
  });

  it("recognizes 'go test ./...'", () => {
    expect(isSafeVerificationCommand("go test ./...")).toBe(true);
  });

  it("recognizes 'tsc --noEmit'", () => {
    expect(isSafeVerificationCommand("tsc --noEmit")).toBe(true);
  });

  it("recognizes 'eslint'", () => {
    expect(isSafeVerificationCommand("eslint")).toBe(true);
  });

  it("rejects 'random-command'", () => {
    expect(isSafeVerificationCommand("random-command")).toBe(false);
  });
});

describe("extractVerificationCommands", () => {
  it("extracts commands from boundary object", () => {
    const commands = extractVerificationCommands({
      boundary: {
        commands: [{ command: "npm test", purpose: "run tests" }],
      },
      planMarkdown: null,
      tasksMarkdown: null,
      taskSummaries: [],
      explicitCommands: [],
    });
    expect(commands.length).toBeGreaterThanOrEqual(1);
    expect(commands.some((c) => c.command === "npm test")).toBe(true);
  });

  it("extracts explicit commands", () => {
    const commands = extractVerificationCommands({
      boundary: null,
      planMarkdown: null,
      tasksMarkdown: null,
      taskSummaries: [],
      explicitCommands: ["npm run lint"],
    });
    expect(commands.some((c) => c.command === "npm run lint")).toBe(true);
    expect(commands.find((c) => c.command === "npm run lint")!.required).toBe(true);
  });

  it("deduplicates commands", () => {
    const commands = extractVerificationCommands({
      boundary: null,
      planMarkdown: null,
      tasksMarkdown: null,
      taskSummaries: [],
      explicitCommands: ["npm test", "npm test"],
    });
    expect(commands.filter((c) => c.command === "npm test").length).toBe(1);
  });
});
