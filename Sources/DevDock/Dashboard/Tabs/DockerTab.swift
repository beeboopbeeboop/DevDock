import SwiftUI

struct DockerTab: View {
    let project: DevDockProject

    @State private var containers: [APIClient.DockerContainer] = []
    @State private var available = false
    @State private var isLoading = true

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if isLoading {
                ProgressView().frame(maxWidth: .infinity, minHeight: 100)
            } else if !available {
                VStack(spacing: 8) {
                    Image(systemName: "cube")
                        .font(.system(size: 24))
                        .foregroundStyle(.quaternary)
                    Text("Docker not available")
                        .font(.system(size: 12))
                        .foregroundStyle(.tertiary)
                }
                .frame(maxWidth: .infinity, minHeight: 150)
            } else {
                // Compose actions
                HStack(spacing: 8) {
                    Button("Up") {
                        Task { _ = await APIClient.shared.dockerAction("compose-up", path: project.path) }
                    }
                    .font(.system(size: 10))
                    Button("Down") {
                        Task { _ = await APIClient.shared.dockerAction("compose-down", path: project.path) }
                    }
                    .font(.system(size: 10))
                    Button("Restart") {
                        Task { _ = await APIClient.shared.dockerAction("compose-restart", path: project.path) }
                    }
                    .font(.system(size: 10))
                    Spacer()
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)

                if containers.isEmpty {
                    Text("No containers running")
                        .font(.system(size: 11))
                        .foregroundStyle(.tertiary)
                } else {
                    ForEach(containers) { container in
                        HStack(spacing: 8) {
                            Circle()
                                .fill(container.state == "running" ? Color.green : Color.gray)
                                .frame(width: 6, height: 6)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(container.name)
                                    .font(.system(size: 11, weight: .medium))
                                Text(container.image)
                                    .font(.system(size: 9))
                                    .foregroundStyle(.tertiary)
                            }
                            Spacer()
                            if !container.ports.isEmpty {
                                Text(container.ports)
                                    .font(.system(size: 9, design: .monospaced))
                                    .foregroundStyle(.tertiary)
                            }
                            Text(container.status)
                                .font(.system(size: 9))
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 3)
                    }
                }
            }
        }
        .task {
            let result = await APIClient.shared.fetchDockerContainers()
            available = result.available
            containers = result.containers
            isLoading = false
        }
    }
}
