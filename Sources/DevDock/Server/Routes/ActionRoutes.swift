import Foundation
import Swifter

enum ActionRoutes {
    private struct TerminalBufferResponse: Codable {
        let lines: [String]
    }

    private struct TerminalActionResponse: Codable {
        let ok: Bool
        let error: String?

        init(ok: Bool, error: String? = nil) {
            self.ok = ok
            self.error = error
        }
    }

    private struct PortCheckResponse: Codable {
        let port: Int
        let running: Bool
    }

    private struct GitStatusFile: Codable {
        let path: String
        let status: String
    }

    private struct GitStatusResponse: Codable {
        let staged: [GitStatusFile]
        let unstaged: [GitStatusFile]
    }

    private struct GitLogEntry: Codable {
        let hash: String
        let short: String
        let message: String
        let author: String
        let ago: String
        let insertions: Int?
        let deletions: Int?
        let filesChanged: Int?
    }

    private struct GitCommitResponse: Codable {
        let ok: Bool
        let hash: String?
        let output: String?
        let error: String?
    }

    private struct GitPushResponse: Codable {
        let ok: Bool
        let output: String
    }

    private struct GitBranchesResponse: Codable {
        let current: String
        let branches: [String]
    }

    private struct GitDiffResponse: Codable {
        let diff: String
        let truncated: Bool
    }

    private struct GitStashEntry: Codable {
        let ref: String
        let message: String
    }

    private struct FilesResponse: Codable {
        let files: [FileEntry]
        let extStats: [String: FileStat]
    }

    private struct FileEntry: Codable {
        let name: String
        let path: String
        let size: Int
        let isDir: Bool
        let ext: String
        let children: [FileEntry]?
    }

    private struct FileStat: Codable {
        let count: Int
        let size: Int
    }

    private struct DepsPackage: Codable {
        let name: String
        let current: String
        let wanted: String
        let latest: String
        let type: String
        let severity: String
    }

    private struct DepsResponse: Codable {
        let packages: [DepsPackage]
        let total: Int
        let major: Int
        let minor: Int
        let patch: Int
    }

    private struct SearchResult: Codable {
        let projectName: String
        let projectId: String
        let projectType: String
        let projectPath: String
        let file: String
        let line: Int
        let text: String
    }

    private struct SearchResponse: Codable {
        let results: [SearchResult]
        let total: Int
        let truncated: Bool
    }

    private static let fileIgnoreNames: Set<String> = [
        "node_modules", ".git", ".next", "dist", "build", ".cache", ".turbo",
        ".vercel", ".DS_Store", "__pycache__", "coverage"
    ]

    private static let searchIgnoreNames: Set<String> = [
        "node_modules", ".git", "dist", "build", ".next", ".cache",
        ".turbo", ".vercel", "coverage", "__pycache__", ".DS_Store"
    ]

    private static let searchSkipExtensions: Set<String> = [
        ".lock", ".min.js", ".min.css", ".map", ".woff", ".woff2",
        ".ttf", ".otf", ".eot", ".png", ".jpg", ".jpeg", ".gif",
        ".svg", ".ico", ".mp3", ".mp4", ".webm", ".zip", ".tar",
        ".gz", ".pdf", ".db", ".sqlite", ".sqlite3"
    ]

    private static let maxSearchResults = 100
    private static let maxMatchesPerFile = 3
    private static let maxSearchFileSize = 1_000_000

