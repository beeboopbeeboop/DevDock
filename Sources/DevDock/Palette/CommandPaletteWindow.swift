import AppKit
import SwiftUI

/// Floating panel subclass that can become key window (for keyboard input)
/// without activating the owning app, and dismisses on Escape.
class PalettePanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }

    override func cancelOperation(_ sender: Any?) {
        orderOut(nil)
    }
}

/// A floating, borderless panel that appears above all windows.
/// Dismisses on Escape, click outside, or when a regular app activates.
@MainActor
final class CommandPaletteWindowController {
    static let shared = CommandPaletteWindowController()

    private var panel: PalettePanel?
    private var paletteState: PaletteState?
    private var clickMonitor: Any?
    private var resignKeyObserver: NSObjectProtocol?

    private init() {}

    var isVisible: Bool {
        panel?.isVisible ?? false
    }

    /// Pre-create the panel and load data so first open is instant
    func preload() {
        if panel == nil {
            createPanel()
        }
        paletteState?.loadData()
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

        // Start state: invisible, scaled down, shifted up
        panel.alphaValue = 0
        let finalFrame = panel.frame
        let startFrame = NSRect(
            x: finalFrame.origin.x + 16,
            y: finalFrame.origin.y - 8,
            width: finalFrame.width - 32,
            height: finalFrame.height
        )
        panel.setFrame(startFrame, display: false)
        // orderFrontRegardless + makeKey lets a nonactivating panel receive
        // keyboard input without bringing the owning app forward. We deliberately
        // do NOT call NSApp.activate() — that would focus the dashboard too.
        panel.orderFrontRegardless()
        panel.makeKey()

        // Animate in: fade + scale up + slide down
        NSAnimationContext.runAnimationGroup({ ctx in
            ctx.duration = 0.2
            ctx.timingFunction = CAMediaTimingFunction(controlPoints: 0.16, 1, 0.3, 1)
            panel.animator().alphaValue = 1
            panel.animator().setFrame(finalFrame, display: true)
        })

        // Monitor for clicks outside the panel (other apps, empty desktop).
        clickMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] _ in
            self?.dismiss()
        }

        // Dismiss when the palette loses key status — covers clicks on the
        // dashboard window (same-app, local events the global monitor misses).
        if resignKeyObserver == nil {
            resignKeyObserver = NotificationCenter.default.addObserver(
                forName: NSWindow.didResignKeyNotification,
                object: panel,
                queue: .main
            ) { [weak self] _ in
                Task { @MainActor in
                    self?.dismiss()
                }
            }
        }
    }

    func dismiss() {
        guard let panel = panel, panel.isVisible else { return }

        if let monitor = clickMonitor {
            NSEvent.removeMonitor(monitor)
            clickMonitor = nil
        }
        if let observer = resignKeyObserver {
            NotificationCenter.default.removeObserver(observer)
            resignKeyObserver = nil
        }

        // Fade out
        NSAnimationContext.runAnimationGroup({ ctx in
            ctx.duration = 0.1
            ctx.timingFunction = CAMediaTimingFunction(name: .easeIn)
            panel.animator().alphaValue = 0
        }, completionHandler: {
            panel.orderOut(nil)
            panel.alphaValue = 1 // reset for next show
        })
    }

    private func createPanel() {
        let state = PaletteState()
        self.paletteState = state

        let hostView = NSHostingView(
            rootView: CommandPaletteView(state: state, onDismiss: { [weak self] in
                self?.dismiss()
            })
            .padding(0)
        )
        // Clip the host view's backing layer to the same rounded shape the
        // SwiftUI RoundedRectangle draws (radius 12). Without this, the
        // window's rectangular backing store shows through at the corners.
        hostView.wantsLayer = true
        hostView.layer?.backgroundColor = .clear
        hostView.layer?.cornerRadius = 12
        hostView.layer?.masksToBounds = true

        let panel = PalettePanel(
            contentRect: NSRect(x: 0, y: 0, width: 640, height: 420),
            styleMask: [.borderless, .nonactivatingPanel, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.isMovableByWindowBackground = false
        panel.hidesOnDeactivate = false
        panel.contentView = hostView

        // Dismiss when a regular app activates (not overlay/accessory apps like Paste)
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let app = notification.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication else { return }
            guard app.activationPolicy == .regular else { return }
            guard app.bundleIdentifier != Bundle.main.bundleIdentifier else { return }
            Task { @MainActor in
                self?.dismiss()
            }
        }

        self.panel = panel
    }
}
