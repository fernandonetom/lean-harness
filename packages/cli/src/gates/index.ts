export type {
  GateArtifact,
  GateResult,
  GateDiagnostic,
  RunGatesInput,
  GateConfig,
} from "./types.js";

export { defaultGateConfig } from "./types.js";
export { runGates, parseTypeScriptDiagnostics, filterFiles, matchesAnyGlob } from "./run-gates.js";
