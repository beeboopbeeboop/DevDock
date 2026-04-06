import SwiftUI

class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        // Pre-create palette and load projects so first open is instant
        CommandPaletteWindowController.shared.preload()

        HotkeyManager.shared.register {
            Task { @MainActor in
                CommandPaletteWindowController.shared.toggle()
            }
        }
    }
}

@main
struct DevDockMenuApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @State private var appState = AppState()

    var body: some Scene {
        MenuBarExtra {
            MenuContentView(state: appState)
                .task {
                    appState.startPolling()
                }
        } label: {
            Image(systemName: "square.grid.2x2")
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(appState.isOnline ? .primary : .secondary)
        }
        .menuBarExtraStyle(.window)
    }
}
