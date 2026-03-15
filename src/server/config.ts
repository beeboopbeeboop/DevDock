import { getUserConfig } from './userConfig.js';

// Re-export config in the shape the rest of the codebase expects.
// Reads from ~/.devdock/config.json (user-editable) instead of hardcoded paths.

function buildConfig() {
  const uc = getUserConfig();
  return {
    port: uc.port,
    host: uc.host,
    scanPaths: uc.scanPaths,
    ignoreDirs: new Set(uc.ignoreDirs),
    projectSignals: uc.projectSignals,
    sharedLibraries: uc.sharedLibraries,
  };
}

export type Config = ReturnType<typeof buildConfig>;

// Lazy singleton — built on first access
let _config: Config | null = null;

export const config = new Proxy({} as Config, {
  get(_, prop: string) {
    if (!_config) _config = buildConfig();
    return (_config as Record<string, unknown>)[prop];
  },
});
