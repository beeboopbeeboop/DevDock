import Foundation

actor DevDockAPIClient {
    static let shared = DevDockAPIClient()

    private let baseURL = "http://localhost:3070/api"
    private let session: URLSession

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 2
        config.timeoutIntervalForResource = 5
        self.session = URLSession(configuration: config)
    }

    func checkHealth() async -> Bool {
        guard let url = URL(string: "\(baseURL)/health") else { return false }
        do {
            let (_, response) = try await session.data(from: url)
            return (response as? HTTPURLResponse)?.statusCode == 200
        } catch {
            return false
        }
    }

    func fetchRunningProcesses() async -> [RunningProcess] {
        guard let url = URL(string: "\(baseURL)/actions/running-processes") else { return [] }
        do {
            let (data, _) = try await session.data(from: url)
            return try JSONDecoder().decode([RunningProcess].self, from: data)
        } catch {
            return []
        }
    }

    func fetchProfiles() async -> [StartupProfile] {
        guard let url = URL(string: "\(baseURL)/profiles") else { return [] }
        do {
            let (data, _) = try await session.data(from: url)
            return try JSONDecoder().decode([StartupProfile].self, from: data)
        } catch {
            return []
        }
    }

    func stopProcess(projectId: String) async -> Bool {
        guard let url = URL(string: "\(baseURL)/actions/terminal-stop/\(projectId)") else { return false }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        do {
            let (_, response) = try await session.data(for: request)
            return (response as? HTTPURLResponse)?.statusCode == 200
        } catch {
            return false
        }
    }

    func startProfile(id: String) async -> ProfileActionResponse? {
        guard let url = URL(string: "\(baseURL)/profiles/\(id)/start") else { return nil }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = "{}".data(using: .utf8)
        do {
            let (data, _) = try await session.data(for: request)
            return try JSONDecoder().decode(ProfileActionResponse.self, from: data)
        } catch {
            return nil
        }
    }

    func stopProfile(id: String) async -> ProfileActionResponse? {
        guard let url = URL(string: "\(baseURL)/profiles/\(id)/stop") else { return nil }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = "{}".data(using: .utf8)
        do {
            let (data, _) = try await session.data(for: request)
            return try JSONDecoder().decode(ProfileActionResponse.self, from: data)
        } catch {
            return nil
        }
    }

    // MARK: - Command Palette APIs

    func fetchProjects() async -> [DevDockProject] {
        guard let url = URL(string: "\(baseURL)/projects") else { return [] }
        do {
            let (data, _) = try await session.data(from: url)
            return try JSONDecoder().decode([DevDockProject].self, from: data)
        } catch {
            return []
        }
    }

    func executeVerb(verb: String, target: String) async -> VerbResponse? {
        guard let url = URL(string: "\(baseURL)/verbs/do") else { return nil }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 15 // verbs can take a moment
        let body: [String: Any] = ["verb": verb, "target": target, "source": "menubar"]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        do {
            let (data, _) = try await session.data(for: request)
            return try JSONDecoder().decode(VerbResponse.self, from: data)
        } catch {
            return nil
        }
    }

    func startDev(projectId: String) async -> Bool {
        guard let url = URL(string: "\(baseURL)/actions/start-dev") else { return false }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = ["projectId": projectId]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        do {
            let (_, response) = try await session.data(for: request)
            return (response as? HTTPURLResponse)?.statusCode == 200
        } catch {
            return false
        }
    }

    // MARK: - Project Actions

    func openEditor(projectId: String, editor: String) async {
        await postAction("open-editor", body: ["projectId": projectId, "editor": editor])
    }

    func openTerminal(projectId: String) async {
        await postAction("open-terminal", body: ["projectId": projectId])
    }

    func openFinder(projectId: String) async {
        await postAction("open-finder", body: ["projectId": projectId])
    }

    func gitPull(path: String) async {
        await postAction("git-pull", body: ["path": path])
    }

    func stopDev(projectId: String) async {
        guard let url = URL(string: "\(baseURL)/actions/terminal-stop/\(projectId)") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        _ = try? await session.data(for: request)
    }

    private func postAction(_ action: String, body: [String: Any]) async {
        guard let url = URL(string: "\(baseURL)/actions/\(action)") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        _ = try? await session.data(for: request)
    }
}
