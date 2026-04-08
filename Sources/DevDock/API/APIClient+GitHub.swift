import Foundation

// MARK: - GitHub Integration

extension APIClient {
    struct GitHubWorkflowRun: Decodable, Identifiable {
        let databaseId: Int
        let displayTitle: String
        let status: String
        let conclusion: String?
        let event: String?
        let headBranch: String?
        let createdAt: String?
        var id: Int { databaseId }
    }

    struct GitHubIssue: Decodable, Identifiable {
        let number: Int
        let title: String
        let state: String
        let createdAt: String?
        var id: Int { number }
    }

    struct GitHubPRDetail: Decodable, Identifiable {
        let number: Int
        let title: String
        let state: String
        let updatedAt: String?
        let reviewDecision: String?
        let author: PRAuthor?
        let headRefName: String?
        var id: Int { number }

        struct PRAuthor: Decodable {
            let login: String
        }
    }

    struct GitHubStatus: Decodable {
        let ci: String?
        let openPrs: Int?
        let openIssues: Int?
        let stars: Int?
        let forks: Int?
    }

    func githubActions(owner: String, repo: String) async -> [GitHubWorkflowRun] {
        await getArray("/github/repo/\(owner)/\(repo)/actions")
    }

    func githubIssues(owner: String, repo: String) async -> [GitHubIssue] {
        await getArray("/github/repo/\(owner)/\(repo)/issues")
    }

    func githubPRs(owner: String, repo: String) async -> [GitHubPRDetail] {
        await getArray("/github/repo/\(owner)/\(repo)/prs-detail")
    }

    func githubStatus(owner: String, repo: String) async -> GitHubStatus? {
        await get("/github/repo/\(owner)/\(repo)/status")
    }

    func createPR(path: String, title: String, body: String, base: String) async -> (ok: Bool, url: String?) {
        guard let url = URL(string: "\(baseURL)/github/create-pr") else { return (false, nil) }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 15
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["path": path, "title": title, "body": body, "base": base])
        do {
            let (data, _) = try await session.data(for: request)
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                return (json["ok"] as? Bool ?? false, json["url"] as? String)
            }
        } catch {}
        return (false, nil)
    }

    func createIssue(repo: String, title: String, body: String) async -> (ok: Bool, url: String?) {
        guard let url = URL(string: "\(baseURL)/github/create-issue") else { return (false, nil) }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["repo": repo, "title": title, "body": body])
        do {
            let (data, _) = try await session.data(for: request)
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                return (json["ok"] as? Bool ?? false, json["url"] as? String)
            }
        } catch {}
        return (false, nil)
    }
}
