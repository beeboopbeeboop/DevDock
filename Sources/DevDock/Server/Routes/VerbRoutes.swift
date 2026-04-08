import Foundation
import Swifter

enum VerbRoutes {
    private struct VerbStep: Codable {
        let step: String?
        let ok: Bool?
        let message: String?
    }

    private struct VerbResponse: Codable {
        let ok: Bool?
        let message: String?
        let error: String?
        let correction: Bool?
        let suggested: String?
        let steps: [VerbStep]?
    }

    private static let knownVerbs = ["reset", "start", "stop", "status", "logs", "open", "pull", "push", "commit", "deploy"]

    static func mount(on server: HttpServer) {
        server["/api/verbs/do"] = { request in
            guard request.method == "POST" else { return .raw(405, "Method Not Allowed", nil, nil) }
            let body = requestBody(request)
            let verb = (body["verb"] as? String ?? "").lowercased()
            guard !verb.isEmpty else { return .badRequest(.text("verb is required")) }

            if !knownVerbs.contains(verb) {
                if let suggestion = suggestVerb(verb) {
                    return jsonResponse(VerbResponse(ok: nil, message: nil, error: nil, correction: true, suggested: suggestion, steps: nil))
                }
                return jsonResponse(VerbResponse(ok: false, message: nil, error: "Unknown verb: \(verb)", correction: nil, suggested: nil, steps: nil))
            }

            let target = body["target"] as? String
            let projects = (try? Queries.getProjects()) ?? []
            let aliases = (try? Queries.getProjectAliases()) ?? [:]

            guard let project = resolveProject(target: target, projects: projects, aliases: aliases) else {
                return jsonResponse(VerbResponse(ok: false, message: nil, error: "Project not found", correction: nil, suggested: nil, steps: nil))
            }

            let response = execute(verb: verb, project: project, body: body)
            Queries.logCommand(
                projectId: project.id,
                verb: verb,
                args: nil,
                source: (body["source"] as? String) ?? "api",
                status: response.ok == true ? "ok" : "error",
                message: response.message
            )
            Queries.recordActivity(projectId: project.id, signal: "verb_exec", metadata: ["verb": verb, "ok": response.ok ?? false])
            return jsonResponse(response)
        }

        server["/api/verbs/aliases"] = { request in
            switch request.method {
            case "GET":
                return jsonResponse((try? Queries.getAllAliases()) ?? [])
            case "POST":
                let body = requestBody(request)
                let alias = (body["alias"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                let projectId = body["projectId"] as? String ?? ""
                guard !alias.isEmpty, !projectId.isEmpty else { return .badRequest(.text("alias and projectId required")) }
                let result = (try? Queries.setProjectAlias(projectId: projectId, alias: alias)) ?? (false, "Failed")
                return result.ok ? jsonResponse(["ok": true]) : .raw(409, "Conflict", ["Content-Type": "application/json"]) { writer in
                    let data = try? JSONSerialization.data(withJSONObject: ["error": result.error ?? "Conflict"])
                    try? writer.write(Array(data ?? Data()))
                }
            default:
                return .raw(405, "Method Not Allowed", nil, nil)
            }
        }

        server["/api/verbs/aliases/:alias"] = { request in
            guard request.method == "DELETE" else { return .raw(405, "Method Not Allowed", nil, nil) }
            let alias = request.params[":alias"] ?? ""
            return jsonResponse(["ok": ((try? Queries.removeProjectAlias(alias)) ?? false)])
        }

        server["/api/verbs/logs"] = { request in
            let project = request.queryParams.first { $0.0 == "project" }?.1
            let verb = request.queryParams.first { $0.0 == "verb" }?.1
            let limit = Int(request.queryParams.first { $0.0 == "limit" }?.1 ?? "50") ?? 50
            let since = request.queryParams.first { $0.0 == "since" }?.1
            let filters = Queries.CommandLogFilters(projectId: project, verb: verb, limit: limit, since: since)
            return jsonResponse((try? Queries.getCommandLogs(filters: filters)) ?? [])
        }
    }

    private static func execute(verb: String, project: Queries.ProjectResponse, body: [String: Any]) -> VerbResponse {
        var steps: [VerbStep] = []
        let validPath = Security.validateProjectPath(project.path)

        switch verb {
        case "start":
            guard validPath.valid, let command = project.devCommand, !command.isEmpty else {
                return VerbResponse(ok: false, message: "No dev command configured", error: nil, correction: nil, suggested: nil, steps: [VerbStep(step: "start", ok: false, message: "No dev command configured")])
            }
            let ok = ProcessManager.shared.startProcess(projectId: project.id, path: validPath.resolved, command: command)
            steps.append(VerbStep(step: "start", ok: ok, message: ok ? "Started \(project.name)" : "Failed to start \(project.name)"))
        case "stop":
            let stopped = ProcessManager.shared.stopProcess(projectId: project.id)
            if let port = project.devPort {
                _ = killPort(port)
            }
            steps.append(VerbStep(step: "stop", ok: true, message: stopped ? "Stopped \(project.name)" : "Not running"))
        case "status":
            let status = ProcessManager.shared.getStatus(projectId: project.id)
            let message = status.running ? "Running (PID \(status.pid ?? 0))" : "Not running"
            steps.append(VerbStep(step: "status", ok: true, message: message))
        case "logs":
            let buffer = ProcessManager.shared.getBuffer(projectId: project.id)
            steps.append(VerbStep(step: "logs", ok: true, message: buffer.isEmpty ? "No logs available" : buffer.joined(separator: "\n")))
        case "open":
            if validPath.valid {
                _ = runCommand(["/usr/bin/open", validPath.resolved], cwd: validPath.resolved)
                steps.append(VerbStep(step: "open", ok: true, message: "Opened \(project.name)"))
            } else {
                steps.append(VerbStep(step: "open", ok: false, message: "Invalid project path"))
            }
        case "pull":
            let result = validPath.valid ? runCommand(["/usr/bin/env", "git", "pull"], cwd: validPath.resolved) : (false, "Invalid path")
            steps.append(VerbStep(step: "pull", ok: result.0, message: result.1.isEmpty ? "Pulled" : result.1))
        case "push":
            let result = validPath.valid ? runCommand(["/usr/bin/env", "git", "push"], cwd: validPath.resolved) : (false, "Invalid path")
            steps.append(VerbStep(step: "push", ok: result.0, message: result.1.isEmpty ? "Pushed" : result.1))
        case "commit":
            let message = (body["message"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard validPath.valid, !message.isEmpty else {
                return VerbResponse(ok: false, message: nil, error: "No commit message", correction: nil, suggested: nil, steps: [VerbStep(step: "commit", ok: false, message: "No commit message")])
            }
            _ = runCommand(["/usr/bin/env", "git", "add", "-A"], cwd: validPath.resolved)
            let result = runCommand(["/usr/bin/env", "git", "commit", "-m", message], cwd: validPath.resolved)
            steps.append(VerbStep(step: "commit", ok: result.0, message: result.1.isEmpty ? "Committed" : result.1))
        case "deploy":
            steps.append(VerbStep(step: "deploy", ok: false, message: "Deploy via verb system not implemented; use Deploy tab"))
        case "reset":
            if let port = project.devPort {
                _ = killPort(port)
                steps.append(VerbStep(step: "kill-port", ok: true, message: "Cleared port \(port)"))
            }
            _ = ProcessManager.shared.stopProcess(projectId: project.id)
            if let command = project.devCommand, validPath.valid {
                let started = ProcessManager.shared.startProcess(projectId: project.id, path: validPath.resolved, command: command)
                steps.append(VerbStep(step: "start-dev", ok: started, message: started ? "Started \(project.name)" : "Failed to restart"))
            } else {
                steps.append(VerbStep(step: "start-dev", ok: false, message: "No dev command configured"))
            }
        default:
            steps.append(VerbStep(step: verb, ok: false, message: "Unknown verb"))
        }

        let ok = steps.allSatisfy { $0.ok ?? false }
        let message = steps.compactMap(\.message).joined(separator: " -> ")
        return VerbResponse(ok: ok, message: message, error: ok ? nil : message, correction: nil, suggested: nil, steps: steps)
    }

    private static func resolveProject(target: String?, projects: [Queries.ProjectResponse], aliases: [String: String]) -> Queries.ProjectResponse? {
        guard let target = target?.trimmingCharacters(in: .whitespacesAndNewlines), !target.isEmpty else { return nil }
        if let aliasProjectId = aliases[target.lowercased()] {
            return projects.first(where: { $0.id == aliasProjectId })
        }
        if let exact = projects.first(where: { $0.id == target || $0.name.caseInsensitiveCompare(target) == .orderedSame }) {
            return exact
        }
        return projects
            .map { ($0, score(project: $0, target: target)) }
            .filter { $0.1 > 0 }
            .sorted { $0.1 > $1.1 }
            .first?.0
    }

    private static func score(project: Queries.ProjectResponse, target: String) -> Int {
        let q = target.lowercased()
        let candidates = [project.id, project.name, (project.path as NSString).lastPathComponent] + project.aliases
        return candidates.map { fuzzyScore(query: q, target: $0.lowercased()) }.max() ?? 0
    }

    private static func fuzzyScore(query: String, target: String) -> Int {
        if target == query { return 100 }
        if target.hasPrefix(query) { return 90 }
        if target.contains(query) { return 70 }
        var qi = query.startIndex
        for char in target where qi < query.endIndex {
            if char == query[qi] {
                qi = query.index(after: qi)
            }
        }
        return qi == query.endIndex ? 50 : 0
    }

    private static func suggestVerb(_ input: String) -> String? {
        var best: (String, Int)?
        for verb in knownVerbs {
            let distance = levenshtein(input, verb)
            if distance <= 2 && (best == nil || distance < best!.1) {
                best = (verb, distance)
            }
        }
        return best?.0
    }

    private static func levenshtein(_ lhs: String, _ rhs: String) -> Int {
        let lhsChars = Array(lhs)
        let rhsChars = Array(rhs)
        var matrix = Array(repeating: Array(repeating: 0, count: rhsChars.count + 1), count: lhsChars.count + 1)
        for i in 0...lhsChars.count { matrix[i][0] = i }
        for j in 0...rhsChars.count { matrix[0][j] = j }
        if !lhsChars.isEmpty && !rhsChars.isEmpty {
            for i in 1...lhsChars.count {
                for j in 1...rhsChars.count {
                    matrix[i][j] = min(
                        matrix[i - 1][j] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j - 1] + (lhsChars[i - 1] == rhsChars[j - 1] ? 0 : 1)
                    )
                }
            }
        }
        return matrix[lhsChars.count][rhsChars.count]
    }

    private static func killPort(_ port: Int) -> Int {
        let result = runCommand(["/usr/sbin/lsof", "-ti", ":\(port)"], cwd: "/")
        let pids = result.1.split(separator: "\n").compactMap { Int32($0) }
        for pid in pids {
            kill(pid_t(pid), SIGKILL)
        }
        return pids.count
    }

    private static func requestBody(_ request: HttpRequest) -> [String: Any] {
        (try? JSONSerialization.jsonObject(with: Data(request.body), options: [])) as? [String: Any] ?? [:]
    }

    private static func runCommand(_ args: [String], cwd: String) -> (Bool, String) {
        let process = Process()
        let stdout = Pipe()
        let stderr = Pipe()
        process.standardOutput = stdout
        process.standardError = stderr
        process.currentDirectoryURL = URL(fileURLWithPath: cwd)
        process.executableURL = URL(fileURLWithPath: args[0])
        process.arguments = Array(args.dropFirst())

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
