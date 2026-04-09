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

/// Layer-backed container that wraps NSHostingView. We animate the layer on
/// this view — not on the NSHostingView itself — because NSHostingView owns
/// its own SwiftUI layer tree and doesn't reliably propagate transforms to
/// its sublayers. By wrapping it, we get clean CALayer ownership without
/// fighting SwiftUI's renderer.
final class PaletteContainerView: NSView {
    override var isFlipped: Bool { true }
    override var wantsUpdateLayer: Bool { true }
}

/// A floating, borderless panel that appears above all windows.
/// Dismisses on Escape, click outside, or when a regular app activates.
@MainActor
final class CommandPaletteWindowController {
    static let shared = CommandPaletteWindowController()

    private var panel: PalettePanel?
    private var containerView: PaletteContainerView?
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
        guard let panel = panel,
              let containerView = containerView,
              let layer = containerView.layer
        else { return }

        // Center on the active screen at final size. Window frame stays
        // constant for the entire animation so SwiftUI lays out once, at
        // the correct width. All motion happens at the layer level.
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

        // Ensure the layer's bounds match the container before setting
        // anchor point (anchor point is normalized, but position uses bounds
        // coordinates, so we need fresh bounds or the scale will radiate
        // from the wrong spot after a frame change).
        containerView.layoutSubtreeIfNeeded()
        let bounds = layer.bounds

        // Anchor at center so scale grows from the middle, not the corner.
        layer.anchorPoint = CGPoint(x: 0.5, y: 0.5)
        layer.position = CGPoint(x: bounds.midX, y: bounds.midY)

        // Snap to start state with animations disabled so the open animation
        // isn't competing with an implicit reset animation.
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        layer.opacity = 0
        layer.transform = CATransform3DConcat(
            CATransform3DMakeScale(0.88, 0.88, 1),
            CATransform3DMakeTranslation(0, 14, 0)
        )
        CATransaction.commit()

        panel.alphaValue = 1
        panel.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        // Explicit CABasicAnimations so we fully own the timing — implicit
        // CATransaction animations on transform can get merged/cancelled
        // with the anchor-point change above.
        let duration: CFTimeInterval = 0.28
        let easeOut = CAMediaTimingFunction(controlPoints: 0.16, 1.0, 0.3, 1.0)

        let scaleAnim = CABasicAnimation(keyPath: "transform")
        scaleAnim.fromValue = NSValue(caTransform3D: CATransform3DConcat(
            CATransform3DMakeScale(0.88, 0.88, 1),
            CATransform3DMakeTranslation(0, 14, 0)
        ))
        scaleAnim.toValue = NSValue(caTransform3D: CATransform3DIdentity)
        scaleAnim.duration = duration
        scaleAnim.timingFunction = easeOut
        scaleAnim.fillMode = .forwards
        scaleAnim.isRemovedOnCompletion = false

        let opacityAnim = CABasicAnimation(keyPath: "opacity")
        opacityAnim.fromValue = 0
        opacityAnim.toValue = 1
        opacityAnim.duration = duration * 0.7 // fade is quicker than the scale
        opacityAnim.timingFunction = CAMediaTimingFunction(name: .easeOut)
        opacityAnim.fillMode = .forwards
        opacityAnim.isRemovedOnCompletion = false

        // Commit the final model values so post-animation state is correct.
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        layer.transform = CATransform3DIdentity
        layer.opacity = 1
        CATransaction.commit()

        layer.add(scaleAnim, forKey: "paletteShowTransform")
        layer.add(opacityAnim, forKey: "paletteShowOpacity")

        // Global clicks (other apps, empty desktop) dismiss the palette.
        clickMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] _ in
            self?.dismiss()
        }
        // Local clicks inside this app that land outside the palette window
        // also dismiss. Runs before SwiftUI sees the event; we let it pass
        // through by returning it.
        localClickMonitor = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] event in
            guard let self = self, let panel = self.panel else { return event }
            if event.window !== panel {
                Task { @MainActor in self.dismiss() }
            }
            return event
        }
    }

    func dismiss() {
        guard let panel = panel,
              panel.isVisible,
              let containerView = containerView,
              let layer = containerView.layer
        else { return }

        if let monitor = clickMonitor {
            NSEvent.removeMonitor(monitor)
            clickMonitor = nil
        }
        if let monitor = localClickMonitor {
            NSEvent.removeMonitor(monitor)
            localClickMonitor = nil
        }

        // Cancel any in-flight show animations before running the dismissal.
        layer.removeAnimation(forKey: "paletteShowTransform")
        layer.removeAnimation(forKey: "paletteShowOpacity")

        let duration: CFTimeInterval = 0.16
        let easeIn = CAMediaTimingFunction(controlPoints: 0.4, 0.0, 1.0, 1.0)

        let scaleAnim = CABasicAnimation(keyPath: "transform")
        scaleAnim.fromValue = NSValue(caTransform3D: CATransform3DIdentity)
        scaleAnim.toValue = NSValue(caTransform3D: CATransform3DConcat(
            CATransform3DMakeScale(0.94, 0.94, 1),
            CATransform3DMakeTranslation(0, 6, 0)
        ))
        scaleAnim.duration = duration
        scaleAnim.timingFunction = easeIn
        scaleAnim.fillMode = .forwards
        scaleAnim.isRemovedOnCompletion = false

        let opacityAnim = CABasicAnimation(keyPath: "opacity")
        opacityAnim.fromValue = 1
        opacityAnim.toValue = 0
        opacityAnim.duration = duration
        opacityAnim.timingFunction = CAMediaTimingFunction(name: .easeIn)
        opacityAnim.fillMode = .forwards
        opacityAnim.isRemovedOnCompletion = false

        CATransaction.begin()
        CATransaction.setCompletionBlock { [weak self] in
            guard let self = self,
                  let panel = self.panel,
                  let containerView = self.containerView,
                  let layer = containerView.layer
            else { return }
            panel.orderOut(nil)
            // Reset to identity so next show() starts clean.
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            layer.removeAllAnimations()
            layer.transform = CATransform3DIdentity
            layer.opacity = 1
            CATransaction.commit()
        }
        layer.add(scaleAnim, forKey: "paletteHideTransform")
        layer.add(opacityAnim, forKey: "paletteHideOpacity")
        CATransaction.commit()
    }

    private func createPanel() {
        let state = PaletteState()
        self.paletteState = state

        // Layer-backed container — this is the view whose layer we animate.
        let container = PaletteContainerView(frame: NSRect(x: 0, y: 0, width: 640, height: 420))
        container.wantsLayer = true
        container.layer = CALayer()
        container.layer?.backgroundColor = .clear
        container.layer?.cornerRadius = 12
        container.layer?.masksToBounds = true
        container.layerContentsRedrawPolicy = .onSetNeedsDisplay

        // SwiftUI host view sits inside the container, filling it.
        let hostView = NSHostingView(
            rootView: CommandPaletteView(state: state, onDismiss: { [weak self] in
                self?.dismiss()
            })
            .padding(0)
        )
        hostView.translatesAutoresizingMaskIntoConstraints = false
        container.addSubview(hostView)
        NSLayoutConstraint.activate([
            hostView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            hostView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            hostView.topAnchor.constraint(equalTo: container.topAnchor),
            hostView.bottomAnchor.constraint(equalTo: container.bottomAnchor),
        ])

        self.containerView = container

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
        panel.contentView = container

        // Dismiss when a regular app activates (not accessory apps like Paste)
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
