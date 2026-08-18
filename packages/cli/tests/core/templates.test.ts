import { describe, it, expect, afterEach } from "vitest";
import {
  renderTemplate,
  loadTemplate,
  renderNamedTemplate,
  ensureFinalNewline,
} from "../../src/core/templates.js";
import { createTempWorkspace, initHarnessWorkspace } from "../helpers/workspace.js";
import { writeTextFile } from "../../src/core/fs.js";
import { harnessPath } from "../../src/core/paths.js";
import type { TestWorkspace } from "../helpers/workspace.js";

let ws: TestWorkspace | undefined;

afterEach(async () => {
  if (ws) {
    await ws.cleanup();
    ws = undefined;
  }
});

// ---------------------------------------------------------------------------
// renderTemplate
// ---------------------------------------------------------------------------

describe("renderTemplate", () => {
  it("replaces a single placeholder", () => {
    expect(renderTemplate("Hello {{NAME}}", { NAME: "World" })).toBe(
      "Hello World",
    );
  });

  it("replaces multiple placeholders", () => {
    expect(
      renderTemplate("{{A}} and {{B}}", { A: "x", B: "y" }),
    ).toBe("x and y");
  });

  it("leaves unmatched placeholders as-is", () => {
    expect(renderTemplate("{{A}} and {{B}}", { A: "x" })).toBe(
      "x and {{B}}",
    );
  });

  it("leaves all placeholders when values is empty", () => {
    expect(renderTemplate("{{A}} {{B}}", {})).toBe("{{A}} {{B}}");
  });

  it("handles template with no placeholders", () => {
    expect(renderTemplate("plain text", { A: "x" })).toBe("plain text");
  });

  it("handles empty template string", () => {
    expect(renderTemplate("", { A: "x" })).toBe("");
  });
});

// ---------------------------------------------------------------------------
// ensureFinalNewline
// ---------------------------------------------------------------------------

describe("ensureFinalNewline", () => {
  it("adds newline to string without one", () => {
    expect(ensureFinalNewline("hello")).toBe("hello\n");
  });

  it("does not add extra newline if already present", () => {
    expect(ensureFinalNewline("hello\n")).toBe("hello\n");
  });

  it("converts empty string to a single newline", () => {
    expect(ensureFinalNewline("")).toBe("\n");
  });

  it("handles string with only a newline", () => {
    expect(ensureFinalNewline("\n")).toBe("\n");
  });
});

// ---------------------------------------------------------------------------
// loadTemplate
// ---------------------------------------------------------------------------

describe("loadTemplate", () => {
  it("returns null when template does not exist", async () => {
    ws = await createTempWorkspace();
    await initHarnessWorkspace(ws.root);
    const result = await loadTemplate(ws.root, "nonexistent");
    expect(result).toBeNull();
  });

  it("loads a template file by name (auto-adds .md)", async () => {
    ws = await createTempWorkspace();
    await initHarnessWorkspace(ws.root);
    const templatePath = harnessPath(ws.root, "templates", "greeting.md");
    await writeTextFile(templatePath, "Hello {{NAME}}!");
    const result = await loadTemplate(ws.root, "greeting");
    expect(result).toBe("Hello {{NAME}}!");
  });

  it("loads a template file when .md extension is included", async () => {
    ws = await createTempWorkspace();
    await initHarnessWorkspace(ws.root);
    const templatePath = harnessPath(ws.root, "templates", "greeting.md");
    await writeTextFile(templatePath, "Hi {{NAME}}!");
    const result = await loadTemplate(ws.root, "greeting.md");
    expect(result).toBe("Hi {{NAME}}!");
  });
});

// ---------------------------------------------------------------------------
// renderNamedTemplate
// ---------------------------------------------------------------------------

describe("renderNamedTemplate", () => {
  it("loads and renders a template with values", async () => {
    ws = await createTempWorkspace();
    await initHarnessWorkspace(ws.root);
    const templatePath = harnessPath(ws.root, "templates", "hello.md");
    await writeTextFile(templatePath, "Hello {{NAME}}, welcome to {{PLACE}}!");
    const result = await renderNamedTemplate(ws.root, "hello", {
      NAME: "Alice",
      PLACE: "Wonderland",
    });
    expect(result).toBe("Hello Alice, welcome to Wonderland!\n");
  });

  it("ensures final newline in rendered output", async () => {
    ws = await createTempWorkspace();
    await initHarnessWorkspace(ws.root);
    const templatePath = harnessPath(ws.root, "templates", "simple.md");
    await writeTextFile(templatePath, "no newline");
    const result = await renderNamedTemplate(ws.root, "simple", {});
    expect(result).toBe("no newline\n");
  });

  it("throws when template is not found", async () => {
    ws = await createTempWorkspace();
    await initHarnessWorkspace(ws.root);
    await expect(
      renderNamedTemplate(ws.root, "missing", {}),
    ).rejects.toThrow("Template not found");
  });
});
