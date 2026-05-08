import fsp from "node:fs/promises";
import path from "node:path";
import { fileExists, dirExists, readTextFile } from "../core/fs.js";

export interface ProjectDetection {
  root: string;
  packageManagers: string[];
  languages: string[];
  frameworks: string[];
  importantFiles: string[];
  sourceDirs: string[];
  testDirs: string[];
  configFiles: string[];
  notes: string[];
}

const LOCKFILE_TO_PM: Array<[string, string]> = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lockb", "bun"],
  ["package-lock.json", "npm"],
];

const LANGUAGE_INDICATORS: Array<[string, string]> = [
  ["tsconfig.json", "typescript"],
  ["jsconfig.json", "javascript"],
  ["package.json", "javascript"],
  ["pyproject.toml", "python"],
  ["requirements.txt", "python"],
  ["Pipfile", "python"],
  ["poetry.lock", "python"],
  ["pytest.ini", "python"],
  ["go.mod", "go"],
  ["Cargo.toml", "rust"],
  ["Gemfile", "ruby"],
  ["pom.xml", "java"],
  ["build.gradle", "java"],
  ["composer.json", "php"],
];

const LANGUAGE_EXTENSIONS: Array<[string, string]> = [
  [".csproj", "csharp"],
  [".sln", "csharp"],
];

const FRAMEWORK_INDICATORS: Array<[string, string]> = [
  ["next.config.js", "next.js"],
  ["next.config.mjs", "next.js"],
  ["next.config.ts", "next.js"],
  ["nuxt.config.js", "nuxt"],
  ["nuxt.config.ts", "nuxt"],
  ["svelte.config.js", "svelte"],
  ["svelte.config.ts", "svelte"],
  ["angular.json", "angular"],
  ["vite.config.js", "vite"],
  ["vite.config.ts", "vite"],
  ["vite.config.mjs", "vite"],
  ["astro.config.mjs", "astro"],
  ["remix.config.js", "remix"],
];

const COMMON_SOURCE_DIRS = [
  "src", "app", "pages", "components", "lib", "server",
  "client", "backend", "frontend", "packages", "apps",
  "services", "modules",
];

const COMMON_TEST_DIRS = [
  "test", "tests", "spec", "__tests__", "e2e", "integration",
];

const CONFIG_FILES = [
  "tsconfig.json", "jsconfig.json", "package.json",
  ".eslintrc.json", ".eslintrc.js", ".eslintrc.yml", "eslint.config.js", "eslint.config.mjs",
  ".prettierrc", ".prettierrc.json", "prettier.config.js",
  "jest.config.js", "jest.config.ts", "vitest.config.ts", "vitest.config.js",
  ".babelrc", "babel.config.js",
  "webpack.config.js", "rollup.config.js",
  "Dockerfile", "docker-compose.yml", "docker-compose.yaml",
  ".env.example",
  "Makefile",
];

export async function detectProject(root: string): Promise<ProjectDetection> {
  const result: ProjectDetection = {
    root,
    packageManagers: [],
    languages: [],
    frameworks: [],
    importantFiles: [],
    sourceDirs: [],
    testDirs: [],
    configFiles: [],
    notes: [],
  };

  let topEntries: string[];
  try {
    topEntries = (await fsp.readdir(root)).slice(0, 5000);
  } catch {
    result.notes.push("Could not read project root directory.");
    return result;
  }

  const topSet = new Set(topEntries);

  for (const [file, pm] of LOCKFILE_TO_PM) {
    if (topSet.has(file)) {
      result.packageManagers.push(pm);
    }
  }
  if (result.packageManagers.length === 0 && topSet.has("package.json")) {
    result.packageManagers.push("npm");
  }

  const seenLangs = new Set<string>();
  for (const [file, lang] of LANGUAGE_INDICATORS) {
    if (topSet.has(file) && !seenLangs.has(lang)) {
      seenLangs.add(lang);
      result.languages.push(lang);
    }
  }

  for (const entry of topEntries) {
    for (const [ext, lang] of LANGUAGE_EXTENSIONS) {
      if (entry.endsWith(ext) && !seenLangs.has(lang)) {
        seenLangs.add(lang);
        result.languages.push(lang);
      }
    }
  }

  if (seenLangs.has("typescript") && seenLangs.has("javascript")) {
    result.languages = result.languages.filter((l) => l !== "javascript");
  }

  const seenFrameworks = new Set<string>();
  for (const [file, fw] of FRAMEWORK_INDICATORS) {
    if (topSet.has(file) && !seenFrameworks.has(fw)) {
      seenFrameworks.add(fw);
      result.frameworks.push(fw);
    }
  }

  for (const dir of COMMON_SOURCE_DIRS) {
    if (topSet.has(dir) && (await dirExists(path.join(root, dir)))) {
      result.sourceDirs.push(dir);
    }
  }

  for (const dir of COMMON_TEST_DIRS) {
    if (topSet.has(dir) && (await dirExists(path.join(root, dir)))) {
      result.testDirs.push(dir);
    }
  }

  for (const file of CONFIG_FILES) {
    if (topSet.has(file) && (await fileExists(path.join(root, file)))) {
      result.configFiles.push(file);
    }
  }

  const important = [
    "package.json", "tsconfig.json", "README.md", "CLAUDE.md",
    "Makefile", "Dockerfile",
  ];
  for (const file of important) {
    if (topSet.has(file)) {
      result.importantFiles.push(file);
    }
  }

  if (result.languages.length === 0) {
    result.notes.push("No recognized language indicators found at project root.");
  }

  if (result.sourceDirs.length === 0) {
    result.notes.push("No common source directories found. Files may be at project root.");
  }

  return result;
}
