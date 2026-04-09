import SwiftUI
import AppKit

// MARK: - Palette State

@MainActor
@Observable
class PaletteState {
    var query = ""
    var selectedIndex = 0
    var projects: [DevDockProject] = []
    var runningProcesses: [RunningProcess] = []
    var isLoading = false
    var verbResult: String?
    var verbOk: Bool = true
    var lastExecutedCommand: String?
    var arrowNavCounter = 0
    // isVisible removed — window-level animation now owns show/hide visuals.
    var dataReady = false

    // Drill-in state
    var drillProject: DevDockProject? = nil

    // Confirmation state for destructive actions on low-confidence matches
    var pendingConfirmation: PaletteItem? = nil

    // Recents
    var recents: [RecentEntry] = []

    // Active projects (context engine)
    var activeProjects: [(projectId: String, projectName: String, score: Double)] = []

    static let knownVerbs = ["reset", "start", "stop", "status", "logs", "pull", "push", "commit", "deploy"]

    /// User-defined shell shortcuts loaded from ~/.devdock/config.json
    var customCommands: [CustomCommand] { CustomCommandStore.shared.commands }

    var isVerbMode: Bool {
        drillProject == nil && Self.knownVerbs.contains(query.trimmingCharacters(in: .whitespaces).split(separator: " ").first.map(String.init)?.lowercased() ?? "")
    }

    /// Shell command prefixes — common CLI tools and builtins
    private static let shellPrefixes: Set<String> = [
        "cd", "ls", "pwd", "mkdir", "rm", "rmdir", "cp", "mv", "cat", "echo", "touch",
        "chmod", "chown", "ln", "find", "grep", "sed", "awk", "sort", "head", "tail",
        "which", "env", "export", "source", "curl", "wget",
        "git", "gh", "npm", "npx", "bun", "bunx", "node", "deno", "pnpm", "yarn",
        "python", "python3", "pip", "pip3", "ruby", "cargo", "rustc", "go",
        "swift", "swiftc", "xcodebuild", "xcrun",
        "brew", "apt", "sudo", "open", "killall", "kill", "lsof", "ps",
        "docker", "make", "cmake", "ssh", "scp", "rsync",
        "tar", "zip", "unzip", "gzip",
        "rtk", "devdock"
    ]

    /// Detect shell mode: explicit prefix (> or $), known command, or shell operators
    var isShellMode: Bool {
        let q = query.trimmingCharacters(in: .whitespaces)
        if q.isEmpty { return false }
        if q.hasPrefix(">") || q.hasPrefix("$") { return true }
        if q.hasPrefix("/") || q.hasPrefix("~/") || q.hasPrefix("./") { return true }
        if q.contains("&&") || q.contains("||") || q.contains(" | ") { return true }
        let firstWord = q.split(separator: " ", maxSplits: 1).first.map(String.init)?.lowercased() ?? ""
        return Self.shellPrefixes.contains(firstWord)
    }

    var shellCommand: String? {
        guard isShellMode else { return nil }
        let q = query.trimmingCharacters(in: .whitespaces)
        if q.hasPrefix(">") || q.hasPrefix("$") {
            return String(q.dropFirst()).trimmingCharacters(in: .whitespaces)
        }
        return q
    }

    var isDrillMode: Bool { drillProject != nil }

    // MARK: - Sections

    struct Section {
        let title: String
        let items: [PaletteItem]
    }

