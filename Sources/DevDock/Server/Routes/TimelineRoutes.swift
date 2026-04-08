import Foundation
import Swifter

enum TimelineRoutes {
    static func mount(on server: HttpServer) {
        server["/api/timeline"] = { request in
            let range = request.queryParams.first { $0.0 == "range" }?.1 ?? "today"
            let project = request.queryParams.first { $0.0 == "project" }?.1
            return jsonResponse((try? Queries.getTimeline(range: range, projectId: project)) ?? [])
        }

        server["/api/timeline/active"] = { request in
            let range = request.queryParams.first { $0.0 == "range" }?.1 ?? "today"
            return jsonResponse((try? Queries.getActiveProjects(range: range)) ?? [])
        }
    }
}
