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

/// Global hotkey — reads config from ~/.devdock/config.json
/// Uses CGEventTap — requires Accessibility permission.
final class HotkeyManager {
    static let shared = HotkeyManager()

    private(set) var config: HotkeyConfig = .defaultConfig
    private var onTrigger: (() -> Void)?
    private var eventTap: CFMachPort?
    private var runLoopSource: CFRunLoopSource?

    private init() {}

    func register(handler: @escaping () -> Void) {
        self.onTrigger = handler
        self.config = HotkeyConfig.load()
        log("register() — hotkey: \(config.displayLabel) (keyCode=\(config.keyCode))")

        let trusted = AXIsProcessTrustedWithOptions(
            [kAXTrustedCheckOptionPrompt.takeUnretainedValue(): true] as CFDictionary
        )
        log("Accessibility trusted: \(trusted)")

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
            log("ERROR: CGEvent.tapCreate failed — Accessibility permission not granted")
            return
        }

        self.eventTap = tap
        log("CGEventTap created successfully")

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
        if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
            if let tap = eventTap {
                CGEvent.tapEnable(tap: tap, enable: true)
            }
            return Unmanaged.passUnretained(event)
        }

        let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
        let flags = event.flags

        let ctrlMatch = !config.modifiers.ctrl || flags.contains(.maskControl)
        let shiftMatch = !config.modifiers.shift || flags.contains(.maskShift)
        let cmdMatch = !config.modifiers.cmd || flags.contains(.maskCommand)
        let altMatch = !config.modifiers.alt || flags.contains(.maskAlternate)

        // Also check that we're not triggering on extra modifiers
        let noExtraCtrl = config.modifiers.ctrl || !flags.contains(.maskControl)
        let noExtraCmd = config.modifiers.cmd || !flags.contains(.maskCommand)

        if keyCode == config.keyCode
            && ctrlMatch && shiftMatch && cmdMatch && altMatch
            && noExtraCtrl && noExtraCmd
        {
            DispatchQueue.main.async { [weak self] in
                self?.onTrigger?()
            }
            return nil
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
