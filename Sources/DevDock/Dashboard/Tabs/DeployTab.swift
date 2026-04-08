import SwiftUI

struct DeployTab: View {
    let project: DevDockProject

    @State private var history: [APIClient.DeployHistoryEntry] = []
    @State private var health: APIClient.DeployHealth? = nil
    @State private var isLoading = true

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if project.deployTarget == nil || project.deployTarget == "none" {
                VStack(spacing: 8) {
                    Image(systemName: "paperplane")
                        .font(.system(size: 24))
                        .foregroundStyle(.quaternary)
                    Text("No deploy target configured")
                        .font(.system(size: 12))
                        .foregroundStyle(.tertiary)
                }
                .frame(maxWidth: .infinity, minHeight: 150)
            } else if isLoading {
                ProgressView().frame(maxWidth: .infinity, minHeight: 100)
            } else {
                // Health
                if let h = health {
                    HStack(spacing: 8) {
                        Circle().fill(h.healthy ? Color.green : Color.red).frame(width: 8, height: 8)
                        Text(h.healthy ? "Healthy" : "Unhealthy")
                            .font(.system(size: 12, weight: .medium))
                        if let time = h.responseTime {
                            Text("\(time)ms")
                                .font(.system(size: 10, design: .monospaced))
                                .foregroundStyle(.tertiary)
                        }
                        Spacer()
                        if let url = h.url {
                            Button(action: {
                                if let u = URL(string: url) { NSWorkspace.shared.open(u) }
                            }) {
                                Text("Open")
                                    .font(.system(size: 10))
                                    .foregroundStyle(.blue)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(10)
                    .background(RoundedRectangle(cornerRadius: 6).fill(.white.opacity(0.03)))
                }

                // Deploy actions
                HStack(spacing: 8) {
                    ForEach(["preview", "production"], id: \.self) { env in
                        Button(action: {
                            Task { _ = await APIClient.shared.deployTrigger(projectId: project.id, environment: env) }
                        }) {
                            Text("Deploy \(env)")
                                .font(.system(size: 10, weight: .medium))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(RoundedRectangle(cornerRadius: 5).fill(env == "production" ? .blue.opacity(0.3) : .white.opacity(0.08)))
                        }
                        .buttonStyle(.plain)
                    }
                }

                // History
                if !history.isEmpty {
                    Text("DEPLOYMENT HISTORY")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.tertiary)
                        .tracking(0.5)

                    ForEach(history) { entry in
                        HStack(spacing: 8) {
                            Circle()
                                .fill(entry.status == "ready" ? Color.green : entry.status == "error" ? Color.red : Color.yellow)
                                .frame(width: 6, height: 6)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(entry.environment ?? "production")
                                    .font(.system(size: 11, weight: .medium))
                                Text(entry.createdAt ?? "")
                                    .font(.system(size: 9))
                                    .foregroundStyle(.tertiary)
                            }
                            Spacer()
                            Text(entry.status)
                                .font(.system(size: 9))
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
        }
        .task { await loadData() }
    }

    private func loadData() async {
        async let h = APIClient.shared.deployHealth(projectId: project.id)
        async let hist = APIClient.shared.deployHistory(projectId: project.id)
        health = await h
        history = await hist
        isLoading = false
    }
}
