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
}

struct PaletteItem: Identifiable {
    let id: String
    let label: String
    let description: String
    let icon: String // SF Symbol name
    let kind: PaletteItemKind
}
