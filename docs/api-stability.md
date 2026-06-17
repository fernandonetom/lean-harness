# API Stability

LeanHarness v1.0.0 freezes the following API surfaces. Breaking changes to frozen surfaces require a major version bump.

## Stability tiers

| Tier | Meaning | Applies to |
|------|---------|------------|
| **Frozen** | Breaking changes require major version bump | Public TypeScript types, CLI commands, artifact structure |
| **Stable** | Additive changes allowed, removals require major bump | Config keys, plugin hooks |
| **Internal** | May change without notice | Private functions, internal modules |

---

## Frozen TypeScript interfaces

### `HarnessConfig`

```typescript
interface HarnessConfig {
  version?: string | number;
  project?: HarnessConfigProject;
  host?: HarnessConfigHost;
  workflow?: HarnessConfigWorkflow;
  artifacts?: HarnessConfigArtifacts;
  discovery?: HarnessConfigDiscovery;
  context?: HarnessConfigContext;
  compression?: HarnessConfigCompression;
  verification?: HarnessConfigVerification;
  risk_gates?: HarnessConfigRiskGates;
  models?: HarnessConfigModels;
  memory?: HarnessConfigMemory;
  logging?: HarnessConfigLogging;
  adapters?: Record<string, HarnessConfigAdapter>;
}
```

All sub-interfaces (`HarnessConfigProject`, `HarnessConfigHost`, etc.) are also frozen. New optional fields may be added to sub-interfaces without a major bump. Removing or renaming existing fields is a breaking change.

Source: `src/core/types.ts`

### `AgentAdapter`

```typescript
interface AgentAdapter {
  host: AgentHost;
  run(input: AgentRunInput): Promise<AgentRunResult>;
  detect(root: string, commandOverride?: string): Promise<AgentDetection>;
}
```

Source: `src/adapters/types.ts`

### `AgentRunInput`

```typescript
interface AgentRunInput {
  host?: AgentHost;
  root: string;
  prompt: string;
  featureRef: string;
  taskId: string;

  dryRun?: boolean;
  model?: string;

  // Claude Code-specific
  allowedTools?: string[];
  permissionMode?: string;
  outputFormat?: "text" | "json" | "stream-json";
  claudeCommand?: string;

  // OpenCode-specific
  opencodeCommand?: string;
  opencodeAgent?: string;
  opencodeFormat?: "default" | "json";
  attach?: string;
  session?: string;

  // subprocess control
  timeout?: number;
  signal?: AbortSignal;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}
```

New optional fields may be added. Existing fields will not be removed or have their types changed.

Source: `src/adapters/types.ts`

### `AgentRunResult`

```typescript
interface AgentRunResult {
  host: AgentHost;
  ok: boolean;
  command: string[];
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  outputPath?: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  dryRun: boolean;
  timedOut: boolean;
  aborted: boolean;
  warnings?: string[];
}
```

Source: `src/adapters/types.ts`

### `LHPlugin`

```typescript
interface LHPlugin {
  name: string;
  version: string;
  hooks?: PluginHooks;
  adapters?: AgentAdapter[];
}

interface PluginHooks {
  beforeDiscover?: (ctx: PluginHookContext) => Promise<void> | void;
  afterDiscover?: (ctx: PluginHookContext) => Promise<void> | void;
  beforeBuild?: (ctx: PluginHookContext) => Promise<void> | void;
  afterBuild?: (ctx: PluginHookContext) => Promise<void> | void;
  beforeCheck?: (ctx: PluginHookContext) => Promise<void> | void;
  afterCheck?: (ctx: PluginHookContext) => Promise<void> | void;
}

interface PluginHookContext {
  root: string;
  featureId: string;
  featureDir: string;
}
```

New hook names may be added to `PluginHooks`. Existing hooks will not be removed or have their signatures changed.

Source: `src/plugins/types.ts`

### `ResolvedConfig`

```typescript
interface ResolvedConfig {
  host: { primary: SupportedAgentHost };
  discovery: { default_depth: DiscoveryDepth; max_initial_files: number };
  compression: { enabled: boolean; mode: CompressionMode };
  verification: {
    require_acceptance_trace: boolean;
    require_changed_files: boolean;
    require_review: boolean;
  };
  risk_gates: { require_approval: string[] };
  models: { agent: string | null; subagent: string | null };
}
```

Source: `src/core/resolved-config.ts`

---

## Frozen type aliases

| Type | Values | Source |
|------|--------|--------|
| `AgentHost` | `"claude-code" \| "opencode"` | `src/adapters/types.ts` |
| `SupportedAgentHost` | `"claude-code" \| "opencode"` | `src/core/types.ts` |
| `FeatureStatus` | `"draft" \| "specified" \| "discovered" \| "planned" \| "building" \| "needs-fix" \| "blocked" \| "verified" \| "done" \| "archived"` | `src/core/types.ts` |
| `DiscoveryDepth` | `"D0" \| "D1" \| "D2" \| "D3" \| "D4"` | `src/core/types.ts` |
| `CompressionMode` | `"lite" \| "full" \| "ultra"` | `src/core/types.ts` |
| `CheckVerdict` | `"pass" \| "needs-fix" \| "blocked"` | `src/core/types.ts` |

New values may be added to union types. Existing values will not be removed.

---

## Frozen CLI commands

