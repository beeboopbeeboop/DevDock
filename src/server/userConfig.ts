import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// ─────────────────────────────────────────────
// User Configuration — replaces hardcoded paths
// ─────────────────────────────────────────────

export interface SharedLibrary {
  /** Display name (e.g., "DesignCore") */
  name: string;
  /** Absolute path to the master/source copy */
  masterPath: string;
  /** Subdirectory name to look for in projects (e.g., "DesignCore") */
  subdir: string;
  /** Optional: subdirectory within the master to compare (e.g., "src") */
  compareSubdir?: string;
}

export interface DevDockConfig {
  /** Directories to scan for projects */
  scanPaths: string[];
  /** Directory names to skip during scanning */
  ignoreDirs: string[];
  /** Server port */
  port: number;
  /** Server host */
  host: string;
  /** Shared libraries to track (replaces hardcoded HanlanCore/FramerCore) */
  sharedLibraries: SharedLibrary[];
  /** File/dir names that indicate a directory is a project */
  projectSignals: string[];
  /** Auto-scan interval in minutes (0 = disabled) */
  autoScanInterval: number;
}

const CONFIG_DIR = join(homedir(), '.devdock');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: DevDockConfig = {
  scanPaths: [
    join(homedir(), 'Documents'),
    join(homedir(), 'Projects'),
  ],
  ignoreDirs: [
    'node_modules', '.git', '.next', 'dist', 'build', '.cache',
    '.claude', '.vscode', '__pycache__', 'coverage',
  ],
  port: 3070,
  host: 'localhost',
  sharedLibraries: [],
  projectSignals: [
    'package.json', 'Cargo.toml', 'go.mod', 'pyproject.toml',
    'CSXS', 'manifest.xml', 'index.html', 'Package.swift',
    'wrangler.toml', 'vercel.json', '.git',
  ],
  autoScanInterval: 0,
};

let cachedConfig: DevDockConfig | null = null;

/** Load user config from ~/.devdock/config.json, creating defaults if missing */
export function getUserConfig(): DevDockConfig {
  if (cachedConfig) return cachedConfig;

  if (existsSync(CONFIG_FILE)) {
    try {
      const raw = readFileSync(CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      // Merge with defaults so new fields are always present
      cachedConfig = { ...DEFAULT_CONFIG, ...parsed };
      return cachedConfig;
    } catch (e) {
      console.warn('  Failed to parse config, using defaults:', e);
    }
  }

  // First run — create config dir and file with defaults
  cachedConfig = DEFAULT_CONFIG;
  saveConfig(cachedConfig);
  return cachedConfig;
}

/** Save config to disk */
export function saveConfig(config: DevDockConfig): void {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n');
    cachedConfig = config;
  } catch (e) {
    console.error('  Failed to save config:', e);
  }
}

/** Reload config from disk (e.g., after user edits it) */
export function reloadConfig(): DevDockConfig {
  cachedConfig = null;
  return getUserConfig();
}

/** Get the config file path (for display to user) */
export function getConfigPath(): string {
  return CONFIG_FILE;
}
