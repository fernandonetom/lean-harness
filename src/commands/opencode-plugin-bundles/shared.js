import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// This file is distributed by copying it into consumer projects' .opencode/plugins/, on its
// own, without the rest of the lh package tree — it cannot import from "../../core/version.js"
// (that file only exists inside the package, not wherever this bundle ends up). The version
// here is only ever used as a fallback default shape, never compared against anything.
function getVersion() { return "0.0.0"; }

function execGitSync(cwd, args) {
  try {
    const out = execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 });
    return String(out).trim() || null;
  } catch { return null; }
}

function resolveCwdFromContext(context) {
  if (context && context.project && typeof context.project.cwd === "string") return context.project.cwd;
  if (context && typeof context.directory === "string") return context.directory;
  if (process.env.OPENCODE_PROJECT_DIR) return process.env.OPENCODE_PROJECT_DIR;
  if (process.env.LEANHARNESS_PROJECT_DIR) return process.env.LEANHARNESS_PROJECT_DIR;
  return process.cwd();
}

/** Root that owns `.lh/` — state, config, policies, boundaries (the MAIN repo, not a linked worktree). */
export function projectRoot(context) {
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
      } catch { /* .lh not found there, keep cwd-based fallback */ }
    }
  }
  return harnessRoot;
}

/** Root that owns the working files being edited — the actual git worktree we're running in. */
export function worktreeRoot(context) {
  const cwd = resolveCwdFromContext(context);
  const top = execGitSync(cwd, ["rev-parse", "--show-toplevel"]);
  return top ? path.resolve(top) : path.resolve(cwd);
}

export function nowIso() { return new Date().toISOString(); }

export function safeString(value, maxLength = 2000) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return s.length > maxLength ? s.slice(0, maxLength) + "...[truncated]" : s;
}

export function readJsonFile(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return null; }
}

