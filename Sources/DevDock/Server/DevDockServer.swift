import Foundation
import Swifter

/// In-process HTTP server for DevDock.
///
/// Replaces the old Bun/TypeScript backend at `src/server/index.ts`. Runs inside the
/// Swift menu bar app so DevDock is a single process — no LaunchAgent, no port-sync.
///
/// The existing `APIClient` hits `http://localhost:3070/api/*` exactly as before;
/// every route is mounted here in the same shape.
final class DevDockServer {
    static let shared = DevDockServer()

    private let server = HttpServer()
    private var isRunning = false
    private let port: UInt16

    private init(port: UInt16 = 3070) {
        self.port = port
    }

    // MARK: - Lifecycle

    func start() {
        guard !isRunning else { return }

        // Touch the DB once so migrations run on startup, not on first request.
        _ = Database.shared

        registerRoutes()

        do {
            try server.start(port, forceIPv4: true, priority: .default)
            isRunning = true
            NSLog("[DevDockServer] listening on http://localhost:\(port)")

            // Kick off initial scan in the background so the dashboard
            // populates shortly after launch.
            DispatchQueue.global(qos: .utility).async {
                let count = Scanner.runScan()
                NSLog("[DevDockServer] initial scan: \(count) projects")
            }
        } catch {
            NSLog("[DevDockServer] failed to bind port \(port): \(error.localizedDescription)")
        }
    }

    func stop() {
        guard isRunning else { return }
        server.stop()
        isRunning = false
        NSLog("[DevDockServer] stopped")
    }

    // MARK: - Route mounting
    private func registerRoutes() {
        HealthRoutes.mount(on: server)
        ProjectRoutes.mount(on: server)
        ScanRoutes.mount(on: server)
    }
}
