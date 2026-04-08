import Foundation

// MARK: - Port Management

extension APIClient {
    struct PortEntry: Decodable, Identifiable {
        let port: Int
        let pid: Int
        let command: String
        let user: String
        let projectId: String?
        let projectName: String?
        var id: Int { port }
    }

    struct PortConflict: Decodable, Identifiable {
        let port: Int
        let type: String
        var id: Int { port }
    }

    func fetchAllPorts() async -> [PortEntry] {
        await getArray("/ports/all")
    }

    func fetchPortConflicts() async -> [PortConflict] {
        await getArray("/ports/conflicts")
    }

    func killPort(port: Int) async -> Bool {
        await postOk("/actions/port-kill", body: ["port": port])
    }

    func checkPort(port: Int) async -> Bool {
        guard let url = URL(string: "\(baseURL)/actions/port-check/\(port)") else { return false }
        do {
            let (data, _) = try await session.data(from: url)
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                return json["running"] as? Bool ?? false
            }
        } catch {}
        return false
    }
}