    var sections: [Section] {
        if !dataReady { return [] }

        if let project = drillProject {
            let q = query.lowercased().trimmingCharacters(in: .whitespaces)
            let actions = ProjectAction.actionsFor(project)
            let filtered = q.isEmpty ? actions : actions.filter { fuzzyScore($0.label, q) > 0 }
            let items = filtered.map { action in
                PaletteItem(
                    id: "action-\(action.id)",
                    label: action.label,
                    description: project.name,
                    icon: action.icon,
                    kind: .projectAction(project, action)
                )
            }
            return [Section(title: project.name.uppercased(), items: items)]
        }

        let q = query.lowercased().trimmingCharacters(in: .whitespaces)

        if q.isEmpty {
            var sections: [Section] = []

            if !activeProjects.isEmpty {
                let items = activeProjects.prefix(3).compactMap { active -> PaletteItem? in
                    guard let project = projects.first(where: { $0.id == active.projectId }) else { return nil }
                    return PaletteItem(id: "active-\(project.id)", label: project.name, description: "Active today", icon: "flame", kind: .project(project))
                }
                if !items.isEmpty { sections.append(Section(title: "ACTIVE", items: items)) }
            }

            if !recents.isEmpty {
                let items = recents.compactMap { entry -> PaletteItem? in
                    PaletteItem(id: "recent-\(entry.id)", label: entry.label, description: entry.projectId, icon: "clock", kind: .action(entry.label, entry.projectId, {}))
                }
                sections.append(Section(title: "RECENT", items: items))
            }

            let running = runningProcesses.compactMap { proc -> PaletteItem? in
                guard let project = projects.first(where: { $0.id == proc.projectId }) else { return nil }
                return PaletteItem(id: "running-\(proc.projectId)", label: project.name, description: "Running on :\(project.devPort ?? 0)", icon: "bolt.fill", kind: .project(project))
            }
            if !running.isEmpty { sections.append(Section(title: "RUNNING", items: running)) }

            let verbs = Self.knownVerbs.map { verb in
                PaletteItem(id: "verb-\(verb)", label: verb, description: "Type '\(verb) <project>' to execute", icon: iconForVerb(verb), kind: .verb(verb, ""))
            }
            sections.append(Section(title: "VERBS", items: verbs))

            let customItems = customCommands.map { cmd in
                PaletteItem(id: "custom-\(cmd.name)", label: cmd.name, description: cmd.command, icon: cmd.icon, kind: .action(cmd.command, "shell", {}))
            }
            if !customItems.isEmpty {
                sections.append(Section(title: "COMMANDS", items: customItems))
            }

            let favs = projects.filter(\.isFavorite).compactMap { project -> PaletteItem? in
                guard !running.contains(where: { $0.id == "running-\(project.id)" }) else { return nil }
                return PaletteItem(id: "fav-\(project.id)", label: project.name, description: "\(project.type) \(project.status)", icon: "star.fill", kind: .project(project))
            }
            if !favs.isEmpty { sections.append(Section(title: "FAVORITES", items: favs)) }

            let runningIds = Set(running.map { $0.id.replacingOccurrences(of: "running-", with: "") })
            let favIds = Set(favs.map { $0.id.replacingOccurrences(of: "fav-", with: "") })
            let rest = projects.compactMap { project -> PaletteItem? in
                guard !runningIds.contains(project.id) && !favIds.contains(project.id) else { return nil }
                return PaletteItem(id: "proj-\(project.id)", label: project.name, description: "\(project.type) \(project.status)", icon: ProjectType.icon(for: project.type), kind: .project(project))
            }
            if !rest.isEmpty { sections.append(Section(title: "PROJECTS", items: rest)) }

            return sections
        }

        if isShellMode {
            if let cmd = shellCommand, !cmd.isEmpty {
                let item = PaletteItem(id: "shell-exec", label: cmd, description: "Run in shell", icon: "terminal", kind: .action(cmd, "shell", {}))
                return [Section(title: "SHELL", items: [item])]
            }
            return []
        }

        if isVerbMode {
            let parts = q.split(separator: " ", maxSplits: 1)
            let verb = String(parts.first ?? "")
            let target = parts.count > 1 ? String(parts[1]) : ""
            let scored = target.isEmpty
                ? projects.map { ScoredProject(project: $0, score: 100) }
                : scoredProjects(target)
            let items = scored.map { sp in
                var item = PaletteItem(id: "target-\(sp.project.id)", label: "\(verb) \(sp.project.name)", description: sp.project.type, icon: iconForVerb(verb), kind: .verb(verb, sp.project.id))
                item.confidence = sp.confidence
                return item
            }
            return [Section(title: "TARGETS", items: items)]
        }

        var sections: [Section] = []

        // Custom commands matching search
        let matchingCustom = customCommands.filter { fuzzyScore($0.name, q) > 0 }.map { cmd in
            PaletteItem(id: "custom-\(cmd.name)", label: cmd.name, description: cmd.command, icon: cmd.icon, kind: .action(cmd.command, "shell", {}))
        }
        if !matchingCustom.isEmpty { sections.append(Section(title: "COMMANDS", items: matchingCustom)) }

        let scored = scoredProjects(q)
        let items = scored.map { sp in
            var item = PaletteItem(id: "search-\(sp.project.id)", label: sp.project.name,
                description: "\(sp.project.type) \(sp.project.status)\(sp.project.gitDirty ? " (dirty)" : "")",
                icon: ProjectType.icon(for: sp.project.type), kind: .project(sp.project))
            item.confidence = sp.confidence
            return item
        }
        if !items.isEmpty { sections.append(Section(title: "RESULTS", items: items)) }

        return sections
    }

