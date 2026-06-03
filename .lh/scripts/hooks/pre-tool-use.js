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

  var enforcement = shared.loadBoundaryEnforcement(root);

  var featureRef = shared.findActiveFeature(root);
  var featureDir = featureRef ? shared.resolveFeatureDir(root, featureRef) : null;
  var boundary = featureDir ? shared.loadBoundary(root, featureDir) : null;

  for (var i = 0; i < paths.length; i++) {
    var p = paths[i];

    // Parent-escape check is unconditional — cannot be overridden by mode or always_allow
    if (p.startsWith('__PARENT_ESCAPE__')) {
      var escDecision = shared.preToolDecision(
        'PreToolUse',
        'deny',
        'LeanHarness blocked this edit because the path escapes the project directory: \`' + p + '\`.'
      );
      process.stdout.write(JSON.stringify(escDecision));
      return;
    }

    // Bootstrap path check is unconditional — always allow
    if (shared.isHarnessBootstrapPath(p)) {
      continue;
    }

    // always_allow globs — allow unconditionally regardless of mode or boundary
    if (shared.matchesAnyPattern(enforcement.always_allow, p)) {
      continue;
    }

    // session_overrides — allow unconditionally
    if (enforcement.session_overrides.indexOf(p) !== -1) {
      continue;
    }

    // mode: off — skip all boundary checks
    if (enforcement.mode === 'off') {
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

        if (enforcement.mode === 'warn') {
          process.stderr.write(
            'LeanHarness warning: \`' + p +
            '\` is outside the active change boundary for ' + featureName +
            '. Edit is allowed in warn mode.\n'
          );
          continue;
        }

        // strict mode (default) — deny with CLI hint
        var oobDecision = shared.preToolDecision(
          'PreToolUse',
          'deny',
          'LeanHarness blocked this edit because \`' + p +
          '\` is outside the active change boundary for ' + featureName +
          '. Update discovery and boundary before editing it.' +
          '\nTo allow this file, run: lh boundary allow ' + p
        );
        process.stdout.write(JSON.stringify(oobDecision));
        return;
      }

      continue;
    }
  }
}

main();
