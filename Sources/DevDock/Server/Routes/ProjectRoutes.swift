import Foundation
import Swifter

/// `/api/projects/*` routes.
///
/// Contracts match `APIClient.swift` + extensions:
///
/// - `GET /api/projects?search=…&type=…&status=…&tag=…&sort=…` → `[DevDockProject]`
/// - `PATCH /api/projects/:id/override` (body: `{customName?, customStatus?, customTags?, customDevCommand?, notes?}`) → 200 OK
/// - `POST /api/projects/:id/favorite` → 200 OK
/// - `POST /api/projects/reorder` (body: `{ids: [String]}`) → 200 OK
enum ProjectRoutes {
    static func mount(on server: HttpServer) {
        server["/api/projects"] = { request in
            var filters = Queries.ProjectFilters()
            for (key, value) in request.queryParams {
                switch key {
                case "search": filters.search = value
                case "type": filters.type = value
                case "status": filters.status = value
                case "tag": filters.tag = value
                case "sort": filters.sort = value
                default: break
                }
            }

            do {
                let projects = try Queries.getProjects(filters: filters)
                return jsonResponse(projects)
            } catch {
                return .internalServerError
            }
        }

        // PATCH /api/projects/:id/override
        server["/api/projects/:id/override"] = { request in
            guard request.method == "PATCH" else { return .raw(405, "Method Not Allowed", nil, nil) }
            guard let id = request.params[":id"], !id.isEmpty else { return .badRequest(.text("missing id")) }

            let body = (try? JSONSerialization.jsonObject(with: Data(request.body)) as? [String: Any]) ?? [:]
            var input = Queries.OverrideInput()
            if let v = body["customName"] as? String { input.customName = v }
            if let v = body["customStatus"] as? String { input.customStatus = v }
            if let v = body["customTags"] as? [String] { input.customTags = v }
            if let v = body["customDevCommand"] as? String {
                input.customDevCommand = .some(v)
            } else if body["customDevCommand"] is NSNull {
                input.customDevCommand = .some(nil)
            }
            if let v = body["notes"] as? String { input.notes = v }

            do {
                try Queries.updateProjectOverride(projectId: id, input: input)
                return .ok(.text("ok"))
            } catch {
                return .internalServerError
            }
        }

        // POST /api/projects/:id/favorite
        server["/api/projects/:id/favorite"] = { request in
            guard request.method == "POST" else { return .raw(405, "Method Not Allowed", nil, nil) }
            guard let id = request.params[":id"], !id.isEmpty else { return .badRequest(.text("missing id")) }
            do {
                let newValue = try Queries.toggleFavorite(projectId: id)
                return jsonResponse(["isFavorite": newValue])
            } catch {
                return .internalServerError
            }
        }

        // POST /api/projects/reorder
        server["/api/projects/reorder"] = { request in
            guard request.method == "POST" else { return .raw(405, "Method Not Allowed", nil, nil) }
            let body = (try? JSONSerialization.jsonObject(with: Data(request.body)) as? [String: Any]) ?? [:]
            guard let ids = body["ids"] as? [String] else {
                return .badRequest(.text("missing ids"))
            }
            do {
                try Queries.setSortOrder(ids: ids)
                return .ok(.text("ok"))
            } catch {
                return .internalServerError
            }
        }
    }
}

// MARK: - JSON response helper

/// Returns a Swifter `HttpResponse` with a JSON-encoded Encodable body.
///
/// Uses `.raw` rather than `.ok(.json(…))` because Swifter's built-in
/// `.json` path uses JSONSerialization and mangles our Encodable types.
func jsonResponse<T: Encodable>(_ value: T) -> HttpResponse {
    let encoder = JSONEncoder()
    guard let data = try? encoder.encode(value) else {
        return .internalServerError
    }
    let bytes = Array(data)
    return .raw(200, "OK", ["Content-Type": "application/json"]) { writer in
        try? writer.write(bytes)
    }
}

/// Overload for `[String: Any]` payloads (non-Encodable dicts).
func jsonResponse(_ dict: [String: Any]) -> HttpResponse {
    guard let data = try? JSONSerialization.data(withJSONObject: dict) else {
        return .internalServerError
    }
    let bytes = Array(data)
    return .raw(200, "OK", ["Content-Type": "application/json"]) { writer in
        try? writer.write(bytes)
    }
}
