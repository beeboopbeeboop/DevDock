# DevDock

A local dev control plane for developers who juggle multiple projects. One command vocabulary across every project — type-aware, fuzzy-matched, and audited.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)
[![Platform: macOS](https://img.shields.io/badge/platform-macOS-purple.svg)](#prerequisites)
[![Runtime: Bun](https://img.shields.io/badge/runtime-Bun-orange.svg)](https://bun.sh)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-green.svg)](#contributing)

DevDock auto-discovers your projects, understands their types, and gives you a universal command vocabulary that adapts per project. No prefixes, no flags, no configuration. Just plain words.

```bash
reset site           # kills port, clears .next, restarts Next.js
reset proteus        # kills port, clears Vite cache, restarts Vite
start ff             # starts FrameFlow (fuzzy match)
stop all             # stops every running dev server
status               # shows what's running (from any project dir)
```

No `dd` prefix required. No `npm run dev`. No `cd` into project folders. No remembering ports or cache directories. DevDock knows your projects and does the right thing.

It runs entirely on your machine — no accounts, no cloud, no telemetry.

## Why

```bash
# Before: 8 shell functions, all slightly different, all manually maintained
reset-site-jh()   { cd ~/Documents/website-2026-react; kill port 3100; rm -rf .next; npm run dev; }
reset-proteus()   { cd ~/Documents/Proteus; kill port 4707; rm -rf node_modules/.vite dist; npm run dev; }
reset-devdock()   { cd ~/Documents/DevDock; kill port 3070; rm -rf node_modules/.vite; bun run build && bun run start; }
# ...repeat for every new project

# After: one word, every project, forever
reset site
reset proteus
reset devdock
```

## How It Works

- **No prefix needed.** Bare verbs in your terminal: `reset`, `start`, `stop`, `status`, `logs`, `pull`, `push`, `commit`, `deploy`. No `dd` or `devdock` required for daily use.
- **Fuzzy matching.** Don't type the full name. `site` matches `website-2026-react`. `p` matches `proteus`. `ff` matches `frameflow`.
- **Aliases.** Set shortcuts once: `aka site website-2026-react`. Now `reset site` works forever.
- **Type-aware.** `reset` clears `.next` for Next.js, `node_modules/.vite` for Vite, `.build` for Swift, `.wrangler` for Cloudflare Workers. You never think about it.
- **Order doesn't matter.** `reset site` and `site reset` both work. Type it however your brain says it.
- **Typo correction.** `resst site` → "Did you mean: **reset** site?" Auto-corrects on Enter.
- **CWD-aware.** If you're inside a project folder, just type `status` — no target needed.
- **Works everywhere.** Same verbs work in terminal, in the dashboard's Cmd+K palette, and via API.
- **Always on.** Runs as a background service. Open a terminal, it's there. No startup command.

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) v1.0 or later
- macOS (uses `lsof` and `osascript` for system integration)

### Install

```bash
git clone https://github.com/beeboopbeeboop/DevDock.git
cd DevDock
bun install
bun run setup
```

That's it. `bun run setup` handles everything:

- Installs the `devdock` CLI globally
- Starts the background server (auto-starts on login)
- Adds shell integration to your `.zshrc`
- Scans your project directories
- Migrates any existing `reset-*` shell functions into aliases
- Builds the menu bar app

Open a new terminal tab and start using it immediately.

### Configuration

DevDock creates a config at `~/.devdock/config.json`. Add your project directories:

```json
{
  "scanPaths": ["~/Documents", "~/Code", "~/Projects"],
  "port": 3070
}
```

Hit **Rescan** in the sidebar or run `devdock scan` to discover projects.

## Verbs

| Verb | What it does |
|------|-------------|
| `reset <project>` | Kill port, clear cache, restart (adapts to project type) |
| `start <project>` | Start dev server |
| `stop <project\|all>` | Stop dev server |
| `status [project]` | What's running (CWD-aware) |
| `logs <project>` | Dev server output |
| `pull <project>` | Git pull |
| `push <project>` | Git push |
| `commit <project> -m "msg"` | Git add + commit |
| `deploy <project>` | Trigger deployment |

All verbs work without any prefix. Fuzzy matching means you never type full project names.

### Aliases

Set them once, use them forever:

```bash
aka site website-2026-react
aka cor comp-o-rama
aka p proteus
aka --list               # see all aliases
aka --remove site        # remove one
```

`dd` is only needed for less-common config commands like `dd log` or `dd config`.

### CWD Detection

If you're inside a project directory, skip the target:

```bash
cd ~/Documents/Proteus
status    # shows Proteus status
reset     # resets Proteus
```

### Reset Recipes by Type

| Project Type | Reset Behavior |
|-------------|---------------|
| Next.js | Kill port, clear `.next`, restart |
| Vite + React | Kill port, clear `node_modules/.vite` + `dist`, restart |
| Framer Plugin | Kill port, clear `node_modules/.vite` + `dist`, restart |
| Hono Server | Kill port, clear `node_modules/.vite`, restart |
| Cloudflare Worker | Kill port, clear `.wrangler`, restart |
| Static Site | Kill port, clear `dist` + `.cache`, restart |
| Swift App | Clear `.build`, run `swift build` |
| CEP Plugin | No-op (restart manually in After Effects) |

## Command Audit Log

Every verb execution is logged:

```bash
dd log                    # Recent commands
dd log --verb reset       # Filter by verb
dd log --limit 50         # More history
```

## Features

### Dashboard

A full web UI at `localhost:3070` with:

- **Project Grid** — All your projects with type badges, Git status, port indicators, and one-click actions
- **Port Monitor** — Every listening TCP port mapped to its project. Kill rogue processes instantly
- **Cross-Project Search** — Search file contents across all projects simultaneously
- **Dependency Graph** — Visualize how projects connect through shared libraries
- **Docker Dashboard** — Container management with compose detection
- **Git Operations** — Stage, commit, push, pull, branch switch per project
- **Localhost Preview** — Embedded browser preview with split terminal view
- **GitHub Integration** — PR tracking, Actions workflow status, issue monitoring
- **Secrets Scanner** — Detect hardcoded API keys, tokens, and credentials
- **Environment Manager** — Compare `.env` files across projects, audit for missing vars
- **Insights** — Analytics on project activity over time

### Menu Bar App

A native macOS menu bar companion (Swift):

- Shows running dev servers with status
- Stop/restart servers without opening the dashboard
- Launch startup profiles from the menu bar
- Crash notifications via macOS notification center
- Auto-launches with DevDock

### Startup Profiles

Group projects to launch together:

```bash
dd profile create "morning" --projects site,proteus,jig
dd profile start morning     # Launches all three
dd profile stop morning      # Stops all three
```

Also accessible via Cmd+K in the dashboard.

### Process Management

- **Crash Detection** — DevDock monitors managed processes and detects unexpected exits
- **Auto-Restart** — Optional per-project auto-restart with exponential backoff (1s → 2s → 4s → 30s max)
- **Restart Budget** — Max 3 restarts in 5 minutes before giving up
- **Custom Dev Commands** — Override auto-detected start commands per project

### Command Palette (Cmd+K)

Fuzzy search across projects, actions, git operations, profiles, and navigation. Multi-level drill-in for project-specific actions.

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Command palette |
| `Cmd+1`-`5` | Switch views |
| `Cmd+B` | Batch selection mode |
| `E` / `T` / `F` | Open in editor / terminal / Finder |
| `↑↓` / `Enter` / `Esc` | Navigate / select / close |

## CLI Reference

```bash
# Smart verbs (via shell integration)
reset <project>                          # Type-aware reset
start <project>                          # Start dev server
stop <project|all>                       # Stop dev server(s)
status [project]                         # Server status (CWD-aware)
logs <project>                           # Dev server output
pull/push <project>                      # Git operations
commit <project> -m "msg"               # Git add + commit

# Project management
devdock projects [--type X] [--dirty]    # List projects
devdock scan                             # Rescan directories
dd aka <alias> <project>                 # Set alias
dd aka --list                            # Show aliases
dd log [--verb X] [--limit N]           # Audit log

# Direct commands
devdock dev start|stop|status|logs <id>  # Dev server management
devdock git status|commit|push|pull <id> # Git operations
devdock ports [kill <port>]              # Port management
devdock deploy trigger|status <id>       # Deployments
devdock env [list|read|set|compare] <id> # Environment files
devdock secrets [<id>|audit]             # Security scanning
devdock config [set <key> <value>]       # Configuration
devdock open <id> [--cursor]             # Open in editor
devdock health                           # Server health
```

## Architecture

```
                          ┌─────────────────┐
                          │   Menu Bar App   │ (Swift, polls API)
                          │   macOS native   │
                          └────────┬────────┘
                                   │
┌─────────────┐  ┌─────────────┐  │  ┌─────────────┐
│  Dashboard  │  │    CLI      │  │  │  Verb API   │
│  React 19   │──│  Bun CLI    │──┼──│  /api/verbs │
│  + Vite 8   │  │  + shell    │  │  │  /do        │
└──────┬──────┘  └──────┬──────┘  │  └──────┬──────┘
       │                │         │         │
       └────────────────┴─────────┴─────────┘
                        │
              ┌─────────┴─────────┐
              │    Hono on Bun    │
              │    API Server     │
              ├───────────────────┤
              │  Verb Engine      │ ← Type-aware recipes
              │  Process Manager  │ ← Crash recovery
              │  Project Scanner  │ ← Auto-discovery
              │  Security Layer   │ ← Command validation
              ├───────────────────┤
              │     SQLite        │
              └───────────────────┘
```

## Configuration

```json
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

## Security

- **Runs locally only** — Server binds to `localhost`. Nothing exposed to the network
- **No telemetry** — No data leaves your machine
- **Command allowlist** — Dev commands validated against safe prefix list (npm, bun, node, cargo, swift, etc.)
- **Path validation** — All file operations reject path traversal attempts
- **Secrets scanning** — 20+ patterns for AWS keys, Stripe tokens, database URLs, private keys
- **`.env` masking** — Values masked by default, explicit `--reveal` required

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun |
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS v4, TanStack Query |
| Backend | Hono, SQLite (Bun native driver) |
| Menu Bar | Swift, SwiftUI, MenuBarExtra |
| Process Mgmt | Bun.spawn with SSE streaming, crash recovery |

## Contributing

Contributions welcome. To get started:

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes
4. Push and open a PR

Please keep PRs focused. For new views or major features, open an issue first.

## License

[MIT](LICENSE)
