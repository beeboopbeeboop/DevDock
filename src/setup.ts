#!/usr/bin/env bun
/**
 * DevDock Setup — one command to install everything.
 * Run: bun run setup
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync, symlinkSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';

const HOME = homedir();
const DEVDOCK_DIR = resolve(import.meta.dir, '..');
const CLI_PATH = join(DEVDOCK_DIR, 'src', 'cli.ts');
const BUN_PATH = join(HOME, '.bun', 'bin', 'bun');

function log(msg: string) { console.log(`  \x1b[32m✓\x1b[0m ${msg}`); }
function warn(msg: string) { console.log(`  \x1b[33m!\x1b[0m ${msg}`); }
function fail(msg: string) { console.log(`  \x1b[31m✗\x1b[0m ${msg}`); }
function header(msg: string) { console.log(`\n\x1b[1m${msg}\x1b[0m`); }

async function main() {
  console.log('\n\x1b[1m  DevDock Setup\x1b[0m\n');

  // ─── 1. Check prerequisites ───
  header('Checking prerequisites...');

  if (!existsSync(BUN_PATH)) {
    fail('Bun not found at ~/.bun/bin/bun. Install it: https://bun.sh');
    process.exit(1);
  }
  log('Bun found');

  // ─── 2. Install CLI binary ───
  header('Installing CLI...');

  const binDirs = [
    join(HOME, '.local', 'bin'),
    '/usr/local/bin',
  ];

  let binDir = binDirs.find(d => {
    try { return existsSync(d); } catch { return false; }
  });

  if (!binDir) {
    binDir = join(HOME, '.local', 'bin');
    mkdirSync(binDir, { recursive: true });
  }

  const binPath = join(binDir, 'devdock');
  const wrapper = `#!/bin/bash\nexec ${BUN_PATH} run ${CLI_PATH} "$@"\n`;

  writeFileSync(binPath, wrapper);
  chmodSync(binPath, 0o755);
  log(`CLI installed at ${binPath}`);

  // Check if binDir is on PATH
  const pathDirs = (process.env.PATH || '').split(':');
  if (!pathDirs.includes(binDir)) {
    warn(`${binDir} is not on your PATH. You may need to add it.`);
  }

  // ─── 3. Create config directory ───
  header('Setting up config...');

  const configDir = join(HOME, '.devdock');
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  const configPath = join(configDir, 'config.json');
  if (!existsSync(configPath)) {
    writeFileSync(configPath, JSON.stringify({
      scanPaths: [`${HOME}/Documents`, `${HOME}/Projects`],
      port: 3070,
    }, null, 2));
    log('Created default config at ~/.devdock/config.json');
  } else {
    log('Config already exists');
  }

  // ─── 4. Install LaunchAgent ───
  header('Installing background service...');

  const agentDir = join(HOME, 'Library', 'LaunchAgents');
  const agentPath = join(agentDir, 'com.devdock.server.plist');
  const serverScript = join(DEVDOCK_DIR, 'src', 'server', 'index.ts');

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.devdock.server</string>
    <key>ProgramArguments</key>
    <array>
        <string>${BUN_PATH}</string>
        <string>run</string>
        <string>${serverScript}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${DEVDOCK_DIR}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${configDir}/server.log</string>
    <key>StandardErrorPath</key>
    <string>${configDir}/server.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>${HOME}/.bun/bin:${HOME}/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>
</dict>
</plist>`;

  // Unload existing if present
  try {
    Bun.spawnSync(['launchctl', 'unload', agentPath]);
  } catch { /* not loaded */ }

  writeFileSync(agentPath, plist);

  // Load the agent
  const loadResult = Bun.spawnSync(['launchctl', 'load', agentPath]);
  if (loadResult.exitCode === 0) {
    log('Background service installed and started');
  } else {
    warn('LaunchAgent loaded with warnings — check ~/Library/LaunchAgents/com.devdock.server.plist');
  }

  // ─── 5. Wait for server to be healthy ───
  header('Waiting for server...');

  let healthy = false;
  for (let i = 0; i < 15; i++) {
    try {
      const res = await fetch('http://localhost:3070/api/health');
      if (res.ok) { healthy = true; break; }
    } catch { /* not ready */ }
    await new Promise(r => setTimeout(r, 1000));
  }

  if (healthy) {
    log('Server is running at http://localhost:3070');
  } else {
    fail('Server failed to start. Check: tail ~/.devdock/server.log');
    // Continue anyway — shell integration is still useful
  }

  // ─── 6. Trigger initial scan ───
  if (healthy) {
    try {
      const res = await fetch('http://localhost:3070/api/scan', { method: 'POST' });
      const data = await res.json() as { count?: number };
      log(`Scanned ${data.count || '?'} projects`);
    } catch {
      warn('Initial scan failed — run "devdock scan" manually');
    }
  }

  // ─── 7. Shell integration ───
  header('Setting up shell...');

  const zshrcPath = join(HOME, '.zshrc');
  const shellInitLine = `eval "$(${binPath} shell-init)"`;

  if (existsSync(zshrcPath)) {
    const zshrc = readFileSync(zshrcPath, 'utf-8');
    if (zshrc.includes('devdock shell-init')) {
      log('Shell integration already in .zshrc');
    } else {
      writeFileSync(zshrcPath, zshrc + `\n# DevDock Smart Verbs\n${shellInitLine}\n`);
      log('Added shell integration to .zshrc');
    }
  } else {
    writeFileSync(zshrcPath, `# DevDock Smart Verbs\n${shellInitLine}\n`);
    log('Created .zshrc with shell integration');
  }

  // ─── 8. Auto-detect aliases from existing reset functions ───
  if (healthy && existsSync(zshrcPath)) {
    header('Detecting project aliases...');

    const zshrc = readFileSync(zshrcPath, 'utf-8');
    const resetPattern = /reset-(\w+)\(\)\s*\{[^}]*cd\s+([^\n;]+)/g;
    let match;
    const detected: { alias: string; path: string }[] = [];

    while ((match = resetPattern.exec(zshrc)) !== null) {
      const alias = match[1].replace(/-/g, '').toLowerCase();
      const path = match[2].trim().replace(/^~/, HOME).replace(/\/?\s*$/, '');
      detected.push({ alias, path });
    }

    if (detected.length > 0) {
      // Fetch projects to match paths
      try {
        const res = await fetch('http://localhost:3070/api/projects');
        const projects = await res.json() as { id: string; name: string; path: string }[];

        for (const d of detected) {
          const project = projects.find(p => p.path === d.path || p.path.endsWith(d.path.split('/').pop()!));
          if (project) {
            try {
              await fetch('http://localhost:3070/api/verbs/aliases', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ alias: d.alias, projectId: project.id }),
              });
              log(`Alias: ${d.alias} → ${project.name}`);
            } catch { /* alias might already exist */ }
          }
        }
      } catch {
        warn('Could not auto-detect aliases');
      }
    } else {
      log('No existing reset functions found to migrate');
    }
  }

  // ─── 9. Build menu bar app ───
  header('Building menu bar app...');

  const menubarDir = join(DEVDOCK_DIR, 'menubar');
  if (existsSync(join(menubarDir, 'Package.swift'))) {
    const buildResult = Bun.spawnSync(['swift', 'build', '-c', 'release'], { cwd: menubarDir });
    if (buildResult.exitCode === 0) {
      const src = join(menubarDir, '.build', 'release', 'DevDockMenu');
      const dst = join(menubarDir, 'DevDockMenu.bin');
      try { unlinkSync(dst); } catch { /* doesn't exist */ }
      writeFileSync(dst, readFileSync(src));
      chmodSync(dst, 0o755);
      log('Menu bar app built');
    } else {
      warn('Menu bar app build failed — Xcode CLT may be needed');
    }
  } else {
    warn('Menu bar app not found at menubar/Package.swift');
  }

  // ─── Done ───
  console.log(`
\x1b[1m  Setup complete!\x1b[0m

  Open a new terminal tab and try:

    \x1b[36mreset site\x1b[0m          Kill port, clear cache, restart
    \x1b[36mstart proteus\x1b[0m       Start dev server
    \x1b[36mstop all\x1b[0m            Stop everything
    \x1b[36mstatus\x1b[0m              What's running
    \x1b[36mdd aka p proteus\x1b[0m    Set a shortcut alias
    \x1b[36mdd log\x1b[0m              See command history

  Dashboard: \x1b[4mhttp://localhost:3070\x1b[0m
`);
}

main().catch((e) => {
  console.error('Setup failed:', e);
  process.exit(1);
});
