import Foundation

// MARK: - Docker

extension APIClient {
    struct DockerContainer: Decodable, Identifiable {
        let id: String
        let name: String
        let image: String
        let state: String
        let status: String
        let ports: String
    }

    func fetchDockerContainers() async -> (available: Bool, containers: [DockerContainer]) {
        guard let url = URL(string: "\(baseURL)/docker/containers") else { return (false, []) }
        do {
            let (data, _) = try await session.data(from: url)
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                let available = json["available"] as? Bool ?? false
                if let containerData = try? JSONSerialization.data(withJSONObject: json["containers"] ?? []),
                   let containers = try? JSONDecoder().decode([DockerContainer].self, from: containerData) {
                    return (available, containers)
                }
                return (available, [])
            }
        } catch {}
        return (false, [])
    }

    func dockerAction(_ action: String, path: String? = nil, containerId: String? = nil) async -> Bool {
        var body: [String: Any] = [:]
        if let path { body["path"] = path }
        if let containerId { body["containerId"] = containerId }
        return await postOk("/docker/\(action)", body: body)
    }
}
