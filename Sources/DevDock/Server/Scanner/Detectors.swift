import Foundation

/// Project type + tech stack + deploy target detection.
///
/// Ported from `src/server/scanner/detectors.ts`. Detection priority order
/// matches the TS version exactly so existing projects get the same type
/// when re-scanned.
enum Detectors {

    struct Result {
        var type: String = "unknown"
        var techStack: [String] = []
        var devCommand: String? = nil
        var devPort: Int? = nil
        var deployTarget: String = "none"
        var description: String? = nil
    }

    static func detect(dir: String) -> Result {
        var result = Result()
        let pkg = readPkg(dir: dir)

        if let pkg = pkg {
            result.description = pkg["description"] as? String

            // Pick package manager by lockfile
            let hasBun = fileExists(dir, "bun.lock") || fileExists(dir, "bun.lockb")
            let hasPnpm = fileExists(dir, "pnpm-lock.yaml")
            let hasYarn = fileExists(dir, "yarn.lock")
            let pm: String
            if hasBun { pm = "bun" }
            else if hasPnpm { pm = "pnpm" }
            else if hasYarn { pm = "yarn" }
            else { pm = "npm" }

            if let scripts = pkg["scripts"] as? [String: String] {
                if scripts["dev"] != nil {
                    result.devCommand = "\(pm) run dev"
                } else if scripts["start"] != nil {
                    result.devCommand = "\(pm) run start"
                }
            }

            // Tech stack from deps
            let deps = collectDeps(pkg)
            if deps.contains("react") { result.techStack.append("react") }
            if deps.contains("typescript") || fileExists(dir, "tsconfig.json") { result.techStack.append("typescript") }
            if deps.contains("tailwindcss") || deps.contains("@tailwindcss/vite") { result.techStack.append("tailwind") }
            if deps.contains("vite") { result.techStack.append("vite") }
            if deps.contains("next") { result.techStack.append("next") }
            if deps.contains("hono") { result.techStack.append("hono") }
            if deps.contains("supabase") || deps.contains("@supabase/supabase-js") { result.techStack.append("supabase") }
            if deps.contains("better-sqlite3") || deps.contains("sqlite3") { result.techStack.append("sqlite") }
            if deps.contains("playwright") || deps.contains("@playwright/test") { result.techStack.append("playwright") }
            if deps.contains("framer-motion") || deps.contains("motion") { result.techStack.append("framer-motion") }
            if deps.contains("stripe") || deps.contains("@stripe/stripe-js") { result.techStack.append("stripe") }
            if deps.contains("@anthropic-ai/sdk") { result.techStack.append("anthropic") }
            if deps.contains("vitest") { result.techStack.append("vitest") }
            if deps.contains("@dnd-kit/core") { result.techStack.append("dnd-kit") }
            if deps.contains("three") || deps.contains("@react-three/fiber") { result.techStack.append("three.js") }
            if deps.contains("vue") { result.techStack.append("vue") }
            if deps.contains("svelte") { result.techStack.append("svelte") }
            if deps.contains("d3") || deps.contains("d3-selection") { result.techStack.append("d3") }
        }

        // Project type (priority order — first match wins)
        if dirExists(dir, "CSXS") || fileExists(dir, ".debug") {
            result.type = "cep-plugin"
            // Shared library detection
            let uc = ConfigStore.shared.load()
            for lib in uc.sharedLibraries where dirExists(dir, lib.subdir) {
                result.techStack.append(lib.name.lowercased())
            }
        } else if fileExists(dir, "next.config.ts") || fileExists(dir, "next.config.js") || fileExists(dir, "next.config.mjs") {
            result.type = "nextjs"
        } else if fileExists(dir, "framer.json") {
            result.type = "framer-plugin"
        } else if (fileExists(dir, "vite.config.ts") || fileExists(dir, "vite.config.js")) && pkg != nil && hasDep(pkg!, "react") {
            result.type = "vite-react"
        } else if fileExists(dir, "wrangler.toml") {
            result.type = "cloudflare-worker"
            result.deployTarget = "cloudflare"
        } else if let pkg, hasDep(pkg, "hono"), !hasDep(pkg, "react") {
            result.type = "hono-server"
        } else if fileExists(dir, "Package.swift") {
            result.type = "swift-app"
            result.techStack.append("swift")
        } else if let pkg, (pkg["main"] != nil || pkg["exports"] != nil) {
            result.type = "node-package"
        } else if fileExists(dir, "index.html") {
            result.type = "static-site"
        }

        // Deploy target (may override cloudflare set above if another present)
        if fileExists(dir, "vercel.json") || dirExists(dir, ".vercel") {
            result.deployTarget = "vercel"
        } else if fileExists(dir, "wrangler.toml") {
            result.deployTarget = "cloudflare"
        } else if fileExists(dir, "netlify.toml") || dirExists(dir, ".netlify") {
            result.deployTarget = "netlify"
        } else if fileExists(dir, "railway.json") || fileExists(dir, "railway.toml") {
            result.deployTarget = "railway"
        } else if fileExists(dir, "fly.toml") {
            result.deployTarget = "flyio"
        }

        // Docker detection
        if fileExists(dir, "docker-compose.yml") || fileExists(dir, "docker-compose.yaml")
            || fileExists(dir, "compose.yml") || fileExists(dir, "compose.yaml") {
            result.techStack.append("docker-compose")
        }
        if fileExists(dir, "Dockerfile") {
            result.techStack.append("docker")
        }

        result.devPort = extractPort(dir: dir, pkg: pkg)

        return result
    }

