import AppKit
import SwiftUI

/// Floating panel subclass that can become key window (for keyboard input)
/// and dismisses on Escape.
class PalettePanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }

    override func cancelOperation(_ sender: Any?) {
        // Escape key
        orderOut(nil)
    }
}

/// A floating, borderless panel that appears above all windows.
/// Dismisses on Escape, click outside, or focus loss (like Spotlight/Raycast).
@MainActor
final class CommandPaletteWindowController {
    static let shared = CommandPaletteWindowController()

    private var panel: PalettePanel?
    private var paletteState: PaletteState?
    private var clickMonitor: Any?

    private init() {}

    var isVisible: Bool {
        panel?.isVisible ?? false
    }

    func toggle() {
        if isVisible {
            dismiss()
        } else {
            show()
        }
    }

    func show() {
        if panel == nil {
            createPanel()
        }
        guard let panel = panel else { return }

        // Center on the active screen
        if let screen = NSScreen.main ?? NSScreen.screens.first {
            let screenFrame = screen.visibleFrame
            let panelSize = NSSize(width: 640, height: 420)
            let origin = NSPoint(
                x: screenFrame.midX - panelSize.width / 2,
                y: screenFrame.midY - panelSize.height / 2 + 100
            )
            panel.setFrame(NSRect(origin: origin, size: panelSize), display: true)
        }

        paletteState?.reset()
        panel.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        // Monitor for clicks outside the panel
        clickMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] event in
            self?.dismiss()
        }
    }

    func dismiss() {
        panel?.orderOut(nil)
        if let monitor = clickMonitor {
            NSEvent.removeMonitor(monitor)
            clickMonitor = nil
        }
    }

    private func createPanel() {
        let state = PaletteState()
        self.paletteState = state

        let hostView = NSHostingView(
            rootView: CommandPaletteView(state: state, onDismiss: { [weak self] in
                self?.dismiss()
            })
        )

        let panel = PalettePanel(
            contentRect: NSRect(x: 0, y: 0, width: 640, height: 420),
            styleMask: [.fullSizeContentView, .borderless],
            backing: .buffered,
            defer: false
        )
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.isMovableByWindowBackground = false
        panel.contentView = hostView

        // Dismiss on focus loss
        NotificationCenter.default.addObserver(
            forName: NSWindow.didResignKeyNotification,
            object: panel,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.dismiss()
            }
        }

        self.panel = panel
    }
}
