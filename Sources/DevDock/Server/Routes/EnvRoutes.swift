import Foundation
import Swifter

enum EnvRoutes {
    static func mount(on server: HttpServer) {
        server["/api/env/audit"] = { _ in
            jsonResponse(auditIssues())
        }
    }

    static func auditIssues() -> [[String: String]] {
        let projects = (try? Queries.getProjects()) ?? []
        let fm = FileManager.default
        var issues: [[String: String]] = []

        for project in projects {
            let envExample = (project.path as NSString).appendingPathComponent(".env.example")
            let envFile = (project.path as NSString).appendingPathComponent(".env")
            let gitignore = (project.path as NSString).appendingPathComponent(".gitignore")

            let hasExample = fm.fileExists(atPath: envExample)
            let hasEnv = fm.fileExists(atPath: envFile)

            if hasExample && !hasEnv {
                issues.append([
                    "projectId": project.id,
                    "projectName": project.name,
                    "issue": "missing-env",
                    "severity": "warning",
                    "detail": ".env.example exists but no .env",
                ])
            }

            if hasEnv {
                if let content = try? String(contentsOfFile: envFile) {
                    let emptySecretKeys = content
                        .split(separator: "\n")
                        .compactMap { line -> String? in
                            let trimmed = line.trimmingCharacters(in: .whitespaces)
                            guard !trimmed.isEmpty, !trimmed.hasPrefix("#"), let eq = trimmed.firstIndex(of: "=") else { return nil }
                            let key = String(trimmed[..<eq]).trimmingCharacters(in: .whitespaces)
                            let value = String(trimmed[trimmed.index(after: eq)...]).trimmingCharacters(in: .whitespaces)
                            let looksSecret = ["SECRET", "TOKEN", "KEY", "PASSWORD", "AUTH", "OPENAI", "ANTHROPIC"].contains {
                                key.uppercased().contains($0)
                            }
                            return looksSecret && value.isEmpty ? key : nil
                        }
                    if !emptySecretKeys.isEmpty {
                        issues.append([
                            "projectId": project.id,
                            "projectName": project.name,
                            "issue": "empty-secrets",
                            "severity": "error",
                            "detail": emptySecretKeys.joined(separator: ", "),
                        ])
                    }
                }

                if let ignoreContent = try? String(contentsOfFile: gitignore) {
                    let ignored = ignoreContent.split(separator: "\n").map { $0.trimmingCharacters(in: .whitespaces) }.contains {
                        [".env", ".env*", ".env.*", "*.env"].contains($0)
                    }
                    if !ignored {
                        issues.append([
                            "projectId": project.id,
                            "projectName": project.name,
                            "issue": "env-not-gitignored",
                            "severity": "error",
                            "detail": ".env exists but is not in .gitignore",
                        ])
                    }
                } else {
                    issues.append([
                        "projectId": project.id,
                        "projectName": project.name,
                        "issue": "no-gitignore",
                        "severity": "warning",
                        "detail": "No .gitignore found",
                    ])
                }
            }
        }

        return issues
    }
}
