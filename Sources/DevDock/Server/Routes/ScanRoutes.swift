import Foundation
import Swifter

/// `POST /api/scan` — triggers a full project rescan.
///
/// Runs synchronously on Swifter's handler thread. Scanning ~50-100 projects
/// takes ~1-2 seconds; if it becomes noticeably slow we can move to a
/// background `DispatchQueue` and return 202 Accepted immediately.
enum ScanRoutes {
    static func mount(on server: HttpServer) {
        server["/api/scan"] = { request in
            guard request.method == "POST" else { return .raw(405, "Method Not Allowed", nil, nil) }
            let count = Scanner.runScan()
            return jsonResponse(["ok": true, "scanned": count])
        }
    }
}
