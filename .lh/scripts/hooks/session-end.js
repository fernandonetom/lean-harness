#!/usr/bin/env node
'use strict';

var fs = require('fs');
var path = require('path');
var shared = require('./shared');

function main() {
  var input = shared.readStdinJson();

  if (input.__parseError) return;

  var hookEvent = input.hook_event_name || '';
  var root = shared.projectRoot();

  if (hookEvent === 'SessionEnd') {
    handleSessionEnd(input, root);
  } else if (hookEvent === 'Stop' || hookEvent === 'SubagentStop') {
    handleStop(input, root, hookEvent);
  }
}

function handleSessionEnd(input, root) {
  var featureRef = shared.findActiveFeature(root);
  var featureDir = featureRef ? shared.resolveFeatureDir(root, featureRef) : null;

  if (featureDir) {
    var event = {
      timestamp: shared.nowIso(),
      source: 'leanharness-hook',
      event: 'SessionEnd',
      tool: null,
      feature: featureRef,
      paths: null,
      command: null,
      result: 'session-end',
      durationMs: null,
      notes: []
    };
    shared.appendJsonl(path.join(featureDir, 'events.jsonl'), event);
  }
  // never block SessionEnd
}

function handleStop(input, root, hookEvent) {
  var featureRef = shared.findActiveFeature(root);
  if (!featureRef) return;

  var featureDir = shared.resolveFeatureDir(root, featureRef);
  if (!featureDir) return;

  var state = shared.loadState(root);

  // determine feature status
  var featureStatus = getFeatureStatus(state, featureRef, featureDir);

  // only enforce during active build-like states
  var buildStates = ['building', 'planned', 'needs-fix', 'in-progress'];
  if (buildStates.indexOf(featureStatus) < 0) return;

  // check for recent implementation events
  var events = loadRecentEvents(featureDir);
  if (events.length === 0) return;

  var hasImplEdits = events.some(function(e) {
    return (e.tool === 'Edit' || e.tool === 'Write' || e.tool === 'MultiEdit') &&
           Array.isArray(e.paths) &&
           e.paths.some(function(p) { return !shared.isHarnessBootstrapPath(p); });
  });

  // if only bootstrap/docs edits, don't block
  if (!hasImplEdits) return;

  // check for task summaries
  var hasSummary = hasTaskSummaries(featureDir);

  // check for verification evidence
  var hasVerification = hasVerificationEvidence(featureDir);

  // check for recent failures without follow-up
  var hasUnresolvedFailure = hasRecentUnresolvedFailure(events);

  // check if checks.md shows pass
  var checksPass = checksShowPass(featureDir);
  if (checksPass) return;

  // build block reasons
  var reasons = [];

  if (!hasSummary) {
    reasons.push(
      'LeanHarness needs a task summary before stopping. Write or update a task summary in `' +
      path.join('.lh/features', path.basename(featureDir), 'task-summaries') +
      '/` with files changed, commands run, verification evidence, and next action.'
    );
  }

  if (hasUnresolvedFailure) {
    reasons.push(
      'LeanHarness detected failed commands in events.jsonl. Before stopping, summarize the failure and mark the task `needs-fix` or `blocked`.'
    );
  }

  if (reasons.length > 0) {
    var block = shared.stopBlock(reasons.join(' '));
    process.stdout.write(JSON.stringify(block));
    return;
  }
}

function getFeatureStatus(state, featureRef, featureDir) {
  // check state.json features map
  if (state.features && state.features[featureRef] && state.features[featureRef].status) {
    return state.features[featureRef].status;
  }

  // check for spec/plan/tasks as status proxy
  if (fileExists(path.join(featureDir, 'tasks.md'))) return 'building';
  if (fileExists(path.join(featureDir, 'plan.md'))) return 'planned';
  if (fileExists(path.join(featureDir, 'spec.md'))) return 'specified';

  return 'unknown';
}

function loadRecentEvents(featureDir) {
  var eventsFile = path.join(featureDir, 'events.jsonl');
  try {
    var raw = fs.readFileSync(eventsFile, 'utf8').trim();
    if (!raw) return [];

    var lines = raw.split('\n');
    // take last 50 events
    var recent = lines.slice(-50);
    var events = [];
    for (var i = 0; i < recent.length; i++) {
      try {
        events.push(JSON.parse(recent[i]));
      } catch (_) {}
    }
    return events;
  } catch (_) {
    return [];
  }
}

function hasTaskSummaries(featureDir) {
  var summaryDir = path.join(featureDir, 'task-summaries');
  try {
    var entries = fs.readdirSync(summaryDir);
    return entries.length > 0;
  } catch (_) {
    return false;
  }
}

function hasVerificationEvidence(featureDir) {
  // check for checks.md or result.md
  if (fileExists(path.join(featureDir, 'checks.md'))) return true;
  if (fileExists(path.join(featureDir, 'result.md'))) return true;
  return false;
}

function hasRecentUnresolvedFailure(events) {
  // find most recent failure and check if there's a success after it
  var lastFailureIdx = -1;
  var lastSuccessAfterFailure = false;

  for (var i = 0; i < events.length; i++) {
    if (events[i].result === 'failure') {
      lastFailureIdx = i;
      lastSuccessAfterFailure = false;
    } else if (lastFailureIdx >= 0 && events[i].result === 'success' && events[i].tool === 'Bash') {
      lastSuccessAfterFailure = true;
    }
  }

  return lastFailureIdx >= 0 && !lastSuccessAfterFailure;
}

function checksShowPass(featureDir) {
  var checksFile = path.join(featureDir, 'checks.md');
  try {
    var content = fs.readFileSync(checksFile, 'utf8');
    return content.toLowerCase().indexOf('verdict: pass') >= 0 ||
           content.toLowerCase().indexOf('verdict:pass') >= 0;
  } catch (_) {
    return false;
  }
}

function fileExists(p) {
  try { return fs.statSync(p).isFile(); } catch (_) { return false; }
}

main();
