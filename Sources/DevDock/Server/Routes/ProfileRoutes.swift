import Foundation
import Swifter

enum ProfileRoutes {
    private struct ProfileActionResponse: Codable {
        let started: [String]?
        let failed: [String]?
        let stopped: [String]?
    }

    static func mount(on server: HttpServer) {
        server["/api/profiles"] = { request in
            switch request.method {
            case "GET":
                return jsonResponse((try? Queries.getStartupProfiles()) ?? [])
            case "POST":
                let body = requestBody(request)
                let name = (body["name"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                let projectIds = body["projectIds"] as? [String] ?? []
                guard !name.isEmpty else { return .badRequest(.text("name required")) }
                guard let profile = try? Queries.createStartupProfile(name: name, projectIds: projectIds) else {
                    return .internalServerError
                }
                return jsonResponse(profile)
            default:
                return .raw(405, "Method Not Allowed", nil, nil)
            }
        }

        server["/api/profiles/:id"] = { request in
            let id = request.params[":id"] ?? ""
            switch request.method {
            case "PATCH":
                let body = requestBody(request)
                let name = (body["name"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                let projectIds = body["projectIds"] as? [String] ?? []
                guard !name.isEmpty else { return .badRequest(.text("name required")) }
                do {
                    try Queries.updateStartupProfile(id: id, name: name, projectIds: projectIds)
                    return jsonResponse(["ok": true])
                } catch {
                    return .internalServerError
                }
            case "DELETE":
                do {
                    try Queries.deleteStartupProfile(id: id)
                    return jsonResponse(["ok": true])
                } catch {
                    return .internalServerError
                }
            default:
                return .raw(405, "Method Not Allowed", nil, nil)
            }
        }

        server["/api/profiles/:id/start"] = { request in
            guard request.method == "POST" else { return .raw(405, "Method Not Allowed", nil, nil) }
            let id = request.params[":id"] ?? ""
            let profiles = (try? Queries.getStartupProfiles()) ?? []
            guard let profile = profiles.first(where: { $0.id == id }) else { return .notFound }
            var started: [String] = []
            var failed: [String] = []
            for projectId in profile.projectIds {
                guard let project = ((try? Queries.getProjectLookup(id: projectId)) ?? nil) else {
                    failed.append(projectId)
                    continue
                }
                guard let command = project.devCommand, !command.isEmpty else {
                    failed.append(projectId)
                    continue
                }
                let check = Security.validateProjectPath(project.path)
                if !check.valid || !ProcessManager.shared.startProcess(projectId: projectId, path: check.resolved, command: command) {
                    failed.append(projectId)
                } else {
                    started.append(projectId)
                }
            }
            return jsonResponse(ProfileActionResponse(started: started, failed: failed, stopped: nil))
        }

        server["/api/profiles/:id/stop"] = { request in
            guard request.method == "POST" else { return .raw(405, "Method Not Allowed", nil, nil) }
            let id = request.params[":id"] ?? ""
            let profiles = (try? Queries.getStartupProfiles()) ?? []
            guard let profile = profiles.first(where: { $0.id == id }) else { return .notFound }
            let stopped = profile.projectIds.filter { ProcessManager.shared.stopProcess(projectId: $0) }
            return jsonResponse(ProfileActionResponse(started: nil, failed: nil, stopped: stopped))
        }
    }

    private static func requestBody(_ request: HttpRequest) -> [String: Any] {
        (try? JSONSerialization.jsonObject(with: Data(request.body), options: [])) as? [String: Any] ?? [:]
    }
}
