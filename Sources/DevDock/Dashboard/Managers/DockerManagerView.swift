import SwiftUI

struct DockerManagerView: View {
    @State private var containers: [APIClient.DockerContainer] = []
    @State private var isAvailable = false
    @State private var isLoading = true
    @State private var filter = "all" // all, running, stopped

    private var filteredContainers: [APIClient.DockerContainer] {
        switch filter {
        case "running": return containers.filter { $0.state == "running" }
        case "stopped": return containers.filter { $0.state != "running" }
        default: return containers
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack(spacing: 12) {
                Text("Docker")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)

                let running = containers.filter { $0.state == "running" }.count
                if running > 0 {
                    Text("\(running) running")
                        .font(.system(size: 10))
                        .foregroundStyle(.green)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(RoundedRectangle(cornerRadius: 4).fill(.green.opacity(0.08)))
                }

                Spacer()

                HStack(spacing: 4) {
                    FilterPill(label: "All", isActive: filter == "all") { filter = "all" }
                    FilterPill(label: "Running", isActive: filter == "running") { filter = "running" }
                    FilterPill(label: "Stopped", isActive: filter == "stopped") { filter = "stopped" }
                }

                Button(action: { Task { await refresh() } }) {
                    Image(systemName: "arrow.clockwise").font(.system(size: 10)).foregroundStyle(.secondary)
                }.buttonStyle(.plain)
            }
            .padding(.horizontal, 16).padding(.vertical, 10)

            Divider().opacity(0.3)

            if !isAvailable {
                VStack(spacing: 8) {
                    Image(systemName: "cube").font(.system(size: 28)).foregroundStyle(.quaternary)
                    Text("Docker is not running").font(.system(size: 13)).foregroundStyle(.tertiary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 1) {
                        ForEach(filteredContainers) { container in
                            HStack(spacing: 10) {
                                Circle()
                                    .fill(container.state == "running" ? Color.green : Color.gray)
                                    .frame(width: 6, height: 6)

                                VStack(alignment: .leading, spacing: 1) {
                                    Text(container.name)
                                        .font(.system(size: 12, weight: .medium))
                                        .foregroundStyle(.white)
                                    Text(container.image)
                                        .font(.system(size: 9))
                                        .foregroundStyle(.tertiary)
                                        .lineLimit(1)
                                }

                                Spacer()

                                if !container.ports.isEmpty {
                                    Text(container.ports)
                                        .font(.system(size: 9, design: .monospaced))
                                        .foregroundStyle(.tertiary)
                                        .lineLimit(1)
                                }

                                Text(container.status)
                                    .font(.system(size: 9))
                                    .foregroundStyle(.secondary)
                                    .frame(width: 80, alignment: .trailing)

                                if container.state == "running" {
                                    Button(action: {
                                        Task { _ = await APIClient.shared.dockerAction("container-stop", containerId: container.id); await refresh() }
                                    }) {
                                        Image(systemName: "stop.fill").font(.system(size: 8)).foregroundStyle(.red)
                                    }.buttonStyle(.plain)

                                    Button(action: {
                                        Task { _ = await APIClient.shared.dockerAction("container-restart", containerId: container.id); await refresh() }
                                    }) {
                                        Image(systemName: "arrow.clockwise").font(.system(size: 8)).foregroundStyle(.secondary)
                                    }.buttonStyle(.plain)
                                }
                            }
                            .padding(.horizontal, 16).padding(.vertical, 6)
                        }
                    }.padding(.vertical, 8)
                }
            }
        }
        .task { await refresh() }
    }

    private func refresh() async {
        isLoading = true
        let result = await APIClient.shared.fetchDockerContainers()
        isAvailable = result.available
        containers = result.containers
        isLoading = false
    }
}
