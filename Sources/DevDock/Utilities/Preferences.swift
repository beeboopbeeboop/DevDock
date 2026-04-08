import Foundation

/// UserDefaults wrapper for local-only preferences (window state, view mode, etc.)
/// All persistent data lives in the backend DB — this is only for UI state.
enum Preferences {
    private static let defaults = UserDefaults.standard

    static var viewMode: String {
        get { defaults.string(forKey: "devdock.viewMode") ?? "grid" }
        set { defaults.set(newValue, forKey: "devdock.viewMode") }
    }

    static var sortMode: String {
        get { defaults.string(forKey: "devdock.sortMode") ?? "priority" }
        set { defaults.set(newValue, forKey: "devdock.sortMode") }
    }

    static var sidebarWidth: Double {
        get { defaults.double(forKey: "devdock.sidebarWidth").nonZero ?? 220 }
        set { defaults.set(newValue, forKey: "devdock.sidebarWidth") }
    }

    static var lastAppView: String {
        get { defaults.string(forKey: "devdock.lastAppView") ?? "projects" }
        set { defaults.set(newValue, forKey: "devdock.lastAppView") }
    }
}

private extension Double {
    var nonZero: Double? { self == 0 ? nil : self }
}
