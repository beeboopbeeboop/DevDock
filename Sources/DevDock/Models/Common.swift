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
