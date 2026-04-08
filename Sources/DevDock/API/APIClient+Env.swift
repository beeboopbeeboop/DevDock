import Foundation

// MARK: - Environment Variables

extension APIClient {
    struct EnvIssue: Identifiable {
        let id: String
        let projectId: String
        let projectName: String
        let issue: String
        let severity: String
        let detail: String
    }

    func envAudit() async -> [EnvIssue] {
        guard let url = URL(string: "\(baseURL)/actions/env-audit") else { return [] }
        do {
            let (data, _) = try await session.data(from: url)
            if let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
                return arr.enumerated().map { index, item in
                    EnvIssue(
                        id: "\(index)",
                        projectId: item["projectId"] as? String ?? "",
                        projectName: item["projectName"] as? String ?? "",
                        issue: item["issue"] as? String ?? "",
                        severity: item["severity"] as? String ?? "info",
                        detail: item["detail"] as? String ?? ""
                    )
                }
            }
        } catch {}
        return []
    }

    func depsOutdated(path: String) async -> [[String: Any]] {
        guard let url = URL(string: "\(baseURL)/actions/deps-outdated?path=\(path.urlEncoded)") else { return [] }
        do {
            let (data, _) = try await session.data(from: url)
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let packages = json["packages"] as? [[String: Any]] {
                return packages
            }
        } catch {}
        return []
    }

    func crossSearch(query: String, glob: String? = nil) async -> [[String: Any]] {
        var q = "q=\(query.urlEncoded)"
        if let glob { q += "&glob=\(glob.urlEncoded)" }
        guard let url = URL(string: "\(baseURL)/actions/search?\(q)") else { return [] }
        do {
            let (data, _) = try await session.data(from: url)
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let results = json["results"] as? [[String: Any]] {
                return results
            }
        } catch {}
        return []
    }

    func insights(range: String) async -> [[String: Any]] {
        guard let url = URL(string: "\(baseURL)/insights?range=\(range)") else { return [] }
        do {
            let (data, _) = try await session.data(from: url)
            if let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
                return arr
            }
        } catch {}
        return []
    }

    func latestSnapshot() async -> [String: Any]? {
        guard let url = URL(string: "\(baseURL)/insights/latest") else { return nil }
        do {
            let (data, _) = try await session.data(from: url)
            return try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        } catch {}
        return nil
    }

    func graphRelationships() async -> (nodes: [[String: Any]], edges: [[String: Any]]) {
        guard let url = URL(string: "\(baseURL)/graph/relationships") else { return ([], []) }
        do {
            let (data, _) = try await session.data(from: url)
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                let nodes = json["nodes"] as? [[String: Any]] ?? []
                let edges = json["edges"] as? [[String: Any]] ?? []
                return (nodes, edges)
            }
        } catch {}
        return ([], [])
    }
}
