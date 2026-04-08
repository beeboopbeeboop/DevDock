import Foundation
import Swifter

enum DockerRoutes {
    private struct Container: Codable {
        let id: String
        let name: String
        let image: String
        let state: String
        let status: String
        let ports: String
    }

    private struct ContainersResponse: Codable {
        let available: Bool
        let containers: [Container]
    }

    static func mount(on server: HttpServer) {
        server["/api/docker/containers"] = { _ in
            guard dockerAvailable() else {
                return jsonResponse(ContainersResponse(available: false, containers: []))
            }
            return jsonResponse(ContainersResponse(available: true, containers: containers()))
        }

        for route in ["compose-up", "compose-down", "compose-restart"] {
            server["/api/docker/\(route)"] = { request in
                guard request.method == "POST" else { return .raw(405, "Method Not Allowed", nil, nil) }
                let body = requestBody(request)
                let check = requireValidPath(body["path"] as? String)
                guard check.valid else { return .badRequest(.text(check.error!)) }
                guard dockerAvailable() else { return .raw(503, "Service Unavailable", nil, nil) }
                guard let composeFile = findComposeFile(in: check.resolved!) else {
                    return .badRequest(.text("No compose file found"))
                }
                let args: [String]
                switch route {
                case "compose-up":
                    args = ["docker", "compose", "-f", composeFile, "up", "-d"]
                case "compose-down":
                    args = ["docker", "compose", "-f", composeFile, "down"]
                default:
                    args = ["docker", "compose", "-f", composeFile, "restart"]
                }
                let result = runCommand(args, cwd: check.resolved!)
                return jsonResponse(["ok": result.ok, "output": result.output])
            }
        }

        server["/api/docker/container-stop"] = { request in
            containerAction(request: request, action: "stop")
        }

        server["/api/docker/container-restart"] = { request in
            containerAction(request: request, action: "restart")
        }
    }

    private static func containerAction(request: HttpRequest, action: String) -> HttpResponse {
        guard request.method == "POST" else { return .raw(405, "Method Not Allowed", nil, nil) }
        let body = requestBody(request)
        let id = body["containerId"] as? String ?? ""
        guard isValidContainerId(id) else { return .badRequest(.text("Invalid containerId")) }
        guard dockerAvailable() else { return .raw(503, "Service Unavailable", nil, nil) }
        let result = runCommand(["docker", action, id], cwd: "/")
        return jsonResponse(["ok": result.ok, "output": result.output])
    }

    private static func containers() -> [Container] {
        let result = runCommand(["docker", "ps", "-a", "--format", "{{json .}}"], cwd: "/")
        guard result.ok else { return [] }

        return result.output
            .split(separator: "\n", omittingEmptySubsequences: true)
            .compactMap { line -> Container? in
                guard let data = line.data(using: .utf8),
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                    return nil
                }
                return Container(
                    id: json["ID"] as? String ?? "",
                    name: (json["Names"] as? String ?? "").replacingOccurrences(of: "/", with: ""),
                    image: json["Image"] as? String ?? "",
                    state: (json["State"] as? String ?? "exited").lowercased(),
                    status: json["Status"] as? String ?? "",
                    ports: json["Ports"] as? String ?? ""
                )
            }
    }

    private static func dockerAvailable() -> Bool {
        runCommand(["/usr/bin/env", "docker", "info"], cwd: "/").ok
    }

    private static func findComposeFile(in path: String) -> String? {
        ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"].first {
            FileManager.default.fileExists(atPath: (path as NSString).appendingPathComponent($0))
        }
    }

    private static func isValidContainerId(_ value: String) -> Bool {
        value.range(of: #"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$"#, options: .regularExpression) != nil
    }

    private static func requestBody(_ request: HttpRequest) -> [String: Any] {
        (try? JSONSerialization.jsonObject(with: Data(request.body), options: [])) as? [String: Any] ?? [:]
    }

    private static func requireValidPath(_ path: String?) -> (valid: Bool, resolved: String?, error: String?) {
        guard let path, !path.isEmpty else { return (false, nil, "path required") }
        let result = Security.validateProjectPath(path)
        return result.valid ? (true, result.resolved, nil) : (false, nil, result.error ?? "Invalid path")
    }

    private static func runCommand(_ args: [String], cwd: String) -> (ok: Bool, output: String) {
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
