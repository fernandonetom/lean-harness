import { execFileSync, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

// Check if claude CLI is available
try {
  execFileSync('which', ['claude'], { stdio: 'pipe' });
} catch (err) {
  console.log('claude CLI not found — skipping plugin smoke test');
  process.exit(0);
}

// claude CLI is available, proceed with smoke test
const prompt = 'What LeanHarness skills are available? List their names only, one per line, no other text.';
const timeout = 60 * 1000; // 60 seconds

const result = spawnSync('claude', [
  '--plugin-dir', repoRoot,
  '-p', prompt,
  '--output-format', 'json'
], {
  timeout,
  encoding: 'utf-8'
});

// Check for timeout
if (result.error && result.error.code === 'ETIMEDOUT') {
  console.error('Plugin smoke test timed out after 60 seconds');
  process.exit(1);
}

// Check for other errors
if (result.error) {
  console.error('Failed to run claude CLI:', result.error.message);
  process.exit(1);
}

// Check exit code
if (result.status !== 0) {
  console.error('claude CLI exited with status', result.status);
  if (result.stderr) {
    console.error('stderr:', result.stderr);
  }
  process.exit(1);
}

// Parse JSON output
let responseText = '';
try {
  const parsed = JSON.parse(result.stdout);
  // Try common envelope field names
  responseText = parsed.content || parsed.text || parsed.message || '';
  if (!responseText && typeof parsed === 'string') {
    responseText = parsed;
  }
  if (!responseText) {
    responseText = JSON.stringify(parsed);
  }
} catch (err) {
  // Fallback: treat whole stdout as the response
  responseText = result.stdout;
}

// Check for required skill names (case-insensitive)
const requiredSkills = ['lh-status', 'lh-spec', 'lh-build', 'lh-do'];
const lowerResponse = responseText.toLowerCase();
const found = requiredSkills.some(skill => lowerResponse.includes(skill));

if (found) {
  console.log('✓ Plugin smoke test passed: Found LeanHarness skills in response');
  process.exit(0);
} else {
  console.error('✗ Plugin smoke test failed: No LeanHarness skills found in response');
  console.error('Response was:', responseText);
  process.exit(1);
}
