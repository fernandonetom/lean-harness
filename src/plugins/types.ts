import type { AgentAdapter } from "../adapters/types.js";

export interface PluginHookContext {
  root: string;
  featureId: string;
  featureDir: string;
}

export interface PluginHooks {
  beforeDiscover?: ((ctx: PluginHookContext) => Promise<void> | void) | undefined;
  afterDiscover?: ((ctx: PluginHookContext) => Promise<void> | void) | undefined;
  beforeBuild?: ((ctx: PluginHookContext) => Promise<void> | void) | undefined;
  afterBuild?: ((ctx: PluginHookContext) => Promise<void> | void) | undefined;
  beforeCheck?: ((ctx: PluginHookContext) => Promise<void> | void) | undefined;
  afterCheck?: ((ctx: PluginHookContext) => Promise<void> | void) | undefined;
}

export type PluginHookName = keyof PluginHooks;

export interface LHPlugin {
  name: string;
  version: string;
  hooks?: PluginHooks | undefined;
  adapters?: AgentAdapter[] | undefined;
}

export interface PluginManifest {
  name: string;
  version: string;
  main: string;
}
