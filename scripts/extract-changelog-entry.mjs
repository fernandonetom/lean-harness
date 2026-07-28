import fs from 'fs';
import path from 'path';

const version = process.argv[2];

if (!version) {
  console.error('Usage: node extract-changelog-entry.mjs <version>');
  process.exit(1);
}

const changelogPath = path.join(process.cwd(), 'CHANGELOG.md');

let content;
try {
  content = fs.readFileSync(changelogPath, 'utf-8');
} catch (err) {
  console.error(`Error reading CHANGELOG.md: ${err.message}`);
  process.exit(1);
}

const lines = content.split('\n');
const versionHeading = `## ${version}`;

let startIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i] === versionHeading) {
    startIdx = i;
    break;
  }
}

if (startIdx === -1) {
  console.error(`No changelog entry found for version ${version}`);
  process.exit(1);
}

// Find the next ## heading
let endIdx = lines.length;
for (let i = startIdx + 1; i < lines.length; i++) {
  if (lines[i].startsWith('## ')) {
    endIdx = i;
    break;
  }
}

// Get the content between the headings (excluding the heading line itself)
const section = lines.slice(startIdx + 1, endIdx).join('\n');

// Trim leading and trailing blank lines
const trimmed = section.replace(/^\n+|\n+$/g, '');

console.log(trimmed);