    var filteredItems: [PaletteItem] { sections.flatMap(\.items) }
    var resultCount: Int { filteredItems.count }

    // MARK: - Fuzzy Scored Projects

    struct ScoredProject {
        let project: DevDockProject
        let score: Int
        var confidence: Confidence {
            if score >= 50 { return .high }
            if score >= 25 { return .medium }
            return .low
        }
    }

    private func scoredProjects(_ query: String) -> [ScoredProject] {
        let runningIds = Set(runningProcesses.map(\.projectId))
        return projects
            .map { project -> ScoredProject in
                let nameScore = fuzzyScore(project.name, query)
                let aliasScore = project.aliases.map { fuzzyScore($0, query) }.max() ?? 0
                let typeScore = fuzzyScore(project.type, query)
                let pathScore = project.path.split(separator: "/").map { fuzzyScore(String($0), query) }.max() ?? 0
                let portScore = project.devPort.map { fuzzyScore(String($0), query) } ?? 0
                let branchScore = project.gitBranch.map { fuzzyScore($0, query) } ?? 0
                var score = max(nameScore, aliasScore, typeScore, pathScore, portScore, branchScore)
                if project.isFavorite { score += 5 }
                if runningIds.contains(project.id) { score += 5 }
                return ScoredProject(project: project, score: score)
            }
            .filter { $0.score > 0 }
            .sorted { $0.score > $1.score }
            .prefix(20)
            .map { $0 }
    }

    static let destructiveVerbs: Set<String> = ["reset", "stop", "deploy"]

    // MARK: - Actions

    func reset() {
        query = ""
        selectedIndex = 0
        verbResult = nil
        isLoading = false
        drillProject = nil
        pendingConfirmation = nil
        dataReady = false
        recents = RecentsStore.load()
        loadData()
    }

    func loadData() {
        Task {
            async let p = APIClient.shared.fetchProjects()
            async let r = APIClient.shared.fetchRunningProcesses()
            async let a = APIClient.shared.fetchActiveProjects()
            projects = await p
            runningProcesses = await r
            activeProjects = await a
            dataReady = true
        }
    }

    func executeSelected(item: PaletteItem) {
        switch item.kind {
        case .project(let project):
            drillProject = project
            query = ""
            selectedIndex = 0

        case .verb(let verb, let target):
            guard !target.isEmpty else { return }
            if Self.destructiveVerbs.contains(verb) && item.confidence != .high && pendingConfirmation == nil {
                pendingConfirmation = item
                return
            }
            pendingConfirmation = nil
            let projectName = projects.first(where: { $0.id == target })?.name ?? target
            isLoading = true
            verbResult = nil
            Task {
                let response = await APIClient.shared.executeVerb(verb: verb, target: projectName)
                isLoading = false
                if let r = response {
                    verbOk = r.ok ?? (r.error == nil)
                    verbResult = r.message ?? r.error ?? (r.ok == true ? "Done" : "Failed")
                } else {
                    verbOk = false
                    verbResult = "No response from server"
                }
            }
            RecentsStore.save(RecentEntry(id: "\(verb)-\(target)", label: "\(verb) \(projectName)", projectId: target, timestamp: Date().timeIntervalSince1970))

        case .projectAction(let project, let action):
            executeProjectAction(project: project, action: action)

        case .action(let label, let desc, _):
            if desc == "shell" {
                isLoading = true
                verbResult = nil
                lastExecutedCommand = label
                Task {
                    let result = await APIClient.shared.execCommand(command: label)
                    isLoading = false
                    verbOk = result.ok
                    verbResult = result.output.isEmpty ? (result.ok ? "Done" : "Failed") : result.output
                }
                RecentsStore.save(RecentEntry(id: "shell-\(label.prefix(30))", label: "> \(label)", projectId: "shell", timestamp: Date().timeIntervalSince1970))
            }
        }
    }

