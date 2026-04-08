import Foundation

/// Reads hotkey configuration from ~/.devdock/config.json
/// Supports modifiers: ctrl, shift, cmd, alt/option
/// Supports any single key character (maps to macOS keycode)
struct HotkeyConfig {
    let keyCode: Int64
    let keyChar: String
    let modifiers: Modifiers
    let displayLabel: String

    struct Modifiers {
        let ctrl: Bool
        let shift: Bool
        let cmd: Bool
        let alt: Bool
    }

    /// Default: Ctrl+Shift+D
    static let defaultConfig = HotkeyConfig(
        keyCode: 2,
        keyChar: "D",
        modifiers: Modifiers(ctrl: true, shift: true, cmd: false, alt: false),
        displayLabel: "\u{2303}\u{21E7}D"
    )

    /// Load from ~/.devdock/config.json
    static func load() -> HotkeyConfig {
        let configPath = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".devdock/config.json")

        guard let data = try? Data(contentsOf: configPath),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let hotkey = json["hotkey"] as? [String: Any],
              let key = hotkey["key"] as? String
        else {
            return defaultConfig
        }

        let mods = hotkey["modifiers"] as? [String] ?? ["ctrl", "shift"]
        let hasCtrl = mods.contains("ctrl") || mods.contains("control")
        let hasShift = mods.contains("shift")
        let hasCmd = mods.contains("cmd") || mods.contains("command")
        let hasAlt = mods.contains("alt") || mods.contains("option")

        let keyUpper = key.uppercased()
        guard let code = Self.keyCodeMap[keyUpper] else {
            return defaultConfig
        }

        // Build display label
        var label = ""
        if hasCtrl { label += "\u{2303}" }
        if hasAlt { label += "\u{2325}" }
        if hasShift { label += "\u{21E7}" }
        if hasCmd { label += "\u{2318}" }
        label += keyUpper

        return HotkeyConfig(
            keyCode: Int64(code),
            keyChar: keyUpper,
            modifiers: Modifiers(ctrl: hasCtrl, shift: hasShift, cmd: hasCmd, alt: hasAlt),
            displayLabel: label
        )
    }

    // macOS virtual key codes for common keys
    static let keyCodeMap: [String: Int] = [
        "A": 0, "S": 1, "D": 2, "F": 3, "H": 4, "G": 5, "Z": 6, "X": 7,
        "C": 8, "V": 9, "B": 11, "Q": 12, "W": 13, "E": 14, "R": 15,
        "Y": 16, "T": 17, "1": 18, "2": 19, "3": 20, "4": 21, "6": 22,
        "5": 23, "=": 24, "9": 25, "7": 26, "-": 27, "8": 28, "0": 29,
        "]": 30, "O": 31, "U": 32, "[": 33, "I": 34, "P": 35,
        "L": 37, "J": 38, "'": 39, "K": 40, ";": 41, "\\": 42,
        ",": 43, "/": 44, "N": 45, "M": 46, ".": 47,
        "SPACE": 49, "`": 50,
    ]
}
