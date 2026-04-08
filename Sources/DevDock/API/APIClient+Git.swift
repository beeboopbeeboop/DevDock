import Foundation

// MARK: - Git Operations

extension APIClient {
    struct GitLogEntry: Decodable, Identifiable {
        let hash: String
        let short: String
        let message: String
        let author: String
        let ago: String
        let insertions: Int?
        let deletions: Int?
        let filesChanged: Int?
        var id: String { hash }
    }

    struct GitStatusFile: Identifiable {
        let path: String
        let status: String
        var id: String { path }
    }

    func gitLog(path: String) async -> [GitLogEntry] {
        await getArray("/actions/git-log?path=\(path.urlEncoded)")
    }

    func gitStatus(path: String) async -> (staged: [GitStatusFile], unstaged: [GitStatusFile]) {
        guard let url = URL(string: "\(baseURL)/actions/git-status?path=\(path.urlEncoded)") else { return ([], []) }
        do {
            let (data, _) = try await session.data(from: url)
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                let staged = (json["staged"] as? [[String: String]] ?? []).map {
                    GitStatusFile(path: $0["path"] ?? "", status: $0["status"] ?? "")
                }
                let unstaged = (json["unstaged"] as? [[String: String]] ?? []).map {
                    GitStatusFile(path: $0["path"] ?? "", status: $0["status"] ?? "")
                }
                return (staged, unstaged)
            }
        } catch {}
        return ([], [])
    }

    func gitBranches(path: String) async -> (current: String, branches: [String]) {
        guard let url = URL(string: "\(baseURL)/actions/git-branches?path=\(path.urlEncoded)") else { return ("", []) }
        do {
            let (data, _) = try await session.data(from: url)
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                let current = json["current"] as? String ?? ""
                let branches = json["branches"] as? [String] ?? []
                return (current, branches)
            }
        } catch {}
        return ("", [])
    }

    func gitDiff(path: String, file: String? = nil, staged: Bool = false) async -> String {
        var query = "path=\(path.urlEncoded)"
        if let file { query += "&file=\(file.urlEncoded)" }
        if staged { query += "&staged=true" }
        guard let url = URL(string: "\(baseURL)/actions/git-diff?\(query)") else { return "" }
        do {
            let (data, _) = try await session.data(from: url)
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                return json["diff"] as? String ?? ""
            }
        } catch {}
        return ""
    }

    func gitStage(path: String, files: [String], unstage: Bool = false) async -> Bool {
        var body: [String: Any] = ["path": path, "files": files]
        if unstage { body["unstage"] = true }
        return await postOk("/actions/git-stage", body: body)
    }

    func gitCommit(path: String, message: String) async -> (ok: Bool, hash: String?) {
        guard let url = URL(string: "\(baseURL)/actions/git-commit") else { return (false, nil) }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["path": path, "message": message])
        do {
            let (data, _) = try await session.data(for: request)
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                return (json["ok"] as? Bool ?? false, json["hash"] as? String)
            }
        } catch {}
        return (false, nil)
    }

    func gitPush(path: String) async -> (ok: Bool, output: String) {
        guard let url = URL(string: "\(baseURL)/actions/git-push") else { return (false, "") }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 30
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["path": path])
        do {
            let (data, _) = try await session.data(for: request)
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                return (json["ok"] as? Bool ?? false, json["output"] as? String ?? "")
            }
        } catch {}
        return (false, "")
    }

    func gitCheckout(path: String, branch: String, create: Bool = false) async -> Bool {
        var body: [String: Any] = ["path": path, "branch": branch]
        if create { body["create"] = true }
        return await postOk("/actions/git-checkout", body: body)
    }

    func gitStashList(path: String) async -> [(ref: String, message: String)] {
        guard let url = URL(string: "\(baseURL)/actions/git-stash-list?path=\(path.urlEncoded)") else { return [] }
        do {
            let (data, _) = try await session.data(from: url)
            if let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: String]] {
                return arr.map { ($0["ref"] ?? "", $0["message"] ?? "") }
            }
        } catch {}
        return []
    }

    func gitStash(path: String) async -> Bool {
        await postOk("/actions/git-stash", body: ["path": path])
    }

    func gitStashPop(path: String, index: Int = 0) async -> Bool {
        await postOk("/actions/git-stash-pop", body: ["path": path, "index": index])
    }
}

extension String {
    var urlEncoded: String {
        addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? self
    }
}
