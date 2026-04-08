import Foundation

// MARK: - Deployment

extension APIClient {
    struct DeployStatus: Decodable {
        let target: String?
        let deployUrl: String?
    }

    struct DeployHistoryEntry: Decodable, Identifiable {
        let id: String
        let url: String?
        let status: String
        let environment: String?
        let createdAt: String?
    }

    struct DeployHealth: Decodable {
        let url: String?
        let healthy: Bool
        let status: Int?
        let responseTime: Int?
    }

    func deployStatus(projectId: String) async -> DeployStatus? {
        await get("/deploy/\(projectId)/status")
    }

    func deployHistory(projectId: String) async -> [DeployHistoryEntry] {
        await getArray("/deploy/\(projectId)/history")
    }

    func deployTrigger(projectId: String, environment: String) async -> Bool {
        await postOk("/deploy/\(projectId)/trigger", body: ["environment": environment])
    }

    func deployHealth(projectId: String) async -> DeployHealth? {
        await get("/deploy/\(projectId)/health")
    }
}
