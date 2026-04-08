# DevDock — Future Features

## Terminal & Shell Power

Ideas for making the command palette into a true terminal-grade tool.

### Command History
- Recent shell commands appear as suggestions when typing `>` or `$`
- Persistent across sessions
- Search through history with fuzzy matching
- Browser-URL-bar style autocomplete

### Project-Scoped Shell
- When drilling into a project, shell commands auto-`cd` to that project's directory
- `git status` from inside a project context runs there automatically
- Project-aware aliases (e.g. `dev` runs the right command per project type)

### Copy Output to Clipboard
- Single keystroke (Cmd+C while output panel is visible) copies stdout
- Useful for "get my IP", "list running ports", etc.
- Already implemented as a button — add keystroke binding

### Autocomplete from PATH
- Auto-detect every command available in PATH instead of using a hardcoded prefix list
- Run on startup, refresh periodically
- Lets DevDock recognize newly installed CLI tools (`fzf`, `bat`, `eza`, etc.)
- Tab completion for binaries

### Pipe & Chain Commands
- Run multiple commands in sequence with output passing between them
- `ls | grep foo` style support (already works via shell, but could be richer)
- Save chains as named commands

### Inline Editing
- Click on the output panel to re-edit and re-run the last command
- Modify and re-execute without retyping

### Output Filters
- Search/filter within long command output
- Highlight matches
- Copy filtered subset

### Notifications for Long-Running Commands
- If a command takes > 5 seconds, show notification when done
- Doesn't block the palette

### Sudo Handling
- Detect when `sudo` is needed
- Prompt for password securely (not in plain text in palette)
- Cache for short window like terminal

### Custom Command Variables
- Support `{project}`, `{cwd}`, `{clipboard}` placeholders in custom commands
- Example: `"git push origin {branch}"` where `{branch}` is auto-resolved

### Command Groups / Categories
- Organize custom commands into groups in the editor UI
- Show as collapsible sections in the palette

### Run as Background Job
- Option to fire-and-forget without waiting for output
- Useful for "open Spotify", "start dev server", etc.
