export type CaveBusProtectedTokenKind =
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

export interface CaveBusProtectedToken {
  value: string;
  kind: CaveBusProtectedTokenKind;
  source: string;
}

export interface ProtectedTokenCheck {
  ok: boolean;
  missing: CaveBusProtectedToken[];
  changed: Array<{ original: CaveBusProtectedToken; candidate?: string }>;
  warnings: string[];
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
  "TOKEN", "SECRET", "PASSWORD",
]);

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9]{10,}/,
  /ghp_[A-Za-z0-9]{10,}/,
  /AKIA[A-Z0-9]{12,}/,
  /BEGIN PRIVATE KEY/,
  /DATABASE_URL\s*=\s*\S+/,
  /TOKEN\s*=\s*\S+/,
  /SECRET\s*=\s*\S+/,
  /PASSWORD\s*=\s*\S+/,
];

export function containsSecretLikeValue(value: string): boolean {
  return SECRET_PATTERNS.some((re) => re.test(value));
}

export function redactSecrets(input: string): { redacted: string; hadSecrets: boolean } {
  let result = input;
  let hadSecrets = false;

  for (const pattern of SECRET_PATTERNS) {
    const globalPattern = new RegExp(pattern.source, "g");
    if (globalPattern.test(result)) {
      hadSecrets = true;
      result = result.replace(new RegExp(pattern.source, "g"), "[REDACTED]");
    }
  }

  return { redacted: result, hadSecrets };
}

function looksLikePath(value: string): boolean {
  if (value.includes("/") && !value.startsWith("http")) return true;
  const ext = value.lastIndexOf(".");
  if (ext > 0) {
    const suffix = value.slice(ext).toLowerCase();
    if (PATH_EXTENSIONS.has(suffix)) return true;
    const prevDot = value.lastIndexOf(".", ext - 1);
    if (prevDot >= 0) {
      const dblExt = value.slice(prevDot).toLowerCase();
      if (PATH_EXTENSIONS.has(dblExt)) return true;
    }
  }
  return false;
}

function looksLikeCommand(value: string): boolean {
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

export function extractCaveBusProtectedTokens(input: string, source: string): CaveBusProtectedToken[] {
  const tokens: CaveBusProtectedToken[] = [];
  const seen = new Set<string>();

  function add(value: string, kind: CaveBusProtectedTokenKind): void {
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
        add(bullet, "file_path");
      }

      if ((inCommandSection || /^(npm|pnpm|yarn|node|npx)\s/.test(bullet)) && looksLikeCommand(bullet)) {
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

export function mergeCaveBusProtectedTokens(groups: CaveBusProtectedToken[][]): CaveBusProtectedToken[] {
  const seen = new Set<string>();
  const merged: CaveBusProtectedToken[] = [];

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

export function checkProtectedTokensPreserved(
  source: string,
  compressed: string,
  sourceName: string,
): ProtectedTokenCheck {
  const sourceTokens = extractCaveBusProtectedTokens(source, sourceName);
  const missing: CaveBusProtectedToken[] = [];
  const changed: Array<{ original: CaveBusProtectedToken; candidate?: string }> = [];
  const warnings: string[] = [];

  const importantKinds = new Set<CaveBusProtectedTokenKind>([
    "feature_id", "task_id", "acceptance_criteria_id",
    "file_path", "command", "risk_gate_name",
    "environment_variable", "url",
  ]);

  for (const token of sourceTokens) {
    if (!importantKinds.has(token.kind)) continue;
    if (!compressed.includes(token.value)) {
      missing.push(token);
    }
  }

  if (missing.length > 0) {
    warnings.push(
      `${missing.length} protected token(s) from ${sourceName} not found in compressed output: ${missing.map((t) => t.value).join(", ")}`,
    );
  }

  return {
    ok: missing.length === 0 && changed.length === 0,
    missing,
    changed,
    warnings,
  };
}

export function renderProtectedTokensCompact(tokens: CaveBusProtectedToken[], maxTokens?: number): string[] {
  const limit = maxTokens ?? 50;
  const lines: string[] = [];
  const grouped = new Map<CaveBusProtectedTokenKind, string[]>();

  for (const t of tokens) {
    const list = grouped.get(t.kind) ?? [];
    list.push(t.value);
    grouped.set(t.kind, list);
  }

  let count = 0;
  for (const [kind, values] of grouped) {
    if (count >= limit) break;
    const remaining = limit - count;
    const vals = values.slice(0, remaining);
    lines.push(`${kind}: ${vals.join(", ")}`);
    count += vals.length;
  }

  return lines;
}
