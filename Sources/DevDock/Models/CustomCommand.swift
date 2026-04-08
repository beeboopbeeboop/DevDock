import Foundation

// MARK: - Custom Command (user-defined shell shortcuts)

struct CustomCommand: Identifiable, Codable, Equatable {
    var id: String { name }
    let name: String
    let command: String
    let icon: String

    static let defaultIcon = "terminal"
}

// MARK: - Config Loader

@MainActor
final class CustomCommandStore {
    static let shared = CustomCommandStore()

    private(set) var commands: [CustomCommand] = []

    private var configURL: URL {
        FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".devdock/config.json")
    }

    init() {
        load()
    }

    func load() {
        guard let data = try? Data(contentsOf: configURL),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let raw = json["customCommands"] as? [[String: Any]] else {
            commands = []
            return
        }
        commands = raw.compactMap { dict in
            guard let name = dict["name"] as? String,
                  let command = dict["command"] as? String else { return nil }
            let icon = dict["icon"] as? String ?? CustomCommand.defaultIcon
            return CustomCommand(name: name, command: command, icon: icon)
        }
    }

    func save(_ newCommands: [CustomCommand]) {
        commands = newCommands
        // Read existing config, update customCommands key, write back (preserves other keys)
        guard var json = (try? Data(contentsOf: configURL)).flatMap({ try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }) else {
            return
        }
        json["customCommands"] = newCommands.map { ["name": $0.name, "command": $0.command, "icon": $0.icon] }
        if let data = try? JSONSerialization.data(withJSONObject: json, options: [.prettyPrinted, .sortedKeys]) {
            try? data.write(to: configURL, options: .atomic)
        }
    }

    func add(_ command: CustomCommand) {
        var updated = commands
        updated.append(command)
        save(updated)
    }

    func update(_ command: CustomCommand, at index: Int) {
        guard index >= 0 && index < commands.count else { return }
        var updated = commands
        updated[index] = command
        save(updated)
    }

    func remove(at index: Int) {
        guard index >= 0 && index < commands.count else { return }
        var updated = commands
        updated.remove(at: index)
        save(updated)
    }
}
