import { getVersion } from "./version.js";
import { readJsonFile, writeJsonFile } from "./fs.js";
import { statePath } from "./paths.js";
import type { HarnessState, FeatureIndexEntry } from "./types.js";

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
    features = rawFeatures.filter(
      (f): f is FeatureIndexEntry =>
        typeof f === "object" && f !== null && typeof f.id === "string",
    );
  } else if (typeof rawFeatures === "object" && rawFeatures !== null) {
    for (const val of Object.values(rawFeatures)) {
      if (typeof val === "object" && val !== null && typeof (val as Record<string, unknown>)["id"] === "string") {
        features.push(val as FeatureIndexEntry);
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
