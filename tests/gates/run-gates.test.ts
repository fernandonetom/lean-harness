import { describe, it, expect } from "vitest";
import { parseTypeScriptDiagnostics, filterFiles } from "../../src/gates/run-gates.js";
import { defaultGateConfig } from "../../src/gates/types.js";

describe("parseTypeScriptDiagnostics", () => {
  it("parses a single error diagnostic", () => {
    const input = "src/file.ts(10,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.";
    const result = parseTypeScriptDiagnostics(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      file: "src/file.ts",
      line: 10,
      column: 5,
      severity: "error",
      message: "Argument of type 'string' is not assignable to parameter of type 'number'.",
    });
  });

  it("parses a warning diagnostic", () => {
    const input = "src/foo.ts(42,3): warning TS6133: 'x' is declared but its value is never read.";
    const result = parseTypeScriptDiagnostics(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      file: "src/foo.ts",
      line: 42,
      column: 3,
      severity: "warning",
      message: "'x' is declared but its value is never read.",
    });
  });

  it("parses multiple diagnostics", () => {
    const input = [
      "src/a.ts(1,1): error TS2304: Cannot find name 'foo'.",
      "src/a.ts(5,3): warning TS6133: 'b' is declared but never read.",
      "src/b.ts(10,5): error TS2345: Type mismatch.",
    ].join("\n");
    const result = parseTypeScriptDiagnostics(input);
    expect(result).toHaveLength(3);
    expect(result[0]!.severity).toBe("error");
    expect(result[1]!.severity).toBe("warning");
    expect(result[2]!.severity).toBe("error");
  });

  it("returns empty array for non-diagnostic output", () => {
    const input = "src/file.ts: just a regular message\nno diagnostic here\n";
    const result = parseTypeScriptDiagnostics(input);
    expect(result).toHaveLength(0);
  });

  it("returns empty array for empty string", () => {
    const result = parseTypeScriptDiagnostics("");
    expect(result).toHaveLength(0);
  });

  it("handles Windows-style paths", () => {
    const input = "src\\components\\button.ts(15,7): error TS2322: Type 'string' is not assignable to type 'number'.";
    const result = parseTypeScriptDiagnostics(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.file).toBe("src\\components\\button.ts");
    expect(result[0]!.line).toBe(15);
  });

  it("handles diagnostic with colons in message", () => {
    const input = "src/types.ts(3,1): error TS2304: Cannot find name: 'undefined'.";
    const result = parseTypeScriptDiagnostics(input);
    expect(result).toHaveLength(1);
    expect(result[0]!.message).toBe("Cannot find name: 'undefined'.");
  });
});

describe("filterFiles", () => {
  it("returns files matching include globs", () => {
    const files = ["src/index.ts", "README.md", "src/utils.js"];
    const result = filterFiles(files, ["**/*.{ts,js}"], []);
    expect(result).toEqual(["src/index.ts", "src/utils.js"]);
  });

  it("excludes files matching exclude globs", () => {
    const files = ["src/index.ts", "dist/bundle.js", "node_modules/pkg/index.js"];
    const result = filterFiles(files, ["**/*.{ts,js}"], ["dist/**", "node_modules/**"]);
    expect(result).toEqual(["src/index.ts"]);
  });

  it("handles nested directories", () => {
    const files = [
      "src/components/button.tsx",
      "src/components/button.test.tsx",
      "dist/components/button.js",
    ];
    const result = filterFiles(files, ["**/*.{tsx,js}"], ["dist/**"]);
    expect(result).toEqual(["src/components/button.tsx", "src/components/button.test.tsx"]);
  });

  it("returns empty when no files match", () => {
    const files = ["README.md", "package.json"];
    const result = filterFiles(files, ["**/*.ts"], []);
    expect(result).toEqual([]);
  });

  it("returns empty when all files are excluded", () => {
    const files = ["src/index.ts", "src/main.ts"];
    const result = filterFiles(files, ["**/*.ts"], ["src/**"]);
    expect(result).toEqual([]);
  });

  it("matches test and spec files", () => {
    const files = [
      "src/foo.test.ts",
      "src/bar.spec.ts",
      "src/baz.test.tsx",
      "src/qux.ts",
    ];
    const result = filterFiles(files, ["**/*.{test,spec}.{ts,tsx}"], []);
    expect(result).toEqual(["src/foo.test.ts", "src/bar.spec.ts", "src/baz.test.tsx"]);
  });
});

describe("defaultGateConfig", () => {
  it("returns enabled config with after_task timing", () => {
    const config = defaultGateConfig();
    expect(config.enabled).toBe(true);
    expect(config.when).toBe("after_task");
  });

  it("fails on error by default", () => {
    const config = defaultGateConfig();
    expect(config.fail_task_on).toBe("error");
  });

  it("has all three gates enabled", () => {
    const config = defaultGateConfig();
    expect(config.typecheck).toBe("touched");
    expect(config.lint).toBe("touched");
    expect(config.test).toBe("related");
  });

  it("excludes dist and node_modules", () => {
    const config = defaultGateConfig();
    expect(config.exclude_globs).toContain("dist/**");
    expect(config.exclude_globs).toContain("node_modules/**");
  });

  it("includes TypeScript and JavaScript file globs", () => {
    const config = defaultGateConfig();
    const patterns = config.include_globs.join("|");
    expect(patterns).toContain("ts");
    expect(patterns).toContain("js");
  });
});
