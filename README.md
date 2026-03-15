# DevDock

A local-first command center for developers who juggle multiple projects. Monitor ports, manage dev servers, track dependencies, and deploy — all from one dashboard.

<!-- screenshot placeholder: replace with actual screenshot -->
<!-- ![DevDock Screenshot](screenshot.png) -->

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)
[![Platform: macOS](https://img.shields.io/badge/platform-macOS-purple.svg)](#prerequisites)
[![Runtime: Bun](https://img.shields.io/badge/runtime-Bun-orange.svg)](https://bun.sh)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-green.svg)](#contributing)

DevDock auto-discovers your projects, watches their ports, tracks Git status, connects to GitHub, and gives you one-click access to editors, terminals, deploy pipelines, and more. It runs entirely on your machine — no accounts, no cloud, no telemetry.

## Features

**Project Discovery** — Point DevDock at your project directories. It scans for `package.json`, `tsconfig`, `manifest.xml`, and more to auto-detect project type, tech stack, dev commands, and ports.

**Port Monitor** — See every listening TCP port on your machine, mapped to the project that owns it. Spot conflicts instantly. Kill rogue processes with one click.

**Cross-Project Search** — Search file contents across all projects simultaneously. Filter by file type. Jump straight from result to your editor at the exact line.

**Dependency Graph** — Visualize how your projects connect through shared libraries and common dependencies. Track sync status for monorepo-style shared code.

**Deploy Integration** — Trigger deployments to Vercel, Cloudflare, Netlify, Railway, or Fly.io. View deployment history, status, and preview URLs without leaving DevDock.

**Docker Dashboard** — List containers, check state, view logs, start and stop services. Compose project detection maps containers back to your projects.

**Git Operations** — Stage, commit, push, pull, and view diffs per project. See branch info, dirty status, and full commit history with inline stats.

**Localhost Preview** — Embedded browser preview with split terminal view. Start dev servers, watch logs, and preview your app side-by-side in one panel.

Plus: GitHub PR & Actions tracking, secrets scanning, `.env` management, outdated dependency audits, project notes, batch operations, drag-to-reorder, keyboard-driven navigation, and a full CLI.

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.0 or later
- macOS (uses `lsof` and `osascript` for system integration)

### Install & Run

```bash
# Clone the repo
git clone https://github.com/beeboopbeeboop/DevDock.git
cd DevDock

# Install dependencies
bun install

# Start the dev server (client + API)
bun run dev

# Open in your browser
open http://localhost:5173
```

### Production Build

```bash
bun run build    # Build frontend
bun run start    # Start production server on :3070
```

### First-Time Setup

On first launch, DevDock creates a config file at `~/.config/devdock/config.json`. Add your project directories:

```json
{
  "scanPaths": [
    "~/Documents",
    "~/Code",
    "~/Projects"
  ],
  "port": 3070
}
```

Then hit **Rescan** in the sidebar (or run `devdock scan`) to discover projects.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌──────────────────┐
│  Frontend   │ ──▶ │    API      │ ──▶ │  Database   │ ──▶ │     System       │
│ React 19    │     │ Hono on Bun │     │   SQLite    │     │ Git · Docker ·   │
│ + Vite 8    │     │             │     │             │     │ lsof             │
└─────────────┘     └─────────────┘     └─────────────┘     └──────────────────┘
```

- **Frontend:** React 19 with TanStack Query for data fetching, Tailwind CSS v4 for styling, TypeScript in strict mode
- **Backend:** Hono HTTP framework running on Bun with SQLite for project metadata and user preferences
- **System layer:** Spawns Git, Docker, lsof, and deploy CLIs as child processes. Terminal output streamed via SSE
- **No external services:** Everything runs locally. No database servers, no cloud accounts, no API keys required

## CLI

DevDock includes a full command-line interface for scripting and terminal workflows.

```bash
# List all projects
devdock projects

# Filter by type or status
devdock projects --type vite-react --status active

# Show only dirty repos
devdock projects --dirty

# Port management
devdock ports                 # List all listening ports
devdock ports kill 3000       # Kill process on port 3000

# Git operations
devdock git status my-app
devdock git commit my-app -m "fix: resolve auth bug"
devdock git push my-app

# Dev server
devdock dev start my-app      # Launch dev command
devdock dev logs my-app       # Stream terminal output

# Deploy
devdock deploy trigger my-app --prod

# Environment management
devdock env list my-app       # List .env files
devdock env compare my-app    # Diff .env vs .env.example

# Security
devdock secrets audit         # Scan all projects for hardcoded secrets

# Health check
devdock health
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Command palette — search projects, run actions |
| `Cmd+1`–`5` | Switch views: Projects, Ports, Docker, Graph, Search |
| `Cmd+B` | Toggle batch selection mode |
| `↑` `↓` | Navigate project list |
| `Enter` | Open selected project |
| `E` | Open in editor (VS Code) |
| `T` | Open terminal at project |
| `F` | Reveal in Finder |
| `/` | Focus search |
| `Esc` | Close panel / clear selection |

## Project Detail Panel

Click any project to open a slide-out panel with nine tabs:

- **Overview** — Tech stack badges, status, quick-launch buttons for VS Code, terminal, Finder, and dev server
- **Files** — Full directory tree with file type breakdown and size stats
- **Git** — Staging area, commit with message, push/pull, branch switching, commit history with insertion/deletion counts
- **GitHub** — Recent commits, open PRs, Actions workflow runs with pass/fail status, issue tracking
- **Deploy** — Trigger preview or production deploys, view deployment history with URLs and timestamps
- **Deps** — Outdated package audit showing current vs. latest version, severity breakdown (major/minor/patch)
- **Docker** — Project-specific containers, compose services, start/stop controls
- **Localhost** — Embedded preview iframe with split terminal, start/stop dev server, edit port
- **Notes** — Free-form per-project notes with auto-save

## Security

- **Runs locally only** — The server binds to `localhost`. Nothing is exposed to the network
- **No telemetry** — No data leaves your machine. No analytics, no tracking, no phone-home
- **Path validation** — All file operations resolve symlinks and reject path traversal attempts
- **Secrets scanner** — Built-in detection for 20+ patterns: AWS keys, Stripe tokens, database URLs, private keys, and more
- **`.env` masking** — Environment variable values are masked by default. Explicit `--reveal` flag required to view

## Configuration

```json
// ~/.config/devdock/config.json
{
  "scanPaths": ["~/Documents", "~/Code"],
  "sharedLibraries": [
    {
      "name": "MySharedLib",
      "masterPath": "~/Code/my-shared-lib",
      "subdir": "shared"
    }
  ],
  "projectSignals": ["package.json", "tsconfig.json", "manifest.xml"],
  "ignorePatterns": ["node_modules", ".git", "dist", "build"],
  "port": 3070
}
```

| Key | Description |
|-----|-------------|
| `scanPaths` | Directories to scan for projects (supports `~`) |
| `sharedLibraries` | Monorepo-style shared code to track in the dependency graph |
| `projectSignals` | Files that indicate a directory is a project root |
| `ignorePatterns` | Directory names to skip during scanning |
| `port` | Port for the DevDock API server (default: 3070) |

## Integrations

DevDock detects and uses these tools when available. None are required — features gracefully degrade when a tool is missing.

| Tool | Used For |
|------|----------|
| `gh` | GitHub PRs, Actions, issues, repo metadata |
| `vercel` | Vercel deployments and project linking |
| `wrangler` | Cloudflare Workers / Pages deployments |
| `netlify` | Netlify site deployments |
| `railway` | Railway service deployments |
| `flyctl` | Fly.io application deployments |
| `docker` | Container management and compose orchestration |
| `code` / `cursor` | Open projects in VS Code or Cursor |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun |
| Frontend | React 19, TypeScript 5.9, Vite 8 |
| Styling | Tailwind CSS v4 + custom design tokens |
| Data Fetching | TanStack React Query v5 |
| API Framework | Hono |
| Database | SQLite (via Bun's native driver) |
| Process Management | Bun.spawn with stdout/stderr streaming |

## Contributing

Contributions are welcome. To get started:

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes
4. Push and open a PR

Please keep PRs focused on a single change. If you're adding a new view or major feature, open an issue first to discuss the approach.

## License

[MIT](LICENSE) © Jon Hanlan
