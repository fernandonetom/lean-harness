import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// This module is published standalone as part of @feneto/lh-opencode — it cannot import from
// the @feneto/lh package's internal "core/" modules (those aren't part of this package's
// published tarball and OpenCode's Bun-based installer fetches this package on its own).

/** Loosely-typed OpenCode plugin context — field shapes vary across OpenCode versions. */
export type PluginContext = Record<string, unknown> | undefined | null;

export interface Roots {
  harnessRoot: string;
  worktreeRoot: string;
  isLinkedWorktree: boolean;
}

export interface Boundary {
  touchFiles?: unknown;
  touch?: unknown;
  files?: unknown;
  allowedEditGlobs?: string[];
  blockedEditGlobs?: string[];
  doNotTouch?: unknown[];
}

export interface CommandClassification {
  decision: "allow" | "warn" | "block";
  reason: string;
  matchedPattern: string | null;
  riskGate: string | null;
}

export interface PathRiskClassification {
  riskGate: string | null;
  reason: string | null;
}

export interface BoundaryCheck {
  inside: boolean;
  blocked: boolean;
  reason: string;
}

function execGitSync(cwd: string, args: string[]): string | null {
  try {
    const out = execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 });
    return String(out).trim() || null;
  } catch {
    return null;
  }
}

function resolveCwdFromContext(context: PluginContext): string {
  const ctx = context as Record<string, unknown> | undefined | null;
  const project = ctx?.["project"] as Record<string, unknown> | undefined;
  if (project && typeof project["cwd"] === "string") return project["cwd"] as string;
  if (ctx && typeof ctx["directory"] === "string") return ctx["directory"] as string;
  if (process.env["OPENCODE_PROJECT_DIR"]) return process.env["OPENCODE_PROJECT_DIR"] as string;
  if (process.env["LEANHARNESS_PROJECT_DIR"]) return process.env["LEANHARNESS_PROJECT_DIR"] as string;
  return process.cwd();
}