export function writeJsonFile(filePath, value) {
  try { ensureDir(path.dirname(filePath)); fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8"); return true; } catch { return false; }
}

export function appendJsonl(filePath, event) {
  try { ensureDir(path.dirname(filePath)); fs.appendFileSync(filePath, JSON.stringify(event) + "\n", "utf8"); return true; } catch { return false; }
}

export function appendText(filePath, content) {
  try { ensureDir(path.dirname(filePath)); fs.appendFileSync(filePath, content, "utf8"); return true; } catch { return false; }
}

export function ensureDir(dirPath) { try { fs.mkdirSync(dirPath, { recursive: true }); } catch {} }

export function toPosixPath(value) {
  if (!value || typeof value !== "string") return "";
  return value.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

export function normalizeRelativePath(root, candidate) {
  if (!candidate || typeof candidate !== "string") return "";
  candidate = toPosixPath(candidate);
  let posixRoot = toPosixPath(root);
  if (!posixRoot.endsWith("/")) posixRoot += "/";
  if (candidate.startsWith(posixRoot)) candidate = candidate.slice(posixRoot.length);
  else if (candidate.startsWith("/")) return candidate;
  if (candidate.startsWith("./")) candidate = candidate.slice(2);
  if (candidate.includes("../")) return "__PARENT_ESCAPE__/" + candidate;
  return candidate;
}

export function listFeatureDirs(root) {
  try { return fs.readdirSync(path.join(root, ".lh", "features"), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name); } catch { return []; }
}

export function loadState(root) {
  const state = readJsonFile(path.join(root, ".lh", "state.json"));
  if (!state || typeof state !== "object") return { version: getVersion(), activeFeature: null, features: [] };
  return state;
}

export function findActiveFeature(root) {
  if (process.env.LEANHARNESS_ACTIVE_FEATURE) return process.env.LEANHARNESS_ACTIVE_FEATURE;
  const state = loadState(root);
  if (state.active_feature) return state.active_feature;
  if (state.activeFeature) return state.activeFeature;
  const dirs = listFeatureDirs(root);
  return dirs.length === 1 ? dirs[0] : null;
}

export function resolveFeatureDir(root, featureRef) {
  if (!featureRef) return null;
  const featuresDir = path.join(root, ".lh", "features");
  try { if (fs.statSync(path.join(featuresDir, featureRef)).isDirectory()) return path.join(featuresDir, featureRef); } catch {}
  const dirs = listFeatureDirs(root);
  for (const d of dirs) { if (d === featureRef || d.startsWith(featureRef + "-")) return path.join(featuresDir, d); }
  return null;
}

export function loadBoundary(root, featureDir) {
  if (!featureDir) return null;
  const b = readJsonFile(path.join(featureDir, "boundary.json"));
  return (b && typeof b === "object") ? b : null;
}

export function extractToolName(input) {
  if (!input) return null;
  const candidates = [input.tool, input.toolName, input.name, input.type];
  if (input.tool && typeof input.tool === "object" && input.tool.name) candidates.push(input.tool.name);
  for (const c of candidates) { if (typeof c === "string" && c) return c.toLowerCase(); }
  return null;
}

export function extractToolArgs(input, output) {
  const candidates = [output && output.args, input && input.args, input && input.toolInput, input && input.tool_input, input && input.input];
  for (const c of candidates) { if (c && typeof c === "object") return c; }
  return {};
}

export function extractCommand(input, output) {
  const args = extractToolArgs(input, output);
  const candidates = [args.command, args.cmd, args.commandLine, args.shell, input && input.command, output && output.command];
  for (const c of candidates) { if (typeof c === "string" && c) return c; }
  return null;
}

function normalizeAgainstRoots(roots, candidate) {
  const harnessRoot = typeof roots === "string" ? roots : roots.harnessRoot;
  const wtRoot = typeof roots === "string" ? roots : (roots.worktreeRoot || roots.harnessRoot);
  const isLinked = typeof roots === "string" ? false : !!roots.isLinkedWorktree;
  const rel = normalizeRelativePath(wtRoot, candidate);
  if (rel && !rel.startsWith("/") && !rel.startsWith("__PARENT_ESCAPE__")) return rel;
  if (isLinked) {
    const rel2 = normalizeRelativePath(harnessRoot, candidate);
    if (rel2 && !rel2.startsWith("/") && !rel2.startsWith("__PARENT_ESCAPE__")) return rel2;
  }
  return rel;
}

export function extractPaths(input, output, roots) {
  const paths = []; const seen = new Set(); const args = extractToolArgs(input, output);
  function addPath(raw) { if (typeof raw !== "string" || !raw) return; const rel = normalizeAgainstRoots(roots, raw); if (rel && !seen.has(rel)) { seen.add(rel); paths.push(rel); } }
  addPath(args.filePath); addPath(args.file_path); addPath(args.path); addPath(args.filename);
  if (Array.isArray(args.files)) for (const f of args.files) { if (typeof f === "string") addPath(f); else if (f && f.path) addPath(f.path); else if (f && f.file_path) addPath(f.file_path); }
  if (Array.isArray(args.edits)) for (const e of args.edits) { if (e && e.filePath) addPath(e.filePath); else if (e && e.file_path) addPath(e.file_path); }
  if (output) { addPath(output.filePath); addPath(output.file_path); addPath(output.path); if (Array.isArray(output.paths)) for (const p of output.paths) addPath(p); }
  return paths;
}

const BOOTSTRAP_PREFIXES = [".lh/", ".claude/", ".opencode/", "docs/"];
const BOOTSTRAP_EXACT = [".lh", ".claude", ".opencode", "docs", "README.md", "CLAUDE.md", "opencode.json"];

export function isHarnessBootstrapPath(relativePath) {
  if (!relativePath) return false;
  let p = toPosixPath(relativePath);
  if (p.startsWith("./")) p = p.slice(2);
  for (const exact of BOOTSTRAP_EXACT) { if (p === exact) return true; }
  for (const prefix of BOOTSTRAP_PREFIXES) { if (p.startsWith(prefix)) return true; }
  return false;
}

const SECRET_PATH_PATTERNS = [".env", ".env.*", "**/.env", "**/.env.*", "**/secrets/**"];
export function isSecretPath(relativePath) { return relativePath ? matchesAnyPattern(SECRET_PATH_PATTERNS, toPosixPath(relativePath)) : false; }

const REDACT_PATTERNS = [/sk-[a-zA-Z0-9_-]{10,}/g, /ghp_[a-zA-Z0-9]{36,}/g, /AKIA[A-Z0-9]{16,}/g, /-----BEGIN\s+(RSA\s+)?PRIVATE KEY-----[\s\S]*?-----END\s+(RSA\s+)?PRIVATE KEY-----/g, /DATABASE_URL=[^\s"']+/gi, /TOKEN=[^\s"']+/gi, /SECRET=[^\s"']+/gi, /PASSWORD=[^\s"']+/gi];
export function redactSecrets(value) { if (!value || typeof value !== "string") return value; let r = value; for (const p of REDACT_PATTERNS) r = r.replace(p, "[REDACTED_SECRET]"); return r; }

export function matchesPattern(pattern, value, options = {}) {
  if (!pattern || !value || typeof pattern !== "string" || typeof value !== "string") return false;
  if (pattern.includes("|")) { for (const part of pattern.split("|")) { if (matchesPattern(part.trim(), value, options)) return true; } return false; }
  if (pattern === value) return true;
  let regexStr = ""; let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "*") { if (i + 1 < pattern.length && pattern[i + 1] === "*") { regexStr += ".*"; i += 2; if (i < pattern.length && pattern[i] === "/") i++; continue; } regexStr += "[^/]*"; }
    else if (ch === "?") regexStr += "[^/]";
    else if (".+^$\\{}()|[]".includes(ch)) regexStr += "\\" + ch;
    else regexStr += ch;
    i++;
  }
  try { return new RegExp("^" + regexStr + "$", "i").test(value); } catch { return false; }
}

export function matchesAnyPattern(patterns, value, options = {}) { if (!Array.isArray(patterns)) return false; for (const p of patterns) { if (matchesPattern(p, value, options)) return true; } return false; }

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
const BUILTIN_SAFE = ["git status*", "git diff*", "git log*", "ls*", "find*", "grep*", "rg*", "npm test*", "npm run test*", "npm run lint*", "pnpm test*", "yarn test*", "bun test*", "pytest*", "go test*", "cargo test*"];
const FORCE_PUSH_PATTERNS = ["git push --force*", "git push -f *"];

export function loadCommandEnforcement(root) {
  try {
    if (!root) return { force_push: "warn" };
    const configPath = path.join(root, ".lh", "config.yml");
    if (!fs.existsSync(configPath)) return { force_push: "warn" };
    const raw = fs.readFileSync(configPath, "utf8");
    const lines = raw.split("\n");
    let inBlock = false;
    for (const line of lines) {
      const s = line.trim();
      if (s === "command_enforcement:" || s.startsWith("command_enforcement:")) { inBlock = true; continue; }
      if (!inBlock) continue;
      if (s === "" || s.startsWith("#")) continue;
      if (/^[a-zA-Z_]/.test(s) && !s.startsWith(" ") && !s.startsWith("\t")) break;
      const m = s.match(/^force_push\s*:\s*(.+)$/);
      if (m) {
        const mode = m[1].trim().replace(/^["']|["']$/g, "");
        if (mode === "deny" || mode === "warn" || mode === "off") return { force_push: mode };
      }
    }
  } catch {}
  return { force_push: "warn" };
}

export function classifyCommand(command, root) {
  if (!command || typeof command !== "string") return { decision: "allow", reason: "", matchedPattern: null, riskGate: null };
  const trimmed = command.trim();
  for (const e of BUILTIN_DENY) { if (matchesPattern(e.pattern, trimmed)) return { decision: "block", reason: e.reason, matchedPattern: e.pattern, riskGate: null }; }
  for (const s of BUILTIN_SAFE) { if (matchesPattern(s, trimmed)) return { decision: "allow", reason: "Safe command.", matchedPattern: s, riskGate: null }; }
  for (const e of BUILTIN_RISKY) { if (matchesPattern(e.pattern, trimmed)) return { decision: "warn", reason: e.reason, matchedPattern: e.pattern, riskGate: e.riskGate || null }; }
  // Configurable: force push enforcement
  if (root) {
    const enforcement = loadCommandEnforcement(root);
    if (enforcement.force_push === "deny" || enforcement.force_push === "warn") {
      for (const p of FORCE_PUSH_PATTERNS) {
        if (matchesPattern(p, trimmed)) {
          return { decision: enforcement.force_push === "deny" ? "block" : "warn", reason: "Force push requires explicit manual control.", matchedPattern: p, riskGate: null };
        }
      }
    }
  }
  return { decision: "allow", reason: "", matchedPattern: null, riskGate: null };
}

const RISK_GATE_PATHS = {
  auth_rewrite: ["**/auth/**", "**/*auth*"], payment_logic: ["**/billing/**", "**/payment/**", "**/checkout/**"],
  destructive_migration: ["**/migrations/**", "**/schema.*"], new_dependency: ["package.json", "package-lock.json", "yarn.lock"],
  public_api_break: ["**/api/**", "**/routes/**"], security_sensitive_change: ["**/security/**", "**/secrets/**", "**/*token*"],
};
export function classifyPathRisk(relativePath) {
  if (!relativePath) return { riskGate: null, reason: null };
  for (const [key, patterns] of Object.entries(RISK_GATE_PATHS)) { if (matchesAnyPattern(patterns, toPosixPath(relativePath))) return { riskGate: key, reason: key + " risk gate" }; }
  return { riskGate: null, reason: null };
}

function normalizeTouchList(boundary) {
  if (!boundary || typeof boundary !== "object") return [];
  let raw = boundary.touchFiles;
  if (raw == null) raw = boundary.touch;
  if (raw == null) {
    const files = boundary.files;
    if (Array.isArray(files)) raw = files;
    else if (files && typeof files === "object") {
      const merged = [];
      for (const key of ["modify", "create", "delete"]) {
        if (Array.isArray(files[key])) merged.push(...files[key]);
      }
      raw = merged;
    }
  }
  return Array.isArray(raw) ? raw : [];
}

function entryPath(entry) {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object" && typeof entry.path === "string") return entry.path;
  return null;
}

export function isPathInsideBoundary(relativePath, boundary) {
  if (!relativePath || !boundary) return { inside: false, blocked: false, reason: "No boundary loaded." };
  const p = toPosixPath(relativePath);
  if (matchesAnyPattern(boundary.blockedEditGlobs || [], p)) return { inside: false, blocked: true, reason: "Path matches blockedEditGlobs." };
  for (const d of (boundary.doNotTouch || [])) { if (toPosixPath(d) === p || matchesPattern(d, p)) return { inside: false, blocked: true, reason: "Path in doNotTouch." }; }
  if (isHarnessBootstrapPath(p)) return { inside: true, blocked: false, reason: "Bootstrap path." };
  const touchFiles = normalizeTouchList(boundary);
  for (const t of touchFiles) { const tp = entryPath(t); if (tp && toPosixPath(tp) === p) return { inside: true, blocked: false, reason: "In touchFiles." }; }
  if (matchesAnyPattern(boundary.allowedEditGlobs || [], p)) return { inside: true, blocked: false, reason: "Matches allowedEditGlobs." };
  return { inside: false, blocked: false, reason: "Path not in boundary." };
}

export function boundarySummary(boundary) { if (!boundary) return "none"; return "loaded"; }
export function riskGateSummary(risks) { return (!risks || risks.length === 0) ? "none" : risks.join(", "); }

export function eventLogPath(root, featureDir) { return featureDir ? path.join(featureDir, "events.jsonl") : path.join(root, ".lh", "events.jsonl"); }
export function cavebusLogPath(root, featureDir) { return featureDir ? path.join(featureDir, "cavebus.log") : path.join(root, ".lh", "cavebus.log"); }

export function logPluginEvent(root, featureDir, event) { appendJsonl(eventLogPath(root, featureDir), { timestamp: nowIso(), source: "leanharness-opencode-plugin", ...event }); }
export function appendCaveBusNote(root, featureDir, message) { appendText(cavebusLogPath(root, featureDir), "\n" + message + "\n"); }

export function findActiveTask(root, featureDir) {
  if (process.env.LEANHARNESS_ACTIVE_TASK) return process.env.LEANHARNESS_ACTIVE_TASK;
  if (featureDir) { try { const lines = fs.readFileSync(cavebusLogPath(root, featureDir), "utf8").split("\n").reverse(); for (const l of lines) { const m = /(?:TASK|SUM)\s+F\d{3,}\s+(T\d{2,})/i.exec(l); if (m) return m[1]; } } catch {} }
  return null;
}

export function makeBlockError(message) { const e = new Error(message); e.name = "LeanHarnessGuardrailBlock"; return e; }
