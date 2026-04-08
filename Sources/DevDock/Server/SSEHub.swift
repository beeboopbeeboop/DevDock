import Foundation
import Swifter

final class SSEHub {
    static let shared = SSEHub()

    final class Listener {
        private let condition = NSCondition()
        private var queue: [String] = []
        private(set) var isClosed = false

        func push(_ message: String) {
            condition.lock()
            queue.append(message)
            condition.signal()
            condition.unlock()
        }

        func close() {
            condition.lock()
            isClosed = true
            condition.broadcast()
            condition.unlock()
        }

        func stream(to writer: HttpResponseBodyWriter) {
            while true {
                condition.lock()
                while queue.isEmpty && !isClosed {
                    let timeout = Date(timeIntervalSinceNow: 15)
                    let signaled = condition.wait(until: timeout)
                    if !signaled && queue.isEmpty && !isClosed {
                        condition.unlock()
                        try? writer.write(Array(": keepalive\n\n".utf8))
                        condition.lock()
                    }
                }

                let messages = queue
                queue.removeAll(keepingCapacity: true)
                let closed = isClosed
                condition.unlock()

                for message in messages {
                    if !writeEvent(message, writer: writer) {
                        return
                    }
                }

                if closed {
                    return
                }
            }
        }

        private func writeEvent(_ message: String, writer: HttpResponseBodyWriter) -> Bool {
            var payload = ""
            let lines = message.isEmpty ? [""] : message.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
            for line in lines {
                payload += "data: \(line)\n"
            }
            payload += "\n"
            do {
                try writer.write(Array(payload.utf8))
                return true
            } catch {
                return false
            }
        }
    }

    private let queue = DispatchQueue(label: "devdock.ssehub")
    private var listeners: [String: [UUID: Listener]] = [:]

    func subscribe(projectId: String) -> (UUID, Listener) {
        let id = UUID()
        let listener = Listener()
        queue.sync {
            var projectListeners = listeners[projectId] ?? [:]
            projectListeners[id] = listener
            listeners[projectId] = projectListeners
        }
        return (id, listener)
    }

    func unsubscribe(projectId: String, listenerId: UUID) {
        queue.sync {
            guard var projectListeners = listeners[projectId] else { return }
            projectListeners[listenerId]?.close()
            projectListeners.removeValue(forKey: listenerId)
            listeners[projectId] = projectListeners.isEmpty ? nil : projectListeners
        }
    }

    func publish(projectId: String, message: String) {
        let current = queue.sync { Array((listeners[projectId] ?? [:]).values) }
        for listener in current {
            listener.push(message)
        }
    }

    func close(projectId: String) {
        let current = queue.sync { listeners.removeValue(forKey: projectId) ?? [:] }
        for listener in current.values {
            listener.close()
        }
    }

    func closeAll() {
        let current = queue.sync {
            defer { listeners.removeAll() }
            return listeners
        }
        for group in current.values {
            for listener in group.values {
                listener.close()
            }
        }
    }
}