    private func executeProjectAction(project: DevDockProject, action: ProjectAction) {
        let recentLabel = "\(action.label) \u{2014} \(project.name)"
        RecentsStore.save(RecentEntry(id: "\(action.id)-\(project.id)", label: recentLabel, projectId: project.id, timestamp: Date().timeIntervalSince1970))

        // Immediate optimistic feedback — shown before the async task resolves
        // so the user always sees *something* happen on click. Replaced with
        // the real result once the API call completes.
        lastExecutedCommand = action.label
        verbOk = true
        switch action.id {
        case "start-dev": verbResult = "Starting \(project.name)…"
        case "stop-dev":  verbResult = "Stopping \(project.name)…"
        case "git-pull":  verbResult = "Pulling \(project.name)…"
        case "copy-path": verbResult = "Copying path…"
        default:          verbResult = "\(action.label)…"
        }

        Task {
            switch action.id {
            case "vscode":
                await APIClient.shared.openEditor(projectId: project.id, editor: "code")
            case "cursor":
                await APIClient.shared.openEditor(projectId: project.id, editor: "cursor")
            case "terminal":
                await APIClient.shared.openTerminal(projectId: project.id)
            case "finder":
                await APIClient.shared.openFinder(projectId: project.id)
            case "localhost":
                if let port = project.devPort, let url = URL(string: "http://localhost:\(port)") {
                    NSWorkspace.shared.open(url)
                }
            case "start-dev":
                let ok = await APIClient.shared.startDev(projectId: project.id)
                verbOk = ok
                verbResult = ok ? "Started \(project.name)" : "Failed to start \(project.name)"
            case "stop-dev":
                let ok = await APIClient.shared.stopDev(projectId: project.id)
                verbOk = ok
                verbResult = ok ? "Stopped \(project.name)" : "Failed to stop \(project.name)"
            case "git-pull":
                await APIClient.shared.gitPull(path: project.path)
                verbOk = true
                verbResult = "Pulled \(project.name)"
            case "copy-path":
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(project.path, forType: .string)
                verbOk = true
                verbResult = "Copied path"
            default:
                break
            }
        }

        if ["vscode", "cursor", "terminal", "finder", "localhost", "copy-path"].contains(action.id) {
            CommandPaletteWindowController.shared.dismiss()
        }
    }

    func goBack() {
        if drillProject != nil {
            drillProject = nil
            query = ""
            selectedIndex = 0
        }
    }

    func tabAutocomplete() {
        guard isVerbMode else { return }
        let parts = query.trimmingCharacters(in: .whitespaces).split(separator: " ", maxSplits: 1)
        let verb = String(parts.first ?? "")
        let items = filteredItems
        if let first = items.first, case .verb(_, let projectId) = first.kind, !projectId.isEmpty {
            let name = projects.first(where: { $0.id == projectId })?.name ?? projectId
            query = "\(verb) \(name)"
        }
    }

    func moveUp() {
        let count = filteredItems.count
        if count > 0 { selectedIndex = (selectedIndex - 1 + count) % count; arrowNavCounter += 1 }
    }

    func moveDown() {
        let count = filteredItems.count
        if count > 0 { selectedIndex = (selectedIndex + 1) % count; arrowNavCounter += 1 }
    }
}

// MARK: - Fuzzy Scoring

