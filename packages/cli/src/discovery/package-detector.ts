import path from "node:path";
import { fileExists, readJsonFile } from "../core/fs.js";

export interface DetectedCommand {
  command: string;
  purpose: string;
  confidence: "low" | "med" | "high";
  source: string;
}

export interface PackageDetection {
  packageManager: string | null;
  scripts: Record<string, string>;
  dependencies: string[];
  devDependencies: string[];
  likelyCommands: DetectedCommand[];
  notes: string[];
}

interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const LOCKFILE_PRIORITY: Array<[string, string]> = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lockb", "bun"],
  ["package-lock.json", "npm"],
];

const USEFUL_SCRIPTS = ["test", "lint", "typecheck", "build", "check", "format", "e2e"];

export async function detectPackage(root: string): Promise<PackageDetection> {
  const result: PackageDetection = {
    packageManager: null,
    scripts: {},
    dependencies: [],
    devDependencies: [],
    likelyCommands: [],
    notes: [],
  };

  const pkgPath = path.join(root, "package.json");
  const hasPkg = await fileExists(pkgPath);

  if (hasPkg) {
    await detectNodePackage(root, pkgPath, result);
  }

  await detectNonNodeCommands(root, result);

  return result;
}

async function detectNodePackage(
  root: string,
  pkgPath: string,
  result: PackageDetection,
): Promise<void> {
  for (const [lockfile, pm] of LOCKFILE_PRIORITY) {
    if (await fileExists(path.join(root, lockfile))) {
      result.packageManager = pm;
      break;
    }
  }
  if (result.packageManager === null) {
    result.packageManager = "npm";
  }

  const pkg = await readJsonFile<PackageJson>(pkgPath);
  if (pkg === null) {
    result.notes.push("package.json exists but could not be parsed.");
    return;
  }

  if (pkg.scripts) {
    for (const [name, script] of Object.entries(pkg.scripts)) {
      if (typeof script === "string") {
        result.scripts[name] = script;
      }
    }
  }

  if (pkg.dependencies) {
    result.dependencies = Object.keys(pkg.dependencies);
  }
  if (pkg.devDependencies) {
    result.devDependencies = Object.keys(pkg.devDependencies);
  }

  const pm = result.packageManager;
  const run = pm === "npm" ? "npm run " : `${pm} `;

  for (const scriptName of USEFUL_SCRIPTS) {
    if (result.scripts[scriptName]) {
      result.likelyCommands.push({
        command: `${run}${scriptName}`,
        purpose: scriptName,
        confidence: "high",
        source: `package.json scripts.${scriptName}`,
      });
    }
  }
}

async function detectNonNodeCommands(
  root: string,
  result: PackageDetection,
): Promise<void> {
  if (await fileExists(path.join(root, "pyproject.toml"))) {
    result.likelyCommands.push({
      command: "pytest",
      purpose: "test",
      confidence: "med",
      source: "pyproject.toml exists",
    });
  } else if (await fileExists(path.join(root, "pytest.ini"))) {
    result.likelyCommands.push({
      command: "pytest",
      purpose: "test",
      confidence: "high",
      source: "pytest.ini exists",
    });
  } else if (await fileExists(path.join(root, "requirements.txt"))) {
    result.likelyCommands.push({
      command: "pytest",
      purpose: "test",
      confidence: "low",
      source: "requirements.txt exists (pytest assumed)",
    });
  }

  if (await fileExists(path.join(root, "go.mod"))) {
    result.likelyCommands.push({
      command: "go test ./...",
      purpose: "test",
      confidence: "high",
      source: "go.mod exists",
    });
  }

  if (await fileExists(path.join(root, "Cargo.toml"))) {
    result.likelyCommands.push({
      command: "cargo test",
      purpose: "test",
      confidence: "high",
      source: "Cargo.toml exists",
    });
  }

  if (await fileExists(path.join(root, "Gemfile"))) {
    result.likelyCommands.push({
      command: "bundle exec rspec",
      purpose: "test",
      confidence: "med",
      source: "Gemfile exists",
    });
  }

  if (await fileExists(path.join(root, "pom.xml"))) {
    result.likelyCommands.push({
      command: "mvn test",
      purpose: "test",
      confidence: "med",
      source: "pom.xml exists",
    });
  }

  if (await fileExists(path.join(root, "build.gradle"))) {
    result.likelyCommands.push({
      command: "./gradlew test",
      purpose: "test",
      confidence: "med",
      source: "build.gradle exists",
    });
  }

  if (await fileExists(path.join(root, "composer.json"))) {
    result.likelyCommands.push({
      command: "composer test",
      purpose: "test",
      confidence: "low",
      source: "composer.json exists",
    });
  }

  if (await fileExists(path.join(root, "Makefile"))) {
    result.likelyCommands.push({
      command: "make test",
      purpose: "test",
      confidence: "low",
      source: "Makefile exists (make test assumed)",
    });
  }
}
