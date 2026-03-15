import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { ProjectType, DeployTarget } from '../../shared/types.js';

interface DetectionResult {
  type: ProjectType;
  techStack: string[];
  devCommand: string | null;
  devPort: number | null;
  deployTarget: DeployTarget;
  description: string | null;
}

function fileExists(dir: string, file: string): boolean {
  return existsSync(join(dir, file));
}

function dirExists(dir: string, sub: string): boolean {
  try {
    const stat = Bun.file(join(dir, sub));
    // Bun.file doesn't check dirs — use fs
    return existsSync(join(dir, sub));
  } catch {
    return false;
  }
}

function readPkg(dir: string): Record<string, unknown> | null {
  const pkgPath = join(dir, 'package.json');
  if (!existsSync(pkgPath)) return null;
  try {
    return JSON.parse(readFileSync(pkgPath, 'utf-8'));
  } catch {
    return null;
  }
}

function hasDep(pkg: Record<string, unknown>, dep: string): boolean {
  const deps = { ...(pkg.dependencies as Record<string, string> || {}), ...(pkg.devDependencies as Record<string, string> || {}) };
  return dep in deps;
}

function extractPort(dir: string, pkg: Record<string, unknown> | null): number | null {
  // Check vite config for port
  for (const cfg of ['vite.config.ts', 'vite.config.js']) {
    const p = join(dir, cfg);
    if (existsSync(p)) {
      try {
        const content = readFileSync(p, 'utf-8');
        const match = content.match(/port\s*:\s*(\d+)/);
        if (match) return parseInt(match[1]);
      } catch { /* skip */ }
    }
  }

  // Check next.config for port in dev script
  if (pkg) {
    const scripts = pkg.scripts as Record<string, string> || {};
    const devCmd = scripts.dev || '';
    const portMatch = devCmd.match(/-p\s+(\d+)|--port\s+(\d+)|PORT=(\d+)/);
    if (portMatch) return parseInt(portMatch[1] || portMatch[2] || portMatch[3]);
  }

  // Default ports by type
  return null;
}

export function detectProject(dir: string): DetectionResult {
  const pkg = readPkg(dir);
  const techStack: string[] = [];
  let type: ProjectType = 'unknown';
  let devCommand: string | null = null;
  let devPort: number | null = null;
  let deployTarget: DeployTarget = 'none';
  let description: string | null = null;

  if (pkg) {
    description = (pkg.description as string) || null;
    const scripts = pkg.scripts as Record<string, string> || {};
    devCommand = scripts.dev || scripts.start || null;

    // Detect tech stack from deps
    if (hasDep(pkg, 'react')) techStack.push('react');
    if (hasDep(pkg, 'typescript') || fileExists(dir, 'tsconfig.json')) techStack.push('typescript');
    if (hasDep(pkg, 'tailwindcss') || hasDep(pkg, '@tailwindcss/vite')) techStack.push('tailwind');
    if (hasDep(pkg, 'vite')) techStack.push('vite');
    if (hasDep(pkg, 'next')) techStack.push('next');
    if (hasDep(pkg, 'hono')) techStack.push('hono');
    if (hasDep(pkg, 'supabase') || hasDep(pkg, '@supabase/supabase-js')) techStack.push('supabase');
    if (hasDep(pkg, 'better-sqlite3') || hasDep(pkg, 'sqlite3')) techStack.push('sqlite');
    if (hasDep(pkg, 'playwright') || hasDep(pkg, '@playwright/test')) techStack.push('playwright');
    if (hasDep(pkg, 'framer-motion') || hasDep(pkg, 'motion')) techStack.push('framer-motion');
    if (hasDep(pkg, 'stripe') || hasDep(pkg, '@stripe/stripe-js')) techStack.push('stripe');
    if (hasDep(pkg, '@anthropic-ai/sdk')) techStack.push('anthropic');
    if (hasDep(pkg, 'vitest')) techStack.push('vitest');
    if (hasDep(pkg, '@dnd-kit/core')) techStack.push('dnd-kit');
    if (hasDep(pkg, 'three') || hasDep(pkg, '@react-three/fiber')) techStack.push('three.js');
    if (hasDep(pkg, 'vue')) techStack.push('vue');
    if (hasDep(pkg, 'svelte')) techStack.push('svelte');
    if (hasDep(pkg, 'd3') || hasDep(pkg, 'd3-selection')) techStack.push('d3');
  }

  // Detect project type (priority order)
  if (dirExists(dir, 'CSXS') || fileExists(dir, '.debug')) {
    type = 'cep-plugin';
    // Detect shared libraries from config
    try {
      const { getUserConfig } = require('../userConfig.js');
      const uc = getUserConfig();
      for (const lib of uc.sharedLibraries) {
        if (dirExists(dir, lib.subdir)) techStack.push(lib.name.toLowerCase());
      }
    } catch { /* config not ready */ }
  } else if (fileExists(dir, 'next.config.ts') || fileExists(dir, 'next.config.js') || fileExists(dir, 'next.config.mjs')) {
    type = 'nextjs';
  } else if (fileExists(dir, 'framer.json')) {
    type = 'framer-plugin';
  } else if ((fileExists(dir, 'vite.config.ts') || fileExists(dir, 'vite.config.js')) && pkg && hasDep(pkg, 'react')) {
    type = 'vite-react';
  } else if (fileExists(dir, 'wrangler.toml')) {
    type = 'cloudflare-worker';
    deployTarget = 'cloudflare';
  } else if (pkg && hasDep(pkg, 'hono') && !hasDep(pkg, 'react')) {
    type = 'hono-server';
  } else if (fileExists(dir, 'Package.swift')) {
    type = 'swift-app';
    techStack.push('swift');
  } else if (pkg && (pkg.main || pkg.exports)) {
    type = 'node-package';
  } else if (fileExists(dir, 'index.html')) {
    type = 'static-site';
  }

  // Detect deploy target
  if (fileExists(dir, 'vercel.json') || dirExists(dir, '.vercel')) {
    deployTarget = 'vercel';
  } else if (fileExists(dir, 'wrangler.toml')) {
    deployTarget = 'cloudflare';
  } else if (fileExists(dir, 'netlify.toml') || dirExists(dir, '.netlify')) {
    deployTarget = 'netlify';
  } else if (fileExists(dir, 'railway.json') || fileExists(dir, 'railway.toml')) {
    deployTarget = 'railway';
  } else if (fileExists(dir, 'fly.toml')) {
    deployTarget = 'flyio';
  }

  // Docker detection
  if (fileExists(dir, 'docker-compose.yml') || fileExists(dir, 'docker-compose.yaml') || fileExists(dir, 'compose.yml') || fileExists(dir, 'compose.yaml')) {
    techStack.push('docker-compose');
  }
  if (fileExists(dir, 'Dockerfile')) {
    techStack.push('docker');
  }

  devPort = extractPort(dir, pkg);

  return { type, techStack, devCommand, devPort, deployTarget, description };
}
