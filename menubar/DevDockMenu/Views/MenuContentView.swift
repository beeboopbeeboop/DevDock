import SwiftUI

struct MenuContentView: View {
    let state: AppState

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                Text("DevDock")
                    .font(.system(size: 13, weight: .semibold))
                Spacer()
                Circle()
                    .fill(state.isOnline ? Color.green : Color.gray)
                    .frame(width: 6, height: 6)
                Text(state.isOnline ? "Online" : "Offline")
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)

            Divider()

            if !state.isOnline {
                Text("DevDock server is not running")
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
            } else if state.processes.isEmpty {
                Text("No dev servers running")
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
            } else {
                // Running servers
                Text("RUNNING SERVERS")
                    .font(.system(size: 9, weight: .medium))
                    .foregroundStyle(.tertiary)
                    .padding(.horizontal, 12)
                    .padding(.top, 8)
                    .padding(.bottom, 4)

                ForEach(state.processes) { process in
                    ProcessRowView(process: process, state: state)
                }
            }

            // Profiles
            if state.isOnline && !state.profiles.isEmpty {
                Divider()
                    .padding(.vertical, 4)

                Text("PROFILES")
                    .font(.system(size: 9, weight: .medium))
                    .foregroundStyle(.tertiary)
                    .padding(.horizontal, 12)
                    .padding(.bottom, 4)

                ForEach(state.profiles) { profile in
                    ProfileRowView(profile: profile, state: state)
                }
            }

            Divider()
                .padding(.vertical, 4)

            // Footer
            Button(action: { CommandPaletteWindowController.shared.show() }) {
                HStack {
                    Text("Command Palette")
                        .font(.system(size: 12))
                    Spacer()
                    Text("⌃⇧D")
                        .font(.system(size: 10))
                        .foregroundStyle(.tertiary)
                }
            }
            .buttonStyle(MenuRowButtonStyle())
            .padding(.horizontal, 4)

            Button(action: { state.openDashboard() }) {
                HStack {
                    Text("Open Dashboard")
                        .font(.system(size: 12))
                    Spacer()
                    Text("\u{2318}D")
                        .font(.system(size: 10))
                        .foregroundStyle(.tertiary)
                }
            }
            .buttonStyle(MenuRowButtonStyle())
            .padding(.horizontal, 4)

            Button(action: { NSApplication.shared.terminate(nil) }) {
                Text("Quit DevDock Menu")
                    .font(.system(size: 12))
            }
            .buttonStyle(MenuRowButtonStyle())
            .padding(.horizontal, 4)
            .padding(.bottom, 4)
        }
        .frame(width: 280)
    }
}

struct ProcessRowView: View {
    let process: RunningProcess
    let state: AppState

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(process.running ? Color.green : Color.red)
                .frame(width: 6, height: 6)

            Text(process.projectId)
                .font(.system(size: 12))
                .lineLimit(1)
                .truncationMode(.tail)

            Spacer()

            if process.restartCount > 0 {
                Text("\(process.restartCount)x")
                    .font(.system(size: 9))
                    .foregroundStyle(.orange)
            }

            Button(action: { state.stopProcess(process.projectId) }) {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
            .buttonStyle(.plain)
            .help("Stop server")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 4)
        .contentShape(Rectangle())
    }
}

struct ProfileRowView: View {
    let profile: StartupProfile
    let state: AppState

    var body: some View {
        Button(action: { state.startProfile(profile.id) }) {
            HStack {
                Image(systemName: "play.fill")
                    .font(.system(size: 8))
                    .foregroundStyle(.green)
                Text(profile.name)
                    .font(.system(size: 12))
                Spacer()
                Text("\(profile.projectIds.count)")
                    .font(.system(size: 10))
                    .foregroundStyle(.tertiary)
            }
        }
        .buttonStyle(MenuRowButtonStyle())
        .padding(.horizontal, 4)
    }
}

struct MenuRowButtonStyle: ButtonStyle {
    @State private var isHovered = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(
                configuration.isPressed ? Color.accentColor.opacity(0.2) :
                isHovered ? Color.white.opacity(0.06) : Color.clear
            )
            .cornerRadius(4)
            .onHover { hovering in isHovered = hovering }
    }
}
