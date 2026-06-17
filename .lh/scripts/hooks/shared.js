#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// --- stdin ---

function readStdinJson() {
  try {
    const raw = fs.readFileSync(0, 'utf8').trim();
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    try {
      const raw = fs.readFileSync(0, 'utf8').trim();
      return { __parseError: e.message, __raw: raw };
    } catch (_) {
      return { __parseError: e.message, __raw: '' };
    }
  }
}

// --- paths ---

function projectRoot() {
  return process.env.CLAUDE_PROJECT_DIR || process.cwd();
}

function toPosixPath(p) {
  if (!p) return '';
  return p.replace(/\\/g, '/').replace(/\/{2,}/g, function(m, offset) {
    return offset === 0 ? '/' : '/';
  });
}

function normalizeRelativePath(root, candidate) {
  if (!candidate) return '';
  candidate = toPosixPath(candidate);
  var posixRoot = toPosixPath(root);
  if (!posixRoot.endsWith('/')) posixRoot += '/';

  if (candidate.startsWith(posixRoot)) {
    candidate = candidate.slice(posixRoot.length);
  } else if (candidate.startsWith('/')) {
    return candidate;
  }

  if (candidate.startsWith('./')) candidate = candidate.slice(2);

  if (candidate.includes('../')) {
    return '__PARENT_ESCAPE__/' + candidate;
  }

  return candidate;
}

// --- config ---

var BOUNDARY_ENFORCEMENT_DEFAULTS = {
  mode: 'strict',
  always_allow: [],
  session_overrides: []
};

/**
 * Read and minimally parse `.lh/config.yml`.
 * Returns the parsed object (as a plain JS object) or null if the file is
 * missing, unreadable, or too malformed to extract any structure from.
 *
 * Only parses scalar values and sequences at the top two indent levels —
 * enough to extract the `boundary_enforcement` block.
 */
function readConfig(root) {
  try {
    var configFilePath = path.join(root, '.lh', 'config.yml');
    var raw = fs.readFileSync(configFilePath, 'utf8');
    return parseConfigYaml(raw);
  } catch (_) {
    return null;
  }
}

/**
 * Minimal YAML parser for `.lh/config.yml`.
 * Strategy:
 *  1. Split into lines.
 *  2. Walk lines; for each top-level key (indent === 0) build an entry.
 *  3. For each top-level key, collect child lines (indent > 0) until
 *     another non-blank, non-comment line returns to indent 0.
 *  4. Parse child lines as a simple sub-block (key: scalar or sequences).
 *
 * Returns a plain object or null on catastrophic failure.
 */
function parseConfigYaml(text) {
  try {
    var lines = text.split('\n');
    var result = {};
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];
      var stripped = line.trimStart();

      // Skip blank lines and comments
      if (stripped === '' || stripped.charAt(0) === '#') {
        i++;
        continue;
      }

      var indent = getLineIndent(line);

      // Top-level keys are at indent 0
      if (indent === 0) {
        var colonIdx = stripped.indexOf(':');
        if (colonIdx === -1) { i++; continue; }

        var topKey = stripped.slice(0, colonIdx).trim();
        var afterColon = stripped.slice(colonIdx + 1).trim();
        // Strip inline comments from value
        afterColon = stripInlineComment(afterColon).trim();

        if (afterColon !== '') {
          // Inline scalar value
          result[topKey] = parseYamlScalar(afterColon);
          i++;
        } else {
          // Block value — collect child lines
          i++;
          var childLines = [];
          while (i < lines.length) {
            var childLine = lines[i];
            var childStripped = childLine.trimStart();
            if (childStripped === '' || childStripped.charAt(0) === '#') {
              i++;
              continue;
            }
            var childIndent = getLineIndent(childLine);
            if (childIndent === 0) break; // back to top level
            childLines.push(childLine);
            i++;
          }
          result[topKey] = parseYamlBlock(childLines);
        }
      } else {
        // Should not reach here at indent > 0 at the top loop — skip
        i++;
      }
    }

    return result;
  } catch (_) {
    return null;
  }
}

/** Count leading spaces. */
function getLineIndent(line) {
  var n = 0;
  while (n < line.length && line.charAt(n) === ' ') n++;
  return n;
}

