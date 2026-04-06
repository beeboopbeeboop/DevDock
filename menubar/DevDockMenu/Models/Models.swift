import Foundation

struct RunningProcess: Decodable, Identifiable {
    let projectId: String
    let running: Bool
    let pid: Int?
    let startedAt: Int
    let autoRestart: Bool
    let restartCount: Int

    var id: String { projectId }
}

struct StartupProfile: Decodable, Identifiable {
    let id: String
    let name: String
    let projectIds: [String]
    let createdAt: String
}

struct HealthResponse: Decodable {
    let status: String
}

struct ProfileActionResponse: Decodable {
    let started: [String]?
    let failed: [String]?
    let stopped: [String]?
}

// MARK: - Command Palette Models

struct DevDockProject: Decodable, Identifiable {
    let id: String
    let name: String
    let path: String
    let type: String
    let status: String
    let devPort: Int?
    let gitBranch: String?
    let gitDirty: Bool
    let isFavorite: Bool
    let aliases: [String]
}

struct VerbResponse: Decodable {
    let ok: Bool?
    let message: String?
    let error: String?
    let correction: Bool?
    let suggested: String?
    let steps: [VerbStep]?
}

struct VerbStep: Decodable {
    let step: String?
    let ok: Bool?
    let message: String?
}

// Palette item types for unified search results
enum PaletteItemKind {
    case project(DevDockProject)
    case verb(String, String) // verb name, description
    case action(String, String, () -> Void) // label, description, action
    case projectAction(DevDockProject, ProjectAction) // drill-in action
}

struct PaletteItem: Identifiable {
    let id: String
    let label: String
    let description: String
    let icon: String // SF Symbol name
    let kind: PaletteItemKind
}

// MARK: - Project Actions (drill-in)

struct ProjectAction {
    let id: String
    let label: String
    let icon: String
    let color: (Double, Double, Double) // RGB

    static func actionsFor(_ project: DevDockProject) -> [ProjectAction] {
        var actions: [ProjectAction] = [
            ProjectAction(id: "vscode", label: "Open in VS Code", icon: "chevron.left.forwardslash.chevron.right", color: (0.38, 0.65, 0.98)),
            ProjectAction(id: "cursor", label: "Open in Cursor", icon: "cursorarrow.rays", color: (0.51, 0.55, 0.98)),
            ProjectAction(id: "terminal", label: "Open Terminal", icon: "terminal", color: (0.42, 0.45, 0.50)),
            ProjectAction(id: "finder", label: "Show in Finder", icon: "folder", color: (0.42, 0.45, 0.50)),
        ]

        if project.devPort != nil {
            actions.append(ProjectAction(id: "localhost", label: "Open Localhost :\(project.devPort!)", icon: "globe", color: (0.34, 0.80, 0.47)))
            actions.append(ProjectAction(id: "start-dev", label: "Start Dev Server", icon: "play.fill", color: (0.34, 0.80, 0.47)))
            actions.append(ProjectAction(id: "stop-dev", label: "Stop Dev Server", icon: "stop.fill", color: (0.97, 0.44, 0.44)))
        }

        actions.append(ProjectAction(id: "git-pull", label: "Git Pull", icon: "arrow.down.circle", color: (0.38, 0.65, 0.98)))
        actions.append(ProjectAction(id: "copy-path", label: "Copy Path", icon: "doc.on.doc", color: (0.42, 0.45, 0.50)))

        return actions
    }
}

// MARK: - Recent Commands

struct RecentEntry: Codable {
    let id: String
    let label: String
    let projectId: String
    let timestamp: Double
}

struct RecentsStore {
    private static let filePath = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".devdock/recents.json")

    static func load() -> [RecentEntry] {
        guard let data = try? Data(contentsOf: filePath),
              let entries = try? JSONDecoder().decode([RecentEntry].self, from: data) else {
            return []
        }
        return entries
    }

    static func save(_ entry: RecentEntry) {
        var entries = load().filter { $0.id != entry.id }
        entries.insert(entry, at: 0)
        if entries.count > 8 { entries = Array(entries.prefix(8)) }
        if let data = try? JSONEncoder().encode(entries) {
            try? data.write(to: filePath)
        }
    }
}
