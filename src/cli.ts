#!/usr/bin/env bun
/**
 * DevDock CLI — scriptable interface to the DevDock API.
 *
 * Usage:
 *   devdock projects                     # List all projects
 *   devdock projects --type nextjs       # Filter by type
 *   devdock projects --dirty             # Show only repos with uncommitted changes
 *   devdock scan                         # Trigger a full project scan
 *   devdock git status <project-id>      # Git status for a project
 *   devdock git commit <project-id> -m "message"
 *   devdock git push <project-id>
 *   devdock git pull <project-id>
 *   devdock ports                        # List all listening ports
 *   devdock ports kill <port>            # Kill process on port
 *   devdock dev start <project-id>       # Start dev server
 *   devdock dev stop <project-id>        # Stop dev server
 *   devdock dev status <project-id>      # Check dev server status
 *   devdock deploy trigger <project-id>  # Trigger deploy
 *   devdock deploy status <project-id>   # Check deploy status
 *   devdock config                       # Show current config
 *   devdock config set scanPaths '["~/Projects","~/Code"]'
 *   devdock open <project-id>            # Open in VS Code
 *   devdock open <project-id> --cursor   # Open in Cursor
 *   devdock health                       # Server health check
 */

const BASE = process.env.DEVDOCK_URL || 'http://localhost:3070';