/** Strip trailing inline comment from a value fragment (after key:). */
function stripInlineComment(s) {
  var inSingle = false;
  var inDouble = false;
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i);
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === '#' && !inSingle && !inDouble) {
      if (i === 0 || s.charAt(i - 1) === ' ' || s.charAt(i - 1) === '\t') {
        return s.slice(0, i).trimEnd();
      }
    }
  }
  return s;
}

/** Parse a scalar YAML value string into a JS primitive. */
function parseYamlScalar(raw) {
  var s = raw.trim();
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
  if ((s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') ||
      (s.charAt(0) === "'" && s.charAt(s.length - 1) === "'")) {
    return s.slice(1, -1);
  }
  return s;
}

/** Parse a flow sequence like `[foo, bar, "baz"]`. Returns array or null. */
function parseFlowSequence(raw) {
  var inner = raw.slice(1, raw.length - 1).trim();
  if (inner === '') return [];
  var items = [];
  var current = '';
  var inSingle = false;
  var inDouble = false;
  var depth = 0;
  for (var i = 0; i < inner.length; i++) {
    var ch = inner.charAt(i);
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (!inSingle && !inDouble) {
      if (ch === '[') depth++;
      else if (ch === ']') depth--;
    }
    if (ch === ',' && !inSingle && !inDouble && depth === 0) {
      items.push(parseYamlScalar(current.trim()));
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim() !== '') items.push(parseYamlScalar(current.trim()));
  return items;
}

/**
 * Parse a block of indented child lines into a plain JS object.
 * Handles: scalar values, block sequences (`- item`), flow sequences.
 * All child lines share the same base indent (the minimum non-blank indent).
 */
function parseYamlBlock(childLines) {
  if (!childLines || childLines.length === 0) return {};

  // Find base indent
  var baseIndent = Infinity;
  for (var i = 0; i < childLines.length; i++) {
    var l = childLines[i];
    if (l.trimStart() === '') continue;
    var ind = getLineIndent(l);
    if (ind < baseIndent) baseIndent = ind;
  }
  if (baseIndent === Infinity) return {};

  var result = {};
  var j = 0;

  while (j < childLines.length) {
    var line = childLines[j];
    var stripped = line.trimStart();
    if (stripped === '' || stripped.charAt(0) === '#') { j++; continue; }

    var indent = getLineIndent(line);
    if (indent !== baseIndent) { j++; continue; } // deeper or shallower — skip

    var colonIdx = stripped.indexOf(':');
    if (colonIdx === -1) { j++; continue; }

    var key = stripped.slice(0, colonIdx).trim();
    var afterColon = stripped.slice(colonIdx + 1).trim();
    afterColon = stripInlineComment(afterColon).trim();

    if (afterColon !== '') {
      // Inline value: scalar or flow sequence
      if (afterColon.charAt(0) === '[') {
        result[key] = parseFlowSequence(afterColon);
      } else {
        result[key] = parseYamlScalar(afterColon);
      }
      j++;
    } else {
      // Look ahead for block sequence items at deeper indent
      j++;
      var seqItems = [];
      var foundSeq = false;
      while (j < childLines.length) {
        var seqLine = childLines[j];
        var seqStripped = seqLine.trimStart();
        if (seqStripped === '' || seqStripped.charAt(0) === '#') { j++; continue; }
        var seqIndent = getLineIndent(seqLine);
        if (seqIndent <= baseIndent) break; // back to same or parent level
        if (seqStripped.slice(0, 2) === '- ') {
          var itemVal = seqStripped.slice(2).trim();
          itemVal = stripInlineComment(itemVal).trim();
          seqItems.push(parseYamlScalar(itemVal));
          foundSeq = true;
          j++;
        } else {
          // nested mapping — skip for our purposes, treat as null
          j++;
        }
      }
      result[key] = foundSeq ? seqItems : null;
    }
  }

  return result;
}

/**
 * Load boundary enforcement settings from `.lh/config.yml`.
 * Always returns `{ mode, always_allow, session_overrides }`.
 * Falls back to strict defaults if config is missing, the
 * `boundary_enforcement` block is absent, or the block is malformed.
 * Unrecognized mode values also fall back to `'strict'` for safety.
 */
function loadBoundaryEnforcement(root) {
  var defaults = {
    mode: BOUNDARY_ENFORCEMENT_DEFAULTS.mode,
    always_allow: BOUNDARY_ENFORCEMENT_DEFAULTS.always_allow.slice(),
    session_overrides: BOUNDARY_ENFORCEMENT_DEFAULTS.session_overrides.slice()
  };

  try {
    var config = readConfig(root);
    if (!config || typeof config !== 'object') return defaults;

    var block = config['boundary_enforcement'];
    if (!block || typeof block !== 'object') return defaults;

    // mode
    var mode = defaults.mode;
    if (block['mode'] === 'strict' || block['mode'] === 'warn' || block['mode'] === 'off') {
      mode = block['mode'];
    }

    // always_allow
    var always_allow = defaults.always_allow;
    if (Array.isArray(block['always_allow'])) {
      always_allow = block['always_allow'].filter(function(v) { return typeof v === 'string'; });
    }

    // session_overrides
    var session_overrides = defaults.session_overrides;
    if (Array.isArray(block['session_overrides'])) {
      session_overrides = block['session_overrides'].filter(function(v) { return typeof v === 'string'; });
    }

    return { mode: mode, always_allow: always_allow, session_overrides: session_overrides };
  } catch (_) {
    return defaults;
  }
}

// --- file I/O ---

function readJsonFile(filePath) {
  try {
    var raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function writeJsonFile(filePath, data) {
  try {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    return true;
  } catch (_) {
    return false;
  }
}

function appendJsonl(file, event) {
  try {
    ensureDir(path.dirname(file));
    fs.appendFileSync(file, JSON.stringify(event) + '\n', 'utf8');
    return true;
  } catch (_) {
    return false;
  }
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (_) {}
}

// --- state ---

function loadState(root) {
  var statePath = path.join(root, '.lh', 'state.json');
  var state = readJsonFile(statePath);
  if (!state) {
    return {
      version: '0.1',
      active_feature: null,
      features: {},
      last_event_id: 0,
      session: { started_at: null, host: null, adapter: null }
    };
  }
  return state;
}

function findActiveFeature(root) {
  // 1. env var
  var envFeature = process.env.LEANHARNESS_ACTIVE_FEATURE;
  if (envFeature) return envFeature;

  // 2. state.json
  var state = loadState(root);
  if (state.active_feature) return state.active_feature;
  // also check camelCase variant
  if (state.activeFeature) return state.activeFeature;

  // 3. single feature folder fallback
  var dirs = listFeatureDirs(root);
  if (dirs.length === 1) return dirs[0];

  return null;
}

function listFeatureDirs(root) {
  var featuresDir = path.join(root, '.lh', 'features');
  try {
    var entries = fs.readdirSync(featuresDir, { withFileTypes: true });
    return entries
      .filter(function(e) { return e.isDirectory(); })
      .map(function(e) { return e.name; });
  } catch (_) {
    return [];
  }
}

function resolveFeatureDir(root, featureRef) {
  if (!featureRef) return null;

  var featuresDir = path.join(root, '.lh', 'features');

  // exact folder path
  var exact = path.join(featuresDir, featureRef);
  if (dirExists(exact)) return exact;

  // short ID like F001 — scan for matching prefix
  var dirs = listFeatureDirs(root);
  for (var i = 0; i < dirs.length; i++) {
    if (dirs[i] === featureRef || dirs[i].startsWith(featureRef + '-')) {
      return path.join(featuresDir, dirs[i]);
    }
  }

  return null;
}

function dirExists(p) {
  try { return fs.statSync(p).isDirectory(); } catch (_) { return false; }
}

// --- boundary ---

function loadBoundary(root, featureDir) {
  if (!featureDir) return null;
  var bPath = path.join(featureDir, 'boundary.json');
  var b = readJsonFile(bPath);
  if (!b || typeof b !== 'object') return null;
  return b;
}

// --- tool input extraction ---

function extractToolPaths(input) {
  if (!input) return [];
  var root = projectRoot();
  var paths = [];

  var ti = input.tool_input || {};
  var tr = input.tool_response || {};

  // single file path fields
  var candidates = [
    ti.file_path, ti.path, ti.filePath,
    tr.filePath, tr.file_path
  ];

  for (var i = 0; i < candidates.length; i++) {
    if (typeof candidates[i] === 'string' && candidates[i]) {
      paths.push(normalizeRelativePath(root, candidates[i]));
    }
  }

  // files array
  if (Array.isArray(ti.files)) {
    for (var j = 0; j < ti.files.length; j++) {
      var f = ti.files[j];
      if (typeof f === 'string') paths.push(normalizeRelativePath(root, f));
      else if (f && typeof f.path === 'string') paths.push(normalizeRelativePath(root, f.path));
      else if (f && typeof f.file_path === 'string') paths.push(normalizeRelativePath(root, f.file_path));
    }
  }

  // edits array (MultiEdit)
  if (Array.isArray(ti.edits)) {
    for (var k = 0; k < ti.edits.length; k++) {
      var e = ti.edits[k];
      if (e && typeof e.file_path === 'string') paths.push(normalizeRelativePath(root, e.file_path));
      else if (e && typeof e.path === 'string') paths.push(normalizeRelativePath(root, e.path));
    }
  }

  // deduplicate
  var seen = {};
  return paths.filter(function(p) {
    if (!p || seen[p]) return false;
    seen[p] = true;
    return true;
  });
}

function extractCommand(input) {
  if (!input) return null;
  var ti = input.tool_input || {};
  return typeof ti.command === 'string' ? ti.command : null;
}

// --- bootstrap path detection ---

var BOOTSTRAP_PREFIXES = [
  '.lh/',
  '.claude/',
  'docs/'
];

var BOOTSTRAP_EXACT = [
  '.lh',
  '.claude',
  'docs',
  'README.md',
  'CLAUDE.md'
];

function isHarnessBootstrapPath(p) {
  if (!p) return false;
  p = toPosixPath(p);
  if (p.startsWith('./')) p = p.slice(2);

  for (var i = 0; i < BOOTSTRAP_EXACT.length; i++) {
    if (p === BOOTSTRAP_EXACT[i]) return true;
  }

  for (var j = 0; j < BOOTSTRAP_PREFIXES.length; j++) {
    if (p.startsWith(BOOTSTRAP_PREFIXES[j])) return true;
  }

  return false;
}

// --- pattern matching ---

function matchesPattern(pattern, value) {
  if (!pattern || !value) return false;

  // exact match
  if (pattern === value) return true;

  // convert glob pattern to regex
  var regexStr = '';
  var i = 0;
  while (i < pattern.length) {
    var ch = pattern[i];
    if (ch === '*') {
      if (i + 1 < pattern.length && pattern[i + 1] === '*') {
        // ** matches everything including path separators
        regexStr += '.*';
        i += 2;
        if (i < pattern.length && pattern[i] === '/') i++; // skip trailing /
        continue;
      }
      // * matches non-separator characters
      regexStr += '[^/]*';
    } else if (ch === '?') {
      regexStr += '[^/]';
    } else if ('.+^${}()|[]\\'.indexOf(ch) >= 0) {
      regexStr += '\\' + ch;
    } else {
      regexStr += ch;
    }
    i++;
  }

  try {
    var re = new RegExp('^' + regexStr + '$', 'i');
    return re.test(value);
  } catch (_) {
    return false;
  }
}

function matchesAnyPattern(patterns, value) {
  if (!Array.isArray(patterns)) return false;
  for (var i = 0; i < patterns.length; i++) {
    if (matchesPattern(patterns[i], value)) return true;
  }
  return false;
}

// --- command classification ---

var BUILTIN_DENY = [
  { pattern: 'rm -rf /', reason: 'Refuses to delete filesystem root.' },
  { pattern: 'rm -rf /*', reason: 'Refuses to delete filesystem root contents.' },
  { pattern: 'rm -rf ~', reason: 'Refuses to delete the home directory.' },
  { pattern: 'rm -rf ~/*', reason: 'Refuses to delete home directory contents.' },
  { pattern: 'rm -rf .git', reason: 'Refuses to delete git metadata.' },
  { pattern: 'rm -rf .git/', reason: 'Refuses to delete git metadata.' },
  { pattern: 'git push --force*', reason: 'Force push requires explicit manual control.' },
  { pattern: 'git push -f *', reason: 'Force push requires explicit manual control.' },
  { pattern: 'git reset --hard*', reason: 'Hard reset can destroy local work.' },
  { pattern: 'git clean -fd*', reason: 'Git clean with force can delete untracked work.' },
  { pattern: 'git clean -fx*', reason: 'Git clean with force can delete untracked work.' },
  { pattern: 'git clean -fxd*', reason: 'Git clean with force can delete untracked work.' },
  { pattern: '*DROP DATABASE*', reason: 'Destructive database command.' },
  { pattern: '*drop database*', reason: 'Destructive database command.' },
  { pattern: '*DROP TABLE*', reason: 'Destructive database command.' },
  { pattern: '*drop table*', reason: 'Destructive database command.' },
  { pattern: 'cat .env*', reason: 'Refuses to expose secrets.' },
  { pattern: 'printenv*', reason: 'Refuses to expose environment secrets.' },
  { pattern: 'env', reason: 'Refuses to expose environment secrets.' },
  { pattern: '*> /dev/sd*', reason: 'Refuses to write directly to block devices.' },
  { pattern: 'dd if=*', reason: 'Refuses raw disk writes.' },
  { pattern: 'mkfs*', reason: 'Refuses filesystem creation on devices.' }
];

var BUILTIN_SAFE = [
  'git status*', 'git diff*', 'git log*', 'git branch*', 'git show*', 'git blame*',
  'ls*', 'find*', 'grep*', 'rg*', 'cat README.md', 'sed -n*', 'wc *', 'head *', 'tail *',
  'npm test*', 'npm run test*', 'npm run lint*', 'npm run typecheck*',
  'pnpm test*', 'pnpm lint*', 'pnpm typecheck*', 'pnpm run test*', 'pnpm run lint*',
  'yarn test*', 'yarn lint*', 'bun test*',
  'pytest*', 'go test*', 'cargo test*',
  'node --check*', 'python -m json.tool*', 'python -c *'
];

function classifyCommand(command) {
  if (!command || typeof command !== 'string') {
    return { decision: 'none', reason: '', matchedPattern: null };
  }

  var trimmed = command.trim();

  // check deny first
  for (var i = 0; i < BUILTIN_DENY.length; i++) {
    if (matchesPattern(BUILTIN_DENY[i].pattern, trimmed)) {
      return {
        decision: 'deny',
        reason: BUILTIN_DENY[i].reason,
        matchedPattern: BUILTIN_DENY[i].pattern
      };
    }
  }

  // check safe (no decision needed)
  for (var s = 0; s < BUILTIN_SAFE.length; s++) {
    if (matchesPattern(BUILTIN_SAFE[s], trimmed)) {
      return { decision: 'none', reason: '', matchedPattern: null };
    }
  }

  return { decision: 'none', reason: '', matchedPattern: null };
}

// --- path risk classification ---

var RISK_GATE_PATHS = {
  auth_rewrite: [
    '**/auth/**', '**/session/**', '**/*auth*', '**/*session*'
  ],
  payment_logic: [
    '**/billing/**', '**/payment/**', '**/checkout/**',
    '**/*billing*', '**/*payment*', '**/*checkout*'
  ],
  destructive_migration: [
    '**/migrations/**', '**/migration/**', '**/schema.*'
  ],
  new_dependency: [
    'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb',
    'requirements.txt', 'pyproject.toml', 'poetry.lock',
    'Gemfile', 'Gemfile.lock', 'go.mod', 'go.sum', 'Cargo.toml', 'Cargo.lock'
  ],
  public_api_break: [
    '**/api/**', '**/routes/**', '**/controllers/**',
    '**/schema/**', '**/*schema*', '**/*contract*'
  ],
  security_sensitive_change: [
    '**/security/**', '**/permissions/**', '**/authorization/**', '**/secrets/**',
    '**/*token*', '**/*permission*', '**/*secret*'
  ]
};

function classifyPathRisk(p) {
  if (!p) return [];
  var gates = [];
  var keys = Object.keys(RISK_GATE_PATHS);
  for (var i = 0; i < keys.length; i++) {
    if (matchesAnyPattern(RISK_GATE_PATHS[keys[i]], p)) {
      gates.push(keys[i]);
    }
  }
  return gates;
}

// --- boundary check ---

function normalizeTouchList(boundary) {
  if (!boundary || typeof boundary !== 'object') return [];
  var raw = boundary.touchFiles;
  if (raw == null) raw = boundary.touch;
  if (raw == null) {
    var files = boundary.files;
    if (Array.isArray(files)) raw = files;
    else if (files && typeof files === 'object') {
      var merged = [];
      ['modify', 'create', 'delete'].forEach(function(key) {
        if (Array.isArray(files[key])) merged = merged.concat(files[key]);
      });
      raw = merged;
    }
  }
  return Array.isArray(raw) ? raw : [];
}

function isPathInsideBoundary(p, boundary) {
  if (!p || !boundary) {
    return { inside: false, blocked: false, reason: 'No boundary loaded.' };
  }

  // check blocked first
  var blockedGlobs = boundary.blockedEditGlobs || [];
  var doNotTouch = boundary.doNotTouch || [];

  if (matchesAnyPattern(blockedGlobs, p)) {
    return { inside: false, blocked: true, reason: 'Path matches blockedEditGlobs in boundary.' };
  }
  for (var d = 0; d < doNotTouch.length; d++) {
    if (toPosixPath(doNotTouch[d]) === p || matchesPattern(doNotTouch[d], p)) {
      return { inside: false, blocked: true, reason: 'Path is in doNotTouch list.' };
    }
  }

  // check bootstrap paths — always considered inside
  if (isHarnessBootstrapPath(p)) {
    return { inside: true, blocked: false, reason: 'Bootstrap path.' };
  }

  // accept touchFiles (current), touch (docs/migration), or files (older object form)
  var touchFiles = normalizeTouchList(boundary);
  var allTouchPaths = [];
  for (var t = 0; t < touchFiles.length; t++) {
    var entry = touchFiles[t];
    if (entry && typeof entry === 'object' && typeof entry.path === 'string') {
      allTouchPaths.push(toPosixPath(entry.path));
    } else if (typeof entry === 'string') {
      allTouchPaths.push(toPosixPath(entry));
    }
  }

  for (var m = 0; m < allTouchPaths.length; m++) {
    if (allTouchPaths[m] === p) {
      return { inside: true, blocked: false, reason: 'Path listed in touchFiles.' };
    }
  }

  // check allowedEditGlobs
  var allowedGlobs = boundary.allowedEditGlobs || [];
  if (matchesAnyPattern(allowedGlobs, p)) {
    return { inside: true, blocked: false, reason: 'Path matches allowedEditGlobs.' };
  }

  // also check test_files and config_files
  var extras = [].concat(boundary.test_files || [], boundary.config_files || []);
  for (var x = 0; x < extras.length; x++) {
    if (typeof extras[x] === 'string' && toPosixPath(extras[x]) === p) {
      return { inside: true, blocked: false, reason: 'Path listed in boundary test/config files.' };
    }
  }

  return { inside: false, blocked: false, reason: 'Path not found in boundary.' };
}

// --- decision helpers ---

function preToolDecision(eventName, decision, reason) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      permissionDecisionReason: reason
    }
  };
}

function postToolBlock(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      decision: 'block',
      reason: reason
    }
  };
}

