import type { LHPlugin, PluginHookName, PluginHookContext } from "./types.js";
import { loadAllPlugins } from "./loader.js";

export interface PluginRegistry {
  plugins: ReadonlyArray<LHPlugin>;
  errors: ReadonlyArray<{ dir: string; error: string }>;
  runHook(hookName: PluginHookName, ctx: PluginHookContext): Promise<void>;
  getPlugin(name: string): LHPlugin | undefined;
  hasPlugins(): boolean;
}

export function createPluginRegistry(plugins: LHPlugin[], errors: Array<{ dir: string; error: string }> = []): PluginRegistry {
  const pluginMap = new Map<string, LHPlugin>();
  for (const p of plugins) {
    pluginMap.set(p.name, p);
  }

  return {
    plugins,
    errors,

    async runHook(hookName: PluginHookName, ctx: PluginHookContext): Promise<void> {
      for (const plugin of plugins) {
        const hookFn = plugin.hooks?.[hookName];
        if (typeof hookFn === "function") {
          await hookFn(ctx);
        }
      }
    },

    getPlugin(name: string): LHPlugin | undefined {
      return pluginMap.get(name);
    },

    hasPlugins(): boolean {
      return plugins.length > 0;
    },
  };
}

export function createEmptyRegistry(): PluginRegistry {
  return createPluginRegistry([]);
}

export async function loadPluginRegistry(root: string): Promise<PluginRegistry> {
  const results = await loadAllPlugins(root);
  const plugins: LHPlugin[] = [];
  const errors: Array<{ dir: string; error: string }> = [];

  for (const r of results) {
    if (r.plugin) {
      plugins.push(r.plugin);
    } else if (r.error) {
      errors.push({ dir: r.dir, error: r.error });
    }
  }

  return createPluginRegistry(plugins, errors);
}
