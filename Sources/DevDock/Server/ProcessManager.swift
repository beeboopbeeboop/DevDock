import Foundation

final class ProcessManager {
    static let shared = ProcessManager()

    struct StatusSnapshot: Codable {
        let projectId: String
        let running: Bool
        let pid: Int?
        let startedAt: Int64
        let autoRestart: Bool
        let restartCount: Int
    }

    private struct ManagedProcess {
        var process: Process
        let projectId: String
        let projectPath: String
        let command: String
        var startedAt: Int64
        var autoRestart: Bool
        var restartCount: Int
        var crashTimes: [Date]
        var restarting: Bool
    }

    private let queue = DispatchQueue(label: "devdock.process-manager")
    private let maxBuffer = 500
    private let maxConcurrent = 20
    private let maxRestarts = 3
    private let restartWindow: TimeInterval = 5 * 60

    private var processes: [String: ManagedProcess] = [:]
    private var buffers: [String: [String]] = [:]
    private var statuses: [String: StatusSnapshot] = [:]

    func startProcess(projectId: String, path: String, command: String, autoRestart: Bool = false) -> Bool {
        guard Security.validateDevCommand(command).valid else { return false }

        return queue.sync {
            if processes.count >= maxConcurrent && processes[projectId] == nil {
                return false
            }

            if let existing = processes[projectId] {
                stop(process: existing.process, force: false)
                processes.removeValue(forKey: projectId)
            }

            guard let process = spawnProcess(projectId: projectId, path: path, command: command) else {
                return false
            }

            let now = nowMillis()
            let managed = ManagedProcess(
                process: process,
                projectId: projectId,
                projectPath: path,
                command: command,
                startedAt: now,
                autoRestart: autoRestart,
                restartCount: 0,
                crashTimes: [],
                restarting: false
            )
            processes[projectId] = managed
            statuses[projectId] = StatusSnapshot(
                projectId: projectId,
                running: true,
                pid: Int(process.processIdentifier),
                startedAt: now,
                autoRestart: autoRestart,
                restartCount: 0
            )
            buffers[projectId] = []
            Queries.recordActivity(projectId: projectId, signal: "server_start")
            wireIO(for: process, projectId: projectId)
            wireExit(for: process, projectId: projectId)
            return true
        }
    }

    func stopProcess(projectId: String) -> Bool {
        queue.sync {
            guard let managed = processes.removeValue(forKey: projectId) else {
                statuses[projectId] = StatusSnapshot(projectId: projectId, running: false, pid: nil, startedAt: statuses[projectId]?.startedAt ?? 0, autoRestart: false, restartCount: statuses[projectId]?.restartCount ?? 0)
                return false
            }

            stop(process: managed.process, force: false)
            appendLine(projectId: projectId, line: "[Process exited]")
            statuses[projectId] = StatusSnapshot(
                projectId: projectId,
                running: false,
                pid: nil,
                startedAt: managed.startedAt,
                autoRestart: false,
                restartCount: managed.restartCount
            )
            Queries.recordActivity(projectId: projectId, signal: "server_stop")
            SSEHub.shared.close(projectId: projectId)
            return true
        }
    }

    func getBuffer(projectId: String) -> [String] {
        queue.sync { buffers[projectId] ?? [] }
    }

    func getStatus(projectId: String) -> StatusSnapshot {
        queue.sync {
            statuses[projectId] ?? StatusSnapshot(projectId: projectId, running: false, pid: nil, startedAt: 0, autoRestart: false, restartCount: 0)
        }
    }

    func setAutoRestart(projectId: String, enabled: Bool) -> Bool {
        queue.sync {
            guard var managed = processes[projectId] else { return false }
            managed.autoRestart = enabled
            processes[projectId] = managed
            statuses[projectId] = StatusSnapshot(
                projectId: projectId,
                running: true,
                pid: Int(managed.process.processIdentifier),
                startedAt: managed.startedAt,
                autoRestart: enabled,
                restartCount: managed.restartCount
            )
            return true
        }
    }

    func getAllProcesses() -> [StatusSnapshot] {
        queue.sync {
            processes.values.map {
                StatusSnapshot(
                    projectId: $0.projectId,
                    running: true,
                    pid: Int($0.process.processIdentifier),
                    startedAt: $0.startedAt,
                    autoRestart: $0.autoRestart,
                    restartCount: $0.restartCount
                )
            }
            .sorted { $0.projectId < $1.projectId }
        }
    }

    func cleanup() {
        let active = queue.sync {
            let values = Array(processes.values)
            processes.removeAll()
            return values
        }
        for managed in active {
            stop(process: managed.process, force: true)
            SSEHub.shared.close(projectId: managed.projectId)
        }
        SSEHub.shared.closeAll()
    }

    private func spawnProcess(projectId: String, path: String, command: String) -> Process? {
        let process = Process()
        process.currentDirectoryURL = URL(fileURLWithPath: path)
        process.executableURL = URL(fileURLWithPath: "/bin/zsh")
        process.arguments = ["-lc", command]

        var environment = ProcessInfo.processInfo.environment
        let extraPath = [
            "/Users/jon/.bun/bin",
            "/Users/jon/.npm-global/bin",
            "/opt/homebrew/bin",
            "/usr/local/bin",
            environment["PATH"],
        ].compactMap { $0 }.joined(separator: ":")
        environment["PATH"] = extraPath
        process.environment = environment

        let stdout = Pipe()
        let stderr = Pipe()
        process.standardOutput = stdout
        process.standardError = stderr
        process.standardInput = nil

        do {
            try process.run()
            return process
        } catch {
            appendLine(projectId: projectId, line: "[Failed to start process: \(error.localizedDescription)]")
            return nil
        }
    }

