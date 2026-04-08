import Foundation
import SwiftUI

/// Manages SSE terminal streaming for a single project.
@MainActor
@Observable
class TerminalState {
    var lines: [AttributedString] = []
    var isConnected = false
    var isRunning = false
    var autoRestart = false
    var restartCount = 0

    private var streamTask: Task<Void, Never>?
    private var statusTask: Task<Void, Never>?
    private let projectId: String
    private let maxLines = 1000

    init(projectId: String) {
        self.projectId = projectId
    }

    func start() {
        // Fetch existing buffer
        Task {
            await fetchBuffer()
        }

        // Start SSE stream
        streamTask?.cancel()
        streamTask = Task {
            let baseURL = APIClient.shared.baseURL
            guard let url = URL(string: "\(baseURL)/actions/terminal-stream/\(projectId)") else { return }
            isConnected = true

            let sseClient = SSEClient()
            for await line in await sseClient.stream(url: url) {
                if Task.isCancelled { break }
                let parsed = ANSIParser.parse(line)
                lines.append(parsed)
                if lines.count > maxLines {
                    lines.removeFirst(lines.count - maxLines)
                }
            }
            isConnected = false
        }

        // Poll status
        startStatusPolling()
    }

    func stop() {
        streamTask?.cancel()
        streamTask = nil
        statusTask?.cancel()
        statusTask = nil
        isConnected = false
    }

    func clear() {
        lines = []
    }

    private func fetchBuffer() async {
        guard let url = URL(string: "\(APIClient.shared.baseURL)/actions/terminal-buffer/\(projectId)") else { return }
        do {
            let config = URLSessionConfiguration.default
            config.timeoutIntervalForRequest = 5
            let session = URLSession(configuration: config)
            let (data, _) = try await session.data(from: url)
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let bufferLines = json["lines"] as? [String] {
                lines = bufferLines.map { ANSIParser.parse($0) }
            }
        } catch {}
    }

    private func startStatusPolling() {
        statusTask?.cancel()
        statusTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(3))
                if Task.isCancelled { break }
                guard let url = URL(string: "\(APIClient.shared.baseURL)/actions/terminal-status/\(projectId)") else { continue }
                do {
                    let config = URLSessionConfiguration.default
                    config.timeoutIntervalForRequest = 2
                    let session = URLSession(configuration: config)
                    let (data, _) = try await session.data(from: url)
                    if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                        isRunning = json["running"] as? Bool ?? false
                        autoRestart = json["autoRestart"] as? Bool ?? false
                        restartCount = json["restartCount"] as? Int ?? 0
                    }
                } catch {}
            }
        }
    }

    nonisolated func cleanup() {
        // Called before discarding — tasks auto-cancel when references are dropped
    }
}
