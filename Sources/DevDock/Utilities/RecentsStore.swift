import Foundation

struct RecentEntry: Codable {
    let id: String
    let label: String
    let projectId: String
    let timestamp: Double
}

struct RecentsStore {
    private static let filePath = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".devdock/recents.json")

    static func load() -> [RecentEntry] {
        guard let data = try? Data(contentsOf: filePath),
              let entries = try? JSONDecoder().decode([RecentEntry].self, from: data) else {
            return []
        }
        return entries
    }

    static func save(_ entry: RecentEntry) {
        var entries = load().filter { $0.id != entry.id }
        entries.insert(entry, at: 0)
        if entries.count > 8 { entries = Array(entries.prefix(8)) }
        if let data = try? JSONEncoder().encode(entries) {
            try? data.write(to: filePath)
        }
    }
}