/** Root that owns `.lh/` — state, config, policies, boundaries (the MAIN repo, not a linked worktree). */
export function projectRoot(context: PluginContext): string {
  const cwd = resolveCwdFromContext(context);
  let harnessRoot = cwd;
  let common = execGitSync(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (!common) {
    const rel = execGitSync(cwd, ["rev-parse", "--git-common-dir"]);
    if (rel) common = path.resolve(cwd, rel);
  }
  if (common) {
    common = path.resolve(common);
    if (path.basename(common) === ".git") {
      const candidate = path.dirname(common);
      try {
        if (fs.statSync(path.join(candidate, ".lh")).isDirectory()) harnessRoot = candidate;
      } catch {
        /* .lh not found there, keep cwd-based fallback */
      }
    }
  }
  return harnessRoot;
}

/** Root that owns the working files being edited — the actual git worktree we're running in. */
export function worktreeRoot(context: PluginContext): string {
  const cwd = resolveCwdFromContext(context);
  const top = execGitSync(cwd, ["rev-parse", "--show-toplevel"]);
  return top ? path.resolve(top) : path.resolve(cwd);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function safeString(value: unknown, maxLength = 2000): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return s.length > maxLength ? s.slice(0, maxLength) + "...[truncated]" : s;
}

export function readJsonFile<T = unknown>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

export function writeJsonFile(filePath: string, value: unknown): boolean {
  try {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
    return true;
  } catch {
    return false;
  }
}

export function appendJsonl(filePath: string, event: unknown): boolean {
  try {
    ensureDir(path.dirname(filePath));
    fs.appendFileSync(filePath, JSON.stringify(event) + "\n", "utf8");
    return true;
  } catch {
    return false;
  }
}

export function appendText(filePath: string, content: string): boolean {
  try {
    ensureDir(path.dirname(filePath));
    fs.appendFileSync(filePath, content, "utf8");
    return true;
  } catch {
    return false;
  }
}

export function ensureDir(dirPath: string): void {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch {
    /* ignore */
  }
}

export function toPosixPath(value: unknown): string {
  if (!value || typeof value !== "string") return "";
  return value.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

export function normalizeRelativePath(root: string, candidate: unknown): string {
  if (!candidate || typeof candidate !== "string") return "";
  let normalized = toPosixPath(candidate);
  let posixRoot = toPosixPath(root);
  if (!posixRoot.endsWith("/")) posixRoot += "/";
  if (normalized.startsWith(posixRoot)) normalized = normalized.slice(posixRoot.length);
  else if (normalized.startsWith("/")) return normalized;
  if (normalized.startsWith("./")) normalized = normalized.slice(2);
  if (normalized.includes("../")) return "__PARENT_ESCAPE__/" + normalized;
  return normalized;
}

export function listFeatureDirs(root: string): string[] {
  try {
    return fs
      .readdirSync(path.join(root, ".lh", "features"), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

export function loadState(root: string): Record<string, unknown> {
  const state = readJsonFile<Record<string, unknown>>(path.join(root, ".lh", "state.json"));
  if (!state || typeof state !== "object") return { version: "0.0.0", activeFeature: null, features: [] };
  return state;
}

export function findActiveFeature(root: string): string | null {
  if (process.env["LEANHARNESS_ACTIVE_FEATURE"]) return process.env["LEANHARNESS_ACTIVE_FEATURE"] as string;
  const state = loadState(root);
  if (typeof state["active_feature"] === "string") return state["active_feature"] as string;
  if (typeof state["activeFeature"] === "string") return state["activeFeature"] as string;
  const dirs = listFeatureDirs(root);
  return dirs.length === 1 ? (dirs[0] as string) : null;
}

export function resolveFeatureDir(root: string, featureRef: string | null): string | null {
  if (!featureRef) return null;
  const featuresDir = path.join(root, ".lh", "features");
  try {
    if (fs.statSync(path.join(featuresDir, featureRef)).isDirectory()) return path.join(featuresDir, featureRef);
  } catch {
    /* not an exact match, fall through to prefix search */
  }
  const dirs = listFeatureDirs(root);
  for (const d of dirs) {
    if (d === featureRef || d.startsWith(featureRef + "-")) return path.join(featuresDir, d);
  }
  return null;
}

export function loadBoundary(root: string, featureDir: string | null): Boundary | null {
  if (!featureDir) return null;
  const b = readJsonFile<Boundary>(path.join(featureDir, "boundary.json"));
  return b && typeof b === "object" ? b : null;
}

export function extractToolName(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const rec = input as Record<string, unknown>;
  const candidates: unknown[] = [rec["tool"], rec["toolName"], rec["name"], rec["type"]];
  const toolObj = rec["tool"];
  if (toolObj && typeof toolObj === "object" && typeof (toolObj as Record<string, unknown>)["name"] === "string") {
    candidates.push((toolObj as Record<string, unknown>)["name"]);
  }
  for (const c of candidates) {
    if (typeof c === "string" && c) return c.toLowerCase();
  }
  return null;
}

export function extractToolArgs(input: unknown, output: unknown): Record<string, unknown> {
  const inRec = (input ?? {}) as Record<string, unknown>;
  const outRec = (output ?? {}) as Record<string, unknown>;
  const candidates: unknown[] = [outRec["args"], inRec["args"], inRec["toolInput"], inRec["tool_input"], inRec["input"]];
  for (const c of candidates) {
    if (c && typeof c === "object") return c as Record<string, unknown>;
  }
  return {};
}

export function extractCommand(input: unknown, output: unknown): string | null {
  const args = extractToolArgs(input, output);
  const inRec = (input ?? {}) as Record<string, unknown>;
  const outRec = (output ?? {}) as Record<string, unknown>;
  const candidates: unknown[] = [args["command"], args["cmd"], args["commandLine"], args["shell"], inRec["command"], outRec["command"]];
  for (const c of candidates) {
    if (typeof c === "string" && c) return c;
  }
  return null;
}

function normalizeAgainstRoots(roots: string | Roots, candidate: unknown): string {
  const harnessRoot = typeof roots === "string" ? roots : roots.harnessRoot;
  const wtRoot = typeof roots === "string" ? roots : roots.worktreeRoot || roots.harnessRoot;
  const isLinked = typeof roots === "string" ? false : !!roots.isLinkedWorktree;
  const rel = normalizeRelativePath(wtRoot, candidate);
  if (rel && !rel.startsWith("/") && !rel.startsWith("__PARENT_ESCAPE__")) return rel;
  if (isLinked) {
    const rel2 = normalizeRelativePath(harnessRoot, candidate);
    if (rel2 && !rel2.startsWith("/") && !rel2.startsWith("__PARENT_ESCAPE__")) return rel2;
  }
  return rel;
}

export function extractPaths(input: unknown, output: unknown, roots: string | Roots): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  const args = extractToolArgs(input, output);
  function addPath(raw: unknown): void {
    if (typeof raw !== "string" || !raw) return;
    const rel = normalizeAgainstRoots(roots, raw);
    if (rel && !seen.has(rel)) {
      seen.add(rel);
      paths.push(rel);
    }
  }
  addPath(args["filePath"]);
  addPath(args["file_path"]);
  addPath(args["path"]);
  addPath(args["filename"]);
  if (Array.isArray(args["files"])) {
    for (const f of args["files"] as unknown[]) {
      if (typeof f === "string") addPath(f);
      else if (f && typeof f === "object" && typeof (f as Record<string, unknown>)["path"] === "string") addPath((f as Record<string, unknown>)["path"]);
      else if (f && typeof f === "object" && typeof (f as Record<string, unknown>)["file_path"] === "string") addPath((f as Record<string, unknown>)["file_path"]);
    }
  }
  if (Array.isArray(args["edits"])) {
    for (const e of args["edits"] as unknown[]) {
      if (e && typeof e === "object" && typeof (e as Record<string, unknown>)["filePath"] === "string") addPath((e as Record<string, unknown>)["filePath"]);
      else if (e && typeof e === "object" && typeof (e as Record<string, unknown>)["file_path"] === "string") addPath((e as Record<string, unknown>)["file_path"]);
    }
  }
  if (output && typeof output === "object") {
    const outRec = output as Record<string, unknown>;
    addPath(outRec["filePath"]);
    addPath(outRec["file_path"]);
    addPath(outRec["path"]);
    if (Array.isArray(outRec["paths"])) {
      for (const p of outRec["paths"] as unknown[]) addPath(p);
    }
  }
  return paths;
}

const BOOTSTRAP_PREFIXES = [".lh/", ".claude/", ".opencode/", "docs/"];
const BOOTSTRAP_EXACT = [".lh", ".claude", ".opencode", "docs", "README.md", "CLAUDE.md", "opencode.json"];

export function isHarnessBootstrapPath(relativePath: string): boolean {
  if (!relativePath) return false;
  let p = toPosixPath(relativePath);
  if (p.startsWith("./")) p = p.slice(2);
  for (const exact of BOOTSTRAP_EXACT) {
    if (p === exact) return true;
  }
  for (const prefix of BOOTSTRAP_PREFIXES) {
    if (p.startsWith(prefix)) return true;
  }
  return false;
}

const SECRET_PATH_PATTERNS = [".env", ".env.*", "**/.env", "**/.env.*", "**/secrets/**"];
export function isSecretPath(relativePath: string): boolean {
  return relativePath ? matchesAnyPattern(SECRET_PATH_PATTERNS, toPosixPath(relativePath)) : false;
}

const REDACT_PATTERNS = [
  /sk-[a-zA-Z0-9_-]{10,}/g,
  /ghp_[a-zA-Z0-9]{36,}/g,
  /AKIA[A-Z0-9]{16,}/g,
  /-----BEGIN\s+(RSA\s+)?PRIVATE KEY-----[\s\S]*?-----END\s+(RSA\s+)?PRIVATE KEY-----/g,
  /DATABASE_URL=[^\s"']+/gi,
  /TOKEN=[^\s"']+/gi,
  /SECRET=[^\s"']+/gi,
  /PASSWORD=[^\s"']+/gi,
];
export function redactSecrets(value: string | null | undefined): string | null | undefined {
  if (!value || typeof value !== "string") return value;
  let r = value;
  for (const p of REDACT_PATTERNS) r = r.replace(p, "[REDACTED_SECRET]");
  return r;
}

export function matchesPattern(pattern: string, value: string): boolean {
  if (!pattern || !value || typeof pattern !== "string" || typeof value !== "string") return false;
  if (pattern.includes("|")) {
    for (const part of pattern.split("|")) {
      if (matchesPattern(part.trim(), value)) return true;
    }
    return false;
  }
  if (pattern === value) return true;
  let regexStr = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i] as string;
    if (ch === "*") {
      if (i + 1 < pattern.length && pattern[i + 1] === "*") {
        regexStr += ".*";
        i += 2;
        if (i < pattern.length && pattern[i] === "/") i++;
        continue;
      }
      regexStr += "[^/]*";
    } else if (ch === "?") regexStr += "[^/]";
    else if (".+^$\\{}()|[]".includes(ch)) regexStr += "\\" + ch;
    else regexStr += ch;
    i++;
  }
  try {
    return new RegExp("^" + regexStr + "$", "i").test(value);
  } catch {
    return false;
  }
}

export function matchesAnyPattern(patterns: string[] | undefined, value: string): boolean {
  if (!Array.isArray(patterns)) return false;
  for (const p of patterns) {
    if (matchesPattern(p, value)) return true;
  }
  return false;
}

const BUILTIN_DENY = [
  { pattern: "rm -rf /", reason: "Refuses to delete filesystem root." },
  { pattern: "rm -rf ~", reason: "Refuses to delete home directory." },
  { pattern: "rm -rf .git", reason: "Refuses to delete git metadata." },
  { pattern: "git reset --hard*", reason: "Hard reset can destroy local work." },
  { pattern: "git clean -fd*", reason: "Git clean with force can delete untracked work." },
  { pattern: "*DROP DATABASE*", reason: "Destructive database command." },
  { pattern: "*drop database*", reason: "Destructive database command." },
  { pattern: "cat .env*", reason: "Refuses to expose secrets." },
  { pattern: "printenv*", reason: "Refuses to expose environment secrets." },
  { pattern: "env", reason: "Refuses to expose environment secrets." },
];
const BUILTIN_RISKY = [
  { pattern: "npm install*", reason: "Dependency installation requires approval.", riskGate: "new_dependency" },
  { pattern: "pnpm add*", reason: "Dependency installation requires approval.", riskGate: "new_dependency" },
  { pattern: "yarn add*", reason: "Dependency installation requires approval.", riskGate: "new_dependency" },
  { pattern: "pip install*", reason: "Dependency installation requires approval.", riskGate: "new_dependency" },
  { pattern: "cargo add*", reason: "Dependency installation requires approval.", riskGate: "new_dependency" },
  { pattern: "git push*", reason: "Pushing changes requires approval.", riskGate: null },
  { pattern: "git reset*", reason: "Resetting git state requires approval.", riskGate: null },
  { pattern: "git clean*", reason: "Cleaning git state requires approval.", riskGate: null },
  { pattern: "*deploy*", reason: "Deployment requires approval.", riskGate: null },
];
const BUILTIN_SAFE = [
  "git status*", "git diff*", "git log*", "ls*", "find*", "grep*", "rg*",
  "npm test*", "npm run test*", "npm run lint*", "pnpm test*", "yarn test*",
  "bun test*", "pytest*", "go test*", "cargo test*",
];
const FORCE_PUSH_PATTERNS = ["git push --force*", "git push -f *"];

export function loadCommandEnforcement(root: string): { force_push: "deny" | "warn" | "off" } {
  try {
    if (!root) return { force_push: "warn" };
    const configPath = path.join(root, ".lh", "config.yml");
    if (!fs.existsSync(configPath)) return { force_push: "warn" };
    const raw = fs.readFileSync(configPath, "utf8");
    const lines = raw.split("\n");
    let inBlock = false;
    for (const line of lines) {
      const s = line.trim();
      if (s === "command_enforcement:" || s.startsWith("command_enforcement:")) {
        inBlock = true;
        continue;
      }
      if (!inBlock) continue;
      if (s === "" || s.startsWith("#")) continue;
      if (/^[a-zA-Z_]/.test(s) && !s.startsWith(" ") && !s.startsWith("\t")) break;
      const m = s.match(/^force_push\s*:\s*(.+)$/);
      if (m) {
        const mode = (m[1] as string).trim().replace(/^["']|["']$/g, "");
        if (mode === "deny" || mode === "warn" || mode === "off") return { force_push: mode };
      }
    }
  } catch {
    /* ignore malformed config, fall through to default */
  }
  return { force_push: "warn" };
}

export function classifyCommand(command: string | null, root: string): CommandClassification {
  if (!command || typeof command !== "string") return { decision: "allow", reason: "", matchedPattern: null, riskGate: null };
  const trimmed = command.trim();
  for (const e of BUILTIN_DENY) {
    if (matchesPattern(e.pattern, trimmed)) return { decision: "block", reason: e.reason, matchedPattern: e.pattern, riskGate: null };
  }
  for (const s of BUILTIN_SAFE) {
    if (matchesPattern(s, trimmed)) return { decision: "allow", reason: "Safe command.", matchedPattern: s, riskGate: null };
  }
  for (const e of BUILTIN_RISKY) {
    if (matchesPattern(e.pattern, trimmed)) return { decision: "warn", reason: e.reason, matchedPattern: e.pattern, riskGate: e.riskGate };
  }
  if (root) {
    const enforcement = loadCommandEnforcement(root);
    if (enforcement.force_push === "deny" || enforcement.force_push === "warn") {
      for (const p of FORCE_PUSH_PATTERNS) {
        if (matchesPattern(p, trimmed)) {
          return {
            decision: enforcement.force_push === "deny" ? "block" : "warn",
            reason: "Force push requires explicit manual control.",
            matchedPattern: p,
            riskGate: null,
          };
        }
      }
    }
  }
  return { decision: "allow", reason: "", matchedPattern: null, riskGate: null };
}

const RISK_GATE_PATHS: Record<string, string[]> = {
  auth_rewrite: ["**/auth/**", "**/*auth*"],
  payment_logic: ["**/billing/**", "**/payment/**", "**/checkout/**"],
  destructive_migration: ["**/migrations/**", "**/schema.*"],
  new_dependency: ["package.json", "package-lock.json", "yarn.lock"],
  public_api_break: ["**/api/**", "**/routes/**"],
  security_sensitive_change: ["**/security/**", "**/secrets/**", "**/*token*"],
};
export function classifyPathRisk(relativePath: string): PathRiskClassification {
  if (!relativePath) return { riskGate: null, reason: null };
  for (const [key, patterns] of Object.entries(RISK_GATE_PATHS)) {
    if (matchesAnyPattern(patterns, toPosixPath(relativePath))) return { riskGate: key, reason: key + " risk gate" };
  }
  return { riskGate: null, reason: null };
}

function normalizeTouchList(boundary: Boundary | null): unknown[] {
  if (!boundary || typeof boundary !== "object") return [];
  let raw: unknown = boundary.touchFiles;
  if (raw == null) raw = boundary.touch;
  if (raw == null) {
    const files = boundary.files;
    if (Array.isArray(files)) raw = files;
    else if (files && typeof files === "object") {
      const merged: unknown[] = [];
      for (const key of ["modify", "create", "delete"]) {
        const val = (files as Record<string, unknown>)[key];
        if (Array.isArray(val)) merged.push(...val);
      }
      raw = merged;
    }
  }
  return Array.isArray(raw) ? raw : [];
}

function entryPath(entry: unknown): string | null {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object" && typeof (entry as Record<string, unknown>)["path"] === "string") {
    return (entry as Record<string, unknown>)["path"] as string;
  }
  return null;
}

export function isPathInsideBoundary(relativePath: string, boundary: Boundary | null): BoundaryCheck {
  if (!relativePath || !boundary) return { inside: false, blocked: false, reason: "No boundary loaded." };
  const p = toPosixPath(relativePath);
  if (matchesAnyPattern(boundary.blockedEditGlobs || [], p)) return { inside: false, blocked: true, reason: "Path matches blockedEditGlobs." };
  for (const d of boundary.doNotTouch || []) {
    const dPath = entryPath(d) ?? (typeof d === "string" ? d : "");
    if (toPosixPath(dPath) === p || matchesPattern(dPath, p)) return { inside: false, blocked: true, reason: "Path in doNotTouch." };
  }
  if (isHarnessBootstrapPath(p)) return { inside: true, blocked: false, reason: "Bootstrap path." };
  const touchFiles = normalizeTouchList(boundary);
  for (const t of touchFiles) {
    const tp = entryPath(t);
    if (tp && toPosixPath(tp) === p) return { inside: true, blocked: false, reason: "In touchFiles." };
  }
  if (matchesAnyPattern(boundary.allowedEditGlobs || [], p)) return { inside: true, blocked: false, reason: "Matches allowedEditGlobs." };
  return { inside: false, blocked: false, reason: "Path not in boundary." };
}

export function boundarySummary(boundary: Boundary | null): string {
  return boundary ? "loaded" : "none";
}
export function riskGateSummary(risks: string[] | null | undefined): string {
  return !risks || risks.length === 0 ? "none" : risks.join(", ");
}

export function eventLogPath(root: string, featureDir: string | null): string {
  return featureDir ? path.join(featureDir, "events.jsonl") : path.join(root, ".lh", "events.jsonl");
}
export function cavebusLogPath(root: string, featureDir: string | null): string {
  return featureDir ? path.join(featureDir, "cavebus.log") : path.join(root, ".lh", "cavebus.log");
}

export function logPluginEvent(root: string, featureDir: string | null, event: Record<string, unknown>): void {
  appendJsonl(eventLogPath(root, featureDir), { timestamp: nowIso(), source: "leanharness-opencode-plugin", ...event });
}
export function appendCaveBusNote(root: string, featureDir: string | null, message: string): void {
  appendText(cavebusLogPath(root, featureDir), "\n" + message + "\n");
}

export function findActiveTask(root: string, featureDir: string | null): string | null {
  if (process.env["LEANHARNESS_ACTIVE_TASK"]) return process.env["LEANHARNESS_ACTIVE_TASK"] as string;
  if (featureDir) {
    try {
      const lines = fs.readFileSync(cavebusLogPath(root, featureDir), "utf8").split("\n").reverse();
      for (const l of lines) {
        const m = /(?:TASK|SUM)\s+F\d{3,}\s+(T\d{2,})/i.exec(l);
        if (m) return m[1] as string;
      }
    } catch {
      /* no cavebus log yet */
    }
  }
  return null;
}

export interface GuardrailBlockError extends Error {
  name: "LeanHarnessGuardrailBlock";
}

export function makeBlockError(message: string): GuardrailBlockError {
  const e = new Error(message) as GuardrailBlockError;
  e.name = "LeanHarnessGuardrailBlock";
  return e;
}
