# DevDock

A local dev control plane for macOS. One command vocabulary across every project — type-aware, fuzzy-matched, and audited.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](#license)
[![Platform: macOS](https://img.shields.io/badge/platform-macOS-purple.svg)](#prerequisites)
[![Runtime: Bun](https://img.shields.io/badge/runtime-Bun-orange.svg)](https://bun.sh)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-green.svg)](#contributing)

```bash
reset site           # kills port, clears .next, restarts Next.js
reset proteus        # kills port, clears Vite cache, restarts Vite
start ff             # starts FrameFlow (fuzzy match)
stop all             # stops every running dev server
status               # shows what's running (from any project dir)
```

DevDock auto-discovers your projects, understands their types, and does the right thing. No prefixes, no `npm run dev`, no `cd` into folders, no remembering ports or cache directories. It runs entirely on your machine — no accounts, no cloud, no telemetry.

---

## Quick Start

**Prerequisites:** [Bun](https://bun.sh) v1.0+, macOS

```bash
git clone https://github.com/beeboopbeeboop/DevDock.git
cd DevDock
bun install
bun run setup
```

Setup handles everything: CLI install, background server, shell integration, project scan, alias migration, and menu bar app. Open a new terminal tab and start using it.

---

## Three Ways to Use It

### 1. Terminal Verbs

Plain words, no prefix needed:

| Verb | What it does |
|------|-------------|
| `reset <project>` | Kill port, clear cache, restart (adapts to project type) |
| `start <project>` | Start dev server |
| `stop <project\|all>` | Stop dev server(s) |
| `status [project]` | What's running (CWD-aware) |
| `logs <project>` | Dev server output |
| `pull / push <project>` | Git operations |
| `commit <project> -m "msg"` | Git add + commit |
| `deploy <project>` | Trigger deployment |

Every verb supports **fuzzy matching** (`site` matches `website-2026-react`), **aliases** (`aka site website-2026-react`), **order-agnostic input** (`site reset` and `reset site` both work), and **typo correction** (`resst` → "Did you mean: reset?").

If you're inside a project folder, just type the verb — no target needed.

### 2. Global Command Palette

Press **Ctrl+Shift+D** from any app. A floating Raycast-style palette appears:

- **Search projects** by name, type, tech stack, port, path, or git branch
- **Drill into actions** — select a project to see: Open in VS Code, Cursor, Terminal, Finder, start/stop dev server, git pull, copy path
- **Run verbs** — type `reset site` directly
- **Shell commands** — prefix with `>` to run anything (e.g., `> git status`, `> ls ~/Documents`)
- **Recent commands** — your last 8 actions shown at the top
- **Confidence scoring** — results ranked by match quality. Low-confidence matches are dimmed. Destructive verbs on uncertain matches ask for confirmation first.
- **Escape** goes back from drill-in, closes from top level
- **Tab** autocompletes in verb mode

The hotkey is configurable in `~/.devdock/config.json`.

### 3. Web Dashboard

A full UI at `localhost:3070`:

- **Project Grid** — type badges, git status, port indicators, one-click actions
- **Localhost Preview** — embedded browser preview with split terminal view
- **Git Operations** — stage, commit, push, pull, branch switch per project
- **Port Monitor** — every TCP port mapped to its project, kill rogue processes
- **Cross-Project Search** — search file contents across all projects
- **Dependency Graph** — visualize shared library connections
- **Docker Dashboard** — container management with compose detection
- **GitHub Integration** — PRs, Actions, issues
- **Secrets Scanner** — detect hardcoded API keys and tokens
- **Environment Manager** — compare `.env` files, audit for missing vars
- **Insights** — project activity analytics over time
- **Cmd+K palette** — same search/verb capabilities as the global palette

---

## Native Desktop App

DevDock ships as an **8MB native macOS app** built with Tauri v2. No Electron, no 300MB runtime.

- Dashboard runs in a native window — no browser tab needed
- Close the window and it stays in the system tray
- Auto-launches on login
- Automatically starts and manages the backend server
- Native Edit menu so Cmd+C/V work in all text fields

### Menu Bar

The menu bar icon gives you quick access without opening anything:

- Running dev servers with status
- Stop/start servers and profiles
- Open the command palette or dashboard
- Settings (opens config.json)
- Crash notifications via macOS notification center

### Deep Links

Trigger actions from Finder, Alfred, scripts, or other apps:

```bash
open devdock://palette              # Open command palette
open devdock://reset/site           # Execute a verb
open devdock://open/proteus         # Open project in VS Code
```

---

## How It Knows What to Do

DevDock scans your project directories and detects each project's type from its files (package.json, next.config, vite.config, Package.swift, CSXS/, etc.). Each type has a tailored reset recipe:

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

Package manager is auto-detected from lock files (bun.lock → `bun run dev`, yarn.lock → `yarn run dev`, etc.).

---

## Process Management

- **Crash detection** — monitors managed processes for unexpected exits
- **Auto-restart** — optional per-project, exponential backoff (1s → 2s → 4s → 30s max), max 3 restarts in 5 minutes
- **Custom dev commands** — override auto-detected start commands per project
- **Startup profiles** — group projects to launch/stop together

```bash
dd profile create "morning" --projects site,proteus,jig
dd profile start morning     # Launches all three
dd profile stop morning      # Stops all three
```

---

## Configuration

```json
{
  "scanPaths": ["~/Documents", "~/Code"],
  "port": 3070,
  "hotkey": {
    "key": "D",
    "modifiers": ["ctrl", "shift"]
  }
}
```

Stored at `~/.devdock/config.json`. Change the hotkey to any key + modifier combo (`ctrl`, `shift`, `cmd`, `alt`). Relaunch the menu bar app to apply.

---

## Aliases & Audit Log

```bash
aka site website-2026-react    # Set alias
aka --list                     # See all
aka --remove site              # Remove

dd log                         # Recent commands
dd log --verb reset            # Filter by verb
dd log --limit 50              # More history
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+D` | Global command palette (from any app) |
| `Cmd+K` | Dashboard command palette |
| `Cmd+1`-`5` | Switch dashboard views |
| `Cmd+B` | Batch selection mode |
| `E` / `T` / `F` | Open in editor / terminal / Finder |
| `>` prefix | Shell command mode in palette |
| `Tab` | Autocomplete in verb mode |
| `Esc` | Back (drill-in) or close (top level) |

---

## CLI Reference

```bash
# Daily use (no prefix, via shell integration)
reset <project>                          # Type-aware reset
start <project>                          # Start dev server
stop <project|all>                       # Stop dev server(s)
status [project]                         # Server status
logs <project>                           # Dev server output
pull / push <project>                    # Git operations
commit <project> -m "msg"               # Git add + commit

# Management (dd or devdock prefix)
devdock scan                             # Rescan directories
devdock projects [--type X] [--dirty]    # List projects
devdock ports [kill <port>]              # Port management
devdock deploy trigger|status <id>       # Deployments
devdock config [set <key> <value>]       # Configuration
devdock open <id> [--cursor]             # Open in editor
devdock health                           # Server health
```

---

## Architecture

```
┌──────────────────────────────────────────┐
│           Tauri Native App (Rust)         │
│  System Tray  |  Dashboard Window        │
│               |  (WebView → React 19)    │
└──────────────────────┬───────────────────┘
                       │
┌──────────────────────┼───────────────────┐
│      Swift Menu Bar App                  │
│  Global Hotkey (CGEventTap)              │
│  Floating Command Palette (NSPanel)      │
└──────────────────────┼───────────────────┘
                       │
   Terminal CLI ───────┼─────── Deep Links
   (Bun + zsh)         │        (devdock://)
                       │
             ┌─────────┴─────────┐
             │   Hono on Bun     │
             │   API Server      │
             ├───────────────────┤
             │  Verb Engine      │
             │  Process Manager  │
             │  Project Scanner  │
             │  Shell Executor   │
             ├───────────────────┤
             │     SQLite        │
             └───────────────────┘
```

Four interfaces (Tauri window, command palette, CLI, deep links) all hit the same Hono API. The server runs as a background LaunchAgent. Everything stays on your machine.

---

## Security

- **Localhost only** — server never exposed to the network
- **No telemetry** — nothing leaves your machine
- **Command validation** — dev commands checked against safe prefix list
- **Path traversal protection** — all file operations reject `../` attempts
- **Secrets scanning** — 20+ patterns for API keys, tokens, private keys
- **`.env` masking** — values hidden by default

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun |
| Native App | Tauri v2 (Rust, 8MB) |
| Frontend | React 19, TypeScript, Vite 8, Tailwind v4, TanStack Query |
| Backend | Hono, SQLite (Bun native) |
| Command Palette | Swift, SwiftUI, NSPanel |
| Menu Bar | Swift, SwiftUI, CGEventTap |
| Process Mgmt | Bun.spawn, SSE streaming, crash recovery |

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes
4. Push and open a PR

For major features, open an issue first.

## License

[MIT](LICENSE)
