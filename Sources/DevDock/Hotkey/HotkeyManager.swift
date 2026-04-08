import AppKit
import Carbon

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

/// Global hotkey — reads config from ~/.devdock/config.json.
/// Uses Carbon RegisterEventHotKey so it works without Accessibility permission.
final class HotkeyManager {
    static let shared = HotkeyManager()

    private(set) var config: HotkeyConfig = .defaultConfig
    private var onTrigger: (() -> Void)?
    private var hotKeyRef: EventHotKeyRef?
    private var eventHandlerRef: EventHandlerRef?

    private init() {}

    func register(handler: @escaping () -> Void) {
        unregister()

        self.onTrigger = handler
        self.config = HotkeyConfig.load()
        log("register() — hotkey: \(config.displayLabel) (keyCode=\(config.keyCode))")

        var eventSpec = EventTypeSpec(
            eventClass: OSType(kEventClassKeyboard),
            eventKind: UInt32(kEventHotKeyPressed)
        )

        let installStatus = InstallEventHandler(
            GetApplicationEventTarget(),
            { _, event, userData in
                guard let event, let userData else { return noErr }
                let manager = Unmanaged<HotkeyManager>.fromOpaque(userData).takeUnretainedValue()
                return manager.handleHotKeyEvent(event)
            },
            1,
            &eventSpec,
            Unmanaged.passUnretained(self).toOpaque(),
            &eventHandlerRef
        )

        guard installStatus == noErr else {
            log("ERROR: InstallEventHandler failed (\(installStatus))")
            return
        }

        var hotKeyID = EventHotKeyID(
            signature: FourCharCode("DDHK".fourCharCodeValue),
            id: UInt32(config.keyCode)
        )
        let registerStatus = RegisterEventHotKey(
            UInt32(config.keyCode),
            carbonModifiers(for: config.modifiers),
            hotKeyID,
            GetApplicationEventTarget(),
            0,
            &hotKeyRef
        )

        guard registerStatus == noErr else {
            if let eventHandlerRef {
                RemoveEventHandler(eventHandlerRef)
                self.eventHandlerRef = nil
            }
            log("ERROR: RegisterEventHotKey failed (\(registerStatus))")
            return
        }

        log("Carbon hotkey registered successfully")
    }

    private func handleHotKeyEvent(_ event: EventRef) -> OSStatus {
        var hotKeyID = EventHotKeyID()
        let status = GetEventParameter(
            event,
            EventParamName(kEventParamDirectObject),
            EventParamType(typeEventHotKeyID),
            nil,
            MemoryLayout<EventHotKeyID>.size,
            nil,
            &hotKeyID
        )

        guard status == noErr else {
            log("ERROR: GetEventParameter failed (\(status))")
            return status
        }

        if hotKeyID.signature == FourCharCode("DDHK".fourCharCodeValue) {
            DispatchQueue.main.async { [weak self] in
                self?.onTrigger?()
            }
        }

        return noErr
    }

    func unregister() {
        if let hotKeyRef {
            UnregisterEventHotKey(hotKeyRef)
            self.hotKeyRef = nil
        }
        if let eventHandlerRef {
            RemoveEventHandler(eventHandlerRef)
            self.eventHandlerRef = nil
        }
    }

    private func carbonModifiers(for modifiers: HotkeyConfig.Modifiers) -> UInt32 {
        var result: UInt32 = 0
        if modifiers.ctrl { result |= UInt32(controlKey) }
        if modifiers.shift { result |= UInt32(shiftKey) }
        if modifiers.cmd { result |= UInt32(cmdKey) }
        if modifiers.alt { result |= UInt32(optionKey) }
        return result
    }

    deinit { unregister() }
}

private extension String {
    var fourCharCodeValue: UInt32 {
        utf8.prefix(4).reduce(0) { ($0 << 8) + UInt32($1) }
    }
}
