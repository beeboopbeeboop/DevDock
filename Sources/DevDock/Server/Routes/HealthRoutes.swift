import Foundation
import Swifter

/// GET /api/health
///
/// Matches the shape the old Bun backend returned so `APIClient.checkHealth()` and
/// `AppState.poll()` continue to work without changes.
enum HealthRoutes {
    static func mount(on server: HttpServer) {
        server["/api/health"] = { _ in
            let payload: [String: Any] = [
                "status": "ok",
                "name": "DevDock",
                "version": "0.1.0",
            ]
            guard let data = try? JSONSerialization.data(withJSONObject: payload),
                  let json = String(data: data, encoding: .utf8)
            else {
                return .internalServerError
            }
            return .raw(200, "OK", ["Content-Type": "application/json"]) { writer in
                try? writer.write(Array(json.utf8))
            }
        }
    }
}
