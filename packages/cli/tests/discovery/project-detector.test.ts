import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fsp from "node:fs/promises";
import { detectProject } from "../../src/discovery/project-detector.js";
import { createTempWorkspace, type TestWorkspace } from "../helpers/workspace.js";

let ws: TestWorkspace;

beforeEach(async () => {
  ws = await createTempWorkspace();
});

afterEach(async () => {
  await ws.cleanup();
});

describe("detectProject", () => {
  it("detects typescript and npm from package.json + tsconfig.json", async () => {
    await fsp.writeFile(path.join(ws.root, "package.json"), "{}");
    await fsp.writeFile(path.join(ws.root, "tsconfig.json"), "{}");

    const result = await detectProject(ws.root);

    expect(result.root).toBe(ws.root);
    expect(result.languages).toContain("typescript");
    expect(result.packageManagers).toContain("npm");
    expect(result.configFiles).toContain("tsconfig.json");
    expect(result.configFiles).toContain("package.json");
    expect(result.importantFiles).toContain("package.json");
    expect(result.importantFiles).toContain("tsconfig.json");
  });

  it("detects pnpm from pnpm-lock.yaml", async () => {
    await fsp.writeFile(path.join(ws.root, "package.json"), "{}");
    await fsp.writeFile(path.join(ws.root, "pnpm-lock.yaml"), "");

    const result = await detectProject(ws.root);

    expect(result.packageManagers).toContain("pnpm");
    expect(result.packageManagers).not.toContain("npm");
  });

  it("detects next.js framework from next.config.js", async () => {
    await fsp.writeFile(path.join(ws.root, "next.config.js"), "module.exports = {}");

    const result = await detectProject(ws.root);

    expect(result.frameworks).toContain("next.js");
  });

  it("detects src/ source directory", async () => {
    await fsp.mkdir(path.join(ws.root, "src"));

    const result = await detectProject(ws.root);

    expect(result.sourceDirs).toContain("src");
  });

  it("detects tests/ test directory", async () => {
    await fsp.mkdir(path.join(ws.root, "tests"));

    const result = await detectProject(ws.root);

    expect(result.testDirs).toContain("tests");
  });

  it("notes when no languages or source dirs found in an empty dir", async () => {
    const result = await detectProject(ws.root);

    expect(result.languages).toHaveLength(0);
    expect(result.sourceDirs).toHaveLength(0);
    expect(result.notes.some((n) => n.includes("No recognized language"))).toBe(true);
    expect(result.notes.some((n) => n.includes("No common source directories"))).toBe(true);
  });

  it("filters out javascript when typescript is also detected", async () => {
    await fsp.writeFile(path.join(ws.root, "tsconfig.json"), "{}");
    await fsp.writeFile(path.join(ws.root, "package.json"), "{}");

    const result = await detectProject(ws.root);

    expect(result.languages).toContain("typescript");
    expect(result.languages).not.toContain("javascript");
  });

  it("detects multiple source and test dirs", async () => {
    await fsp.mkdir(path.join(ws.root, "src"));
    await fsp.mkdir(path.join(ws.root, "lib"));
    await fsp.mkdir(path.join(ws.root, "tests"));
    await fsp.mkdir(path.join(ws.root, "e2e"));

    const result = await detectProject(ws.root);

    expect(result.sourceDirs).toContain("src");
    expect(result.sourceDirs).toContain("lib");
    expect(result.testDirs).toContain("tests");
    expect(result.testDirs).toContain("e2e");
  });

  it("falls back to npm when package.json exists but no lockfile", async () => {
    await fsp.writeFile(path.join(ws.root, "package.json"), "{}");

    const result = await detectProject(ws.root);

    expect(result.packageManagers).toContain("npm");
  });

  it("detects csharp from .csproj file", async () => {
    await fsp.writeFile(path.join(ws.root, "MyApp.csproj"), "<Project />");

    const result = await detectProject(ws.root);

    expect(result.languages).toContain("csharp");
  });

  it("detects csharp from .sln file", async () => {
    await fsp.writeFile(path.join(ws.root, "MyApp.sln"), "");

    const result = await detectProject(ws.root);

    expect(result.languages).toContain("csharp");
  });

  it("detects go from go.mod", async () => {
    await fsp.writeFile(path.join(ws.root, "go.mod"), "module example.com/app");

    const result = await detectProject(ws.root);

    expect(result.languages).toContain("go");
  });

  it("detects rust from Cargo.toml", async () => {
    await fsp.writeFile(path.join(ws.root, "Cargo.toml"), "[package]");

    const result = await detectProject(ws.root);

    expect(result.languages).toContain("rust");
  });

  it("detects java from pom.xml", async () => {
    await fsp.writeFile(path.join(ws.root, "pom.xml"), "<project />");

    const result = await detectProject(ws.root);

    expect(result.languages).toContain("java");
  });

  it("detects ruby from Gemfile", async () => {
    await fsp.writeFile(path.join(ws.root, "Gemfile"), "source 'https://rubygems.org'");

    const result = await detectProject(ws.root);

    expect(result.languages).toContain("ruby");
  });

  it("detects php from composer.json", async () => {
    await fsp.writeFile(path.join(ws.root, "composer.json"), "{}");

    const result = await detectProject(ws.root);

    expect(result.languages).toContain("php");
  });

  it("does not duplicate csharp when both .csproj and .sln exist", async () => {
    await fsp.writeFile(path.join(ws.root, "App.csproj"), "<Project />");
    await fsp.writeFile(path.join(ws.root, "App.sln"), "");

    const result = await detectProject(ws.root);

    expect(result.languages.filter((l) => l === "csharp")).toHaveLength(1);
  });
});
