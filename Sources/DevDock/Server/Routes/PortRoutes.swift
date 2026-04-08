import Foundation
import Swifter

enum PortRoutes {
    private struct PortEntry: Codable {
        let port: Int
        let pid: Int
        let command: String
        let user: String
        let projectId: String?
        let projectName: String?
    }

    private struct PortConflict: Codable {
        let port: Int
        let type: String
    }

    static func mount(on server: HttpServer) {
        server["/api/ports/all"] = { _ in
            jsonResponse(allPorts())
        }

        server["/api/ports/conflicts"] = { _ in
            jsonResponse(conflicts())
        }
    }

    private static func allPorts() -> [PortEntry] {
        let output = runCommand(["/usr/sbin/lsof", "-iTCP", "-sTCP:LISTEN", "-P", "-n"], cwd: "/").output
        var ports = parseLsof(output)
        let projects = (try? Queries.getProjects()) ?? []

        var portMap: [Int: (String, String)] = [:]
        for project in projects {
            if let port = project.devPort {
                portMap[port] = (project.id, project.name)
            }
        }

        for index in ports.indices {
            if let match = portMap[ports[index].port] {
                ports[index] = PortEntry(
                    port: ports[index].port,
                    pid: ports[index].pid,
                    command: ports[index].command,
                    user: ports[index].user,
                    projectId: match.0,
                    projectName: match.1
                )
            }
        }
        return ports
    }

    private static func conflicts() -> [PortConflict] {
        let projects = (try? Queries.getProjects()) ?? []
        var assignments: [Int: [String]] = [:]
        for project in projects {
            guard let port = project.devPort else { continue }
            assignments[port, default: []].append(project.id)
        }

        var results: [PortConflict] = []
        for (port, ids) in assignments where ids.count > 1 {
            results.append(PortConflict(port: port, type: "duplicate"))
        }
        return results.sorted { $0.port < $1.port }
    }

    private static func parseLsof(_ output: String) -> [PortEntry] {
        let lines = output.split(separator: "\n", omittingEmptySubsequences: true).dropFirst()
        var seen = Set<Int>()
        var ports: [PortEntry] = []

        for line in lines {
            let parts = line.split(whereSeparator: \.isWhitespace).map(String.init)
            guard parts.count >= 9 else { continue }
            guard let pid = Int(parts[1]) else { continue }
            let command = parts[0]
            let user = parts[2]
            // Find the NAME token (e.g. "*:3000", "127.0.0.1:2778", "[::1]:2777")
            // then extract the trailing :NNNN port — anchored to end so IPv6
            // addresses like [::1] don't get parsed as port 1.
            let name = parts.first { $0.range(of: #":(\d+)$"#, options: .regularExpression) != nil } ?? ""
            guard let port = firstMatch(in: name, pattern: #":(\d+)$"#), !seen.contains(port) else { continue }
            seen.insert(port)
            ports.append(PortEntry(port: port, pid: pid, command: command, user: user, projectId: nil, projectName: nil))
        }

        return ports.sorted { $0.port < $1.port }
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
            return (false, "")
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
}
