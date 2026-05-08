export type ProtectedTokenKind =
  | "file_path"
  | "directory_path"
  | "command"
  | "symbol"
  | "class_name"
  | "function_name"
  | "method_name"
  | "api_route"
  | "environment_variable"
  | "error_message"
  | "test_name"
  | "url"
  | "migration_name"
  | "database_table_name"
  | "database_column_name"
  | "configuration_key"
  | "feature_id"
  | "task_id"
  | "acceptance_criteria_id"
  | "risk_gate_name"
  | "package_name"
  | "branch_name"
  | "commit_hash";

export interface ProtectedToken {
  value: string;
  kind: ProtectedTokenKind;
  source: string;
}

const FEATURE_ID_RE = /\bF\d{3,}\b/g;
const TASK_ID_RE = /\bT\d{2,}\b/g;
const AC_ID_RE = /\bAC\d+\b/g;
const ENV_VAR_RE = /\b[A-Z][A-Z0-9_]{2,}\b/g;
const URL_RE = /https?:\/\/[^\s)>"]+/g;
const COMMIT_HASH_RE = /\b[0-9a-f]{7,40}\b/g;

const PATH_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".rs", ".rb", ".java", ".kt", ".swift",
  ".json", ".yml", ".yaml", ".toml", ".md", ".mdx",
  ".css", ".scss", ".html", ".vue", ".svelte",
  ".sql", ".sh", ".bash", ".zsh",
  ".test.ts", ".spec.ts", ".test.js", ".spec.js",
]);

const KNOWN_RISK_GATES = new Set([
  "auth_rewrite",
  "payment_logic",
  "destructive_migration",
  "new_dependency",
  "public_api_break",
  "security_sensitive_change",
]);

const ENV_LIKE_WORDS = new Set([
  "DATABASE_URL", "API_KEY", "SECRET_KEY", "NODE_ENV",
  "PORT", "HOST", "JWT_SECRET", "REDIS_URL", "MONGO_URI",
]);

export function looksLikePath(value: string): boolean {
  if (value.includes("/") && !value.startsWith("http")) return true;
  const ext = value.lastIndexOf(".");
  if (ext > 0) {
    const suffix = value.slice(ext).toLowerCase();
    if (PATH_EXTENSIONS.has(suffix)) return true;
    const dblExt = value.slice(value.lastIndexOf(".", ext - 1)).toLowerCase();
    if (PATH_EXTENSIONS.has(dblExt)) return true;
  }
  return false;
}

export function looksLikeCommand(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const first = trimmed.split(/\s/)[0] ?? "";
  const cmdPrefixes = [
    "npm", "pnpm", "yarn", "node", "npx", "tsx", "tsc",
    "vitest", "jest", "mocha", "pytest", "cargo", "go",
    "make", "docker", "git", "curl", "eslint", "prettier",
  ];
  return cmdPrefixes.some((p) => first === p || first.endsWith("/" + p));
}

export function extractProtectedTokens(input: string, source: string): ProtectedToken[] {
  const tokens: ProtectedToken[] = [];
  const seen = new Set<string>();

  function add(value: string, kind: ProtectedTokenKind): void {
    const key = `${kind}:${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    tokens.push({ value, kind, source });
  }

  for (const m of input.matchAll(FEATURE_ID_RE)) {
    add(m[0], "feature_id");
  }

  for (const m of input.matchAll(TASK_ID_RE)) {
    add(m[0], "task_id");
  }

  for (const m of input.matchAll(AC_ID_RE)) {
    add(m[0], "acceptance_criteria_id");
  }

  for (const m of input.matchAll(URL_RE)) {
    add(m[0], "url");
  }

  const lines = input.split("\n");
  let inCommandSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^#+\s/.test(trimmed) || /^-\s+(verification|test|command)/i.test(trimmed)) {
      inCommandSection = /command|verification|test/i.test(trimmed);
    }

    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const bullet = trimmed.slice(2).trim();

      if (looksLikePath(bullet)) {
        add(bullet, bullet.includes("/") ? "file_path" : "file_path");
      }

      if (inCommandSection && looksLikeCommand(bullet)) {
        add(bullet, "command");
      }

      if (KNOWN_RISK_GATES.has(bullet)) {
        add(bullet, "risk_gate_name");
      }
    }

    for (const m of trimmed.matchAll(ENV_VAR_RE)) {
      const val = m[0];
      if (val && ENV_LIKE_WORDS.has(val)) {
        add(val, "environment_variable");
      }
    }

    const pathMatches = trimmed.match(/(?:^|\s)((?:[\w.-]+\/)+[\w.-]+)/g);
    if (pathMatches) {
      for (const pm of pathMatches) {
        const cleaned = pm.trim();
        if (looksLikePath(cleaned) && !cleaned.startsWith("http")) {
          add(cleaned, "file_path");
        }
      }
    }
  }

  for (const m of input.matchAll(COMMIT_HASH_RE)) {
    const val = m[0];
    if (val && val.length >= 7 && !/^\d+$/.test(val)) {
      add(val, "commit_hash");
    }
  }

  return tokens;
}

export function mergeProtectedTokens(groups: ProtectedToken[][]): ProtectedToken[] {
  const seen = new Set<string>();
  const merged: ProtectedToken[] = [];

  for (const group of groups) {
    for (const token of group) {
      const key = `${token.kind}:${token.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(token);
    }
  }

  return merged;
}

export function renderProtectedTokenSection(tokens: ProtectedToken[]): string {
  if (tokens.length === 0) return "_No protected tokens identified._";

  const byKind = new Map<ProtectedTokenKind, string[]>();
  for (const t of tokens) {
    const list = byKind.get(t.kind) ?? [];
    list.push(t.value);
    byKind.set(t.kind, list);
  }

  const lines: string[] = [];
  lines.push("Preserve these tokens exactly. Do not rename, abbreviate, or paraphrase them.");
  lines.push("");

  for (const [kind, values] of byKind) {
    lines.push(`**${kind}:**`);
    for (const v of values) {
      lines.push(`- \`${v}\``);
    }
    lines.push("");
  }

  return lines.join("\n");
}
