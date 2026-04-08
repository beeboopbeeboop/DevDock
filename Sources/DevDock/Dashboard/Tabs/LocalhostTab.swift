import SwiftUI

struct LocalhostTab: View {
    let project: DevDockProject
    @Bindable var terminalState: TerminalState
    let isRunning: Bool

    @State private var editingPort = false
    @State private var portValue = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Status card
            HStack(spacing: 12) {
                // Status dot
                Circle()
                    .fill(isRunning ? Color.green : Color.gray)
                    .frame(width: 10, height: 10)

                VStack(alignment: .leading, spacing: 2) {
                    Text(isRunning ? "Running" : "Stopped")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(.white)

                    if let port = project.devPort {
                        HStack(spacing: 4) {
                            if editingPort {
                                TextField("Port", text: $portValue)
                                    .textFieldStyle(.plain)
                                    .font(.system(size: 11, design: .monospaced))
                                    .frame(width: 60)
                                    .padding(.horizontal, 4)
                                    .padding(.vertical, 2)
                                    .background(RoundedRectangle(cornerRadius: 3).fill(.white.opacity(0.06)))
                                    .onSubmit { savePort() }
                                Button("Save") { savePort() }
                                    .font(.system(size: 10))
                                Button("Cancel") { editingPort = false }
                                    .font(.system(size: 10))
                                    .foregroundStyle(.secondary)
                            } else {
                                Text("http://localhost:\(port)")
                                    .font(.system(size: 11, design: .monospaced))
                                    .foregroundStyle(.secondary)
                                    .textSelection(.enabled)

                                Button(action: {
                                    portValue = "\(port)"
                                    editingPort = true
                                }) {
                                    Image(systemName: "pencil")
                                        .font(.system(size: 9))
                                        .foregroundStyle(.tertiary)
                                }
                                .buttonStyle(.plain)

                                Button(action: {
                                    if let url = URL(string: "http://localhost:\(port)") {
                                        NSWorkspace.shared.open(url)
                                    }
                                }) {
                                    Image(systemName: "arrow.up.right.square")
                                        .font(.system(size: 9))
                                        .foregroundStyle(.tertiary)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                    }
                }

                Spacer()

                // Start/Stop button
                if isRunning {
                    Button(action: {
                        Task {
                            _ = await APIClient.shared.stopDev(projectId: project.id)
                            terminalState.stop()
                        }
                    }) {
                        HStack(spacing: 4) {
                            Image(systemName: "stop.fill")
                                .font(.system(size: 8))
                            Text("Stop")
                                .font(.system(size: 11, weight: .medium))
                        }
                        .foregroundStyle(.red)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(RoundedRectangle(cornerRadius: 6).fill(.red.opacity(0.1)))
                    }
                    .buttonStyle(.plain)
                } else {
                    Button(action: {
                        Task {
                            _ = await APIClient.shared.startDev(projectId: project.id)
                            terminalState.start()
                        }
                    }) {
                        HStack(spacing: 4) {
                            Image(systemName: "play.fill")
                                .font(.system(size: 8))
                            Text("Start Dev")
                                .font(.system(size: 11, weight: .medium))
                        }
                        .foregroundStyle(.green)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(RoundedRectangle(cornerRadius: 6).fill(.green.opacity(0.1)))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(12)
            .background(RoundedRectangle(cornerRadius: 8).fill(.white.opacity(0.03)))

            // Auto-restart info
            if terminalState.autoRestart {
                HStack(spacing: 6) {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 9))
                        .foregroundStyle(.orange)
                    Text("Auto-restart enabled")
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                    if terminalState.restartCount > 0 {
                        Text("(\(terminalState.restartCount)x)")
                            .font(.system(size: 10))
                            .foregroundStyle(.orange)
                    }
                }
            }

            // Dev command
            if let cmd = project.devCommand ?? project.detectedDevCommand {
                HStack {
                    Text("Command:")
                        .font(.system(size: 10))
                        .foregroundStyle(.tertiary)
                    Text(cmd)
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(.secondary)
                }
            }

            // Terminal output
            TerminalView(
                lines: terminalState.lines,
                isConnected: terminalState.isConnected
            )
            .frame(minHeight: 300)
        }
    }

    private func savePort() {
        editingPort = false
        guard let port = Int(portValue) else { return }
        Task {
            _ = await APIClient.shared.updateOverride(projectId: project.id, overrides: ["devPort": port])
        }
    }
}
