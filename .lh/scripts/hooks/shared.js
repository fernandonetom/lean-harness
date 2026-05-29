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

  // check touchFiles
  var touchFiles = boundary.touchFiles || boundary.files || {};
  var allTouchPaths = [];

  // handle touchFiles as array of objects with .path
  if (Array.isArray(touchFiles)) {
    for (var t = 0; t < touchFiles.length; t++) {
      if (touchFiles[t] && typeof touchFiles[t].path === 'string') {
        allTouchPaths.push(toPosixPath(touchFiles[t].path));
      } else if (typeof touchFiles[t] === 'string') {
        allTouchPaths.push(toPosixPath(touchFiles[t]));
      }
    }
  }

  // handle files.modify/create/delete from boundary template
  if (touchFiles && typeof touchFiles === 'object' && !Array.isArray(touchFiles)) {
    ['modify', 'create', 'delete'].forEach(function(key) {
      if (Array.isArray(touchFiles[key])) {
        touchFiles[key].forEach(function(fp) {
          if (typeof fp === 'string') allTouchPaths.push(toPosixPath(fp));
        });
      }
    });
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