async function api(path: string, options?: RequestInit) {
  const url = `${BASE}/api${path}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    });
    const data = await res.json();
    if (!res.ok && data.error) {
      console.error(`Error: ${data.error}`);
      process.exit(1);
    }
    return data;
  } catch (e) {
    console.error(`Failed to connect to DevDock at ${BASE}. Is the server running?`);
    process.exit(1);
  }
}

function print(data: unknown) {
  console.log(JSON.stringify(data, null, 2));
}

function printTable(rows: Record<string, unknown>[], columns: string[]) {
  if (rows.length === 0) { console.log('(none)'); return; }
  const widths = columns.map((col) =>
    Math.max(col.length, ...rows.map((r) => String(r[col] ?? '').length))
  );
  const header = columns.map((col, i) => col.padEnd(widths[i])).join('  ');
  console.log(header);
  console.log(widths.map((w) => '─'.repeat(w)).join('  '));
  for (const row of rows) {
    console.log(columns.map((col, i) => String(row[col] ?? '').padEnd(widths[i])).join('  '));
  }
}

// ─────────────────────────────────────────────
// Resolve project ID → path using DB
// ─────────────────────────────────────────────

async function resolveProject(idOrName: string): Promise<{ id: string; path: string; name: string }> {
  const projects = await api('/projects');
  const match = projects.find((p: { id: string; name: string }) =>
    p.id === idOrName || p.name.toLowerCase() === idOrName.toLowerCase()
  );
  if (!match) {
    console.error(`Project not found: ${idOrName}`);
    console.error('Run "devdock projects" to see available projects.');
    process.exit(1);
  }
  return match;
}

// ─────────────────────────────────────────────
// Command routing
// ─────────────────────────────────────────────

const args = process.argv.slice(2);
const cmd = args[0];
const sub = args[1];

async function main() {
  switch (cmd) {
    case 'projects': {
      const params = new URLSearchParams();
      const typeIdx = args.indexOf('--type');
      if (typeIdx !== -1 && args[typeIdx + 1]) params.set('type', args[typeIdx + 1]);
      const statusIdx = args.indexOf('--status');
      if (statusIdx !== -1 && args[statusIdx + 1]) params.set('status', args[statusIdx + 1]);

      const projects = await api(`/projects?${params}`);
      const dirty = args.includes('--dirty');
      const filtered = dirty ? projects.filter((p: { gitDirty: boolean }) => p.gitDirty) : projects;

      if (args.includes('--json')) {
        print(filtered);
      } else {
        printTable(
          filtered.map((p: Record<string, unknown>) => ({
            id: p.id,
            name: p.name,
            type: p.type,
            branch: p.gitBranch || '-',
            dirty: p.gitDirty ? '*' : '',
            port: p.devPort || '-',
          })),
          ['id', 'name', 'type', 'branch', 'dirty', 'port'],
        );
      }
      break;
    }

    case 'scan': {
      console.log('Scanning projects...');
      const result = await api('/scan', { method: 'POST' });
      console.log(`Scanned ${result.count ?? '?'} projects.`);
      break;
    }

    case 'git': {
      if (!sub || !args[2]) { console.error('Usage: devdock git <status|commit|push|pull|branches> <project-id>'); process.exit(1); }
      const project = await resolveProject(args[2]);

      switch (sub) {
        case 'status': {
          const data = await api(`/actions/git-status?path=${encodeURIComponent(project.path)}`);
          if (data.staged.length) { console.log('Staged:'); data.staged.forEach((f: { file: string; status: string }) => console.log(`  ${f.status} ${f.file}`)); }
          if (data.unstaged.length) { console.log('Unstaged:'); data.unstaged.forEach((f: { file: string; status: string }) => console.log(`  ${f.status} ${f.file}`)); }
          if (!data.staged.length && !data.unstaged.length) console.log('Clean.');
          break;
        }
        case 'commit': {
          const msgIdx = args.indexOf('-m');
          const message = msgIdx !== -1 ? args[msgIdx + 1] : undefined;
          if (!message) { console.error('Usage: devdock git commit <project-id> -m "message"'); process.exit(1); }
          const result = await api('/actions/git-commit', {
            method: 'POST',
            body: JSON.stringify({ path: project.path, message }),
          });
          console.log(result.ok ? `Committed: ${result.hash}` : `Failed: ${result.error || result.output}`);
          break;
        }
        case 'push': {
          const result = await api('/actions/git-push', {
            method: 'POST',
            body: JSON.stringify({ path: project.path }),
          });
          console.log(result.ok ? 'Pushed.' : `Failed: ${result.error || result.output}`);
          break;
        }
        case 'pull': {
          const result = await api('/actions/git-pull', {
            method: 'POST',
            body: JSON.stringify({ path: project.path }),
          });
          console.log(result.ok ? 'Pulled.' : `Failed: ${result.error || result.output}`);
          break;
        }
        case 'branches': {
          const data = await api(`/actions/git-branches?path=${encodeURIComponent(project.path)}`);
          console.log(`Current: ${data.current}`);
          data.branches.forEach((b: { name: string; isCurrent: boolean; isRemote: boolean }) =>
            console.log(`  ${b.isCurrent ? '*' : ' '} ${b.name}${b.isRemote ? ' (remote)' : ''}`)
          );
          break;
        }
        default:
          console.error(`Unknown git command: ${sub}`);
      }
      break;
    }

    case 'ports': {
      if (sub === 'kill' && args[2]) {
        const result = await api('/actions/port-kill', {
          method: 'POST',
          body: JSON.stringify({ port: parseInt(args[2]) }),
        });
        console.log(result.ok ? `Killed ${result.killed} process(es) on port ${args[2]}` : `Failed: ${result.error}`);
      } else {
        const ports = await api('/ports/all');
        if (args.includes('--json')) {
          print(ports);
        } else {
          printTable(
            ports.map((p: Record<string, unknown>) => ({
              port: p.port,
              command: p.command,
              pid: p.pid,
              project: p.projectName || '-',
            })),
            ['port', 'command', 'pid', 'project'],
          );
        }
      }
      break;
    }

    case 'dev': {
      if (!sub || !args[2]) { console.error('Usage: devdock dev <start|stop|status> <project-id>'); process.exit(1); }
      const project = await resolveProject(args[2]);

      switch (sub) {
        case 'start': {
          const result = await api('/actions/start-dev', {
            method: 'POST',
            body: JSON.stringify({
              path: project.path,
              command: (project as Record<string, unknown>).devCommand,
              projectId: project.id,
            }),
          });
          console.log(result.ok ? `Started dev server for ${project.name}` : `Failed: ${result.error}`);
          break;
        }
        case 'stop': {
          const result = await api(`/actions/terminal-stop/${project.id}`, { method: 'POST' });
          console.log(result.ok ? 'Stopped.' : 'No running process found.');
          break;
        }
        case 'status': {
          const status = await api(`/actions/terminal-status/${project.id}`);
          console.log(status.running ? `Running (PID ${status.pid}, started ${new Date(status.startedAt).toLocaleString()})` : 'Not running.');
          break;
        }
        case 'logs': {
          const buffer = await api(`/actions/terminal-buffer/${project.id}`);
          (buffer.lines as string[]).forEach((line: string) => console.log(line));
          break;
        }
        default:
          console.error(`Unknown dev command: ${sub}`);
      }
      break;
    }

    case 'deploy': {
      if (!sub || !args[2]) { console.error('Usage: devdock deploy <trigger|status|history> <project-id>'); process.exit(1); }
      const project = await resolveProject(args[2]);

      switch (sub) {
        case 'trigger': {
          const env = args.includes('--prod') ? 'production' : 'preview';
          const result = await api(`/deploy/${project.id}/trigger`, {
            method: 'POST',
            body: JSON.stringify({ environment: env }),
          });
          console.log(result.triggered ? `Deploy triggered (${result.target}, ${result.environment})` : `Failed: ${result.error}`);
          break;
        }
        case 'status': {
          const data = await api(`/deploy/${project.id}/status`);
          print(data);
          break;
        }
        case 'history': {
          const data = await api(`/deploy/${project.id}/history`);
          if (args.includes('--json')) {
            print(data);
          } else {
            printTable(
              data.map((d: Record<string, unknown>) => ({
                id: (d.id as string)?.slice(0, 8),
                url: d.url,
                status: d.status,
                env: d.environment,
                created: d.createdAt,
              })),
              ['id', 'url', 'status', 'env', 'created'],
            );
          }
          break;
        }
        default:
          console.error(`Unknown deploy command: ${sub}`);
      }
      break;
    }

    case 'config': {
      if (sub === 'set' && args[2] && args[3]) {
        let value: unknown;
        try { value = JSON.parse(args[3]); } catch { value = args[3]; }
        const result = await api('/config', {
          method: 'PATCH',
          body: JSON.stringify({ [args[2]]: value }),
        });
        console.log(`Updated ${args[2]}.`);
        print(result.config);
      } else {
        const data = await api('/config');
        console.log(`Config file: ${data.configPath}`);
        print(data.config);
      }
      break;
    }

    case 'open': {
      if (!sub) { console.error('Usage: devdock open <project-id> [--cursor]'); process.exit(1); }
      const project = await resolveProject(sub);
      const editor = args.includes('--cursor') ? 'cursor' : 'vscode';
      await api('/actions/open-editor', {
        method: 'POST',
        body: JSON.stringify({ path: project.path, editor }),
      });
      console.log(`Opened ${project.name} in ${editor}.`);
      break;
    }

    case 'health': {
      const data = await api('/health');
      print(data);
      break;
    }

    case 'env': {
      if (!sub) {
        // Global env audit
        const data = await api('/env/audit');
        if (data.issues.length === 0) {
          console.log(`All ${data.totalProjects} projects look good — no env issues found.`);
        } else {
          console.log(`Found ${data.issues.length} issues across ${data.projectsWithIssues} projects:\n`);
          for (const issue of data.issues) {
            const icon = issue.severity === 'error' ? '!' : issue.severity === 'warning' ? '?' : '-';
            console.log(`  ${icon} [${issue.projectName}] ${issue.detail}`);
          }
        }
        break;
      }

      const project = await resolveProject(sub === 'list' || sub === 'read' || sub === 'set' || sub === 'compare' ? args[2] : sub);

      switch (sub) {
        case 'list': {
          const data = await api(`/env/files?path=${encodeURIComponent(project.path)}`);
          if (data.length === 0) { console.log('No .env files found.'); break; }
          printTable(
            data.map((f: Record<string, unknown>) => ({
              file: f.filename,
              vars: f.varCount,
              example: f.isExample ? 'yes' : '',
            })),
            ['file', 'vars', 'example'],
          );
          break;
        }
        case 'read': {
          const file = args.includes('--file') ? args[args.indexOf('--file') + 1] : '.env';
          const reveal = args.includes('--reveal');
          const data = await api(`/env/read?path=${encodeURIComponent(project.path)}&file=${file}&reveal=${reveal}`);
          for (const v of data.variables) {
            if (v.isBlank) { console.log(''); continue; }
            if (v.isComment) { console.log(v.key); continue; }
            const icon = v.sensitivity === 'secret' ? '!' : v.sensitivity === 'config' ? '*' : ' ';
            console.log(`${icon} ${v.key}=${v.masked ? v.value + ' (masked)' : v.value}`);
          }
          break;
        }
        case 'set': {
          const key = args[3];
          const value = args[4];
          if (!key || value === undefined) { console.error('Usage: devdock env set <project> <KEY> <value> [--file .env]'); process.exit(1); }
          const file = args.includes('--file') ? args[args.indexOf('--file') + 1] : '.env';
          const result = await api('/env/variable', {
            method: 'PUT',
            body: JSON.stringify({ path: project.path, file, key, value }),
          });
          console.log(`${result.action}: ${key} in ${file}`);
          break;
        }
        case 'compare': {
          const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : '.env.example';
          const target = args.includes('--target') ? args[args.indexOf('--target') + 1] : '.env';
          const data = await api(`/env/compare?path=${encodeURIComponent(project.path)}&base=${base}&target=${target}`);
          if (data.missingCount > 0) {
            console.log(`Missing from ${target} (defined in ${base}):`);
            data.missing.forEach((k: string) => console.log(`  - ${k}`));
          }
          if (data.extraCount > 0) {
            console.log(`Extra in ${target} (not in ${base}):`);
            data.extra.forEach((k: string) => console.log(`  + ${k}`));
          }
          if (data.missingCount === 0 && data.extraCount === 0) {
            console.log(`${base} and ${target} have the same keys.`);
          }
          break;
        }
        default: {
          // devdock env <project> — show files for that project
          const data = await api(`/env/files?path=${encodeURIComponent(project.path)}`);
          if (data.length === 0) { console.log('No .env files found.'); break; }
          printTable(
            data.map((f: Record<string, unknown>) => ({
              file: f.filename,
              vars: f.varCount,
              example: f.isExample ? 'yes' : '',
            })),
            ['file', 'vars', 'example'],
          );
        }
      }
      break;
    }

    case 'secrets': {
      if (!sub || sub === 'audit') {
        // Global secrets audit
        console.log('Scanning all projects for hardcoded secrets...\n');
        const data = await api('/secrets/audit');
        if (data.totalFindings === 0) {
          console.log(`Clean — no secrets found across ${data.totalProjects} projects.`);
        } else {
          console.log(`Found ${data.totalFindings} potential secrets in ${data.projectsWithSecrets} projects:\n`);
          for (const proj of data.projects) {
            console.log(`  ${proj.projectName} (${proj.total} findings, ${proj.critical} critical)`);
            for (const f of proj.findings.slice(0, 5)) {
              console.log(`    [${f.severity}] ${f.file}:${f.line} — ${f.patternName}: ${f.snippet}`);
            }
            if (proj.findings.length > 5) console.log(`    ... and ${proj.findings.length - 5} more`);
          }
        }
      } else {
        // Scan specific project
        const project = await resolveProject(sub);
        console.log(`Scanning ${project.name}...\n`);
        const data = await api(`/secrets/scan?path=${encodeURIComponent(project.path)}`);
        if (data.total === 0) {
          console.log('Clean — no secrets found.');
        } else {
          console.log(`Found ${data.total} potential secrets (${data.critical} critical, ${data.high} high, ${data.medium} medium):\n`);
          for (const f of data.findings) {
            console.log(`  [${f.severity}] ${f.file}:${f.line} — ${f.patternName}`);
            console.log(`    ${f.snippet}`);
          }
        }
      }
      break;
    }

    case 'integrations': {
      const data = await api('/actions/integrations/status');
      printTable(
        data.map((i: Record<string, unknown>) => ({
          name: i.name,
          cli: i.cliInstalled ? 'installed' : 'missing',
          auth: i.authenticated ? i.account || 'yes' : 'no',
        })),
        ['name', 'cli', 'auth'],
      );
      break;
    }

    default: {
      console.log(`DevDock CLI

Usage: devdock <command> [options]

Commands:
  projects [--type X] [--dirty] [--json]  List projects
  scan                                     Rescan all project directories
  git status|commit|push|pull|branches <id> Git operations
  ports [kill <port>] [--json]            Port management
  dev start|stop|status|logs <id>         Dev server management
  deploy trigger|status|history <id>      Deployment operations
  env [<id>|list|read|set|compare]        Manage .env files
  env                                      Audit env health across all projects
  env read <id> [--reveal] [--file .env]  Read env variables (masked by default)
  env set <id> KEY value [--file .env]    Set a variable
  env compare <id>                         Compare .env vs .env.example
  secrets [<id>]                           Scan for hardcoded secrets
  secrets audit                            Audit all projects for leaked keys
  config [set <key> <json-value>]         View/update config
  open <id> [--cursor]                    Open project in editor
  integrations                            Check CLI integration status
  health                                  Server health check

Environment:
  DEVDOCK_URL   Override server URL (default: http://localhost:3070)
`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