private func fuzzyScore(_ text: String, _ query: String) -> Int {
    let t = text.lowercased()
    let q = query.lowercased()
    if t == q { return 100 }
    if t.hasPrefix(q) { return 50 }
    if t.contains(q) { return 25 }
    var tIndex = t.startIndex
    for char in q {
        guard let found = t[tIndex...].firstIndex(of: char) else { return 0 }
        tIndex = t.index(after: found)
    }
    return 10
}

// MARK: - Helpers

private func iconForVerb(_ verb: String) -> String {
    switch verb {
    case "reset": return "arrow.counterclockwise"
    case "start": return "play.fill"
    case "stop": return "stop.fill"
    case "status": return "info.circle"
    case "logs": return "text.alignleft"
    case "pull": return "arrow.down.circle"
    case "push": return "arrow.up.circle"
    case "commit": return "checkmark.circle"
    case "deploy": return "paperplane.fill"
    default: return "terminal"
    }
}

private func colorForVerb(_ verb: String) -> Color {
    switch verb {
    case "reset": return Color(red: 0.98, green: 0.75, blue: 0.14)
    case "start": return Color(red: 0.34, green: 0.80, blue: 0.47)
    case "stop": return Color(red: 0.97, green: 0.44, blue: 0.44)
    case "deploy": return Color(red: 0.51, green: 0.55, blue: 0.98)
    case "commit": return Color(red: 0.65, green: 0.55, blue: 0.98)
    case "push": return Color(red: 0.38, green: 0.65, blue: 0.98)
    case "pull": return Color(red: 0.38, green: 0.65, blue: 0.98)
    default: return Color(red: 0.42, green: 0.45, blue: 0.50)
    }
}

// MARK: - Command Palette View

struct CommandPaletteView: View {
    @Bindable var state: PaletteState
    let onDismiss: () -> Void

