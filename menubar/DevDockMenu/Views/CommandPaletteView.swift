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

    // Known verbs for detection
    static let knownVerbs = ["reset", "start", "stop", "status", "logs", "pull", "push", "commit", "deploy"]

    var isVerbMode: Bool {
        let first = query.trimmingCharacters(in: .whitespaces).split(separator: " ").first.map(String.init) ?? ""
        return Self.knownVerbs.contains(first.lowercased())
    }

    var filteredItems: [PaletteItem] {
        let q = query.lowercased().trimmingCharacters(in: .whitespaces)

        if q.isEmpty {
            // Show running processes first, then favorites, then recent
            var items: [PaletteItem] = []

            // Running processes
            for proc in runningProcesses {
                if let project = projects.first(where: { $0.id == proc.projectId }) {
                    items.append(PaletteItem(
                        id: "running-\(proc.projectId)",
                        label: project.name,
                        description: "Running on :\(project.devPort ?? 0)",
                        icon: "bolt.fill",
                        kind: .project(project)
                    ))
                }
            }

            // Verbs as quick actions
            for verb in Self.knownVerbs {
                items.append(PaletteItem(
                    id: "verb-\(verb)",
                    label: verb,
                    description: "Type '\(verb) <project>' to execute",
                    icon: iconForVerb(verb),
                    kind: .verb(verb, "")
                ))
            }

            // Favorite projects
            for project in projects where project.isFavorite {
                if !items.contains(where: { $0.id == "running-\(project.id)" }) {
                    items.append(PaletteItem(
                        id: "fav-\(project.id)",
                        label: project.name,
                        description: "\(project.type) \(project.status)",
                        icon: "star.fill",
                        kind: .project(project)
                    ))
                }
            }

            // All projects
            for project in projects {
                let existingIds = items.map(\.id)
                if !existingIds.contains("running-\(project.id)") && !existingIds.contains("fav-\(project.id)") {
                    items.append(PaletteItem(
                        id: "proj-\(project.id)",
                        label: project.name,
                        description: "\(project.type) \(project.status)",
                        icon: iconForProjectType(project.type),
                        kind: .project(project)
                    ))
                }
            }

            return items
        }

        // Verb mode: don't filter, just show the verb target hint
        if isVerbMode {
            let parts = q.split(separator: " ", maxSplits: 1)
            let verb = String(parts.first ?? "")
            let target = parts.count > 1 ? String(parts[1]) : ""

            if target.isEmpty {
                // Show projects as potential targets
                return projects.map { project in
                    PaletteItem(
                        id: "target-\(project.id)",
                        label: "\(verb) \(project.name)",
                        description: project.type,
                        icon: iconForVerb(verb),
                        kind: .verb(verb, project.id)
                    )
                }
            } else {
                // Fuzzy match projects for the target
                return projects
                    .filter { fuzzyMatch($0.name, target) || $0.aliases.contains(where: { fuzzyMatch($0, target) }) }
                    .map { project in
                        PaletteItem(
                            id: "target-\(project.id)",
                            label: "\(verb) \(project.name)",
                            description: project.type,
                            icon: iconForVerb(verb),
                            kind: .verb(verb, project.id)
                        )
                    }
            }
        }

        // Search mode: fuzzy match projects
        return projects
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
    }

    func reset() {
        query = ""
        selectedIndex = 0
        verbResult = nil
        isLoading = false
        loadData()
    }

    func loadData() {
        Task {
            async let p = DevDockAPIClient.shared.fetchProjects()
            async let r = DevDockAPIClient.shared.fetchRunningProcesses()
            projects = await p
            runningProcesses = await r
        }
    }

    func executeSelected(item: PaletteItem) {
        switch item.kind {
        case .project(let project):
            // Open in VSCode
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

    func moveUp() {
        let count = filteredItems.count
        if count > 0 {
            selectedIndex = (selectedIndex - 1 + count) % count
        }
    }

    func moveDown() {
        let count = filteredItems.count
        if count > 0 {
            selectedIndex = (selectedIndex + 1) % count
        }
    }
}

// MARK: - Helpers

private func fuzzyMatch(_ text: String, _ query: String) -> Bool {
    let t = text.lowercased()
    let q = query.lowercased()
    if t.contains(q) { return true }
    // Ordered character match
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

// Color mapping matching PROJECT_TYPE_COLORS from the web dashboard
private func colorForProjectType(_ type: String) -> Color {
    switch type {
    case "cep-plugin": return Color(red: 0.65, green: 0.55, blue: 0.98)    // #a78bfa
    case "nextjs": return Color(red: 0.97, green: 0.97, blue: 0.97)        // #f8f8f8
    case "vite-react": return Color(red: 0.51, green: 0.55, blue: 0.98)    // #818cf8
    case "framer-plugin": return Color(red: 0.38, green: 0.65, blue: 0.98) // #60a5fa
    case "cloudflare-worker": return Color(red: 0.98, green: 0.75, blue: 0.14) // #fbbf24
    case "hono-server": return Color(red: 0.98, green: 0.45, blue: 0.09)   // #f97316
    case "static-site": return Color(red: 0.53, green: 0.94, blue: 0.67)   // #86efac
    case "node-package": return Color(red: 0.97, green: 0.44, blue: 0.44)  // #f87171
    case "swift-app": return Color(red: 1.0, green: 0.42, blue: 0.42)      // #ff6b6b
    default: return Color(red: 0.42, green: 0.45, blue: 0.50)              // #6b7280
    }
}

private func colorForVerb(_ verb: String) -> Color {
    switch verb {
    case "reset": return Color(red: 0.98, green: 0.75, blue: 0.14)  // amber
    case "start": return Color(red: 0.34, green: 0.80, blue: 0.47)  // green
    case "stop": return Color(red: 0.97, green: 0.44, blue: 0.44)   // red
    case "deploy": return Color(red: 0.51, green: 0.55, blue: 0.98) // indigo
    case "commit": return Color(red: 0.65, green: 0.55, blue: 0.98) // purple
    case "push": return Color(red: 0.38, green: 0.65, blue: 0.98)   // blue
    case "pull": return Color(red: 0.38, green: 0.65, blue: 0.98)   // blue
    default: return Color(red: 0.42, green: 0.45, blue: 0.50)       // gray
    }
}

private func colorForStatus(_ status: String) -> Color {
    switch status {
    case "active": return Color(red: 0.53, green: 0.94, blue: 0.67)   // green
    case "maintenance": return Color(red: 0.98, green: 0.75, blue: 0.14) // amber
    case "paused": return Color(red: 0.42, green: 0.45, blue: 0.50)   // gray
    case "archived": return Color(red: 0.29, green: 0.34, blue: 0.39) // dark gray
    case "idea": return Color(red: 0.51, green: 0.55, blue: 0.98)     // indigo
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

                TextField("Search projects, run verbs...", text: $state.query)
                    .textFieldStyle(.plain)
                    .font(.system(size: 18, weight: .light))
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
                    Button("Dismiss") {
                        state.verbResult = nil
                    }
                    .buttonStyle(.plain)
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(state.verbOk ? Color.green.opacity(0.08) : Color.red.opacity(0.08))

                Divider()
            }

            // Results list
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 4) {
                        let items = state.filteredItems
                        ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                            PaletteRow(
                                item: item,
                                isSelected: index == state.selectedIndex
                            )
                            .id(item.id)
                            .onTapGesture {
                                state.selectedIndex = index
                                state.executeSelected(item: item)
                            }
                            .onHover { hovering in
                                if hovering { state.selectedIndex = index }
                            }
                        }

                        if items.isEmpty && !state.query.isEmpty {
                            Text("No matches")
                                .font(.system(size: 13))
                                .foregroundStyle(.tertiary)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 40)
                        }
                    }
                    .padding(.vertical, 4)
                }
                .onChange(of: state.selectedIndex) { _, newVal in
                    let items = state.filteredItems
                    if newVal < items.count {
                        proxy.scrollTo(items[newVal].id, anchor: .center)
                    }
                }
            }

            // Footer with hints
            Divider()
            HStack(spacing: 16) {
                HStack(spacing: 4) {
                    KeyHint("↑↓")
                    Text("navigate")
                }
                HStack(spacing: 4) {
                    KeyHint("↩")
                    Text("select")
                }
                HStack(spacing: 4) {
                    KeyHint("esc")
                    Text("close")
                }
                Spacer()
                Text("⇧Space D")
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
        .onAppear {
            isSearchFocused = true
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
    }
}

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
            // Color-coded icon with tinted background
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
                    .font(.system(size: 13, weight: isSelected ? .medium : .regular))
                    .foregroundStyle(isSelected ? .white : .primary)
                    .lineLimit(1)

                if !item.description.isEmpty {
                    HStack(spacing: 4) {
                        // Type badge
                        if case .project(let proj) = item.kind {
                            Text(proj.type.replacingOccurrences(of: "-", with: " "))
                                .font(.system(size: 9, weight: .medium))
                                .foregroundStyle(isSelected ? .white.opacity(0.9) : itemColor)
                                .padding(.horizontal, 5)
                                .padding(.vertical, 1)
                                .background(
                                    RoundedRectangle(cornerRadius: 3)
                                        .fill(isSelected ? itemColor.opacity(0.3) : itemColor.opacity(0.1))
                                )

                            // Status badge
                            Text(proj.status)
                                .font(.system(size: 9))
                                .foregroundStyle(isSelected ? .white.opacity(0.7) : colorForStatus(proj.status))

                            if proj.gitDirty {
                                Circle()
                                    .fill(Color.orange)
                                    .frame(width: 4, height: 4)
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
    }
}

struct KeyHint: View {
    let text: String

    init(_ text: String) {
        self.text = text
    }

    var body: some View {
        Text(text)
            .font(.system(size: 9, weight: .medium, design: .monospaced))
            .padding(.horizontal, 4)
            .padding(.vertical, 2)
            .background(.white.opacity(0.08))
            .cornerRadius(3)
    }
}