    private func wireIO(for process: Process, projectId: String) {
        guard let stdout = process.standardOutput as? Pipe,
              let stderr = process.standardError as? Pipe else { return }

        stdout.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty else {
                handle.readabilityHandler = nil
                return
            }
            self?.handleOutput(data: data, projectId: projectId)
        }

        stderr.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty else {
                handle.readabilityHandler = nil
                return
            }
            self?.handleOutput(data: data, projectId: projectId)
        }
    }

    private func wireExit(for process: Process, projectId: String) {
        process.terminationHandler = { [weak self] proc in
            self?.handleTermination(projectId: projectId, process: proc)
        }
    }

    private func handleOutput(data: Data, projectId: String) {
        let text = String(data: data, encoding: .utf8) ?? String(decoding: data, as: UTF8.self)
        queue.async {
            let normalized = text.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
            let parts = normalized.split(separator: "\n", omittingEmptySubsequences: false)
            for part in parts {
                self.appendLine(projectId: projectId, line: String(part))
            }
        }
    }

    private func handleTermination(projectId: String, process: Process) {
        queue.async {
            guard var managed = self.processes[projectId],
                  managed.process.processIdentifier == process.processIdentifier else {
                return
            }

            let exitCode = Int(process.terminationStatus)
            let crashed = exitCode != 0

            if crashed {
                self.appendLine(projectId: projectId, line: "[Process crashed with exit code \(exitCode)]")
            } else {
                self.appendLine(projectId: projectId, line: "[Process exited]")
            }

            if crashed && managed.autoRestart {
                let now = Date()
                managed.crashTimes.append(now)
                managed.crashTimes = managed.crashTimes.filter { now.timeIntervalSince($0) < self.restartWindow }

                if managed.crashTimes.count <= self.maxRestarts {
                    managed.restarting = true
                    managed.restartCount += 1
                    self.processes[projectId] = managed
                    self.statuses[projectId] = StatusSnapshot(
                        projectId: projectId,
                        running: false,
                        pid: nil,
                        startedAt: managed.startedAt,
                        autoRestart: true,
                        restartCount: managed.restartCount
                    )

                    let delay = min(pow(2.0, Double(managed.restartCount - 1)), 30.0)
                    self.appendLine(projectId: projectId, line: "[Auto-restarting in \(Int(delay * 1000))ms (attempt \(managed.restartCount))...]")
                    self.scheduleRestart(managed, delay: delay)
                    return
                }

                self.appendLine(projectId: projectId, line: "[Auto-restart disabled — too many crashes]")
            }

            self.processes.removeValue(forKey: projectId)
            self.statuses[projectId] = StatusSnapshot(
                projectId: projectId,
                running: false,
                pid: nil,
                startedAt: managed.startedAt,
                autoRestart: false,
                restartCount: managed.restartCount
            )
            Queries.recordActivity(projectId: projectId, signal: "server_stop", metadata: ["exitCode": exitCode])
            SSEHub.shared.close(projectId: projectId)
        }
    }

    private func scheduleRestart(_ managed: ManagedProcess, delay: TimeInterval) {
        queue.asyncAfter(deadline: .now() + delay) {
            guard var current = self.processes[managed.projectId],
                  current.process.processIdentifier == managed.process.processIdentifier,
                  current.restarting else {
                return
            }

            guard let process = self.spawnProcess(projectId: current.projectId, path: current.projectPath, command: current.command) else {
                self.processes.removeValue(forKey: current.projectId)
                self.statuses[current.projectId] = StatusSnapshot(projectId: current.projectId, running: false, pid: nil, startedAt: current.startedAt, autoRestart: false, restartCount: current.restartCount)
                SSEHub.shared.close(projectId: current.projectId)
                return
            }

            current.process = process
            current.startedAt = self.nowMillis()
            current.restarting = false
            self.processes[current.projectId] = current
            self.statuses[current.projectId] = StatusSnapshot(
                projectId: current.projectId,
                running: true,
                pid: Int(process.processIdentifier),
                startedAt: current.startedAt,
                autoRestart: current.autoRestart,
                restartCount: current.restartCount
            )
            self.wireIO(for: process, projectId: current.projectId)
            self.wireExit(for: process, projectId: current.projectId)
        }
    }

    private func appendLine(projectId: String, line: String) {
        let trimmedLine = line
        var buffer = buffers[projectId] ?? []
        buffer.append(trimmedLine)
        if buffer.count > maxBuffer {
            buffer.removeFirst(buffer.count - maxBuffer)
        }
        buffers[projectId] = buffer
        if !trimmedLine.isEmpty {
            SSEHub.shared.publish(projectId: projectId, message: trimmedLine)
        }
    }

    private func stop(process: Process, force: Bool) {
        guard process.isRunning else { return }
        process.terminate()
        if !force {
            return
        }

        DispatchQueue.global().asyncAfter(deadline: .now() + 1) {
            if process.isRunning {
                kill(process.processIdentifier, SIGKILL)
            }
        }
    }

    private func nowMillis() -> Int64 {
        Int64(Date().timeIntervalSince1970 * 1000)
    }
}
