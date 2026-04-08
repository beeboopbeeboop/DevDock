import AppKit
import SwiftUI

/// Manages the dashboard window. Creates on demand, hides on close (instant re-show).
/// Uses NSWindow directly (not WindowGroup) so the app stays as .accessory — no dock icon.
@MainActor
final class WindowManager {
    static let shared = WindowManager()

    private var window: NSWindow?

    private init() {}

    var isVisible: Bool {
        window?.isVisible ?? false
    }

    func showDashboard() {
        if let window = window {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        let dashboardView = DashboardView()
        let hostView = NSHostingView(rootView: dashboardView)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1200, height: 800),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.contentView = hostView
        window.title = "DevDock"
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.minSize = NSSize(width: 800, height: 500)
        window.center()
        window.isReleasedWhenClosed = false
        window.backgroundColor = NSColor(red: 0.08, green: 0.08, blue: 0.10, alpha: 1.0)

        // Hide on close instead of destroying
        window.delegate = WindowDelegate.shared

        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        self.window = window
    }

    func hideDashboard() {
        window?.orderOut(nil)
    }
}

// MARK: - Window Delegate (close → hide)

class WindowDelegate: NSObject, NSWindowDelegate {
    static let shared = WindowDelegate()

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        sender.orderOut(nil) // hide instead of close
        return false
    }
}
