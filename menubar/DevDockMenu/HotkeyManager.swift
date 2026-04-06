import AppKit
import CoreGraphics

private let logFile = FileManager.default.homeDirectoryForCurrentUser
    .appendingPathComponent(".devdock/hotkey.log")

private func log(_ msg: String) {
    let line = "\(Date()): \(msg)\n"
    if let data = line.data(using: .utf8) {
        if FileManager.default.fileExists(atPath: logFile.path) {
            if let handle = try? FileHandle(forWritingTo: logFile) {
                handle.seekToEndOfFile()
                handle.write(data)
                handle.closeFile()
            }
        } else {
            try? data.write(to: logFile)
        }
    }
}

/// Global hotkey: Ctrl+Shift+D opens command palette.
/// Uses CGEventTap — requires Accessibility permission.
final class HotkeyManager {
    static let shared = HotkeyManager()

    private var onTrigger: (() -> Void)?
    private var eventTap: CFMachPort?
    private var runLoopSource: CFRunLoopSource?

    private init() {}

    func register(handler: @escaping () -> Void) {
        self.onTrigger = handler
        log("register() called — setting up CGEventTap for Ctrl+Shift+D")

        // Request Accessibility
        let trusted = AXIsProcessTrustedWithOptions(
            [kAXTrustedCheckOptionPrompt.takeUnretainedValue(): true] as CFDictionary
        )
        log("Accessibility trusted: \(trusted)")

        // Create event tap at the CGSession level — intercepts ALL keyboard events
        let eventMask: CGEventMask = (1 << CGEventType.keyDown.rawValue)

        guard let tap = CGEvent.tapCreate(
            tap: .cgSessionEventTap,
            place: .headInsertEventTap,
            options: .defaultTap,
            eventsOfInterest: eventMask,
            callback: { (proxy, type, event, refcon) -> Unmanaged<CGEvent>? in
                guard let refcon = refcon else { return Unmanaged.passUnretained(event) }
                let manager = Unmanaged<HotkeyManager>.fromOpaque(refcon).takeUnretainedValue()
                return manager.handleEvent(proxy: proxy, type: type, event: event)
            },
            userInfo: Unmanaged.passUnretained(self).toOpaque()
        ) else {
            log("ERROR: CGEvent.tapCreate failed — Accessibility permission likely not granted")
            log("Go to System Settings > Privacy & Security > Accessibility")
            log("Remove and re-add 'DevDock MenuBar', then relaunch the app")
            return
        }

        self.eventTap = tap
        log("CGEventTap created successfully")

        // Run on a dedicated background thread with its own run loop
        // This ensures the tap fires regardless of what the main thread is doing
        let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
        self.runLoopSource = source

        let thread = Thread {
            CFRunLoopAddSource(CFRunLoopGetCurrent(), source, .commonModes)
            CGEvent.tapEnable(tap: tap, enable: true)
            log("Event tap enabled on background run loop")
            CFRunLoopRun()
        }
        thread.name = "com.devdock.hotkey"
        thread.qualityOfService = .userInteractive
        thread.start()
        log("Hotkey thread started")
    }

    private func handleEvent(proxy: CGEventTapProxy, type: CGEventType, event: CGEvent) -> Unmanaged<CGEvent>? {
        // If tap gets disabled by the system, re-enable it
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            if let tap = eventTap {
                CGEvent.tapEnable(tap: tap, enable: true)
                log("Event tap re-enabled after system disable")
            }
            return Unmanaged.passUnretained(event)
        }

        let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
        let flags = event.flags

        // Ctrl+Shift+D (keyCode 2 = D)
        if keyCode == 2
            && flags.contains(.maskControl)
            && flags.contains(.maskShift)
        {
            log("Ctrl+Shift+D — opening palette")
            DispatchQueue.main.async { [weak self] in
                self?.onTrigger?()
            }
            return nil // swallow
        }

        return Unmanaged.passUnretained(event)
    }

    func unregister() {
        if let tap = eventTap {
            CGEvent.tapEnable(tap: tap, enable: false)
        }
        if let source = runLoopSource {
            CFRunLoopRemoveSource(CFRunLoopGetCurrent(), source, .commonModes)
        }
        eventTap = nil
        runLoopSource = nil
    }

    deinit { unregister() }
}
