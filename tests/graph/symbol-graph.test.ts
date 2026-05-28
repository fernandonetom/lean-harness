import { describe, it, expect, beforeEach } from "vitest";
import { buildSymbolGraph, findSymbol, findImplementors, findSubclasses, symbolsInFiles } from "../../src/graph/symbol-graph.js";
import { createTempWorkspace, type TestWorkspace } from "../helpers/workspace.js";
import { writeTextFile } from "../../src/core/fs.js";

let ws: TestWorkspace;

beforeEach(async () => {
  ws = await createTempWorkspace();
});

describe("buildSymbolGraph", () => {
  it("extracts classes and interfaces", async () => {
    await writeTextFile(ws.root + "/src/types.ts", `export interface UserService { getUser(id: string): Promise<User>; }
export class UserServiceImpl implements UserService { async getUser(id: string) { return { id }; } }`);

    const graph = await buildSymbolGraph(ws.root, ["src/types.ts"]);

    expect(graph.symbols["src/types.ts"]).toBeDefined();
    const symbols = graph.symbols["src/types.ts"]!;
    expect(symbols.some((s) => s.name === "UserService" && s.kind === "interface")).toBe(true);
    expect(symbols.some((s) => s.name === "UserServiceImpl" && s.kind === "class")).toBe(true);
  });

  it("extracts functions and constants", async () => {
    await writeTextFile(ws.root + "/src/utils.ts", `export function helper() { return 1; }
export const VALUE = 42;`);

    const graph = await buildSymbolGraph(ws.root, ["src/utils.ts"]);

    const symbols = graph.symbols["src/utils.ts"]!;
    expect(symbols.some((s) => s.name === "helper" && s.kind === "function")).toBe(true);
    expect(symbols.some((s) => s.name === "VALUE" && s.kind === "const")).toBe(true);
  });

  it("extracts types and enums", async () => {
    await writeTextFile(ws.root + "/src/types.ts", `export type UserId = string;
export enum Role { ADMIN = "admin", USER = "user" }`);

    const graph = await buildSymbolGraph(ws.root, ["src/types.ts"]);

    const symbols = graph.symbols["src/types.ts"]!;
    expect(symbols.some((s) => s.name === "UserId" && s.kind === "type")).toBe(true);
    expect(symbols.some((s) => s.name === "Role" && s.kind === "enum")).toBe(true);
  });

  it("handles files with no symbols", async () => {
    await writeTextFile(ws.root + "/src/empty.ts", "// no symbols here");

    const graph = await buildSymbolGraph(ws.root, ["src/empty.ts"]);

    expect(graph.symbols["src/empty.ts"]).toBeUndefined();
  });
});

describe("findSymbol", () => {
  it("finds symbol by name", async () => {
    await writeTextFile(ws.root + "/src/types.ts", `export class MyClass {}`);

    const graph = await buildSymbolGraph(ws.root, ["src/types.ts"]);
    const results = findSymbol(graph, "MyClass");

    expect(results.length).toBe(1);
    expect(results[0].name).toBe("MyClass");
    expect(results[0].kind).toBe("class");
  });

  it("finds symbol by name and kind", async () => {
    await writeTextFile(ws.root + "/src/types.ts", `export const MyClass = 1;`);

    const graph = await buildSymbolGraph(ws.root, ["src/types.ts"]);
    const results = findSymbol(graph, "MyClass", "const");

    expect(results.length).toBe(1);
    expect(results[0].kind).toBe("const");
  });

  it("returns empty array when symbol not found", async () => {
    await writeTextFile(ws.root + "/src/types.ts", `export class MyClass {}`);

    const graph = await buildSymbolGraph(ws.root, ["src/types.ts"]);
    const results = findSymbol(graph, "NotFound");

    expect(results.length).toBe(0);
  });
});

describe("findImplementors", () => {
  it("finds classes that implement an interface", async () => {
    await writeTextFile(ws.root + "/src/types.ts", `interface Repository { save(): void; }
class UserRepository implements Repository { save() {} }
class PostRepository implements Repository { save() {} }`);

    const graph = await buildSymbolGraph(ws.root, ["src/types.ts"]);
    const implementors = findImplementors(graph, "Repository");

    const names = implementors.map((i) => i.name);
    expect(names).toContain("UserRepository");
    expect(names).toContain("PostRepository");
  });

  it("returns empty array when no implementors", async () => {
    await writeTextFile(ws.root + "/src/types.ts", `interface Repository { save(): void; }`);

    const graph = await buildSymbolGraph(ws.root, ["src/types.ts"]);
    const implementors = findImplementors(graph, "Repository");

    expect(implementors.length).toBe(0);
  });
});

describe("findSubclasses", () => {
  it("finds classes that extend a base class", async () => {
    await writeTextFile(ws.root + "/src/types.ts", `class Base {}
class Child1 extends Base {}
class Child2 extends Base {}`);

    const graph = await buildSymbolGraph(ws.root, ["src/types.ts"]);
    const subclasses = findSubclasses(graph, "Base");

    const names = subclasses.map((s) => s.name);
    expect(names).toContain("Child1");
    expect(names).toContain("Child2");
  });

  it("returns empty array when no subclasses", async () => {
    await writeTextFile(ws.root + "/src/types.ts", `class Base {}`);

    const graph = await buildSymbolGraph(ws.root, ["src/types.ts"]);
    const subclasses = findSubclasses(graph, "Base");

    expect(subclasses.length).toBe(0);
  });
});

describe("symbolsInFiles", () => {
  it("filters symbols by file paths", async () => {
    await writeTextFile(ws.root + "/src/a.ts", `export class A {}`);
    await writeTextFile(ws.root + "/src/b.ts", `export class B {}`);

    const graph = await buildSymbolGraph(ws.root, ["src/a.ts", "src/b.ts"]);
    const symbols = symbolsInFiles(graph, ["src/a.ts"]);

    expect(symbols.length).toBe(1);
    expect(symbols[0].name).toBe("A");
  });

  it("returns empty array when no matching files", async () => {
    await writeTextFile(ws.root + "/src/a.ts", `export class A {}`);

    const graph = await buildSymbolGraph(ws.root, ["src/a.ts"]);
    const symbols = symbolsInFiles(graph, ["src/nonexistent.ts"]);

    expect(symbols.length).toBe(0);
  });
});
