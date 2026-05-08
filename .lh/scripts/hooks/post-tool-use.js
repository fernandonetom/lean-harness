#!/usr/bin/env node
'use strict';

var path = require('path');
var shared = require('./shared');

function main() {
  var input = shared.readStdinJson();

  if (input.__parseError) return;

  var hookEvent = input.hook_event_name || 'PostToolUse';
  var toolName = input.tool_name || '';
  var root = shared.projectRoot();

  var featureRef = shared.findActiveFeature(root);
  var featureDir = featureRef ? shared.resolveFeatureDir(root, featureRef) : null;
  var boundary = featureDir ? shared.loadBoundary(root, featureDir) : null;

  var command = shared.extractCommand(input);
  var paths = shared.extractToolPaths(input);

  // build event object
  var event = {
    timestamp: shared.nowIso(),
    source: 'leanharness-hook',
    event: hookEvent,
    tool: toolName,
    feature: featureRef || null,
    paths: paths.length > 0 ? paths : null,
    command: command || null,
    result: hookEvent === 'PostToolUseFailure' ? 'failure' : 'success',
    durationMs: typeof input.duration_ms === 'number' ? input.duration_ms : null,
    notes: []
  };

  // extract error info for failures
  if (hookEvent === 'PostToolUseFailure') {
    var tr = input.tool_response || {};
    var errMsg = tr.stderr || tr.error || tr.message || null;
    if (errMsg) {
      event.notes.push('error: ' + shared.safeString(errMsg).slice(0, 500));
    }
  }

  // log event to feature events.jsonl
  if (featureDir) {
    var eventsFile = path.join(featureDir, 'events.jsonl');
    shared.appendJsonl(eventsFile, event);
  }

  // boundary feedback for PostToolUse edits
  if (hookEvent === 'PostToolUse' && boundary && paths.length > 0) {
    for (var i = 0; i < paths.length; i++) {
      var p = paths[i];

      if (shared.isHarnessBootstrapPath(p)) continue;

      var check = shared.isPathInsideBoundary(p, boundary);

      if (check.blocked || !check.inside) {
        var feedback = shared.postToolBlock(
          'LeanHarness detected an out-of-boundary edit after the tool ran: `' + p +
          '`. Do not continue implementation until you either revert the change or update discovery.md and boundary.json with a clear reason.'
        );
        process.stdout.write(JSON.stringify(feedback));

        // log the boundary violation
        if (featureDir) {
          var violationEvent = {
            timestamp: shared.nowIso(),
            source: 'leanharness-hook',
            event: 'boundary-violation',
            tool: toolName,
            feature: featureRef,
            paths: [p],
            command: null,
            result: 'warning',
            durationMs: null,
            notes: ['Out-of-boundary edit detected post-execution: ' + p]
          };
          shared.appendJsonl(path.join(featureDir, 'events.jsonl'), violationEvent);
        }

        return;
      }
    }
  }

  // for PostToolUseFailure, provide context when useful
  if (hookEvent === 'PostToolUseFailure' && featureDir) {
    var tr2 = input.tool_response || {};
    var hasError = tr2.stderr || tr2.error;
    if (hasError && command) {
      var failFeedback = shared.postToolBlock(
        'LeanHarness recorded a failed command in the event log: `' + command +
        '`. Review the error output and either fix the issue or mark the current task as needs-fix.'
      );
      process.stdout.write(JSON.stringify(failFeedback));
      return;
    }
  }
}

main();
