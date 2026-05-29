#!/usr/bin/env node
'use strict';

var shared = require('./shared');

function main() {
  var input = shared.readStdinJson();

  if (input.__parseError) return;

  var toolName = input.tool_name || '';
  var root = shared.projectRoot();

  if (toolName === 'Bash') {
    handleBash(input, root);
  } else if (toolName === 'Edit' || toolName === 'Write' || toolName === 'MultiEdit') {
    handleFileEdit(input, root, toolName);
  }
}

function handleBash(input, root) {
  var command = shared.extractCommand(input);
  if (!command) return;

  var result = shared.classifyCommand(command);

  if (result.decision === 'deny') {
    var decision = shared.preToolDecision(
      'PreToolUse',
      'deny',
      'LeanHarness blocked this command: ' +
      result.reason.replace(/\.$/, '') +
      '. Command: \`' + command + '\`.'
    );
    process.stdout.write(JSON.stringify(decision));
    return;
  }

}

function handleFileEdit(input, root, toolName) {
  var paths = shared.extractToolPaths(input);

  if (paths.length === 0) return;

  var featureRef = shared.findActiveFeature(root);
  var featureDir = featureRef ? shared.resolveFeatureDir(root, featureRef) : null;
  var boundary = featureDir ? shared.loadBoundary(root, featureDir) : null;

  for (var i = 0; i < paths.length; i++) {
    var p = paths[i];

    if (p.startsWith('__PARENT_ESCAPE__')) {
      var escDecision = shared.preToolDecision(
        'PreToolUse',
        'deny',
        'LeanHarness blocked this edit because the path escapes the project directory: \`' + p + '\`.'
      );
      process.stdout.write(JSON.stringify(escDecision));
      return;
    }

    if (shared.isHarnessBootstrapPath(p)) {
      continue;
    }

    if (boundary) {
      var check = shared.isPathInsideBoundary(p, boundary);

      if (check.blocked) {
        var blockDecision = shared.preToolDecision(
          'PreToolUse',
          'deny',
          'LeanHarness blocked this edit because \`' + p +
          '\` is explicitly blocked in the active change boundary. ' + check.reason
        );
        process.stdout.write(JSON.stringify(blockDecision));
        return;
      }

      if (!check.inside) {
        var featureName = featureRef || 'active feature';
        var oobDecision = shared.preToolDecision(
          'PreToolUse',
          'deny',
          'LeanHarness blocked this edit because \`' + p +
          '\` is outside the active change boundary for ' + featureName +
          '. Update discovery and boundary before editing it.'
        );
        process.stdout.write(JSON.stringify(oobDecision));
        return;
      }

      continue;
    }
  }
}

main();