    @FocusState private var isSearchFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            // Search bar
            HStack(spacing: 10) {
                if state.isDrillMode {
                    Button(action: { state.goBack() }) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                } else {
                    Image(systemName: "magnifyingglass")
                        .foregroundStyle(.secondary)
                        .font(.system(size: 16))
                }

                TextField(state.isDrillMode ? "Filter actions..." : "Type a verb or project name...", text: $state.query)
                    .textFieldStyle(.plain)
                    .font(.system(size: 18, weight: .light))
                    .foregroundStyle(.primary)
                    .focused($isSearchFocused)
                    .onSubmit {
                        let items = state.filteredItems
                        if state.selectedIndex < items.count {
                            state.executeSelected(item: items[state.selectedIndex])
                        }
                    }
                    .onChange(of: state.query) { state.selectedIndex = 0 }

                if state.isLoading {
                    ProgressView().scaleEffect(0.6)
                }

                if !state.query.isEmpty {
                    Button(action: { state.query = "" }) {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 14))
                            .foregroundStyle(.tertiary)
                    }
                    .buttonStyle(.plain)
                }

                if state.isVerbMode {
                    Text("VERB")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(.orange)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(.orange.opacity(0.15))
                        .cornerRadius(4)
                }

                if state.isShellMode {
                    Text("SHELL")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(.green)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(.green.opacity(0.15))
                        .cornerRadius(4)
                }

                if state.isDrillMode {
                    Text("ACTIONS")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(.cyan)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(.cyan.opacity(0.15))
                        .cornerRadius(4)
                }

                Button(action: {
                    // Dismiss the palette, open the dashboard window, and
                    // ask it to present the Settings sheet.
                    CommandPaletteWindowController.shared.dismiss()
                    WindowManager.shared.showDashboard()
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                        NotificationCenter.default.post(name: .devdockOpenSettings, object: nil)
                    }
                }) {
                    Image(systemName: "gearshape")
                        .font(.system(size: 13))
                        .foregroundStyle(.tertiary)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)

            Divider()

            // Confirmation banner
            if let pending = state.pendingConfirmation {
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle")
                        .foregroundStyle(.orange)
                    Text("Run \(pending.label)?")
                        .font(.system(size: 12))
                    Spacer()
                    Button("Yes") {
                        state.pendingConfirmation = nil
                        state.executeSelected(item: pending)
                    }
                    .buttonStyle(.plain)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(.orange)
                    Button("No") {
                        state.pendingConfirmation = nil
                    }
                    .buttonStyle(.plain)
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(Color.orange.opacity(0.08))
                Divider()
            }

            // Command output panel
            if let result = state.verbResult {
                CommandOutputPanel(
                    command: state.lastExecutedCommand,
                    output: result,
                    success: state.verbOk,
                    onClose: {
                        state.verbResult = nil
                        state.lastExecutedCommand = nil
                    }
                )
                Divider()
            }

            // Results list
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(spacing: 4) {
                        let allSections = state.sections
                        ForEach(Array(allSections.enumerated()), id: \.element.title) { _, section in
                            HStack {
                                Text(section.title)
                                    .font(.system(size: 9, weight: .semibold, design: .rounded))
                                    .foregroundStyle(.tertiary)
                                    .tracking(0.5)
                                Spacer()
                            }
                            .padding(.horizontal, 20)
                            .padding(.top, 10)
                            .padding(.bottom, 4)

                            ForEach(Array(section.items.enumerated()), id: \.element.id) { _, item in
                                let globalIndex = state.filteredItems.firstIndex(where: { $0.id == item.id }) ?? 0
                                PaletteRow(item: item, isSelected: globalIndex == state.selectedIndex)
                                    .id(item.id)
                                    .onHover { hovering in
                                        if hovering { state.selectedIndex = globalIndex }
                                    }
                                    .onTapGesture {
                                        state.selectedIndex = globalIndex
                                        state.executeSelected(item: item)
                                    }
                            }
                        }

                        if state.filteredItems.isEmpty && !state.query.isEmpty {
                            VStack(spacing: 6) {
                                Image(systemName: "magnifyingglass")
                                    .font(.system(size: 20))
                                    .foregroundStyle(.quaternary)
                                Text("No matches")
                                    .font(.system(size: 13))
                                    .foregroundStyle(.tertiary)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 40)
                        }
                    }
                    .padding(.bottom, 4)
                }
                .onChange(of: state.arrowNavCounter) { _, _ in
                    let items = state.filteredItems
                    if state.selectedIndex < items.count {
                        proxy.scrollTo(items[state.selectedIndex].id, anchor: nil)
                    }
                }
            }

            // Footer
            Divider()
            HStack(spacing: 12) {
                HStack(spacing: 4) { KeyHint("\u{2191}\u{2193}"); Text("navigate") }
                HStack(spacing: 4) { KeyHint("\u{21A9}"); Text("select") }
                if state.isDrillMode {
                    HStack(spacing: 4) { KeyHint("esc"); Text("back") }
                } else {
                    if state.isVerbMode {
                        HStack(spacing: 4) { KeyHint("tab"); Text("complete") }
                    }
                    HStack(spacing: 4) { KeyHint("esc"); Text("close") }
                }
                Spacer()
                Text("\(state.resultCount) item\(state.resultCount == 1 ? "" : "s")")
                    .font(.system(size: 10))
                    .foregroundStyle(.quaternary)
                Text(HotkeyManager.shared.config.displayLabel)
                    .font(.system(size: 9, weight: .medium, design: .monospaced))
                    .foregroundStyle(.quaternary)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 3)
                    .background(
                        RoundedRectangle(cornerRadius: 4)
                            .fill(.white.opacity(0.06))
                    )
            }
            .font(.system(size: 10))
            .foregroundStyle(.quaternary)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(.ultraThinMaterial)
        )
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(.white.opacity(0.1), lineWidth: 0.5)
        )
        .shadow(color: .black.opacity(0.3), radius: 30, y: 10)
        // Show/hide animation is driven by CommandPaletteWindowController at
        // the NSWindow host-layer level. No SwiftUI scaleEffect here — it was
        // forcing a layout pass that collided with the window animation and
        // caused the visible reflow glitch.
        .onAppear {
            isSearchFocused = true
        }
        .onKeyPress(.upArrow) { state.moveUp(); return .handled }
        .onKeyPress(.downArrow) { state.moveDown(); return .handled }
        .onKeyPress(.escape) {
            if state.isDrillMode {
                state.goBack()
            } else {
                onDismiss()
            }
            return .handled
        }
        .onKeyPress(.tab) { state.tabAutocomplete(); return .handled }
        .onKeyPress(.delete) {
            if state.query.isEmpty && state.isDrillMode {
                state.goBack()
                return .handled
            }
            return .ignored
        }
    }
}