| Command | Signature | Purpose |
|---------|-----------|---------|
| `init` | `lh init [--host] [--yes] [--global] [--force] [--json]` | Initialize LeanHarness |
| `status` | `lh status [--json]` | Show current status |
| `spec` | `lh spec <request> [--title] [--id] [--force] [--json]` | Create feature spec |
| `new` | `lh new <request> [--title] [--id] [--force] [--json]` | Alias for spec |
| `list` | `lh list [--all] [--json]` | List features |
| `show` | `lh show <feature> [--json]` | Show feature detail |
| `archive` | `lh archive <feature> [--json]` | Archive a feature |
| `discover` | `lh discover <feature> [--depth] [--max-files] [--hint] [--json]` | Run discovery |
| `plan` | `lh plan <feature> [--force] [--from-spec] [--max-tasks] [--task-size] [--json]` | Create plan |
| `compile-task` | `lh compile-task <feature> <task> [--output] [--max-bytes] [--include-file] [--print] [--json]` | Compile task context |
| `run-task` | `lh run-task <feature> <task> [--host] [--model] [--dry-run] [--json]` | Run single task |
| `build` | `lh build <feature> [task] [--host] [--model] [--dry-run] [--all] [--strict] [--approve-risk] [--json]` | Build feature |
| `check` | `lh check <feature> [--run] [--no-run] [--strict] [--force] [--command] [--max-command-ms] [--json]` | Verify feature |
| `compress` | `lh compress <feature> [--mode] [--source] [--output] [--dry-run] [--force] [--json]` | Generate CaveBus summaries |
| `cavebus` | `lh cavebus <feature> [--type] [--tail] [--validate] [--strict] [--json]` | Inspect CaveBus log |
| `memory` | `lh memory [show\|clear\|status] [--json]` | Manage memory |
| `update` | `lh update [--host] [--json]` | Refresh managed files |
| `watch` | `lh watch <feature> [--run] [--no-run] [--strict] [--json]` | Watch boundary files |
| `completion` | `lh completion [bash\|zsh\|fish]` | Shell completions |
| `doctor` | `lh doctor [--fix] [--json]` | Health check |

New commands may be added. Existing commands, their positional arguments, and documented flags will not be removed or have their semantics changed.

---

## Frozen artifact structure

Feature artifacts live under `.lh/features/<feature-id>-<slug>/`:

```
.lh/features/F001-password-reset/
├── spec.md                    # Feature specification
├── discovery.md               # Discovery results
├── boundary.json              # Machine-readable change boundary
├── plan.md                    # Build plan
├── tasks.md                   # Task definitions
├── checks.md                  # Verification checklist
├── result.md                  # Verification result + verdict
├── risk-approvals.json        # Approved risk gates
├── cavebus.log                # CaveBus message log
└── tasks/                     # Per-task artifacts
    └── T1/
        ├── context.md         # Compiled bounded context
        ├── run-result.json    # Agent run output metadata
        └── summary.md         # Task completion summary
```

New files may be added to the feature directory. Existing file names and their purpose will not change.

### `boundary.json` schema

```json
{
  "featureId": "F001",
  "featureTitle": "Add login route",
  "status": "discovered",
  "confidence": "high",
  "discoveryDepth": "D2",
  "touchFiles": [
    { "path": "src/routes/auth.ts", "reason": "new login route", "confidence": "high" }
  ],
  "readOnlyFiles": [
    { "path": "src/config/routes.ts", "reason": "route registry", "confidence": "medium" }
  ],
  "relevantTests": [
    { "path": "tests/routes/auth.test.ts", "reason": "auth route tests", "confidence": "high" }
  ],
  "commands": [
    { "command": "npm test", "purpose": "run unit tests", "confidence": "high", "source": "package.json" }
  ],
  "allowedEditGlobs": [],
  "blockedEditGlobs": [],
  "riskGates": [
    { "name": "auth_rewrite", "reason": "touches auth", "status": "triggered" }
  ],
  "unknowns": [],
  "doNotTouch": [],
  "protectedTokens": [],
  "closureGaps": [],
  "lastUpdated": "2026-05-08T10:00:00Z"
}
```

**Field aliases for backward compatibility.** The boundary-enforcement code (and the bundled hook scripts) accept older field names so existing feature folders do not break:

| Field | Accepted aliases |
|-------|------------------|
| `touchFiles` | `touch` (string array, no `path` object wrapper), `files` (object with `modify`/`create`/`delete` arrays) |
| `readOnlyFiles` | `readOnly` |

New boundaries generated by the CLI always use the canonical `touchFiles` / `readOnlyFiles` shape with object entries `{ path, reason, confidence }`.

### `state.json` schema

```json
{
  "version": "0.1.0",
  "schema": "v1",
  "activeFeature": "F001",
  "nextFeatureNumber": 2,
  "features": [
    {
      "id": "F001",
      "slug": "password-reset",
      "title": "Add password reset flow",
      "path": ".lh/features/F001-password-reset",
      "status": "building"
    }
  ],
  "lastUpdated": "2026-05-08T10:00:00Z"
}
```

---

## Frozen config keys

All keys in `config.yml` are stable. New keys may be added. Existing keys will not be removed or have their semantics changed. See [configuration.md](configuration.md) for full reference.

---

## Package exports

The `leanharness` npm package exports the following entry points:

| Export | Path | Contents |
|--------|------|----------|
| `.` | `dist/index.js` | CLI entry point |
| `./types` | `dist/core/types.js` | Core type definitions |
| `./adapters` | `dist/adapters/types.js` | Adapter type definitions |
| `./plugins` | `dist/plugins/types.js` | Plugin type definitions |
| `./config` | `dist/core/resolved-config.js` | Config resolution |

Type declarations (`.d.ts`) are included for all exports.

---

## Versioning policy

LeanHarness follows [Semantic Versioning 2.0.0](https://semver.org/):

- **Major** (2.0, 3.0): Breaking changes to frozen surfaces
- **Minor** (1.1, 1.2): New features, new optional fields, new commands
- **Patch** (1.0.1, 1.0.2): Bug fixes, documentation updates

Pre-1.0 releases may break any surface at any time.
