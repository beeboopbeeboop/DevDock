import Foundation
import Swifter

enum InsightsRoutes {
    static func mount(on server: HttpServer) {
        server["/api/insights"] = { request in
            let range = request.queryParams.first { $0.0 == "range" }?.1 ?? "7d"
            let snapshots = (try? Queries.getSnapshots(range: range)) ?? []
            return jsonResponse(snapshots)
        }

        server["/api/insights/latest"] = { _ in
            let latest = (try? Queries.getSnapshots(range: "24h").last)
            if let latest {
                return jsonResponse(latest)
            }
            return .raw(200, "OK", ["Content-Type": "application/json"]) { writer in
                try? writer.write(Array("null".utf8))
            }
        }
    }
}
