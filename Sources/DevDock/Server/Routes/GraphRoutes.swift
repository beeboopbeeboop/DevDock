import Foundation
import GRDB
import Swifter

enum GraphRoutes {
    private struct GraphNode: Codable {
        let id: String
        let name: String
        let type: String
        let status: String
        let isMaster: Bool
        let hasSharedLib: Bool
    }

    private struct GraphEdge: Codable {
        let source: String
        let target: String
        let type: String
        let label: String?
    }

    private struct GraphResponse: Codable {
        let nodes: [GraphNode]
        let edges: [GraphEdge]
    }

    private static let noiseDependencies: Set<String> = [
        "react", "react-dom", "typescript", "vite", "tailwindcss", "@types/react",
        "@types/react-dom", "@types/node", "postcss", "autoprefixer", "eslint",
        "prettier", "tslib", "@vitejs/plugin-react", "framer-motion", "next", "zod"
    ]

    static func mount(on server: HttpServer) {
        server["/api/graph/relationships"] = { _ in
            jsonResponse(relationships())
        }
    }

    private static func relationships() -> GraphResponse {
        let projects = (try? Queries.getProjects()) ?? []
        let config = ConfigStore.shared.load()
        let masterPaths = Set(config.sharedLibraries.map(\.masterPath))

        let nodes = projects.map {
            GraphNode(
                id: $0.id,
                name: $0.name,
                type: $0.type,
                status: $0.status,
                isMaster: masterPaths.contains($0.path),
                hasSharedLib: $0.hasSharedLib
            )
        }

        let edges = (try? dependencyEdges(projects: projects, config: config)) ?? []
        let connectedIDs = Set(edges.flatMap { [$0.source, $0.target] })
        return GraphResponse(nodes: nodes.filter { connectedIDs.contains($0.id) }, edges: edges)
    }

    private static func dependencyEdges(projects: [Queries.ProjectResponse], config: DevDockConfig) throws -> [GraphEdge] {
        try Database.shared.pool.read { db in
            var edges: [GraphEdge] = []

            for lib in config.sharedLibraries {
                guard let master = projects.first(where: { $0.path == lib.masterPath }) else { continue }
                for project in projects where project.id != master.id {
                    let subPath = (project.path as NSString).appendingPathComponent(lib.subdir)
                    if FileManager.default.fileExists(atPath: subPath) || project.hasSharedLib {
                        edges.append(GraphEdge(source: master.id, target: project.id, type: "shared-lib", label: lib.name))
                    }
                }
            }

            let depRows = try Row.fetchAll(db, sql: "SELECT project_id, dep_name FROM project_deps")
            var depToProjects: [String: [String]] = [:]
            for row in depRows {
                let dep: String = row["dep_name"]
                guard !noiseDependencies.contains(dep) else { continue }
                depToProjects[dep, default: []].append(row["project_id"])
            }

            var pairCounts: [String: Int] = [:]
            for projectIDs in depToProjects.values where projectIDs.count >= 2 && projectIDs.count <= 5 {
                for lhs in 0..<(projectIDs.count - 1) {
                    for rhs in (lhs + 1)..<projectIDs.count {
                        let key = [projectIDs[lhs], projectIDs[rhs]].sorted().joined(separator: "::")
                        pairCounts[key, default: 0] += 1
                    }
                }
            }

            for (key, count) in pairCounts where count >= 3 {
                let ids = key.split(separator: "::").map(String.init)
                guard ids.count == 2 else { continue }
                let exists = edges.contains {
                    ($0.source == ids[0] && $0.target == ids[1]) || ($0.source == ids[1] && $0.target == ids[0])
                }
                if !exists {
                    edges.append(GraphEdge(source: ids[0], target: ids[1], type: "shared-deps", label: "\(count) shared"))
                }
            }

            return edges
        }
    }
}
