import { getVersion } from "./version.js";
import { readJsonFile, writeJsonFile } from "./fs.js";
import { statePath } from "./paths.js";
import type { HarnessState, FeatureIndexEntry } from "./types.js";

export function normalizeFeatureEntry(raw: Record<string, unknown>): FeatureIndexEntry {
  const entry = raw as unknown as FeatureIndexEntry;
  const worktreePath =
    typeof raw["worktreePath"] === "string" && raw["worktreePath"].length > 0
      ? (raw["worktreePath"] as string)
      : undefined;
  const worktreeBranch =
    typeof raw["worktreeBranch"] === "string" && raw["worktreeBranch"].length > 0
      ? (raw["worktreeBranch"] as string)
      : undefined;
  const worktreeCreatedAt =
    typeof raw["worktreeCreatedAt"] === "string" && raw["worktreeCreatedAt"].length > 0
      ? (raw["worktreeCreatedAt"] as string)
      : undefined;
  return {
    ...entry,
    worktreePath,
    worktreeBranch,
    worktreeCreatedAt,
  };
}

export function nowIso(): string {
  return new Date().toISOString();
}

export async function loadState(root: string): Promise<HarnessState> {
  const p = statePath(root);
  const data = await readJsonFile<Record<string, unknown>>(p);
  if (data === null) return createDefaultState();
  return normalizeState(data);
}

export async function saveState(root: string, state: HarnessState): Promise<void> {
  state.lastUpdated = nowIso();
  const p = statePath(root);
  await writeJsonFile(p, state, { overwrite: true });
}

export function normalizeState(input: unknown): HarnessState {
  if (typeof input !== "object" || input === null) {
    throw new Error(
      "Invalid state.json: expected a JSON object.\nRun `lh init` to create a valid state file.",
    );
  }

  const data = input as Record<string, unknown>;

  const version = typeof data["version"] === "string" ? data["version"] : getVersion();
  const schema = typeof data["schema"] === "string" ? data["schema"] : "leanharness-state";

  const activeFeature =
    typeof data["activeFeature"] === "string"
      ? data["activeFeature"]
      : typeof data["active_feature"] === "string"
        ? data["active_feature"]
        : null;

  const rawFeatures = data["features"];
  let features: FeatureIndexEntry[] = [];

  if (Array.isArray(rawFeatures)) {
    features = rawFeatures
      .filter(
        (f): f is Record<string, unknown> =>
          typeof f === "object" && f !== null && typeof (f as Record<string, unknown>)["id"] === "string",
      )
      .map((f) => normalizeFeatureEntry(f));
  } else if (typeof rawFeatures === "object" && rawFeatures !== null) {
    for (const val of Object.values(rawFeatures)) {
      if (typeof val === "object" && val !== null && typeof (val as Record<string, unknown>)["id"] === "string") {
        features.push(normalizeFeatureEntry(val as Record<string, unknown>));
      }
    }
  }

  const lastUpdated =
    typeof data["lastUpdated"] === "string"
      ? data["lastUpdated"]
      : typeof data["last_updated"] === "string"
        ? data["last_updated"]
        : null;

  let nextFeatureNumber =
    typeof data["nextFeatureNumber"] === "number" ? data["nextFeatureNumber"] : 1;

  if (nextFeatureNumber < 1) nextFeatureNumber = 1;

  const notes = typeof data["notes"] === "string" ? data["notes"] : undefined;

  return { version, schema, activeFeature, nextFeatureNumber, features, lastUpdated, notes };
}

export function getNextFeatureNumber(state: HarnessState): number {
  return state.nextFeatureNumber;
}

export function setNextFeatureNumberFromFeatures(state: HarnessState): HarnessState {
  let max = 0;
  for (const f of state.features) {
    const num = parseFeatureNumberFromId(f.id);
    if (num !== null && num > max) max = num;
  }
  state.nextFeatureNumber = max + 1;
  return state;
}

export function upsertFeatureEntry(state: HarnessState, entry: FeatureIndexEntry): HarnessState {
  const idx = state.features.findIndex((f) => f.id === entry.id);
  if (idx >= 0) {
    state.features[idx] = entry;
  } else {
    state.features.push(entry);
  }
  state.features.sort((a, b) => a.id.localeCompare(b.id));
  return state;
}

export function setFeatureWorktree(
  state: HarnessState,
  featureId: string,
  rec: { path: string; branch: string; createdAt: string },
): boolean {
  const entry = state.features.find((f) => f.id === featureId);
  if (!entry) return false;
  entry.worktreePath = rec.path;
  entry.worktreeBranch = rec.branch;
  entry.worktreeCreatedAt = rec.createdAt;
  return true;
}

export function clearFeatureWorktree(state: HarnessState, featureId: string): boolean {
  const entry = state.features.find((f) => f.id === featureId);
  if (!entry) return false;
  delete entry.worktreePath;
  delete entry.worktreeBranch;
  delete entry.worktreeCreatedAt;
  return true;
}

export function removeFeatureEntry(state: HarnessState, featureIdOrPath: string): HarnessState {
  state.features = state.features.filter(
    (f) => f.id !== featureIdOrPath && f.path !== featureIdOrPath,
  );
  return state;
}

export function setActiveFeature(state: HarnessState, featurePath: string | null): HarnessState {
  state.activeFeature = featurePath;
  return state;
}

function createDefaultState(): HarnessState {
  return {
    version: getVersion(),
    schema: "leanharness-state",
    activeFeature: null,
    nextFeatureNumber: 1,
    features: [],
    lastUpdated: null,
    notes:
      "State is a cache/index. Feature artifacts under .lh/features are the source of truth.",
  };
}

function parseFeatureNumberFromId(id: string): number | null {
  const match = /^F(\d{3,})$/.exec(id);
  if (!match || !match[1]) return null;
  return parseInt(match[1], 10);
}
