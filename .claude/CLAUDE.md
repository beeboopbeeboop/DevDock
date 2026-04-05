# DevDock — Internal Architecture for Claude

This is the internal reference for understanding DevDock's codebase. Read this before modifying anything.

## What DevDock Is

A local dev control plane. It auto-discovers projects on the user's machine, understands their types (Next.js, Vite, Swift, CEP plugin, etc.), and provides a universal command vocabulary (`reset`, `start`, `stop`, etc.) that adapts behavior per project type. Three interfaces: bare terminal verbs, web dashboard (Cmd+K), and a macOS menu bar app — all hitting the same API.

## Stack

- **Runtime:** Bun
- **Backend:** Hono HTTP framework, SQLite (bun:sqlite), SSE for streaming
- **Frontend:** React 19, Vite 8, Tailwind v4, TanStack React Query
- **Menu Bar:** Swift/SwiftUI, polls the same API
- **Server runs as LaunchAgent** at `~/Library/LaunchAgents/com.devdock.server.plist`
- **CLI wrapper** at `~/.local/bin/devdock` → `bun run src/cli.ts`
- **Shell integration** via `eval "$(devdock shell-init)"` in `.zshrc`

## Key Files

### Verb System (the core feature)

| File | Purpose |
|------|---------|
| `src/server/verbEngine.ts` | **The brain.** Reset recipes per project type, fuzzy project resolution, CWD detection, verb execution orchestrator, `killPort()` utility, Levenshtein typo correction |
| `src/server/api/verbApi.ts` | API layer. `POST /api/verbs/do` (unified executor), `GET/POST/DELETE /api/verbs/aliases` (aka system), `GET /api/verbs/logs` (audit log) |
| `src/cli.ts` | CLI entry point. `devdock do <verb> [target]`, `devdock aka`, `devdock log`, `devdock shell-init`. Also handles order-agnostic parsing (swaps `site reset` → `do reset site`) and typo routing |

### Process Management

| File | Purpose |
|------|---------|
| `src/server/processManager.ts` | Spawns dev servers via `Bun.spawn()`, manages SSE output streaming, crash detection, auto-restart with exponential backoff (max 3 in 5 min). Sets PATH env so spawned processes can find node/bun/etc even when launched via LaunchAgent |
| `src/server/api/actions.ts` | REST endpoints for start-dev, terminal-stop, terminal-stream (SSE), terminal-status, auto-restart toggle, running-processes list, port operations |

### Database

| File | Purpose |
|------|---------|
| `src/server/db/schema.ts` | SQLite schema + migrations. Tables: `projects`, `user_overrides`, `project_deps`, `snapshots`, `filter_presets`, `startup_profiles`, `command_logs` |
| `src/server/db/queries.ts` | All DB operations. `getProjects()` merges overrides (custom name, status, tags, dev command, aliases). `getProjectAliases()` returns `Map<alias, projectId>`. `logCommand()` writes to audit log |

### Scanner

| File | Purpose |
|------|---------|
| `src/server/scanner/discover.ts` | `runScan()` iterates configured `scanPaths`, finds project directories, calls detectors/enrichers, upserts to DB. Per-project try/catch so one failure doesn't crash the scan |
| `src/server/scanner/detectors.ts` | Detects project type from files (package.json, vite.config, next.config, Package.swift, CSXS/, etc.). Extracts dev command as `<pm> run dev` (detects package manager from lock files). Extracts port from config/scripts |
| `src/server/scanner/enrichers.ts` | Git info (branch, dirty, remote URL), last modified timestamp, shared library detection |

### Frontend

| File | Purpose |
|------|---------|
| `src/client/App.tsx` | Root component, keyboard shortcuts, view state |
| `src/client/components/CommandPalette.tsx` | Cmd+K palette with dual mode: search OR raw verb execution. Detects when input starts with a known verb and executes via API on Enter. Order-agnostic (detects `site reset` too) |
| `src/client/components/LocalhostManager.tsx` | Per-project dev server control: start/stop, port editing, custom dev command override, auto-restart toggle, live terminal + preview |
| `src/client/components/ProjectCard.tsx` | Project grid cards with context menu (15+ actions) |
| `src/client/hooks/useProjects.ts` | React Query hooks for projects, overrides, favorites, presets. `useProjectActions()` provides `startDev()` with projectId tracking |
| `src/client/hooks/useProfiles.ts` | React Query hooks for startup profiles CRUD + start/stop |
| `src/client/hooks/useTerminal.ts` | SSE connection for live terminal output, `useTerminalStatus()` polls process state including autoRestart and restartCount |

### Menu Bar App

| File | Purpose |
|------|---------|
| `menubar/DevDockMenu/DevDockMenuApp.swift` | @main, MenuBarExtra with SwiftUI |
| `menubar/DevDockMenu/AppState.swift` | Polls `/api/health` and `/api/actions/running-processes` every 3s. Detects crashes via disappearing processes, sends macOS notifications. Backoff when offline |
| `menubar/DevDockMenu/DevDockAPIClient.swift` | URLSession HTTP client for all API calls |

### Setup

| File | Purpose |
|------|---------|
| `src/setup.ts` | One-command installer. Creates CLI binary, LaunchAgent, shell integration, initial scan, alias migration from existing .zshrc reset functions, menu bar build |

## How the Verb System Works

