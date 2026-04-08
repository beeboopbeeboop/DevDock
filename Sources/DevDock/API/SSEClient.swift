import Foundation

/// Server-Sent Events client using URLSession.bytes
/// Used for terminal output streaming and Docker log streaming.
actor SSEClient {
    private var task: Task<Void, Never>?

    func stream(url: URL) -> AsyncStream<String> {
        AsyncStream { continuation in
            let task = Task {
                do {
                    var request = URLRequest(url: url)
                    request.timeoutInterval = 3600 // 1 hour — long-lived connection
                    let config = URLSessionConfiguration.default
                    config.timeoutIntervalForRequest = 3600
                    config.timeoutIntervalForResource = 3600
                    let session = URLSession(configuration: config)

                    let (bytes, response) = try await session.bytes(for: request)

                    guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                        continuation.finish()
                        return
                    }

                    for try await line in bytes.lines {
                        if Task.isCancelled { break }
                        if line.hasPrefix("data: ") {
                            let data = String(line.dropFirst(6))
                            continuation.yield(data)
                        }
                    }
                } catch {
                    // Connection closed or error — just finish
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in
                task.cancel()
            }
        }
    }

    func stop() {
        task?.cancel()
        task = nil
    }
}