    static func mount(on server: HttpServer) {
        server["/api/actions/start-dev"] = { request in
            guard request.method == "POST" else { return methodNotAllowed() }
            let body = requestBody(request)
            guard let projectId = body["projectId"] as? String, !projectId.isEmpty else {
                return .badRequest(.text("projectId required"))
            }
            guard let project = ((try? Queries.getProjectLookup(id: projectId)) ?? nil) else {
                return .notFound
            }
            guard let command = project.devCommand, !command.isEmpty else {
                return .badRequest(.text("No dev command found"))
            }
            let pathCheck = Security.validateProjectPath(project.path)
            guard pathCheck.valid else { return .badRequest(.text(pathCheck.error ?? "Invalid path")) }

            let autoRestart = body["autoRestart"] as? Bool ?? false
            let ok = ProcessManager.shared.startProcess(projectId: projectId, path: pathCheck.resolved, command: command, autoRestart: autoRestart)
            return jsonResponse(TerminalActionResponse(ok: ok, error: ok ? nil : "Failed to start process"))
        }

        server["/api/actions/terminal-stream/:projectId"] = { request in
            let projectId = request.params[":projectId"] ?? ""
            guard !projectId.isEmpty else { return .badRequest(.text("missing project id")) }
            let (listenerId, listener) = SSEHub.shared.subscribe(projectId: projectId)
            return .raw(200, "OK", [
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            ]) { writer in
                listener.stream(to: writer)
                SSEHub.shared.unsubscribe(projectId: projectId, listenerId: listenerId)
            }
        }

        server["/api/actions/terminal-buffer/:projectId"] = { request in
            let projectId = request.params[":projectId"] ?? ""
            return jsonResponse(TerminalBufferResponse(lines: ProcessManager.shared.getBuffer(projectId: projectId)))
        }

        server["/api/actions/terminal-stop/:projectId"] = { request in
            guard request.method == "POST" else { return methodNotAllowed() }
            let projectId = request.params[":projectId"] ?? ""
            return jsonResponse(TerminalActionResponse(ok: ProcessManager.shared.stopProcess(projectId: projectId)))
        }

        server["/api/actions/terminal-status/:projectId"] = { request in
            let projectId = request.params[":projectId"] ?? ""
            return jsonResponse(ProcessManager.shared.getStatus(projectId: projectId))
        }

        server["/api/actions/auto-restart/:projectId"] = { request in
            guard request.method == "PATCH" else { return methodNotAllowed() }
            let body = requestBody(request)
            let projectId = request.params[":projectId"] ?? ""
            let enabled = body["enabled"] as? Bool ?? false
            return jsonResponse(TerminalActionResponse(ok: ProcessManager.shared.setAutoRestart(projectId: projectId, enabled: enabled)))
        }

        server["/api/actions/running-processes"] = { _ in
            jsonResponse(ProcessManager.shared.getAllProcesses())
        }

        server["/api/actions/git-log"] = { request in
            let check = requireValidPath(query(request, key: "path"))
            guard check.valid else { return .badRequest(.text(check.error!)) }
            let result = runCommand(["git", "log", "--oneline", "--shortstat", "-n", "15", "--format=%H|%h|%s|%an|%ar"], cwd: check.resolved!)
            guard result.ok else { return jsonResponse([GitLogEntry]()) }

            var commits: [GitLogEntry] = []
            var current: GitLogEntry?
            for line in result.output.split(separator: "\n", omittingEmptySubsequences: false).map(String.init) {
                guard !line.isEmpty else { continue }
                if line.contains("|") {
                    if let current { commits.append(current) }
                    let parts = line.split(separator: "|", omittingEmptySubsequences: false).map(String.init)
                    current = GitLogEntry(
                        hash: parts[safe: 0] ?? "",
                        short: parts[safe: 1] ?? "",
                        message: parts[safe: 2] ?? "",
                        author: parts[safe: 3] ?? "",
                        ago: parts[safe: 4] ?? "",
                        insertions: 0,
                        deletions: 0,
                        filesChanged: 0
                    )
                } else if let open = current {
                    current = GitLogEntry(
                        hash: open.hash,
                        short: open.short,
                        message: open.message,
                        author: open.author,
                        ago: open.ago,
                        insertions: firstMatch(in: line, pattern: #"(\d+) insertions?\(\+\)"#),
                        deletions: firstMatch(in: line, pattern: #"(\d+) deletions?\(-\)"#),
                        filesChanged: firstMatch(in: line, pattern: #"(\d+) files? changed"#)
                    )
                }
            }
            if let current { commits.append(current) }
            return jsonResponse(commits)
        }

        server["/api/actions/git-status"] = { request in
            let check = requireValidPath(query(request, key: "path"))
            guard check.valid else { return .badRequest(.text(check.error!)) }
            let result = runCommand(["git", "status", "--porcelain"], cwd: check.resolved!)
            guard result.ok || result.exitCode == 0 else {
                return jsonResponse(GitStatusResponse(staged: [], unstaged: []))
            }

            var staged: [GitStatusFile] = []
            var unstaged: [GitStatusFile] = []
            for line in result.output.split(separator: "\n").map(String.init) {
                guard line.count >= 3 else { continue }
                let chars = Array(line)
                let stagedCode = String(chars[0])
                let unstagedCode = String(chars[1])
                let file = String(line.dropFirst(3)).trimmingCharacters(in: .whitespaces)
                let displayFile: String
                if file.contains(" -> "), let rhs = file.components(separatedBy: " -> ").last {
                    displayFile = rhs.trimmingCharacters(in: .whitespaces)
                } else {
                    displayFile = file
                }
                if stagedCode != " " && stagedCode != "?" {
                    staged.append(GitStatusFile(path: displayFile, status: stagedCode))
                }
                if unstagedCode != " " && unstagedCode != "?" {
                    unstaged.append(GitStatusFile(path: displayFile, status: unstagedCode))
                }
                if stagedCode == "?" && unstagedCode == "?" {
                    unstaged.append(GitStatusFile(path: displayFile, status: "?"))
                }
            }
            return jsonResponse(GitStatusResponse(staged: staged, unstaged: unstaged))
        }

        server["/api/actions/git-stage"] = { request in
            guard request.method == "POST" else { return methodNotAllowed() }
            let body = requestBody(request)
            let check = requireValidPath(body["path"] as? String)
            guard check.valid else { return .badRequest(.text(check.error!)) }
            guard let files = body["files"] as? [String] else { return .badRequest(.text("files required")) }
            let filesCheck = Security.validateGitFiles(files)
            guard filesCheck.valid else { return .badRequest(.text(filesCheck.error!)) }
            let unstage = body["unstage"] as? Bool ?? false
            let args = unstage ? ["git", "restore", "--staged", "--"] + files : ["git", "add", "--"] + files
            let result = runCommand(args, cwd: check.resolved!)
            return jsonResponse(TerminalActionResponse(ok: result.ok, error: result.ok ? nil : result.output))
        }

        server["/api/actions/git-commit"] = { request in
            guard request.method == "POST" else { return methodNotAllowed() }
            let body = requestBody(request)
            let check = requireValidPath(body["path"] as? String)
            guard check.valid else { return .badRequest(.text(check.error!)) }
            let message = Security.sanitizeCommitMessage(body["message"] as? String ?? "")
            guard !message.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                return .badRequest(.text("Message required"))
            }
            let result = runCommand(["git", "commit", "-m", message], cwd: check.resolved!)
            let hash = firstCapturedString(in: result.output, pattern: #"\[.+? ([a-f0-9]+)\]"#)
            return jsonResponse(GitCommitResponse(ok: result.ok, hash: hash, output: result.output, error: result.ok ? nil : result.output))
        }

        server["/api/actions/git-push"] = { request in
            guard request.method == "POST" else { return methodNotAllowed() }
            let body = requestBody(request)
            let check = requireValidPath(body["path"] as? String)
            guard check.valid else { return .badRequest(.text(check.error!)) }
            let result = runCommand(["git", "push"], cwd: check.resolved!)
            return jsonResponse(GitPushResponse(ok: result.ok, output: result.output))
        }

        server["/api/actions/git-pull"] = { request in
            guard request.method == "POST" else { return methodNotAllowed() }
            let body = requestBody(request)
            let check = requireValidPath(body["path"] as? String)
            guard check.valid else { return .badRequest(.text(check.error!)) }
            let result = runCommand(["git", "pull"], cwd: check.resolved!)
            return jsonResponse(GitPushResponse(ok: result.ok, output: result.output))
        }

        server["/api/actions/git-branches"] = { request in
            let check = requireValidPath(query(request, key: "path"))
            guard check.valid else { return .badRequest(.text(check.error!)) }
            let result = runCommand(["git", "branch", "-a", "--format=%(refname:short)|%(HEAD)"], cwd: check.resolved!)
            guard result.ok else { return jsonResponse(GitBranchesResponse(current: "", branches: [])) }

            var current = ""
            var names: [String] = []
            for line in result.output.split(separator: "\n").map(String.init) {
                let parts = line.split(separator: "|", omittingEmptySubsequences: false).map(String.init)
                let rawName = parts[safe: 0]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                let head = parts[safe: 1]?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                guard !rawName.isEmpty, !rawName.contains("HEAD") else { continue }
                let localName = rawName.hasPrefix("origin/") ? String(rawName.dropFirst("origin/".count)) : rawName
                if head == "*" {
                    current = localName
                }
                if !names.contains(localName) {
                    names.append(localName)
                }
            }
            return jsonResponse(GitBranchesResponse(current: current, branches: names))
        }

        server["/api/actions/git-checkout"] = { request in
            guard request.method == "POST" else { return methodNotAllowed() }
            let body = requestBody(request)
            let check = requireValidPath(body["path"] as? String)
            guard check.valid else { return .badRequest(.text(check.error!)) }
            let branch = body["branch"] as? String ?? ""
            guard Security.validateBranchName(branch) else { return .badRequest(.text("Invalid branch name")) }
            let create = body["create"] as? Bool ?? false
            let args = create ? ["git", "checkout", "-b", branch] : ["git", "checkout", branch]
            let result = runCommand(args, cwd: check.resolved!)
            return jsonResponse(TerminalActionResponse(ok: result.ok, error: result.ok ? nil : result.output))
        }

        server["/api/actions/git-stash"] = { request in
            guard request.method == "POST" else { return methodNotAllowed() }
            let body = requestBody(request)
            let check = requireValidPath(body["path"] as? String)
            guard check.valid else { return .badRequest(.text(check.error!)) }
            let message = body["message"] as? String
            var args = ["git", "stash", "push"]
            if let message, !message.isEmpty {
                args += ["-m", message]
            }
            let result = runCommand(args, cwd: check.resolved!)
            return jsonResponse(TerminalActionResponse(ok: result.ok, error: result.ok ? nil : result.output))
        }

        server["/api/actions/git-stash-pop"] = { request in
            guard request.method == "POST" else { return methodNotAllowed() }
            let body = requestBody(request)
            let check = requireValidPath(body["path"] as? String)
            guard check.valid else { return .badRequest(.text(check.error!)) }
            if let index = body["index"] as? Int {
                let result = runCommand(["git", "stash", "pop", "stash@{\(index)}"], cwd: check.resolved!)
                return jsonResponse(TerminalActionResponse(ok: result.ok, error: result.ok ? nil : result.output))
            }
            let result = runCommand(["git", "stash", "pop"], cwd: check.resolved!)
            return jsonResponse(TerminalActionResponse(ok: result.ok, error: result.ok ? nil : result.output))
        }

        server["/api/actions/git-stash-list"] = { request in
            let check = requireValidPath(query(request, key: "path"))
            guard check.valid else { return .badRequest(.text(check.error!)) }
            let result = runCommand(["git", "stash", "list"], cwd: check.resolved!)
            guard result.ok else { return jsonResponse([GitStashEntry]()) }
            let entries = result.output.split(separator: "\n").map(String.init).compactMap { line -> GitStashEntry? in
                let parts = line.split(separator: ":", maxSplits: 2, omittingEmptySubsequences: false).map(String.init)
                guard parts.count >= 2 else { return nil }
                return GitStashEntry(ref: parts[0], message: parts.dropFirst(1).joined(separator: ":").trimmingCharacters(in: .whitespaces))
            }
            return jsonResponse(entries)
        }

        server["/api/actions/git-diff"] = { request in
            let check = requireValidPath(query(request, key: "path"))
            guard check.valid else { return .badRequest(.text(check.error!)) }
            let staged = query(request, key: "staged") == "true"
            let file = query(request, key: "file")
            if let file {
                let fileCheck = Security.validateGitFiles([file])
                guard fileCheck.valid else { return .badRequest(.text(fileCheck.error!)) }
            }
            var args = ["git", "diff"]
            if staged { args.append("--cached") }
            args.append("--")
            if let file { args.append(file) }
            let result = runCommand(args, cwd: check.resolved!)
            let maxLength = 50_000
            let truncated = result.output.count > maxLength
            let diff = truncated ? String(result.output.prefix(maxLength)) : result.output
            return jsonResponse(GitDiffResponse(diff: diff, truncated: truncated))
        }

        server["/api/actions/port-check/:port"] = { request in
            guard let portString = request.params[":port"], let port = Int(portString), Security.validatePort(port) else {
                return .badRequest(.text("Invalid port"))
            }
            return jsonResponse(PortCheckResponse(port: port, running: checkLocalPort(port)))
        }

        server["/api/actions/port-kill"] = { request in
            guard request.method == "POST" else { return methodNotAllowed() }
            let body = requestBody(request)
            guard let port = body["port"] as? Int, Security.validatePort(port) else { return .badRequest(.text("Invalid port")) }
            let pids = lsofPids(for: port)
            for pid in pids {
                kill(pid_t(pid), SIGKILL)
            }
            return jsonResponse(["ok": true, "killed": pids.count])
        }

        server["/api/actions/files"] = { request in
            let check = requireValidPath(query(request, key: "path"))
            guard check.valid else { return .badRequest(.text(check.error!)) }
            let root = check.resolved!
            let files = scanFiles(in: root, rootPath: root, depth: 0)
            var extStats: [String: FileStat] = [:]
            accumulateExtStats(files: files, stats: &extStats)
            return jsonResponse(FilesResponse(files: files, extStats: extStats))
        }

        server["/api/actions/deps-outdated"] = { request in
            let check = requireValidPath(query(request, key: "path"))
            guard check.valid else { return .badRequest(.text(check.error!)) }
            let result = runCommand(["npm", "outdated", "--json"], cwd: check.resolved!)
            let parsed = parseOutdatedPackages(result.output)
            return jsonResponse(parsed)
        }

        server["/api/actions/env-audit"] = { _ in
            jsonResponse(auditIssues())
        }

        server["/api/actions/search"] = { request in
            let q = query(request, key: "q")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let glob = query(request, key: "glob")?.trimmingCharacters(in: .whitespacesAndNewlines)
            guard q.count >= 2 else { return jsonResponse(SearchResponse(results: [], total: 0, truncated: false)) }

            let projects = (try? Queries.getProjects()) ?? []
            var results: [SearchResult] = []
            let queryLower = q.lowercased()
            for project in projects {
                searchDirectory(
                    directory: project.path,
                    project: project,
                    projectRoot: project.path,
                    query: q,
                    queryLower: queryLower,
                    glob: glob,
                    results: &results,
                    depth: 0
                )
                if results.count >= maxSearchResults { break }
            }
            results.sort {
                let lhsExact = $0.text.contains(q) ? 0 : 1
                let rhsExact = $1.text.contains(q) ? 0 : 1
                if lhsExact != rhsExact { return lhsExact < rhsExact }
                if $0.projectName != $1.projectName { return $0.projectName < $1.projectName }
                if $0.file != $1.file { return $0.file < $1.file }
                return $0.line < $1.line
            }
            return jsonResponse(SearchResponse(results: results, total: results.count, truncated: results.count >= maxSearchResults))
        }
    }

    private static func requestBody(_ request: HttpRequest) -> [String: Any] {
        (try? JSONSerialization.jsonObject(with: Data(request.body), options: [])) as? [String: Any] ?? [:]
    }

    private static func query(_ request: HttpRequest, key: String) -> String? {
        request.queryParams.first { $0.0 == key }?.1
    }

    private static func methodNotAllowed() -> HttpResponse {
        .raw(405, "Method Not Allowed", nil, nil)
    }

    private static func requireValidPath(_ path: String?) -> (valid: Bool, resolved: String?, error: String?) {
        guard let path, !path.isEmpty else { return (false, nil, "path required") }
        let result = Security.validateProjectPath(path)
        return result.valid ? (true, result.resolved, nil) : (false, nil, result.error ?? "Invalid path")
    }

    private static func runCommand(_ args: [String], cwd: String) -> (ok: Bool, output: String, exitCode: Int32) {
        let process = Process()
        let stdout = Pipe()
        let stderr = Pipe()
        process.standardOutput = stdout
        process.standardError = stderr
        process.currentDirectoryURL = URL(fileURLWithPath: cwd)
        process.executableURL = URL(fileURLWithPath: args[0].hasPrefix("/") ? args[0] : "/usr/bin/env")
        process.arguments = args[0].hasPrefix("/") ? Array(args.dropFirst()) : args

        do {
            try process.run()
            process.waitUntilExit()
            let out = String(data: stdout.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            let err = String(data: stderr.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            let output = (out + err).trimmingCharacters(in: .whitespacesAndNewlines)
            return (process.terminationStatus == 0, output, process.terminationStatus)
        } catch {
            return (false, error.localizedDescription, 1)
        }
    }

    private static func firstMatch(in string: String, pattern: String) -> Int? {
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: string, range: NSRange(location: 0, length: string.utf16.count)),
              match.numberOfRanges > 1,
              let range = Range(match.range(at: 1), in: string) else {
            return nil
        }
        return Int(string[range])
    }

    private static func firstCapturedString(in string: String, pattern: String) -> String? {
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: string, range: NSRange(location: 0, length: string.utf16.count)),
              match.numberOfRanges > 1,
              let range = Range(match.range(at: 1), in: string) else {
            return nil
        }
        return String(string[range])
    }

    private static func checkLocalPort(_ port: Int) -> Bool {
        let semaphore = DispatchSemaphore(value: 0)
        var running = false
        guard let url = URL(string: "http://127.0.0.1:\(port)") else { return false }
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 1.5
        let session = URLSession(configuration: config)
        let task = session.dataTask(with: url) { _, response, _ in
            if let http = response as? HTTPURLResponse {
                running = http.statusCode < 500
            }
            semaphore.signal()
        }
        task.resume()
        _ = semaphore.wait(timeout: .now() + 2)
        return running
    }

    private static func lsofPids(for port: Int) -> [Int32] {
        let result = runCommand(["/usr/sbin/lsof", "-ti", ":\(port)"], cwd: "/")
        return result.output
            .split(separator: "\n")
            .compactMap { Int32($0.trimmingCharacters(in: .whitespacesAndNewlines)) }
    }

    private static func scanFiles(in directory: String, rootPath: String, depth: Int) -> [FileEntry] {
        guard depth <= 3 else { return [] }
        let resolvedRoot = (rootPath as NSString).standardizingPath
        let resolvedDirectory = (directory as NSString).standardizingPath
        guard resolvedDirectory.hasPrefix(resolvedRoot) else { return [] }

        guard let entries = try? FileManager.default.contentsOfDirectory(atPath: resolvedDirectory) else {
            return []
        }

        return entries
            .filter { !$0.hasPrefix(".") || $0 == ".env.example" }
            .filter { !fileIgnoreNames.contains($0) }
            .compactMap { name -> FileEntry? in
                let fullPath = (resolvedDirectory as NSString).appendingPathComponent(name)
                guard let attrs = try? FileManager.default.attributesOfItem(atPath: fullPath) else { return nil }
                let type = attrs[.type] as? FileAttributeType
                let isDir = type == .typeDirectory
                let relativePath = fullPath.replacingOccurrences(of: resolvedRoot, with: "")
                if isDir {
                    let children = scanFiles(in: fullPath, rootPath: rootPath, depth: depth + 1)
                    let totalSize = children.reduce(0) { $0 + $1.size }
                    return FileEntry(name: name, path: relativePath, size: totalSize, isDir: true, ext: "", children: children)
                }
                let size = (attrs[.size] as? NSNumber)?.intValue ?? 0
                let ext = URL(fileURLWithPath: name).pathExtension
                return FileEntry(name: name, path: relativePath, size: size, isDir: false, ext: ext, children: nil)
            }
            .sorted {
                if $0.isDir != $1.isDir { return $0.isDir && !$1.isDir }
                return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
            }
    }

    private static func accumulateExtStats(files: [FileEntry], stats: inout [String: FileStat]) {
        for file in files {
            if file.isDir {
                accumulateExtStats(files: file.children ?? [], stats: &stats)
                continue
            }
            guard !file.ext.isEmpty else { continue }
            let current = stats[file.ext] ?? FileStat(count: 0, size: 0)
            stats[file.ext] = FileStat(count: current.count + 1, size: current.size + file.size)
        }
    }

    private static func parseOutdatedPackages(_ output: String) -> DepsResponse {
        guard !output.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let data = output.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: [String: Any]] else {
            return DepsResponse(packages: [], total: 0, major: 0, minor: 0, patch: 0)
        }

        var packages: [DepsPackage] = []
        var major = 0
        var minor = 0
        var patch = 0

        for (name, info) in json {
            let current = info["current"] as? String ?? "0.0.0"
            let wanted = info["wanted"] as? String ?? current
            let latest = info["latest"] as? String ?? current
            let type = info["type"] as? String ?? "dependencies"
            let severity = versionSeverity(current: current, latest: latest)
            switch severity {
            case "major": major += 1
            case "minor": minor += 1
            default: patch += 1
            }
            packages.append(DepsPackage(name: name, current: current, wanted: wanted, latest: latest, type: type, severity: severity))
        }

        packages.sort {
            severityRank($0.severity) < severityRank($1.severity)
        }
        return DepsResponse(packages: packages, total: packages.count, major: major, minor: minor, patch: patch)
    }

    private static func auditIssues() -> [[String: String]] {
        let projects = (try? Queries.getProjects()) ?? []
        let fm = FileManager.default
        var issues: [[String: String]] = []

        for project in projects {
            let envExample = (project.path as NSString).appendingPathComponent(".env.example")
            let envFile = (project.path as NSString).appendingPathComponent(".env")
            let gitignore = (project.path as NSString).appendingPathComponent(".gitignore")

            let hasExample = fm.fileExists(atPath: envExample)
            let hasEnv = fm.fileExists(atPath: envFile)

            if hasExample && !hasEnv {
                issues.append([
                    "projectId": project.id,
                    "projectName": project.name,
                    "issue": "missing-env",
                    "severity": "warning",
                    "detail": ".env.example exists but no .env",
                ])
            }

            if hasEnv, let content = try? String(contentsOfFile: envFile), content.contains("=") {
                let emptySecretKeys = content
                    .split(separator: "\n")
                    .compactMap { line -> String? in
                        let trimmed = line.trimmingCharacters(in: .whitespaces)
                        guard !trimmed.isEmpty, !trimmed.hasPrefix("#"), let eq = trimmed.firstIndex(of: "=") else { return nil }
                        let key = String(trimmed[..<eq]).trimmingCharacters(in: .whitespaces)
                        let value = String(trimmed[trimmed.index(after: eq)...]).trimmingCharacters(in: .whitespaces)
                        let sensitivity = key.uppercased()
                        let looksSecret = ["SECRET", "TOKEN", "KEY", "PASSWORD", "AUTH", "OPENAI", "ANTHROPIC"].contains { sensitivity.contains($0) }
                        return looksSecret && value.isEmpty ? key : nil
                    }
                if !emptySecretKeys.isEmpty {
                    issues.append([
                        "projectId": project.id,
                        "projectName": project.name,
                        "issue": "empty-secrets",
                        "severity": "error",
                        "detail": emptySecretKeys.joined(separator: ", "),
                    ])
                }
            }

            if hasEnv {
                if let ignoreContent = try? String(contentsOfFile: gitignore) {
                    let ignored = ignoreContent.split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.contains {
                        [".env", ".env*", ".env.*", "*.env"].contains($0)
                    }
                    if !ignored {
                        issues.append([
                            "projectId": project.id,
                            "projectName": project.name,
                            "issue": "env-not-gitignored",
                            "severity": "error",
                            "detail": ".env exists but is not in .gitignore",
                        ])
                    }
                } else {
                    issues.append([
                        "projectId": project.id,
                        "projectName": project.name,
                        "issue": "no-gitignore",
                        "severity": "warning",
                        "detail": "No .gitignore found",
                    ])
                }
            }
        }

        return issues
    }

    private static func versionSeverity(current: String, latest: String) -> String {
        let currentParts = current.split(separator: ".").compactMap { Int($0) }
        let latestParts = latest.split(separator: ".").compactMap { Int($0) }
        let currentMajor = currentParts[safe: 0] ?? 0
        let latestMajor = latestParts[safe: 0] ?? 0
        let currentMinor = currentParts[safe: 1] ?? 0
        let latestMinor = latestParts[safe: 1] ?? 0
        if latestMajor > currentMajor { return "major" }
        if latestMinor > currentMinor { return "minor" }
        return "patch"
    }

    private static func severityRank(_ value: String) -> Int {
        switch value {
        case "major": return 0
        case "minor": return 1
        default: return 2
        }
    }

    private static func searchDirectory(
        directory: String,
        project: Queries.ProjectResponse,
        projectRoot: String,
        query: String,
        queryLower: String,
        glob: String?,
        results: inout [SearchResult],
        depth: Int
    ) {
        guard depth <= 8, results.count < maxSearchResults else { return }
        guard let entries = try? FileManager.default.contentsOfDirectory(atPath: directory) else { return }

        for name in entries {
            if results.count >= maxSearchResults { return }
            if searchIgnoreNames.contains(name) || name.hasPrefix(".") { continue }

            let fullPath = (directory as NSString).appendingPathComponent(name)
            var isDirectory: ObjCBool = false
            guard FileManager.default.fileExists(atPath: fullPath, isDirectory: &isDirectory) else { continue }

            if isDirectory.boolValue {
                searchDirectory(directory: fullPath, project: project, projectRoot: projectRoot, query: query, queryLower: queryLower, glob: glob, results: &results, depth: depth + 1)
                continue
            }

            let ext = "." + URL(fileURLWithPath: name).pathExtension.lowercased()
            if searchSkipExtensions.contains(ext) { continue }
            if let glob, !matchesGlob(name: name, glob: glob) { continue }

            guard let attrs = try? FileManager.default.attributesOfItem(atPath: fullPath),
                  let size = (attrs[.size] as? NSNumber)?.intValue,
                  size > 0,
                  size <= maxSearchFileSize else { continue }

            guard let content = try? String(contentsOfFile: fullPath, encoding: .utf8) else { continue }
            let lines = content.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
            var matches = 0
            for (index, line) in lines.enumerated() {
                if line.lowercased().contains(queryLower) {
                    results.append(SearchResult(
                        projectName: project.name,
                        projectId: project.id,
                        projectType: project.type,
                        projectPath: projectRoot,
                        file: fullPath.replacingOccurrences(of: projectRoot + "/", with: ""),
                        line: index + 1,
                        text: String(line.trimmingCharacters(in: .whitespaces).prefix(200))
                    ))
                    matches += 1
                    if matches >= maxMatchesPerFile || results.count >= maxSearchResults {
                        break
                    }
                }
            }
        }
    }

    private static func matchesGlob(name: String, glob: String) -> Bool {
        if glob.hasPrefix("*.") {
            return name.hasSuffix(String(glob.dropFirst(1)))
        }
        return name == glob
    }
}

private extension Collection {
    subscript(safe index: Index) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
