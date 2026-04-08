import SwiftUI

struct PortManagerView: View {
    @State private var ports: [APIClient.PortEntry] = []
    @State private var conflicts: [APIClient.PortConflict] = []
    @State private var isLoading = true
    @State private var searchQuery = ""
    @State private var filter = "all" // all, projects, conflicts

    private var filteredPorts: [APIClient.PortEntry] {
        var result = ports
        if filter == "projects" {
            result = result.filter { $0.projectId != nil }
        }
        if !searchQuery.isEmpty {
            let q = searchQuery.lowercased()
            result = result.filter {
                "\($0.port)".contains(q) ||
                $0.command.lowercased().contains(q) ||
                ($0.projectName?.lowercased().contains(q) ?? false)
            }
        }
        return result
    }

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack(spacing: 12) {
                Text("Ports")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                Text("\(ports.count)")
                    .font(.system(size: 11))
                    .foregroundStyle(.tertiary)
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(RoundedRectangle(cornerRadius: 4).fill(.white.opacity(0.04)))

                Spacer()

                // Filter pills
                HStack(spacing: 4) {
                    FilterPill(label: "All", isActive: filter == "all") { filter = "all" }
                    FilterPill(label: "Projects", isActive: filter == "projects") { filter = "projects" }
                    FilterPill(label: "Conflicts (\(conflicts.count))", isActive: filter == "conflicts") { filter = "conflicts" }
                }

                // Search
                HStack(spacing: 4) {
                    Image(systemName: "magnifyingglass").font(.system(size: 10)).foregroundStyle(.tertiary)
                    TextField("Search ports...", text: $searchQuery)
                        .textFieldStyle(.plain).font(.system(size: 11)).frame(width: 100)
                }
                .padding(.horizontal, 8).padding(.vertical, 4)
                .background(RoundedRectangle(cornerRadius: 6).fill(.white.opacity(0.04)))

                Button(action: { Task { await refresh() } }) {
                    Image(systemName: "arrow.clockwise").font(.system(size: 10)).foregroundStyle(.secondary)
                }.buttonStyle(.plain)
            }
            .padding(.horizontal, 16).padding(.vertical, 10)

            Divider().opacity(0.3)

            if filter == "conflicts" {
                // Conflicts view
                ScrollView {
                    LazyVStack(spacing: 1) {
                        ForEach(conflicts) { conflict in
                            HStack(spacing: 12) {
                                Text(":\(conflict.port)")
                                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                                    .foregroundStyle(.orange)
                                    .frame(width: 60, alignment: .leading)
                                Text(conflict.type)
                                    .font(.system(size: 10))
                                    .foregroundStyle(.secondary)
                                Spacer()
                                Button(action: { Task { _ = await APIClient.shared.killPort(port: conflict.port); await refresh() } }) {
                                    Text("Kill").font(.system(size: 9)).foregroundStyle(.red)
                                }.buttonStyle(.plain)
                            }
                            .padding(.horizontal, 16).padding(.vertical, 6)
                        }
                    }.padding(.vertical, 8)
                }
            } else {
                // Port list
                ScrollView {
                    LazyVStack(spacing: 1) {
                        ForEach(filteredPorts) { port in
                            HStack(spacing: 12) {
                                Text(":\(port.port)")
                                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                                    .foregroundStyle(.white)
                                    .frame(width: 60, alignment: .leading)
                                Text("\(port.pid)")
                                    .font(.system(size: 10, design: .monospaced))
                                    .foregroundStyle(.tertiary)
                                    .frame(width: 50, alignment: .leading)
                                Text(port.command)
                                    .font(.system(size: 10))
                                    .foregroundStyle(.secondary)
                                    .lineLimit(1)
                                Spacer()
                                if let name = port.projectName {
                                    Text(name)
                                        .font(.system(size: 10, weight: .medium))
                                        .foregroundStyle(.blue)
                                }
                                Button(action: { Task { _ = await APIClient.shared.killPort(port: port.port); await refresh() } }) {
                                    Image(systemName: "xmark.circle")
                                        .font(.system(size: 10)).foregroundStyle(.tertiary)
                                }.buttonStyle(.plain).help("Kill process")
                            }
                            .padding(.horizontal, 16).padding(.vertical, 5)
                            .background(Color.white.opacity(0.01))
                        }
                    }.padding(.vertical, 8)
                }
            }
        }
    }

    private func refresh() async {
        isLoading = true
        async let p = APIClient.shared.fetchAllPorts()
        async let c = APIClient.shared.fetchPortConflicts()
        ports = await p
        conflicts = await c
        isLoading = false
    }
}

struct FilterPill: View {
    let label: String
    let isActive: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.system(size: 10))
                .foregroundStyle(isActive ? .white : .secondary)
                .padding(.horizontal, 8).padding(.vertical, 4)
                .background(RoundedRectangle(cornerRadius: 5).fill(isActive ? .white.opacity(0.1) : .white.opacity(0.03)))
        }.buttonStyle(.plain)
    }
}
