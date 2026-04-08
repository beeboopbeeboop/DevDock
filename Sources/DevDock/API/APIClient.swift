import Foundation

actor APIClient {
    static let shared = APIClient()

    let baseURL = "http://localhost:3070/api"
    let session: URLSession

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 2
        config.timeoutIntervalForResource = 5
        self.session = URLSession(configuration: config)
    }

    // MARK: - Generic Helpers

    func get<T: Decodable>(_ path: String, timeout: TimeInterval? = nil) async -> T? {
        guard let url = URL(string: "\(baseURL)\(path)") else { return nil }
        var request = URLRequest(url: url)
        if let timeout { request.timeoutInterval = timeout }
        do {
            let (data, _) = try await session.data(for: request)
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            return nil
        }
    }

    func getArray<T: Decodable>(_ path: String) async -> [T] {
        guard let url = URL(string: "\(baseURL)\(path)") else { return [] }
        do {
            let (data, _) = try await session.data(from: url)
            return try JSONDecoder().decode([T].self, from: data)
        } catch {
            return []
        }
    }

    func post<T: Decodable>(_ path: String, body: [String: Any] = [:], timeout: TimeInterval? = nil) async -> T? {
        guard let url = URL(string: "\(baseURL)\(path)") else { return nil }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let timeout { request.timeoutInterval = timeout }
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        do {
            let (data, _) = try await session.data(for: request)
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            return nil
        }
    }

    func postOk(_ path: String, body: [String: Any] = [:]) async -> Bool {
        guard let url = URL(string: "\(baseURL)\(path)") else { return false }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        do {
            let (_, response) = try await session.data(for: request)
            return (response as? HTTPURLResponse)?.statusCode == 200
        } catch {
            return false
        }
    }

    func postFire(_ path: String, body: [String: Any] = [:]) async {
        guard let url = URL(string: "\(baseURL)\(path)") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        _ = try? await session.data(for: request)
    }

    func patchOk(_ path: String, body: [String: Any] = [:]) async -> Bool {
        guard let url = URL(string: "\(baseURL)\(path)") else { return false }
        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        do {
            let (_, response) = try await session.data(for: request)
            return (response as? HTTPURLResponse)?.statusCode == 200
        } catch {
            return false
        }
    }

    // MARK: - Health

    func checkHealth() async -> Bool {
        guard let url = URL(string: "\(baseURL)/health") else { return false }
        do {
            let (_, response) = try await session.data(from: url)
            return (response as? HTTPURLResponse)?.statusCode == 200
        } catch {
            return false
        }
    }

    // MARK: - Processes

    func fetchRunningProcesses() async -> [RunningProcess] {
        await getArray("/actions/running-processes")
    }

    // MARK: - Profiles

    func fetchProfiles() async -> [StartupProfile] {
        await getArray("/profiles")
    }

    func startProfile(id: String) async -> ProfileActionResponse? {
        await post("/profiles/\(id)/start", body: [:])
    }

    func stopProfile(id: String) async -> ProfileActionResponse? {
        await post("/profiles/\(id)/stop", body: [:])
    }

    // MARK: - Projects

    func fetchProjects(filters: [String: String] = [:]) async -> [DevDockProject] {
        var query = ""
        if !filters.isEmpty {
            let parts = filters.map { "\($0.key)=\($0.value)" }.joined(separator: "&")
            query = "?\(parts)"
        }
        return await getArray("/projects\(query)")
    }

    func updateOverride(projectId: String, overrides: [String: Any]) async -> Bool {
        await patchOk("/projects/\(projectId)/override", body: overrides)
    }

    func toggleFavorite(projectId: String) async -> Bool {
        await postOk("/projects/\(projectId)/favorite")
    }

    func reorderProjects(ids: [String]) async -> Bool {
        await postOk("/projects/reorder", body: ["ids": ids])
    }

    func triggerScan() async -> Bool {
        await postOk("/scan")
    }

    // MARK: - Verbs

    func executeVerb(verb: String, target: String) async -> VerbResponse? {
        await post("/verbs/do", body: ["verb": verb, "target": target, "source": "app"], timeout: 15)
    }

    // MARK: - Dev Server

    func startDev(projectId: String) async -> Bool {
        await postOk("/actions/start-dev", body: ["projectId": projectId])
    }

    func stopDev(projectId: String) async -> Bool {
        await postOk("/actions/terminal-stop/\(projectId)")
    }

    // MARK: - Shell (native — no server needed)

    func execCommand(command: String) async -> (ok: Bool, output: String) {
        await withCheckedContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                let process = Process()
                process.executableURL = URL(fileURLWithPath: "/bin/zsh")
                // -i = interactive (loads aliases), -l = login (loads .zprofile/.zshrc), -c = run command
                process.arguments = ["-i", "-l", "-c", command]
                process.environment = ProcessInfo.processInfo.environment

                let stdoutPipe = Pipe()
                let stderrPipe = Pipe()
                process.standardOutput = stdoutPipe
                process.standardError = stderrPipe

                do {
                    try process.run()
                    process.waitUntilExit()

                    let stdoutData = stdoutPipe.fileHandleForReading.readDataToEndOfFile()
                    let stderrData = stderrPipe.fileHandleForReading.readDataToEndOfFile()
                    let stdout = String(data: stdoutData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
                    let stderr = String(data: stderrData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

                    let ok = process.terminationStatus == 0
                    let output = stdout.isEmpty ? (stderr.isEmpty ? (ok ? "Done" : "Failed") : stderr) : stdout
                    continuation.resume(returning: (ok, output))
                } catch {
                    continuation.resume(returning: (false, error.localizedDescription))
                }
            }
        }
    }

    // MARK: - Project Actions (native — no server needed)

    private func projectPath(for projectId: String) -> String? {
        // Resolve project path from known projects via scan paths in config
        let configPath = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".devdock/config.json")
        guard let data = try? Data(contentsOf: configPath),
              let config = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let scanPaths = config["scanPaths"] as? [String] else { return nil }
        for scanPath in scanPaths {
            let candidate = (scanPath as NSString).appendingPathComponent(projectId)
            if FileManager.default.fileExists(atPath: candidate) { return candidate }
        }
        return nil
    }

    func openEditor(projectId: String, editor: String) async {
        guard let path = projectPath(for: projectId) else { return }
        _ = await execCommand(command: "\(editor) \"\(path)\"")
    }

    func openTerminal(projectId: String) async {
        guard let path = projectPath(for: projectId) else { return }
        _ = await execCommand(command: "open -a Terminal \"\(path)\"")
    }

    func openFinder(projectId: String) async {
        guard let path = projectPath(for: projectId) else { return }
        _ = await execCommand(command: "open \"\(path)\"")
    }

    func gitPull(path: String) async {
        _ = await execCommand(command: "cd \"\(path)\" && git pull")
    }

    // MARK: - Active Projects (Context Engine)

    func fetchActiveProjects() async -> [(projectId: String, projectName: String, score: Double)] {
        guard let url = URL(string: "\(baseURL)/timeline/active?range=today") else { return [] }
        do {
            let (data, _) = try await session.data(from: url)
            if let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
                return arr.compactMap { item in
                    guard let id = item["projectId"] as? String,
                          let name = item["projectName"] as? String,
                          let score = item["score"] as? Double else { return nil }
                    return (id, name, score)
                }
            }
        } catch {}
        return []
    }
}