1. User types `reset site` in terminal
2. Shell function `reset()` calls `devdock do reset site`
3. CLI sends `POST /api/verbs/do { verb: "reset", target: "site", cwd: "...", source: "cli" }`
4. `verbApi.ts` receives request, calls `resolveProjectFuzzy("site", projects, aliasMap)`
5. Alias map checked first (instant match if `site` is an alias), then exact match, then fuzzy scoring
6. Once project is resolved, `executeVerb("reset", project)` is called
7. Verb engine looks up `RESET_RECIPES[project.type]` — e.g., for Next.js: `[kill-port, rm-dirs(.next), start-dev]`
8. Each step executes: `killPort(3100)` → `rm -rf .next` → `startProcess("website-2026-react", path, "npm run dev")`
9. Results logged to `command_logs` table
10. Response returned with step-by-step results

### Order-Agnostic Parsing

In `cli.ts`, before the main switch: if `args[0]` is not a known command but `args[1]` IS a known verb, swap them. So `devdock site reset` becomes `devdock do reset site`.

### Typo Correction

In `cli.ts`, if `args[0]` is not a known command and not a known verb, run Levenshtein distance against all verbs. If within 2 edits, route through `do` handler which hits the API. The API returns `{ correction: true, suggested: "reset" }` and the CLI prompts "Did you mean: reset site? [Y/n]".

### Alias Resolution Order

1. Exact alias match (from `user_overrides.aliases` JSON column)
2. Exact project ID or name match (case-insensitive)
3. Fuzzy scoring: startsWith (90) > includes (70) > word boundary (60) > ordered chars (50)
4. If top two scores tied → ambiguous, return candidates list

### Reset Recipes

Hardcoded in `verbEngine.ts` per `ProjectType`:
- `nextjs` → kill port, rm `.next`, start dev
- `vite-react` / `framer-plugin` → kill port, rm `node_modules/.vite` + `dist`, start dev
- `hono-server` → kill port, rm `node_modules/.vite`, start dev
- `cloudflare-worker` → kill port, rm `.wrangler`, start dev
- `swift-app` → rm `.build`, swift build
- `cep-plugin` → noop (restart manually in AE)
- `unknown` → kill port, start dev

### Dev Command Detection

`detectors.ts` reads `package.json` scripts and detects the package manager from lock files:
- `bun.lock` / `bun.lockb` → `bun run dev`
- `pnpm-lock.yaml` → `pnpm run dev`
- `yarn.lock` → `yarn run dev`
- Otherwise → `npm run dev`

Never stores raw script content (like `next dev -p 3100`) because those binaries aren't on PATH outside `node_modules/.bin`.

### Process PATH

`processManager.ts` injects a full PATH into spawned processes: `~/.bun/bin`, `~/.npm-global/bin`, `/opt/homebrew/bin`, `/usr/local/bin`, plus inherited PATH. This is critical because the LaunchAgent environment has a minimal PATH.

## Database Tables

- **projects** — 18+ columns, detected by scanner, PK is slugified dir name
- **user_overrides** — per-project customizations: custom name, status, tags, dev port, dev command, deploy URL, notes, favorites, sort order, **aliases** (JSON string array)
- **project_deps** — dependency graph from package.json
- **startup_profiles** — named groups of project IDs to launch together
- **command_logs** — audit trail: verb, project, source (cli/ui/api), status, duration, timestamp
- **filter_presets** — saved dashboard filter configs
- **snapshots** — time-series analytics data

## API Routes

### Verb System
- `POST /api/verbs/do` — execute any verb (the universal entry point)
- `GET /api/verbs/aliases` — list all aliases
- `POST /api/verbs/aliases` — add alias
- `DELETE /api/verbs/aliases/:alias` — remove alias
- `GET /api/verbs/logs` — query audit log

### Process Management
- `POST /api/actions/start-dev` — start dev server
- `POST /api/actions/terminal-stop/:id` — stop server
- `GET /api/actions/terminal-stream/:id` — SSE output stream
- `GET /api/actions/terminal-status/:id` — process status (running, pid, autoRestart, restartCount)
- `GET /api/actions/running-processes` — all managed processes
- `PATCH /api/actions/auto-restart/:id` — toggle auto-restart

### Profiles
- `GET/POST /api/profiles` — CRUD
- `POST /api/profiles/:id/start` — launch profile
- `POST /api/profiles/:id/stop` — stop profile

### Projects
- `GET /api/projects` — list with filters (search, type, status, tag, sort)
- `PATCH /api/projects/:id/override` — update custom name, status, tags, dev command, etc.

## Important Gotchas

1. **Never store raw script content as devCommand.** Always use `<pm> run dev`. Raw commands like `next dev` fail because the binary is in `node_modules/.bin`, not on PATH.
2. **LaunchAgent has minimal PATH.** processManager must inject full PATH into spawn env.
3. **`lsof` exits 1 when no matches.** Treat this as success (port is clear), not failure.
4. **Scanner must not crash on individual projects.** Each project is wrapped in try/catch.
5. **Alias `dd` conflicts with the shell alias.** Don't allow it as a project alias.
6. **`open` verb uses `dopen` in shell** to avoid shadowing macOS `/usr/bin/open`.
7. **`reset` shadows zsh built-in `reset`** (terminal reset). User accepted this tradeoff.
