import Foundation
import Swifter

enum DeployRoutes {
    private struct DeploymentEntry: Codable {
        let id: String
        let url: String?
        let status: String
        let environment: String?
        let createdAt: String?
    }

    private struct DeployStatus: Codable {
        let target: String?
        let lastDeploy: DeploymentEntry?
        let cliMissing: Bool?
        let cliName: String?
        let deployUrl: String?
    }

    private struct TriggerResponse: Codable {
        let triggered: Bool
        let target: String
        let environment: String
    }

    private struct HealthResponse: Codable {
        let url: String?
        let healthy: Bool
        let status: Int?
        let responseTime: Int?
    }

    private static let targetCLI: [String: String] = [
        "vercel": "vercel",
        "cloudflare": "wrangler",
        "netlify": "netlify",
        "railway": "railway",
        "flyio": "flyctl",
    ]

    static func mount(on server: HttpServer) {
        server["/api/deploy/:projectId/status"] = { request in
            let projectId = request.params[":projectId"] ?? ""
            guard let project = ((try? Queries.getProjectLookup(id: projectId)) ?? nil) else { return .notFound }
            if project.deployTarget == "none" {
                return jsonResponse(DeployStatus(target: "none", lastDeploy: nil, cliMissing: nil, cliName: nil, deployUrl: project.deployUrl))
            }

            let cli = targetCLI[project.deployTarget]
            let missing = cli == nil || !cliInstalled(cli!)
            let latest = deploymentHistory(for: project).first
            return jsonResponse(DeployStatus(
                target: project.deployTarget,
                lastDeploy: latest,
                cliMissing: missing ? true : nil,
                cliName: missing ? cli : nil,
                deployUrl: project.deployUrl
            ))
        }

        server["/api/deploy/:projectId/history"] = { request in
            let projectId = request.params[":projectId"] ?? ""
            guard let project = ((try? Queries.getProjectLookup(id: projectId)) ?? nil) else { return .notFound }
            return jsonResponse(deploymentHistory(for: project))
        }

        server["/api/deploy/:projectId/trigger"] = { request in
            guard request.method == "POST" else { return .raw(405, "Method Not Allowed", nil, nil) }
            let projectId = request.params[":projectId"] ?? ""
            guard let project = ((try? Queries.getProjectLookup(id: projectId)) ?? nil) else { return .notFound }
            let body = requestBody(request)
            let environment = body["environment"] as? String ?? "preview"
            guard ["preview", "production", "staging"].contains(environment) else {
                return .badRequest(.text("Invalid environment"))
            }
            guard let cli = targetCLI[project.deployTarget], cliInstalled(cli) else {
                return .badRequest(.text("CLI not installed"))
            }

            triggerDeployment(for: project, environment: environment)
            return jsonResponse(TriggerResponse(triggered: true, target: project.deployTarget, environment: environment))
        }

        server["/api/deploy/:projectId/health"] = { request in
            let projectId = request.params[":projectId"] ?? ""
            guard let project = ((try? Queries.getProjectLookup(id: projectId)) ?? nil) else { return .notFound }
            return jsonResponse(health(for: project.deployUrl))
        }
    }

    private static func deploymentHistory(for project: Queries.ProjectLookup) -> [DeploymentEntry] {
        guard let cli = targetCLI[project.deployTarget], cliInstalled(cli) else { return [] }
        switch project.deployTarget {
        case "vercel":
            return vercelHistory(path: project.path)
        case "cloudflare":
            return wranglerHistory(path: project.path)
        case "netlify":
            return netlifyHistory(path: project.path)
        case "railway":
            return railwayHistory(path: project.path)
        case "flyio":
            return flyHistory(path: project.path, deployUrl: project.deployUrl)
        default:
            return []
        }
    }

    private static func triggerDeployment(for project: Queries.ProjectLookup, environment: String) {
        switch project.deployTarget {
        case "vercel":
            var args = ["vercel"]
            if environment == "production" { args.append("--prod") }
            _ = runDetached(args, cwd: project.path)
        case "cloudflare":
            _ = runDetached(["wrangler", "deploy"], cwd: project.path)
        case "netlify":
            var args = ["netlify", "deploy"]
            if environment == "production" { args.append("--prod") }
            _ = runDetached(args, cwd: project.path)
        case "railway":
            _ = runDetached(["railway", "up"], cwd: project.path)
        case "flyio":
            _ = runDetached(["flyctl", "deploy"], cwd: project.path)
        default:
            break
        }
    }

    private static func health(for deployURL: String?) -> HealthResponse {
        guard let deployURL, let url = URL(string: deployURL), ["http", "https"].contains(url.scheme?.lowercased() ?? "") else {
            return HealthResponse(url: deployURL, healthy: false, status: 0, responseTime: 0)
        }

        let semaphore = DispatchSemaphore(value: 0)
        var response = HealthResponse(url: deployURL, healthy: false, status: 0, responseTime: 0)
        let start = Date()
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 5
        let session = URLSession(configuration: config)
        let task = session.dataTask(with: url) { _, httpResponse, _ in
            let elapsed = Int(Date().timeIntervalSince(start) * 1000)
            if let http = httpResponse as? HTTPURLResponse {
                response = HealthResponse(url: deployURL, healthy: (200..<300).contains(http.statusCode), status: http.statusCode, responseTime: elapsed)
            }
            semaphore.signal()
        }
        task.resume()
        _ = semaphore.wait(timeout: .now() + 6)
        return response
    }

