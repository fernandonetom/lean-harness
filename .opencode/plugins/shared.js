import fs from "node:fs";
import path from "node:path";

// --- project root ---

export function projectRoot(context) {
  if (context && context.project && typeof context.project.cwd === "string") {
    return context.project.cwd;
  }
  if (context && typeof context.directory === "string") {
    return context.directory;
  }
  if (process.env.OPENCODE_PROJECT_DIR) {
    return process.env.OPENCODE_PROJECT_DIR;
  }
  if (process.env.LEANHARNESS_PROJECT_DIR) {
    return process.env.LEANHARNESS_PROJECT_DIR;
  }
  return process.cwd();
}

// --- time ---

export function nowIso() {
  return new Date().toISOString();
}

// --- string safety ---

export function safeString(value, maxLength = 2000) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return s.length > maxLength ? s.slice(0, maxLength) + "...[truncated]" : s;
}

// --- file I/O ---

export function readJsonFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeJsonFile(filePath, value) {
  try {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
    return true;
  } catch {
    return false;
  }
}

export function appendJsonl(filePath, event) {
  try {
    ensureDir(path.dirname(filePath));
    fs.appendFileSync(filePath, JSON.stringify(event) + "\n", "utf8");
    return true;
  } catch {
    return false;
  }
}

export function appendText(filePath, content) {
  try {
    ensureDir(path.dirname(filePath));
    fs.appendFileSync(filePath, content, "utf8");
    return true;
  } catch {
    return false;
  }
}

export function ensureDir(dirPath) {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch {
    // ignore
  }
}

// --- path normalization ---

export function toPosixPath(value) {
  if (!value || typeof value !== "string") return "";
  return value.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
}

export function normalizeRelativePath(root, candidate) {
  if (!candidate || typeof candidate !== "string") return "";
  candidate = toPosixPath(candidate);
  let posixRoot = toPosixPath(root);
  if (!posixRoot.endsWith("/")) posixRoot += "/";

  if (candidate.startsWith(posixRoot)) {
    candidate = candidate.slice(posixRoot.length);
  } else if (candidate.startsWith("/")) {
    return candidate;
  }

  if (candidate.startsWith("./")) candidate = candidate.slice(2);
  if (candidate.includes("../")) {
    return "__PARENT_ESCAPE__/" + candidate;
  }
  return candidate;
}

// --- feature detection ---

