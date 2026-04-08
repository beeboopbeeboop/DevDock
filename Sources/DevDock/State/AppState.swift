import Foundation
import AppKit
import UserNotifications

@MainActor
@Observable
class AppState {
    var isOnline = false
    var processes: [RunningProcess] = []
    var profiles: [StartupProfile] = []

    private var pollTimer: Timer?
    private var previousProcessIds: Set<String> = []
    private var backoffInterval: TimeInterval = 3
    private let normalInterval: TimeInterval = 3

    func startPolling() {
        requestNotificationPermission()
        schedulePoll()
    }

    func stopPolling() {
        pollTimer?.invalidate()
        pollTimer = nil
    }

    private func schedulePoll() {
        pollTimer?.invalidate()
        pollTimer = Timer.scheduledTimer(withTimeInterval: backoffInterval, repeats: false) { [weak self] _ in
            Task { @MainActor [weak self] in
                await self?.poll()
                self?.schedulePoll()
            }
        }
    }

    private func poll() async {
        let healthy = await APIClient.shared.checkHealth()

        if healthy {
            isOnline = true
            backoffInterval = normalInterval

            let newProcesses = await APIClient.shared.fetchRunningProcesses()
            let newIds = Set(newProcesses.map(\.projectId))

            // Detect crashes: was running before, now gone
            if !previousProcessIds.isEmpty {
                let disappeared = previousProcessIds.subtracting(newIds)
                for pid in disappeared {
                    sendCrashNotification(projectId: pid)
                }
            }

            previousProcessIds = newIds
            processes = newProcesses

            profiles = await APIClient.shared.fetchProfiles()
        } else {
            if isOnline {
                previousProcessIds = []
                processes = []
                profiles = []
            }
            isOnline = false
            // Backoff: 3 -> 5 -> 10 -> 30
            backoffInterval = min(backoffInterval * 1.5, 30)
        }
    }

    func stopProcess(_ projectId: String) {
        Task {
            _ = await APIClient.shared.stopDev(projectId: projectId)
        }
    }

    func startProfile(_ id: String) {
        Task {
            if let result = await APIClient.shared.startProfile(id: id) {
                let count = result.started?.count ?? 0
                if count > 0 {
                    sendNotification(title: "Profile Started", body: "\(count) server\(count == 1 ? "" : "s") launched")
                }
            }
        }
    }

    func stopProfile(_ id: String) {
        Task {
            _ = await APIClient.shared.stopProfile(id: id)
        }
    }

    func openDashboard() {
        WindowManager.shared.showDashboard()
    }

    func openInBrowser(port: Int) {
        if let url = URL(string: "http://localhost:\(port)") {
            NSWorkspace.shared.open(url)
        }
    }

    // MARK: - Notifications

    private func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    private func sendCrashNotification(projectId: String) {
        let content = UNMutableNotificationContent()
        content.title = "DevDock: Server Crashed"
        content.body = "\(projectId) stopped unexpectedly"
        content.sound = .default
        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }

    private func sendNotification(title: String, body: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }
}