    private static func vercelHistory(path: String) -> [DeploymentEntry] {
        let result = runCommand(["vercel", "ls", "--json", "--limit", "10"], cwd: path)
        guard result.ok,
              let data = result.output.data(using: .utf8),
              let raw = try? JSONSerialization.jsonObject(with: data) else { return [] }
        let items: [[String: Any]]
        if let array = raw as? [[String: Any]] {
            items = array
        } else if let json = raw as? [String: Any] {
            items = (json["deployments"] as? [[String: Any]]) ?? (json["projects"] as? [[String: Any]]) ?? []
        } else {
            items = []
        }
        return items.map {
            DeploymentEntry(
                id: String(describing: $0["uid"] ?? $0["id"] ?? ""),
                url: $0["url"] as? String,
                status: ($0["state"] as? String) ?? (($0["readyState"] as? String) ?? "unknown"),
                environment: $0["target"] as? String ?? "preview",
                createdAt: $0["createdAt"] as? String ?? ($0["created"] as? String)
            )
        }
    }

    private static func wranglerHistory(path: String) -> [DeploymentEntry] {
        let result = runCommand(["wrangler", "deployments", "list", "--json"], cwd: path)
        guard result.ok,
              let data = result.output.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) else { return [] }
        let items = (json as? [[String: Any]]) ?? ((json as? [String: Any])?["items"] as? [[String: Any]]) ?? []
        return items.map {
            DeploymentEntry(
                id: String(describing: $0["id"] ?? ""),
                url: $0["url"] as? String,
                status: "ready",
                environment: "production",
                createdAt: $0["created_on"] as? String ?? ($0["createdAt"] as? String)
            )
        }
    }

    private static func netlifyHistory(path: String) -> [DeploymentEntry] {
        let result = runCommand(["netlify", "api", "listSiteDeploys", "--data", #"{"per_page":10}"#], cwd: path)
        guard result.ok,
              let data = result.output.data(using: .utf8),
              let items = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return [] }
        return items.map {
            DeploymentEntry(
                id: String(describing: $0["id"] ?? ""),
                url: $0["deploy_ssl_url"] as? String ?? ($0["deploy_url"] as? String),
                status: $0["state"] as? String ?? "unknown",
                environment: (($0["context"] as? String) == "production") ? "production" : "preview",
                createdAt: $0["created_at"] as? String
            )
        }
    }

    private static func railwayHistory(path: String) -> [DeploymentEntry] {
        let result = runCommand(["railway", "status", "--json"], cwd: path)
        guard result.ok,
              let data = result.output.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [] }
        let items: [[String: Any]]
        if let deployments = json["deployments"] as? [[String: Any]] {
            items = deployments
        } else if let deployment = json["deployment"] as? [String: Any] {
            items = [deployment]
        } else {
            items = []
        }
        return items.map {
            DeploymentEntry(
                id: String(String(describing: $0["id"] ?? "").prefix(12)),
                url: $0["url"] as? String ?? ($0["staticUrl"] as? String),
                status: $0["status"] as? String ?? "unknown",
                environment: "production",
                createdAt: $0["createdAt"] as? String
            )
        }
    }

    private static func flyHistory(path: String, deployUrl: String?) -> [DeploymentEntry] {
        let result = runCommand(["flyctl", "releases", "--json"], cwd: path)
        guard result.ok,
              let data = result.output.data(using: .utf8),
              let items = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return [] }
        return items.prefix(10).map {
            DeploymentEntry(
                id: String(describing: $0["ID"] ?? $0["id"] ?? ""),
                url: deployUrl,
                status: $0["Status"] as? String ?? ($0["status"] as? String) ?? "unknown",
                environment: "production",
                createdAt: $0["CreatedAt"] as? String ?? ($0["created_at"] as? String)
            )
        }
    }

    private static func cliInstalled(_ name: String) -> Bool {
        runCommand(["/usr/bin/which", name], cwd: "/").ok
    }

    private static func requestBody(_ request: HttpRequest) -> [String: Any] {
        (try? JSONSerialization.jsonObject(with: Data(request.body), options: [])) as? [String: Any] ?? [:]
    }

    private static func runDetached(_ args: [String], cwd: String) -> Bool {
        let process = Process()
        process.currentDirectoryURL = URL(fileURLWithPath: cwd)
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = args
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        do {
            try process.run()
            return true
        } catch {
            return false
        }
    }

    private static func runCommand(_ args: [String], cwd: String) -> (ok: Bool, output: String) {
        let process = Process()
        let stdout = Pipe()
        let stderr = Pipe()
        process.standardOutput = stdout
        process.standardError = stderr
        process.currentDirectoryURL = URL(fileURLWithPath: cwd)
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = args

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
}