export function listFeatureDirs(root) {
  const featuresDir = path.join(root, ".lh", "features");
  try {
    const entries = fs.readdirSync(featuresDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

export function loadState(root) {
  const statePath = path.join(root, ".lh", "state.json");
  const state = readJsonFile(statePath);
  if (!state || typeof state !== "object") {
    return { version: "0.1", activeFeature: null, features: [] };
  }
  return state;
}

export function findActiveFeature(root) {
  const envFeature = process.env.LEANHARNESS_ACTIVE_FEATURE;
  if (envFeature) return envFeature;

  const state = loadState(root);
  if (state.active_feature) return state.active_feature;
  if (state.activeFeature) return state.activeFeature;

  const dirs = listFeatureDirs(root);
  if (dirs.length === 1) return dirs[0];

  return null;
}

export function resolveFeatureDir(root, featureRef) {
  if (!featureRef) return null;
  const featuresDir = path.join(root, ".lh", "features");

  const exact = path.join(featuresDir, featureRef);
  try {
    if (fs.statSync(exact).isDirectory()) return exact;
  } catch {
    // not found
  }

  const dirs = listFeatureDirs(root);
  for (const d of dirs) {
    if (d === featureRef || d.startsWith(featureRef + "-")) {
      return path.join(featuresDir, d);
    }
  }
  return null;
}

// --- boundary ---

export function loadBoundary(root, featureDir) {
  if (!featureDir) return null;
  const bPath = path.join(featureDir, "boundary.json");
  const b = readJsonFile(bPath);
  if (!b || typeof b !== "object") return null;
  return b;
}

// --- tool input extraction ---

export function extractToolName(input) {
  if (!input) return null;
  const candidates = [
    input.tool,
    input.toolName,
    input.name,
    input.type,
  ];
  if (input.tool && typeof input.tool === "object" && input.tool.name) {
    candidates.push(input.tool.name);
  }
  for (const c of candidates) {
    if (typeof c === "string" && c) return c.toLowerCase();
  }
  return null;
}

export function extractToolArgs(input, output) {
  if (!input && !output) return {};
  const candidates = [
    output && output.args,
    input && input.args,
    input && input.toolInput,
    input && input.tool_input,
    input && input.input,
  ];
  for (const c of candidates) {
    if (c && typeof c === "object") return c;
  }
  return {};
}

export function extractCommand(input, output) {
  const args = extractToolArgs(input, output);
  const candidates = [
    args.command,
    args.cmd,
    args.commandLine,
    args.shell,
    input && input.command,
    output && output.command,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c) return c;
  }
  return null;
}

export function extractPaths(input, output, root) {
  const paths = [];
  const args = extractToolArgs(input, output);
  const seen = new Set();

  function addPath(raw) {
    if (typeof raw !== "string" || !raw) return;
    const rel = normalizeRelativePath(root, raw);
    if (rel && !seen.has(rel)) {
      seen.add(rel);
      paths.push(rel);
    }
  }

  // single path fields from args
  addPath(args.filePath);
  addPath(args.file_path);
  addPath(args.path);
  addPath(args.filename);

  // files array
  if (Array.isArray(args.files)) {
    for (const f of args.files) {
      if (typeof f === "string") addPath(f);
      else if (f && typeof f.path === "string") addPath(f.path);
      else if (f && typeof f.file_path === "string") addPath(f.file_path);
      else if (f && typeof f.filePath === "string") addPath(f.filePath);
    }
  }

  // edits array (MultiEdit)
  if (Array.isArray(args.edits)) {
    for (const e of args.edits) {
      if (e && typeof e.filePath === "string") addPath(e.filePath);
      else if (e && typeof e.file_path === "string") addPath(e.file_path);
      else if (e && typeof e.path === "string") addPath(e.path);
    }
  }

  // output paths
  if (output) {
    addPath(output.filePath);
    addPath(output.file_path);
    addPath(output.path);
    if (Array.isArray(output.paths)) {
      for (const p of output.paths) addPath(p);
    }
  }

  // parse obvious paths from command strings
  const command = extractCommand(input, output);
  if (command) {
    const parts = command.split(/\s+/);
    for (const part of parts) {
      if (part.includes("/") && !part.startsWith("-") && !part.startsWith("http")) {
        addPath(part);
      }
    }
  }

  return paths;
}

// --- bootstrap path detection ---

const BOOTSTRAP_PREFIXES = [
  ".lh/",
  ".claude/",
  ".opencode/",
  "docs/",
  "scripts/hooks/",
];

const BOOTSTRAP_EXACT = [
  ".lh",
  ".claude",
  ".opencode",
  "docs",
  "scripts",
  "scripts/hooks",
  "README.md",
  "CLAUDE.md",
  "opencode.json",
];

export function isHarnessBootstrapPath(relativePath) {
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

// --- secret detection ---

const SECRET_PATH_PATTERNS = [
  ".env",
  ".env.*",
  "**/.env",
  "**/.env.*",
  "**/secrets/**",
];

export function isSecretPath(relativePath) {
  if (!relativePath) return false;
  const p = toPosixPath(relativePath);
  return matchesAnyPattern(SECRET_PATH_PATTERNS, p);
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
  /ANTHROPIC_API_KEY=[^\s"']+/gi,
  /OPENAI_API_KEY=[^\s"']+/gi,
];

export function redactSecrets(value) {
  if (!value || typeof value !== "string") return value;
  let result = value;
  for (const pattern of REDACT_PATTERNS) {
    result = result.replace(pattern, "[REDACTED_SECRET]");
  }
  return result;
}

// --- pattern matching ---

export function matchesPattern(pattern, value, options = {}) {
  if (!pattern || !value) return false;
  if (typeof pattern !== "string" || typeof value !== "string") return false;

  // handle alternation: *curl*|*sh*
  if (pattern.includes("|")) {
    const parts = pattern.split("|");
    for (const part of parts) {
      if (matchesPattern(part.trim(), value, options)) return true;
    }
    return false;
  }

  if (pattern === value) return true;

  let regexStr = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "*") {
      if (i + 1 < pattern.length && pattern[i + 1] === "*") {
        regexStr += ".*";
        i += 2;
        if (i < pattern.length && pattern[i] === "/") i++;
        continue;
      }
      regexStr += "[^/]*";
    } else if (ch === "?") {
      regexStr += "[^/]";
    } else if (".+^${}()|[]\\".includes(ch)) {
      regexStr += "\\" + ch;
    } else {
      regexStr += ch;
    }
    i++;
  }

  try {
    const flags = options.caseSensitive === false ? "i" : "i";
    const re = new RegExp("^" + regexStr + "$", flags);
    return re.test(value);
  } catch {
    return false;
  }
}

export function matchesAnyPattern(patterns, value, options = {}) {
  if (!Array.isArray(patterns)) return false;
  for (const p of patterns) {
    if (matchesPattern(p, value, options)) return true;
  }
  return false;
}

// --- command classification ---

const BUILTIN_DENY = [
  { pattern: "rm -rf /", reason: "Refuses to delete filesystem root." },
  { pattern: "rm -rf /*", reason: "Refuses to delete filesystem root contents." },
  { pattern: "rm -rf ~", reason: "Refuses to delete home directory." },
  { pattern: "rm -rf ~/*", reason: "Refuses to delete home directory contents." },
  { pattern: "rm -rf .git", reason: "Refuses to delete git metadata." },
  { pattern: "rm -rf .git/", reason: "Refuses to delete git metadata." },
  { pattern: "git push --force*", reason: "Force push requires explicit manual control." },
  { pattern: "git push -f *", reason: "Force push requires explicit manual control." },
  { pattern: "git reset --hard*", reason: "Hard reset can destroy local work." },
  { pattern: "git clean -fd*", reason: "Git clean with force can delete untracked work." },
  { pattern: "git clean -fx*", reason: "Git clean with force can delete untracked work." },
  { pattern: "git clean -fxd*", reason: "Git clean with force can delete untracked work." },
  { pattern: "*DROP DATABASE*", reason: "Destructive database command." },
  { pattern: "*drop database*", reason: "Destructive database command." },
  { pattern: "*DROP TABLE*", reason: "Destructive database command." },
  { pattern: "*drop table*", reason: "Destructive database command." },
  { pattern: "cat .env*", reason: "Refuses to expose secrets." },
  { pattern: "printenv*", reason: "Refuses to expose environment secrets." },
  { pattern: "env", reason: "Refuses to expose environment secrets." },
  { pattern: "*> /dev/sd*", reason: "Refuses to write directly to block devices." },
  { pattern: "dd if=*", reason: "Refuses raw disk writes." },
  { pattern: "mkfs*", reason: "Refuses filesystem creation on devices." },
  { pattern: ":(){ :|:& };:*", reason: "Refuses fork bombs." },
];

const BUILTIN_RISKY = [
  { pattern: "npm install*", reason: "Dependency installation requires approval.", riskGate: "new_dependency" },
  { pattern: "npm update*", reason: "Dependency updates require approval.", riskGate: "new_dependency" },
  { pattern: "npm ci*", reason: "Dependency installation requires approval.", riskGate: "new_dependency" },
  { pattern: "pnpm add*", reason: "Dependency installation requires approval.", riskGate: "new_dependency" },
  { pattern: "pnpm update*", reason: "Dependency updates require approval.", riskGate: "new_dependency" },
  { pattern: "pnpm install*", reason: "Dependency installation requires approval.", riskGate: "new_dependency" },
  { pattern: "yarn add*", reason: "Dependency installation requires approval.", riskGate: "new_dependency" },
  { pattern: "yarn install*", reason: "Dependency installation requires approval.", riskGate: "new_dependency" },
  { pattern: "bun add*", reason: "Dependency installation requires approval.", riskGate: "new_dependency" },
  { pattern: "bun install*", reason: "Dependency installation requires approval.", riskGate: "new_dependency" },
  { pattern: "pip install*", reason: "Dependency installation requires approval.", riskGate: "new_dependency" },
  { pattern: "poetry add*", reason: "Dependency installation requires approval.", riskGate: "new_dependency" },
  { pattern: "cargo add*", reason: "Dependency installation requires approval.", riskGate: "new_dependency" },
  { pattern: "git push*", reason: "Pushing changes requires approval.", riskGate: null },
  { pattern: "git reset*", reason: "Resetting git state requires approval.", riskGate: null },
  { pattern: "git clean*", reason: "Cleaning git state requires approval.", riskGate: null },
  { pattern: "*migrate reset*", reason: "Migration reset requires approval.", riskGate: "destructive_migration" },
  { pattern: "*db reset*", reason: "Database reset requires approval.", riskGate: "destructive_migration" },
  { pattern: "*deploy*", reason: "Deployment requires approval.", riskGate: null },
  { pattern: "*curl*|*sh*", reason: "Piping remote scripts requires approval.", riskGate: null },
  { pattern: "rm -r*", reason: "Recursive deletion requires approval.", riskGate: null },
];

const BUILTIN_SAFE = [
  "git status*", "git diff*", "git log*", "git branch*", "git show*", "git blame*",
  "ls*", "find*", "grep*", "rg*", "cat README.md", "sed -n*", "wc *", "head *", "tail *",
  "npm test*", "npm run test*", "npm run lint*", "npm run typecheck*",
  "pnpm test*", "pnpm lint*", "pnpm typecheck*", "pnpm run test*", "pnpm run lint*",
  "yarn test*", "yarn lint*", "bun test*",
  "pytest*", "go test*", "cargo test*",
  "node --check*", "python -m json.tool*", "python -c *",
];

export function classifyCommand(command) {
  if (!command || typeof command !== "string") {
    return { decision: "allow", reason: "", matchedPattern: null, riskGate: null };
  }
  const trimmed = command.trim();

  for (const entry of BUILTIN_DENY) {
    if (matchesPattern(entry.pattern, trimmed)) {
      return { decision: "block", reason: entry.reason, matchedPattern: entry.pattern, riskGate: null };
    }
  }

  for (const safe of BUILTIN_SAFE) {
    if (matchesPattern(safe, trimmed)) {
      return { decision: "allow", reason: "Safe verification/read-only command.", matchedPattern: safe, riskGate: null };
    }
  }

  for (const entry of BUILTIN_RISKY) {
    if (matchesPattern(entry.pattern, trimmed)) {
      return { decision: "warn", reason: entry.reason, matchedPattern: entry.pattern, riskGate: entry.riskGate || null };
    }
  }

  return { decision: "allow", reason: "", matchedPattern: null, riskGate: null };
}

// --- path risk classification ---

const RISK_GATE_PATHS = {
  auth_rewrite: ["**/auth/**", "**/session/**", "**/*auth*", "**/*session*"],
  payment_logic: ["**/billing/**", "**/payment/**", "**/checkout/**", "**/*billing*", "**/*payment*", "**/*checkout*"],
  destructive_migration: ["**/migrations/**", "**/migration/**", "**/schema.*"],
  new_dependency: [
    "package.json", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb",
    "requirements.txt", "pyproject.toml", "poetry.lock",
    "Gemfile", "Gemfile.lock", "go.mod", "go.sum", "Cargo.toml", "Cargo.lock",
  ],
  public_api_break: ["**/api/**", "**/routes/**", "**/controllers/**", "**/schema/**", "**/*schema*", "**/*contract*"],
  security_sensitive_change: [
    "**/security/**", "**/permissions/**", "**/authorization/**", "**/secrets/**",
    "**/*token*", "**/*permission*", "**/*secret*",
  ],
};

export function classifyPathRisk(relativePath) {
  if (!relativePath) return { riskGate: null, reason: null };
  const p = toPosixPath(relativePath);
  const keys = Object.keys(RISK_GATE_PATHS);
  for (const key of keys) {
    if (matchesAnyPattern(RISK_GATE_PATHS[key], p)) {
      return { riskGate: key, reason: `Path ${p} matches ${key} risk gate patterns.` };
    }
  }
  return { riskGate: null, reason: null };
}

// --- boundary check ---

export function isPathInsideBoundary(relativePath, boundary) {
  if (!relativePath || !boundary) {
    return { inside: false, blocked: false, reason: "No boundary loaded." };
  }
  const p = toPosixPath(relativePath);
  if (p.startsWith("./")) {
    return isPathInsideBoundary(p.slice(2), boundary);
  }

  // blocked first
  const blockedGlobs = boundary.blockedEditGlobs || [];
  const doNotTouch = boundary.doNotTouch || [];

  if (matchesAnyPattern(blockedGlobs, p)) {
    return { inside: false, blocked: true, reason: "Path matches blockedEditGlobs in boundary." };
  }
  for (const d of doNotTouch) {
    if (toPosixPath(d) === p || matchesPattern(d, p)) {
      return { inside: false, blocked: true, reason: "Path is in doNotTouch list." };
    }
  }

  // bootstrap paths always inside
  if (isHarnessBootstrapPath(p)) {
    return { inside: true, blocked: false, reason: "Bootstrap path." };
  }

  // touchFiles
  const touchFiles = boundary.touchFiles || boundary.files || {};
  const allTouchPaths = [];

  if (Array.isArray(touchFiles)) {
    for (const t of touchFiles) {
      if (t && typeof t.path === "string") allTouchPaths.push(toPosixPath(t.path));
      else if (typeof t === "string") allTouchPaths.push(toPosixPath(t));
    }
  }
  if (touchFiles && typeof touchFiles === "object" && !Array.isArray(touchFiles)) {
    for (const key of ["modify", "create", "delete"]) {
      if (Array.isArray(touchFiles[key])) {
        for (const fp of touchFiles[key]) {
          if (typeof fp === "string") allTouchPaths.push(toPosixPath(fp));
        }
      }
    }
  }

  for (const tp of allTouchPaths) {
    if (tp === p) return { inside: true, blocked: false, reason: "Path listed in touchFiles." };
  }

  // allowedEditGlobs
  const allowedGlobs = boundary.allowedEditGlobs || [];
  if (matchesAnyPattern(allowedGlobs, p)) {
    return { inside: true, blocked: false, reason: "Path matches allowedEditGlobs." };
  }

  // test_files and config_files
  const extras = [].concat(boundary.test_files || [], boundary.config_files || []);
  for (const x of extras) {
    if (typeof x === "string" && toPosixPath(x) === p) {
      return { inside: true, blocked: false, reason: "Path listed in boundary test/config files." };
    }
  }

  return { inside: false, blocked: false, reason: "Path not found in boundary." };
}

// --- summaries ---

export function boundarySummary(boundary) {
  if (!boundary) return "no boundary loaded";
  const touchCount = Array.isArray(boundary.touchFiles)
    ? boundary.touchFiles.length
    : typeof boundary.files === "object" ? Object.keys(boundary.files).length : 0;
  const blockedCount = (boundary.blockedEditGlobs || []).length + (boundary.doNotTouch || []).length;
  return `touch:${touchCount} blocked:${blockedCount}`;
}

export function riskGateSummary(risks) {
  if (!risks || !Array.isArray(risks) || risks.length === 0) return "none";
  return risks.join(", ");
}

// --- event logging ---

export function eventLogPath(root, featureDir) {
  if (featureDir) return path.join(featureDir, "events.jsonl");
  return path.join(root, ".lh", "events.jsonl");
}

export function cavebusLogPath(root, featureDir) {
  if (featureDir) return path.join(featureDir, "cavebus.log");
  return path.join(root, ".lh", "cavebus.log");
}

export function logPluginEvent(root, featureDir, event) {
  const logPath = eventLogPath(root, featureDir);
  const entry = {
    timestamp: nowIso(),
    source: "leanharness-opencode-plugin",
    ...event,
  };
  appendJsonl(logPath, entry);
}

export function appendCaveBusNote(root, featureDir, message) {
  const logPath = cavebusLogPath(root, featureDir);
  const entry = `\n${message}\n`;
  appendText(logPath, entry);
}

// --- active task detection ---

export function findActiveTask(root, featureDir) {
  const envTask = process.env.LEANHARNESS_ACTIVE_TASK;
  if (envTask) return envTask;

  // try to find from most recent cavebus entry
  if (featureDir) {
    const cbPath = cavebusLogPath(root, featureDir);
    try {
      const content = fs.readFileSync(cbPath, "utf8");
      const lines = content.split("\n").reverse();
      for (const line of lines) {
        const match = /(?:TASK|SUM)\s+F\d{3,}\s+(T\d{2,})/i.exec(line);
        if (match) return match[1];
      }
    } catch {
      // no log
    }
  }

  return null;
}

// --- error helper ---

export function makeBlockError(message) {
  const err = new Error(message);
  err.name = "LeanHarnessGuardrailBlock";
  return err;
}
