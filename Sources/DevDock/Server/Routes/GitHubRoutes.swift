import Foundation
import Swifter

enum GitHubRoutes {
    private struct WorkflowRun: Codable {
        let databaseId: Int
        let displayTitle: String
        let status: String
        let conclusion: String?
        let event: String?
        let headBranch: String?
        let createdAt: String?
    }

    private struct Issue: Codable {
        let number: Int
        let title: String
        let state: String
        let createdAt: String?
    }

    private struct PullRequest: Codable {
        struct Author: Codable {
            let login: String
        }

        let number: Int
        let title: String
        let state: String
        let updatedAt: String?
        let reviewDecision: String?
        let author: Author?
        let headRefName: String?
    }

    private struct RepoStatus: Codable {
        let ci: String?
        let openPrs: Int?
        let openIssues: Int?
        let stars: Int?
        let forks: Int?
    }

    static func mount(on server: HttpServer) {
        server["/api/github/repo/:owner/:repo/actions"] = { request in
            guard let params = params(from: request) else { return .badRequest(.text("Invalid owner or repo")) }
            return jsonArrayResponse(
                ghJSON(["run", "list", "--repo", "\(params.owner)/\(params.repo)", "--json", "databaseId,displayTitle,status,conclusion,event,headBranch,createdAt", "--limit", "10"])
            )
        }

        server["/api/github/repo/:owner/:repo/issues"] = { request in
            guard let params = params(from: request) else { return .badRequest(.text("Invalid owner or repo")) }
            return jsonArrayResponse(
                ghJSON(["issue", "list", "--repo", "\(params.owner)/\(params.repo)", "--json", "number,title,state,createdAt", "--limit", "10"])
            )
        }

        server["/api/github/repo/:owner/:repo/prs-detail"] = { request in
            guard let params = params(from: request) else { return .badRequest(.text("Invalid owner or repo")) }
            return jsonArrayResponse(
                ghJSON(["pr", "list", "--repo", "\(params.owner)/\(params.repo)", "--json", "number,title,state,updatedAt,reviewDecision,author,headRefName", "--limit", "10"])
            )
        }

        server["/api/github/repo/:owner/:repo/status"] = { request in
            guard let params = params(from: request) else { return .badRequest(.text("Invalid owner or repo")) }
            let repoInfo = ghJSON(["repo", "view", "\(params.owner)/\(params.repo)", "--json", "stargazerCount,forkCount"], cwd: nil) as? [String: Any] ?? [:]
            let prs = ghJSON(["pr", "list", "--repo", "\(params.owner)/\(params.repo)", "--json", "number", "--limit", "100"], cwd: nil) as? [[String: Any]] ?? []
            let issues = ghJSON(["issue", "list", "--repo", "\(params.owner)/\(params.repo)", "--json", "number", "--limit", "100"], cwd: nil) as? [[String: Any]] ?? []
            return jsonResponse(RepoStatus(
                ci: nil,
                openPrs: prs.count,
                openIssues: issues.count,
                stars: repoInfo["stargazerCount"] as? Int,
                forks: repoInfo["forkCount"] as? Int
            ))
        }

        server["/api/github/create-pr"] = { request in
            guard request.method == "POST" else { return .raw(405, "Method Not Allowed", nil, nil) }
            let body = requestBody(request)
            let check = requireValidPath(body["path"] as? String)
            guard check.valid else { return .badRequest(.text(check.error!)) }
            let title = (body["title"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !title.isEmpty else { return .badRequest(.text("Title is required")) }

            var args = ["pr", "create", "--title", title]
            if let value = body["body"] as? String, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                args += ["--body", value]
            }
            if let base = body["base"] as? String, !base.isEmpty {
                args += ["--base", base]
            }
            let result = runGh(args, cwd: check.resolved!)
            let url = firstURL(in: result.output)
            return jsonResponse(["ok": result.ok, "url": url as Any, "error": result.ok ? NSNull() : result.output as Any])
        }

        server["/api/github/create-issue"] = { request in
            guard request.method == "POST" else { return .raw(405, "Method Not Allowed", nil, nil) }
            let body = requestBody(request)
            let repo = (body["repo"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let title = (body["title"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !repo.isEmpty, !title.isEmpty else { return .badRequest(.text("repo and title required")) }

            var args = ["issue", "create", "--repo", repo, "--title", title]
            if let value = body["body"] as? String, !value.isEmpty {
                args += ["--body", value]
            }
            let result = runGh(args, cwd: nil)
            let url = firstURL(in: result.output)
            return jsonResponse(["ok": result.ok, "url": url as Any, "error": result.ok ? NSNull() : result.output as Any])
        }
    }

    private static func params(from request: HttpRequest) -> (owner: String, repo: String)? {
        let owner = request.params[":owner"] ?? ""
        let repo = request.params[":repo"] ?? ""
        guard Security.validateGitHubParam(owner), Security.validateGitHubParam(repo) else { return nil }
        return (owner, repo)
    }

    private static func ghJSON(_ args: [String], cwd: String? = nil) -> Any {
        let result = runGh(args, cwd: cwd)
        guard result.ok,
              let data = result.output.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) else {
            return []
        }
        return json
    }

    private static func jsonArrayResponse(_ value: Any) -> HttpResponse {
        if let array = value as? [[String: Any]], let data = try? JSONSerialization.data(withJSONObject: array) {
            return .raw(200, "OK", ["Content-Type": "application/json"]) { writer in
                try? writer.write(Array(data))
            }
        }
        return jsonResponse([[String: String]]())
    }

    private static func requestBody(_ request: HttpRequest) -> [String: Any] {
        (try? JSONSerialization.jsonObject(with: Data(request.body), options: [])) as? [String: Any] ?? [:]
    }

    private static func requireValidPath(_ path: String?) -> (valid: Bool, resolved: String?, error: String?) {
        guard let path, !path.isEmpty else { return (false, nil, "path required") }
        let result = Security.validateProjectPath(path)
        return result.valid ? (true, result.resolved, nil) : (false, nil, result.error ?? "Invalid path")
    }

    private static func runGh(_ args: [String], cwd: String?) -> (ok: Bool, output: String) {
        let process = Process()
        let stdout = Pipe()
        let stderr = Pipe()
        process.standardOutput = stdout
        process.standardError = stderr
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = ["gh"] + args
        if let cwd {
            process.currentDirectoryURL = URL(fileURLWithPath: cwd)
        }

        do {
            try process.run()
            process.waitUntilExit()
            let out = String(data: stdout.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            let err = String(data: stderr.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            return (process.terminationStatus == 0, (out + err).trimmingCharacters(in: .whitespacesAndNewlines))
        } catch {
            return (false, error.localizedDescription)
        }
    }

    private static func firstURL(in string: String) -> String? {
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else {
            return nil
        }
        let range = NSRange(location: 0, length: string.utf16.count)
        return detector.matches(in: string, range: range).first?.url?.absoluteString
    }
}
