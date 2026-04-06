import SwiftUI

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
    var arrowNavCounter = 0
    var isVisible = false
    var dataReady = false

    static let knownVerbs = ["reset", "start", "stop", "status", "logs", "pull", "push", "commit", "deploy"]

    var isVerbMode: Bool {
        let first = query.trimmingCharacters(in: .whitespaces).split(separator: " ").first.map(String.init) ?? ""
        return Self.knownVerbs.contains(first.lowercased())
    }

    // Grouped items for section headers
    struct Section {
        let title: String
        let items: [PaletteItem]
    }

    var sections: [Section] {
        if !dataReady { return [] }
        let q = query.lowercased().trimmingCharacters(in: .whitespaces)

        if q.isEmpty {
            var sections: [Section] = []

            // Running processes
            let running = runningProcesses.compactMap { proc -> PaletteItem? in
                guard let project = projects.first(where: { $0.id == proc.projectId }) else { return nil }
                return PaletteItem(
                    id: "running-\(proc.projectId)",
                    label: project.name,
                    description: "Running on :\(project.devPort ?? 0)",
                    icon: "bolt.fill",
                    kind: .project(project)
                )
            }
            if !running.isEmpty { sections.append(Section(title: "RUNNING", items: running)) }

            // Verbs
            let verbs = Self.knownVerbs.map { verb in
                PaletteItem(
                    id: "verb-\(verb)",
                    label: verb,
                    description: "Type '\(verb) <project>' to execute",
                    icon: iconForVerb(verb),
                    kind: .verb(verb, "")
                )
            }
            sections.append(Section(title: "VERBS", items: verbs))

            // Favorites
            let favs = projects.filter(\.isFavorite).compactMap { project -> PaletteItem? in
                guard !running.contains(where: { $0.id == "running-\(project.id)" }) else { return nil }
                return PaletteItem(
                    id: "fav-\(project.id)",
                    label: project.name,
                    description: "\(project.type) \(project.status)",
                    icon: "star.fill",
                    kind: .project(project)
                )
            }
            if !favs.isEmpty { sections.append(Section(title: "FAVORITES", items: favs)) }

            // All projects
            let runningIds = Set(running.map { $0.id.replacingOccurrences(of: "running-", with: "") })
            let favIds = Set(favs.map { $0.id.replacingOccurrences(of: "fav-", with: "") })
            let rest = projects.compactMap { project -> PaletteItem? in
                guard !runningIds.contains(project.id) && !favIds.contains(project.id) else { return nil }
                return PaletteItem(
                    id: "proj-\(project.id)",
                    label: project.name,
                    description: "\(project.type) \(project.status)",
                    icon: iconForProjectType(project.type),
                    kind: .project(project)
                )
            }
            if !rest.isEmpty { sections.append(Section(title: "PROJECTS", items: rest)) }

            return sections
        }

        // Verb mode
        if isVerbMode {
            let parts = q.split(separator: " ", maxSplits: 1)
            let verb = String(parts.first ?? "")
            let target = parts.count > 1 ? String(parts[1]) : ""

            let matchedProjects = target.isEmpty
                ? projects
                : projects.filter { fuzzyMatch($0.name, target) || $0.aliases.contains(where: { fuzzyMatch($0, target) }) }

            let items = matchedProjects.map { project in
                PaletteItem(
                    id: "target-\(project.id)",
                    label: "\(verb) \(project.name)",
                    description: project.type,
                    icon: iconForVerb(verb),
                    kind: .verb(verb, project.id)
                )
            }
            return [Section(title: "TARGETS", items: items)]
        }

        // Search mode
        let items = projects
            .filter { fuzzyMatch($0.name, q) || $0.aliases.contains(where: { fuzzyMatch($0, q) }) || fuzzyMatch($0.type, q) }
            .map { project in
                PaletteItem(
                    id: "search-\(project.id)",
                    label: project.name,
                    description: "\(project.type) \(project.status)\(project.gitDirty ? " (dirty)" : "")",
                    icon: iconForProjectType(project.type),
                    kind: .project(project)
                )
            }
        return [Section(title: "RESULTS", items: items)]
    }

    var filteredItems: [PaletteItem] {
        sections.flatMap(\.items)
    }

    var resultCount: Int {
        filteredItems.count
    }

    func reset() {
        query = ""
        selectedIndex = 0
        verbResult = nil
        isLoading = false
        isVisible = true
        dataReady = false
        loadData()
    }

    func loadData() {
        Task {
            async let p = DevDockAPIClient.shared.fetchProjects()
            async let r = DevDockAPIClient.shared.fetchRunningProcesses()
            projects = await p
            runningProcesses = await r
            dataReady = true
        }
    }

    func executeSelected(item: PaletteItem) {
        switch item.kind {
        case .project(let project):
            Task {
                let process = Process()
                process.executableURL = URL(fileURLWithPath: "/usr/bin/open")
                process.arguments = ["-a", "Visual Studio Code", project.path]
                try? process.run()
            }

        case .verb(let verb, let target):
            guard !target.isEmpty else { return }
            let projectName = projects.first(where: { $0.id == target })?.name ?? target
            isLoading = true
            verbResult = nil
            Task {
                let response = await DevDockAPIClient.shared.executeVerb(verb: verb, target: projectName)
                isLoading = false
                if let r = response {
                    verbOk = r.ok ?? (r.error == nil)
                    verbResult = r.message ?? r.error ?? (r.ok == true ? "Done" : "Failed")
                } else {
                    verbOk = false
                    verbResult = "No response from server"
                }
            }

        case .action(_, _, let action):
            action()
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
        if count > 0 {
            selectedIndex = (selectedIndex - 1 + count) % count
            arrowNavCounter += 1
        }
    }

    func moveDown() {
        let count = filteredItems.count
        if count > 0 {
            selectedIndex = (selectedIndex + 1) % count
            arrowNavCounter += 1
        }
    }
}

