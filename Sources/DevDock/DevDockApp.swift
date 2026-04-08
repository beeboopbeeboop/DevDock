import SwiftUI

class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        // Boot the in-process HTTP server (replaces old Bun backend).
        DevDockServer.shared.start()

        CommandPaletteWindowController.shared.preload()

        HotkeyManager.shared.register {
            Task { @MainActor in
                CommandPaletteWindowController.shared.toggle()
            }
        }

        // Register URL scheme handler
        NSAppleEventManager.shared().setEventHandler(
            self,
            andSelector: #selector(handleURL(_:withReply:)),
            forEventClass: AEEventClass(kInternetEventClass),
            andEventID: AEEventID(kAEGetURL)
        )
    }

    func applicationWillTerminate(_ notification: Notification) {
        DevDockServer.shared.stop()
    }

    @objc func handleURL(_ event: NSAppleEventDescriptor, withReply reply: NSAppleEventDescriptor) {
        guard let urlString = event.paramDescriptor(forKeyword: keyDirectObject)?.stringValue,
              let url = URL(string: urlString),
              url.scheme == "devdock" else { return }

        let host = url.host ?? ""
        let path = url.pathComponents.dropFirst().first ?? ""

        Task { @MainActor in
            switch host {
            case "palette":
                CommandPaletteWindowController.shared.show()

            case "dashboard":
                WindowManager.shared.showDashboard()

            case "open":
                if !path.isEmpty {
                    await APIClient.shared.openEditor(projectId: path, editor: "code")
                }

            case _ where PaletteState.knownVerbs.contains(host):
                if !path.isEmpty {
                    let _ = await APIClient.shared.executeVerb(verb: host, target: path)
                }

            default:
                break
            }
        }
    }
}

@main
struct DevDockApp: App {
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
