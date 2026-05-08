import { readTextFile } from "./fs.js";
import { harnessPath } from "./paths.js";

export type TemplateValues = Record<string, string>;

export function renderTemplate(template: string, values: TemplateValues): string {
  return template.replace(/\{\{([A-Z_]+)\}\}/g, (_match, key: string) => {
    const val = values[key];
    return val !== undefined ? val : `{{${key}}}`;
  });
}

export async function loadTemplate(root: string, name: string): Promise<string | null> {
  const ext = name.endsWith(".md") ? "" : ".md";
  const p = harnessPath(root, "templates", name + ext);
  return readTextFile(p);
}

export async function renderNamedTemplate(
  root: string,
  name: string,
  values: TemplateValues,
): Promise<string> {
  const raw = await loadTemplate(root, name);
  if (raw === null) {
    throw new Error(
      `Template not found: .lh/templates/${name}.md\nRun \`lh init\` to create default templates.`,
    );
  }
  return ensureFinalNewline(renderTemplate(raw, values));
}

export function ensureFinalNewline(value: string): string {
  if (value.length === 0) return "\n";
  return value.endsWith("\n") ? value : value + "\n";
}