// MARK: - Palette Row

struct PaletteRow: View {
    let item: PaletteItem
    let isSelected: Bool

    private var itemColor: Color {
        switch item.kind {
        case .project(let proj):
            return ProjectType.color(for: proj.type)
        case .verb(let verb, _):
            return colorForVerb(verb)
        case .projectAction(_, let action):
            return Color(red: action.color.0, green: action.color.1, blue: action.color.2)
        case .action:
            return Color(red: 0.42, green: 0.45, blue: 0.50)
        }
    }

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: item.icon)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(isSelected ? .white : itemColor)
                .frame(width: 28, height: 28)
                .background(
                    RoundedRectangle(cornerRadius: 6)
                        .fill(isSelected ? itemColor.opacity(0.4) : itemColor.opacity(0.12))
                )

            VStack(alignment: .leading, spacing: 2) {
                Text(item.label)
                    .font(.system(size: 13))
                    .foregroundStyle(isSelected ? .white : .primary)
                    .lineLimit(1)

                if !item.description.isEmpty {
                    HStack(spacing: 4) {
                        if case .project(let proj) = item.kind {
                            Text(proj.type.replacingOccurrences(of: "-", with: " "))
                                .font(.system(size: 9, weight: .medium))
                                .foregroundStyle(isSelected ? .white.opacity(0.9) : itemColor)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 1)
                                .background(RoundedRectangle(cornerRadius: 3).fill(isSelected ? itemColor.opacity(0.3) : itemColor.opacity(0.1)))
                            Text(proj.status)
                                .font(.system(size: 9))
                                .foregroundStyle(isSelected ? .white.opacity(0.7) : ProjectStatus.color(for: proj.status))
                            if proj.gitDirty {
                                Circle().fill(Color.orange).frame(width: 4, height: 4)
                            }
                        } else {
                            Text(item.description)
                                .font(.system(size: 10))
                                .foregroundStyle(isSelected ? Color.white.opacity(0.7) : Color.gray)
                        }
                    }
                    .lineLimit(1)
                }
            }

            Spacer()

            if item.confidence == .low {
                Text("maybe?")
                    .font(.system(size: 9))
                    .foregroundStyle(.tertiary)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 1)
                    .background(RoundedRectangle(cornerRadius: 3).fill(.white.opacity(0.05)))
            }

            if case .project(_) = item.kind {
                Image(systemName: "chevron.right")
                    .font(.system(size: 10))
                    .foregroundStyle(isSelected ? .white.opacity(0.5) : Color.gray.opacity(0.3))
            }

            if case .project(let proj) = item.kind, proj.devPort != nil {
                if item.id.hasPrefix("running-") {
                    HStack(spacing: 4) {
                        Circle().fill(.green).frame(width: 6, height: 6)
                        Text(":\(proj.devPort ?? 0)")
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundStyle(isSelected ? .white.opacity(0.7) : Color.gray)
                    }
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(isSelected ? itemColor.opacity(0.25) : itemColor.opacity(0.04))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .strokeBorder(isSelected ? itemColor.opacity(0.4) : Color.clear, lineWidth: 1)
        )
        .padding(.horizontal, 8)
        .opacity(item.confidence.opacity)
        .contentShape(Rectangle())
    }
}

// MARK: - Key Hint

struct KeyHint: View {
    let text: String
    init(_ text: String) { self.text = text }
    var body: some View {
        Text(text)
            .font(.system(size: 9, weight: .medium, design: .monospaced))
            .padding(.horizontal, 4)
            .padding(.vertical, 2)
            .background(.white.opacity(0.08))
            .cornerRadius(3)
    }
}
