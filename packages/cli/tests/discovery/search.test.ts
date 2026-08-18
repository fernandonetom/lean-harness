import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fsp from "node:fs/promises";
import { extractKeywords, searchRelevantFiles } from "../../src/discovery/search.js";
import { createTempWorkspace, type TestWorkspace } from "../helpers/workspace.js";

describe("extractKeywords", () => {
  it("extracts relevant keywords and synonyms from password reset request", () => {
    const keywords = extractKeywords(
      "Add password reset without replacing existing auth",
    );

    expect(keywords).toContain("password");
    expect(keywords).toContain("reset");
    expect(keywords).toContain("auth");
    // synonyms of "auth"
    expect(keywords).toContain("authentication");
    expect(keywords).toContain("session");
    expect(keywords).toContain("login");
    // synonyms of "password"
    expect(keywords).toContain("credential");
    expect(keywords).toContain("hash");

    // stop words should be excluded
    expect(keywords).not.toContain("add");
    expect(keywords).not.toContain("without");
    expect(keywords).not.toContain("replacing");
    expect(keywords).not.toContain("existing");
  });

  it("extracts billing/checkout keywords with synonyms", () => {
    const keywords = extractKeywords("Update billing checkout");

    expect(keywords).toContain("billing");
    expect(keywords).toContain("checkout");
    // synonyms of "billing"
    expect(keywords).toContain("payment");
    expect(keywords).toContain("invoice");
    expect(keywords).toContain("subscription");
    expect(keywords).toContain("price");
  });

  it("returns empty array for only stop words", () => {
    const keywords = extractKeywords("add the new");
    expect(keywords).toHaveLength(0);
  });
});

describe("searchRelevantFiles", () => {
  let ws: TestWorkspace;

  beforeEach(async () => {
    ws = await createTempWorkspace();
  });

  afterEach(async () => {
    await ws.cleanup();
  });

  it("finds files matching keywords with higher scores for path matches", async () => {
    // Create directory structure
    await fsp.mkdir(path.join(ws.root, "src", "auth"), { recursive: true });
    await fsp.mkdir(path.join(ws.root, "src", "email"), { recursive: true });

    // Create files with relevant content
    await fsp.writeFile(
      path.join(ws.root, "src", "auth", "password.ts"),
      'export function resetPassword() { /* password reset logic */ }\n',
    );
    await fsp.writeFile(
      path.join(ws.root, "src", "email", "send.ts"),
      'export function sendEmail() { /* email sending */ }\n',
    );

    const result = await searchRelevantFiles(ws.root, ["password", "auth"]);

    expect(result.scannedFiles).toBeGreaterThan(0);
    expect(result.candidates.length).toBeGreaterThan(0);

    // The auth/password.ts should be found and have a high score
    const passwordFile = result.candidates.find((c) =>
      c.path.includes("auth/password.ts"),
    );
    expect(passwordFile).toBeDefined();
    expect(passwordFile!.score).toBeGreaterThanOrEqual(3);
    expect(passwordFile!.kind).toBe("source");

    // It should have a higher score than the email file (which may not even appear)
    const emailFile = result.candidates.find((c) =>
      c.path.includes("email/send.ts"),
    );
    if (emailFile) {
      expect(passwordFile!.score).toBeGreaterThan(emailFile.score);
    }
  });

  it("skips node_modules directory", async () => {
    await fsp.mkdir(path.join(ws.root, "node_modules"), { recursive: true });
    await fsp.writeFile(
      path.join(ws.root, "node_modules", "foo.ts"),
      'export const password = "test";\n',
    );

    const result = await searchRelevantFiles(ws.root, ["password"]);

    const nodeModulesFile = result.candidates.find((c) =>
      c.path.includes("node_modules"),
    );
    expect(nodeModulesFile).toBeUndefined();
  });

  it("respects maxResults option", async () => {
    // Create several source files
    await fsp.mkdir(path.join(ws.root, "src"), { recursive: true });
    for (let i = 0; i < 10; i++) {
      await fsp.writeFile(
        path.join(ws.root, "src", `auth${i}.ts`),
        `export const auth${i} = true;\n`,
      );
    }

    const result = await searchRelevantFiles(ws.root, ["auth"], {
      maxResults: 3,
    });

    expect(result.candidates.length).toBeLessThanOrEqual(3);
  });

  it("returns no keyword-matched candidates for gibberish keywords", async () => {
    await fsp.mkdir(path.join(ws.root, "src"), { recursive: true });
    await fsp.writeFile(
      path.join(ws.root, "src", "utils.txt"),
      "some plain text notes\n",
    );

    const result = await searchRelevantFiles(ws.root, [
      "xyznonexistent",
      "abcnotfound",
    ]);

    expect(result.candidates).toHaveLength(0);
    expect(result.notes.some((n) => n.includes("No candidate files"))).toBe(
      true,
    );
  });

  it("assigns correct kind to test files", async () => {
    await fsp.mkdir(path.join(ws.root, "tests"), { recursive: true });
    await fsp.writeFile(
      path.join(ws.root, "tests", "auth.test.ts"),
      'import { describe } from "vitest";\ndescribe("auth", () => {});\n',
    );

    const result = await searchRelevantFiles(ws.root, ["auth"]);
    const testFile = result.candidates.find((c) =>
      c.path.includes("auth.test.ts"),
    );
    expect(testFile).toBeDefined();
    expect(testFile!.kind).toBe("test");
  });
});