// MARK: - Helpers

private func fuzzyMatch(_ text: String, _ query: String) -> Bool {
    let t = text.lowercased()
    let q = query.lowercased()
    if t.contains(q) { return true }
    var tIndex = t.startIndex
    for char in q {
        guard let found = t[tIndex...].firstIndex(of: char) else { return false }
        tIndex = t.index(after: found)
    }
    return true
}

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

private func iconForProjectType(_ type: String) -> String {
    switch type {
    case "nextjs": return "globe"
    case "vite-react", "framer-plugin": return "bolt"
    case "hono-server": return "server.rack"
    case "cep-plugin": return "puzzlepiece.extension"
    case "cloudflare-worker": return "cloud"
    case "swift-app": return "swift"
    case "static-site": return "doc.richtext"
    default: return "folder"
    }
}

private func colorForProjectType(_ type: String) -> Color {
    switch type {
    case "cep-plugin": return Color(red: 0.65, green: 0.55, blue: 0.98)
    case "nextjs": return Color(red: 0.97, green: 0.97, blue: 0.97)
    case "vite-react": return Color(red: 0.51, green: 0.55, blue: 0.98)
    case "framer-plugin": return Color(red: 0.38, green: 0.65, blue: 0.98)
    case "cloudflare-worker": return Color(red: 0.98, green: 0.75, blue: 0.14)
    case "hono-server": return Color(red: 0.98, green: 0.45, blue: 0.09)
    case "static-site": return Color(red: 0.53, green: 0.94, blue: 0.67)
    case "node-package": return Color(red: 0.97, green: 0.44, blue: 0.44)
    case "swift-app": return Color(red: 1.0, green: 0.42, blue: 0.42)
    default: return Color(red: 0.42, green: 0.45, blue: 0.50)
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

private func colorForStatus(_ status: String) -> Color {
    switch status {
    case "active": return Color(red: 0.53, green: 0.94, blue: 0.67)
    case "maintenance": return Color(red: 0.98, green: 0.75, blue: 0.14)
    case "paused": return Color(red: 0.42, green: 0.45, blue: 0.50)
    case "archived": return Color(red: 0.29, green: 0.34, blue: 0.39)
    case "idea": return Color(red: 0.51, green: 0.55, blue: 0.98)
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
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                    .font(.system(size: 16))

                TextField("Type a verb or project name...", text: $state.query)
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
                    .onChange(of: state.query) {
                        state.selectedIndex = 0
                    }

                if state.isLoading {
                    ProgressView()
                        .scaleEffect(0.6)
                }

                // Clear button
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
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)

            Divider()

            // Verb result banner
            if let result = state.verbResult {
                HStack(spacing: 8) {
                    Image(systemName: state.verbOk ? "checkmark.circle.fill" : "xmark.circle.fill")
                        .foregroundStyle(state.verbOk ? .green : .red)
                    Text(result)
                        .font(.system(size: 12))
                        .lineLimit(2)
                    Spacer()
                    Button(action: { state.verbResult = nil }) {
                        Image(systemName: "xmark")
                            .font(.system(size: 10))
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(state.verbOk ? Color.green.opacity(0.08) : Color.red.opacity(0.08))
                .transition(.move(edge: .top).combined(with: .opacity))

                Divider()
            }

            // Results list with section headers
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 0) {
                        let allSections = state.sections
                        ForEach(Array(allSections.enumerated()), id: \.element.title) { _, section in
                            // Section header
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
                                PaletteRow(
                                    item: item,
                                    isSelected: globalIndex == state.selectedIndex
                                )
                                .id(item.id)
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
                        // anchor: nil = only scroll if item is off-screen, minimal movement
                        proxy.scrollTo(items[state.selectedIndex].id, anchor: nil)
                    }
                }
            }

            // Footer
            Divider()
            HStack(spacing: 12) {
                HStack(spacing: 4) {
                    KeyHint("↑↓")
                    Text("navigate")
                }
                HStack(spacing: 4) {
                    KeyHint("↩")
                    Text("select")
                }
                if state.isVerbMode {
                    HStack(spacing: 4) {
                        KeyHint("tab")
                        Text("complete")
                    }
                }
                HStack(spacing: 4) {
                    KeyHint("esc")
                    Text("close")
                }
                Spacer()

                // Result count
                Text("\(state.resultCount) item\(state.resultCount == 1 ? "" : "s")")
                    .font(.system(size: 10))
                    .foregroundStyle(.quaternary)

                Text("⌃⇧D")
                    .font(.system(size: 10))
                    .foregroundStyle(.tertiary)
            }
            .font(.system(size: 10))
            .foregroundStyle(.quaternary)
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
        .background(.ultraThinMaterial)
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .strokeBorder(.white.opacity(0.1), lineWidth: 0.5)
        )
        .shadow(color: .black.opacity(0.3), radius: 30, y: 10)
        // Bounce-in animation
        .scaleEffect(state.isVisible ? 1.0 : 0.97)
        .animation(.spring(response: 0.2, dampingFraction: 0.75), value: state.isVisible)
        .onAppear {
            isSearchFocused = true
            // Trigger bounce
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.01) {
                state.isVisible = true
            }
        }
        .onKeyPress(.upArrow) {
            state.moveUp()
            return .handled
        }
        .onKeyPress(.downArrow) {
            state.moveDown()
            return .handled
        }
        .onKeyPress(.escape) {
            onDismiss()
            return .handled
        }
        .onKeyPress(.tab) {
            state.tabAutocomplete()
            return .handled
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
            return colorForProjectType(proj.type)
        case .verb(let verb, _):
            return colorForVerb(verb)
        case .action:
            return Color(red: 0.42, green: 0.45, blue: 0.50)
        }
    }

    var body: some View {
        HStack(spacing: 10) {
            // Color-coded icon
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
                            // Type pill
                            Text(proj.type.replacingOccurrences(of: "-", with: " "))
                                .font(.system(size: 9, weight: .medium))
                                .foregroundStyle(isSelected ? .white.opacity(0.9) : itemColor)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 1)
                                .background(
                                    RoundedRectangle(cornerRadius: 3)
                                        .fill(isSelected ? itemColor.opacity(0.3) : itemColor.opacity(0.1))
                                )

                            Text(proj.status)
                                .font(.system(size: 9))
                                .foregroundStyle(isSelected ? .white.opacity(0.7) : colorForStatus(proj.status))

                            if proj.gitDirty {
                                Circle()
                                    .fill(Color.orange)
                                    .frame(width: 4, height: 4)
                            }
                        } else if case .verb(_, _) = item.kind {
                            // Verb description with colored pill
                            Text(item.description)
                                .font(.system(size: 10))
                                .foregroundStyle(isSelected ? Color.white.opacity(0.7) : Color.gray)
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

            // Running indicator
            if case .project(let proj) = item.kind, proj.devPort != nil {
                if item.id.hasPrefix("running-") {
                    HStack(spacing: 4) {
                        Circle()
                            .fill(.green)
                            .frame(width: 6, height: 6)
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
        .contentShape(Rectangle())
        .animation(.easeOut(duration: 0.1), value: isSelected)
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
