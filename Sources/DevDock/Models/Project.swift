import Foundation
import SwiftUI

// MARK: - Project Model (matches backend types.ts)

struct DevDockProject: Decodable, Identifiable {
    let id: String
    let name: String
    let path: String
    let type: String
    let status: String
    let priority: Int?
    let tags: [String]?
    let description: String?

    let techStack: [String]?
    let devCommand: String?
    let detectedDevCommand: String?
    let devPort: Int?
    let hasGit: Bool?
    let gitBranch: String?
    let gitDirty: Bool
    let gitDirtyCount: Int?

    let githubRepo: String?
    let githubUrl: String?

    let deployTarget: String?
    let deployUrl: String?

    let hasSharedLib: Bool?
    let lastModified: String?
    let lastScanned: String?
    let isFavorite: Bool
    let aliases: [String]
}

// MARK: - Type Metadata

enum ProjectType {
    static let labels: [String: String] = [
        "cep-plugin": "CEP Plugin",
        "nextjs": "Next.js",
        "vite-react": "Vite + React",
        "framer-plugin": "Framer Plugin",
        "cloudflare-worker": "CF Worker",
        "hono-server": "Hono Server",
        "static-site": "Static Site",
        "node-package": "Node Package",
        "swift-app": "Swift App",
        "unknown": "Unknown",
    ]

    static let colors: [String: Color] = [
        "cep-plugin": Color(red: 0.65, green: 0.55, blue: 0.98),
        "nextjs": Color(red: 0.97, green: 0.97, blue: 0.97),
        "vite-react": Color(red: 0.51, green: 0.55, blue: 0.98),
        "framer-plugin": Color(red: 0.38, green: 0.65, blue: 0.98),
        "cloudflare-worker": Color(red: 0.98, green: 0.75, blue: 0.14),
        "hono-server": Color(red: 0.98, green: 0.45, blue: 0.09),
        "static-site": Color(red: 0.53, green: 0.94, blue: 0.67),
        "node-package": Color(red: 0.97, green: 0.44, blue: 0.44),
        "swift-app": Color(red: 1.0, green: 0.42, blue: 0.42),
        "unknown": Color(red: 0.42, green: 0.45, blue: 0.50),
    ]

    static let icons: [String: String] = [
        "cep-plugin": "puzzlepiece.extension",
        "nextjs": "globe",
        "vite-react": "bolt",
        "framer-plugin": "bolt",
        "cloudflare-worker": "cloud",
        "hono-server": "server.rack",
        "static-site": "doc.richtext",
        "node-package": "shippingbox",
        "swift-app": "swift",
        "unknown": "folder",
    ]

    static func color(for type: String) -> Color {
        colors[type] ?? colors["unknown"]!
    }

    static func icon(for type: String) -> String {
        icons[type] ?? "folder"
    }

    static func label(for type: String) -> String {
        labels[type] ?? type
    }
}

enum ProjectStatus {
    static let colors: [String: Color] = [
        "active": Color(red: 0.53, green: 0.94, blue: 0.67),
        "maintenance": Color(red: 0.98, green: 0.75, blue: 0.14),
        "paused": Color(red: 0.42, green: 0.45, blue: 0.50),
        "archived": Color(red: 0.29, green: 0.34, blue: 0.39),
        "idea": Color(red: 0.51, green: 0.55, blue: 0.98),
    ]

    static func color(for status: String) -> Color {
        colors[status] ?? Color.gray
    }
}

enum PriorityTier {
    static func tier(from priority: Int) -> Int {
        if priority <= 1 { return 1 }
        if priority <= 3 { return 2 }
        if priority <= 6 { return 3 }
        return 4
    }

    static let labels = [1: "P1", 2: "P2", 3: "P3", 4: "P4"]
    static let descriptions = [1: "Critical / Shipping", 2: "Active", 3: "Backlog", 4: "Low"]

    static let colors: [Int: Color] = [
        1: Color(red: 0.97, green: 0.44, blue: 0.44),
        2: Color(red: 0.98, green: 0.75, blue: 0.14),
        3: Color(red: 0.38, green: 0.65, blue: 0.98),
        4: Color(red: 0.42, green: 0.45, blue: 0.50),
    ]
}