    // MARK: - Port extraction

    private static func extractPort(dir: String, pkg: [String: Any]?) -> Int? {
        // vite.config.{ts,js} — look for `port: NNNN`
        for cfg in ["vite.config.ts", "vite.config.js"] {
            let path = (dir as NSString).appendingPathComponent(cfg)
            if let content = try? String(contentsOfFile: path, encoding: .utf8),
               let match = content.range(of: #"port\s*:\s*(\d+)"#, options: .regularExpression) {
                let substring = String(content[match])
                if let num = substring.components(separatedBy: CharacterSet.decimalDigits.inverted)
                    .joined(separator: "")
                    .nonEmpty(),
                   let n = Int(num) {
                    return n
                }
            }
        }

        // package.json dev script — -p NNNN | --port NNNN | PORT=NNNN
        if let pkg, let scripts = pkg["scripts"] as? [String: String], let dev = scripts["dev"] {
            let pattern = #"-p\s+(\d+)|--port\s+(\d+)|PORT=(\d+)"#
            if let re = try? NSRegularExpression(pattern: pattern),
               let match = re.firstMatch(in: dev, range: NSRange(dev.startIndex..., in: dev)) {
                for groupIdx in 1...3 {
                    let range = match.range(at: groupIdx)
                    if range.location != NSNotFound, let r = Range(range, in: dev) {
                        return Int(dev[r])
                    }
                }
            }
        }

        return nil
    }

    // MARK: - Helpers

    private static func fileExists(_ dir: String, _ name: String) -> Bool {
        FileManager.default.fileExists(atPath: (dir as NSString).appendingPathComponent(name))
    }

    private static func dirExists(_ dir: String, _ sub: String) -> Bool {
        var isDir: ObjCBool = false
        let path = (dir as NSString).appendingPathComponent(sub)
        return FileManager.default.fileExists(atPath: path, isDirectory: &isDir) && isDir.boolValue
    }

    private static func readPkg(dir: String) -> [String: Any]? {
        let path = (dir as NSString).appendingPathComponent("package.json")
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return nil }
        return obj
    }

    private static func collectDeps(_ pkg: [String: Any]) -> Set<String> {
        var out = Set<String>()
        if let deps = pkg["dependencies"] as? [String: Any] {
            for key in deps.keys { out.insert(key) }
        }
        if let deps = pkg["devDependencies"] as? [String: Any] {
            for key in deps.keys { out.insert(key) }
        }
        return out
    }

    private static func hasDep(_ pkg: [String: Any], _ name: String) -> Bool {
        if let deps = pkg["dependencies"] as? [String: Any], deps[name] != nil { return true }
        if let deps = pkg["devDependencies"] as? [String: Any], deps[name] != nil { return true }
        return false
    }
}

private extension String {
    func nonEmpty() -> String? { isEmpty ? nil : self }
}
