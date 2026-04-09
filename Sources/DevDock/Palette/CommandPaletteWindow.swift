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
    private var localClickMonitor: Any?

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
        guard let panel = panel, let hostLayer = panel.contentView?.layer else { return }

        // Center on the active screen at final size — the window frame stays
        // constant for the entire animation so SwiftUI lays out once at the
        // correct width. Glitchy reflow of earlier versions came from
        // animating the NSWindow frame and forcing SwiftUI to re-lay out on
        // every frame.
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

        // Anchor the scale around the panel's center so it grows from the
        // middle instead of the top-left corner.
        hostLayer.anchorPoint = CGPoint(x: 0.5, y: 0.5)
        hostLayer.position = CGPoint(x: hostLayer.bounds.midX, y: hostLayer.bounds.midY)

        // Start state: slightly scaled down, nudged up, invisible.
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        hostLayer.opacity = 0
        hostLayer.transform = CATransform3DConcat(
            CATransform3DMakeScale(0.94, 0.94, 1),
            CATransform3DMakeTranslation(0, 10, 0)
        )
        CATransaction.commit()

        panel.alphaValue = 1
        // App is .accessory, so activating is invisible (no Dock icon to
        // switch to). This gives SwiftUI tap gestures a proper key-window
        // context — critical for row click handlers in the palette.
        panel.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        // Animate in: fade + scale up + slide down — all on the content
        // layer, so the window frame (and therefore SwiftUI's layout pass)
        // never changes. Custom cubic-bezier for a crisp exponential feel.
        CATransaction.begin()
        CATransaction.setAnimationDuration(0.22)
        CATransaction.setAnimationTimingFunction(
            CAMediaTimingFunction(controlPoints: 0.22, 1.0, 0.36, 1.0)
        )
        hostLayer.opacity = 1
        hostLayer.transform = CATransform3DIdentity
        CATransaction.commit()

        // Global clicks (other apps, empty desktop) dismiss the palette.
        clickMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] _ in
            self?.dismiss()
        }
        // Local clicks inside this app that land outside the palette window
        // also dismiss. Runs *before* SwiftUI sees the event, so we can let
        // it through (return the event) after scheduling dismissal.
        localClickMonitor = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] event in
            guard let self = self, let panel = self.panel else { return event }
            if event.window !== panel {
                Task { @MainActor in self.dismiss() }
            }
            return event
        }
    }

    func dismiss() {
        guard let panel = panel, panel.isVisible, let hostLayer = panel.contentView?.layer else { return }

        if let monitor = clickMonitor {
            NSEvent.removeMonitor(monitor)
            clickMonitor = nil
        }
        if let monitor = localClickMonitor {
            NSEvent.removeMonitor(monitor)
            localClickMonitor = nil
        }

        // Animate out: scale down slightly, fade. Layer-only — window frame
        // doesn't move.
        CATransaction.begin()
        CATransaction.setAnimationDuration(0.14)
        CATransaction.setAnimationTimingFunction(
            CAMediaTimingFunction(controlPoints: 0.4, 0.0, 0.68, 0.06)
        )
        CATransaction.setCompletionBlock { [weak self] in
            guard let self = self, let panel = self.panel, let hostLayer = panel.contentView?.layer else { return }
            panel.orderOut(nil)
            // Reset layer state so the next show() starts from a known place.
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            hostLayer.opacity = 1
            hostLayer.transform = CATransform3DIdentity
            CATransaction.commit()
        }
        hostLayer.opacity = 0
        hostLayer.transform = CATransform3DConcat(
            CATransform3DMakeScale(0.96, 0.96, 1),
            CATransform3DMakeTranslation(0, 6, 0)
        )
        CATransaction.commit()
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
            styleMask: [.borderless, .fullSizeContentView],
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