function stopBlock(reason) {
  return {
    decision: 'block',
    reason: reason
  };
}

// --- utilities ---

function nowIso() {
  return new Date().toISOString();
}

function safeString(val) {
  if (val === null || val === undefined) return '';
  return String(val);
}

// --- exports ---

module.exports = {
  readStdinJson: readStdinJson,
  projectRoot: projectRoot,
  readConfig: readConfig,
  loadBoundaryEnforcement: loadBoundaryEnforcement,
  toPosixPath: toPosixPath,
  normalizeRelativePath: normalizeRelativePath,
  readJsonFile: readJsonFile,
  writeJsonFile: writeJsonFile,
  appendJsonl: appendJsonl,
  ensureDir: ensureDir,
  loadState: loadState,
  findActiveFeature: findActiveFeature,
  listFeatureDirs: listFeatureDirs,
  resolveFeatureDir: resolveFeatureDir,
  loadBoundary: loadBoundary,
  extractToolPaths: extractToolPaths,
  extractCommand: extractCommand,
  isHarnessBootstrapPath: isHarnessBootstrapPath,
  matchesPattern: matchesPattern,
  matchesAnyPattern: matchesAnyPattern,
  classifyCommand: classifyCommand,
  classifyPathRisk: classifyPathRisk,
  isPathInsideBoundary: isPathInsideBoundary,
  preToolDecision: preToolDecision,
  postToolBlock: postToolBlock,
  stopBlock: stopBlock,
  nowIso: nowIso,
  safeString: safeString
};
