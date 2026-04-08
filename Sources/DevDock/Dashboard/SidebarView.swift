import SwiftUI

struct SidebarView: View {
    @Bindable var projectsState: ProjectsState
    let appState: AppState
    @Binding var appView: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                Image(systemName: "square.grid.2x2")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.white)
                Text("DevDock")
                    .font(.system(size: 15, weight: .bold))
                    .foregroundStyle(.white)
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)

            // Search trigger
            Button(action: { CommandPaletteWindowController.shared.show() }) {
                HStack {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 11))
                        .foregroundStyle(.tertiary)
                    Text("Search or command...")
                        .font(.system(size: 11))
                        .foregroundStyle(.tertiary)
                    Spacer()
                    Text("\u{2318}K")
                        .font(.system(size: 9, weight: .medium, design: .monospaced))
                        .foregroundStyle(.quaternary)
                        .padding(.horizontal, 4)
                        .padding(.vertical, 2)
                        .background(RoundedRectangle(cornerRadius: 3).fill(.white.opacity(0.06)))
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .background(RoundedRectangle(cornerRadius: 6).fill(.white.opacity(0.04)))
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 12)
            .padding(.bottom, 12)

            Divider().opacity(0.3)

            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    // Views
                    SidebarSection(title: "VIEWS") {
                        SidebarNavItem(icon: "square.grid.2x2", label: "Projects", isActive: appView == "projects") {
                            appView = "projects"
                        }
                        SidebarNavItem(icon: "network", label: "Ports", isActive: appView == "ports", badge: appState.processes.count) {
                            appView = "ports"
                        }
                        SidebarNavItem(icon: "shippingbox", label: "Docker", isActive: appView == "docker") {
                            appView = "docker"
                        }
                        SidebarNavItem(icon: "point.3.connected.trianglepath.dotted", label: "Graph", isActive: appView == "graph") {
                            appView = "graph"
                        }
                        SidebarNavItem(icon: "shield.checkered", label: "Env Sync", isActive: appView == "env") {
                            appView = "env"
                        }
                        SidebarNavItem(icon: "chart.xyaxis.line", label: "Insights", isActive: appView == "insights") {
                            appView = "insights"
                        }
                        SidebarNavItem(icon: "magnifyingglass", label: "Search", isActive: appView == "search") {
                            appView = "search"
                        }
                        SidebarNavItem(icon: "archivebox", label: "Archive", isActive: appView == "archive", badge: projectsState.archivedProjects.count) {
                            appView = "archive"
                        }
                        .opacity(appView == "archive" ? 1 : 0.5)
                    }

                    // Status filters
                    let statusCounts = projectsState.statusCounts
                    if !statusCounts.isEmpty {
                        SidebarSection(title: "STATUS") {
                            ForEach(["active", "maintenance", "paused", "idea"], id: \.self) { status in
                                if let count = statusCounts[status], count > 0 {
                                    SidebarFilterItem(
                                        color: ProjectStatus.color(for: status),
                                        label: status.capitalized,
                                        count: count,
                                        isActive: projectsState.statusFilter == status
                                    ) {
                                        projectsState.statusFilter = projectsState.statusFilter == status ? nil : status
                                        appView = "projects"
                                    }
                                }
                            }

                            if projectsState.dirtyCount > 0 {
                                SidebarFilterItem(
                                    color: .orange,
                                    label: "Uncommitted",
                                    count: projectsState.dirtyCount,
                                    isActive: projectsState.showDirtyOnly,
                                    icon: "exclamationmark.triangle"
                                ) {
                                    projectsState.showDirtyOnly.toggle()
                                    appView = "projects"
                                }
                            }

                            if projectsState.hasActiveFilters {
                                Button("Clear filters") {
                                    projectsState.clearFilters()
                                }
                                .font(.system(size: 10))
                                .foregroundStyle(.secondary)
                                .padding(.leading, 8)
                            }
                        }
                    }

                    // Tags
                    let tagCounts = projectsState.tagCounts.sorted { $0.value > $1.value }.prefix(10)
                    if !tagCounts.isEmpty {
                        SidebarSection(title: "TAGS") {
                            ForEach(Array(tagCounts), id: \.key) { tag, count in
                                SidebarFilterItem(
                                    color: .blue,
                                    label: "#\(tag)",
                                    count: count,
                                    isActive: projectsState.tagFilter == tag,
                                    icon: nil
                                ) {
                                    projectsState.tagFilter = projectsState.tagFilter == tag ? nil : tag
                                    appView = "projects"
                                }
                            }
                        }
                    }

                    // Running servers
                    if !appState.processes.isEmpty {
                        SidebarSection(title: "RUNNING") {
                            ForEach(appState.processes) { proc in
                                HStack(spacing: 6) {
                                    Circle().fill(.green).frame(width: 5, height: 5)
                                    Text(proc.projectId)
                                        .font(.system(size: 11))
                                        .foregroundStyle(.primary)
                                        .lineLimit(1)
                                    Spacer()
                                }
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .contentShape(Rectangle())
                                .onTapGesture {
                                    if let project = projectsState.projects.first(where: { $0.id == proc.projectId }) {
                                        projectsState.selectProject(project)
                                        appView = "projects"
                                    }
                                }
                            }
                        }
                    }
                }
                .padding(.vertical, 12)
            }

            Divider().opacity(0.3)

            // Footer — Rescan
            Button(action: {
                Task { await projectsState.scan() }
            }) {
                HStack {
                    if projectsState.isLoading {
                        ProgressView().scaleEffect(0.5)
                    } else if projectsState.scanComplete {
                        Image(systemName: "checkmark")
                            .font(.system(size: 10))
                            .foregroundStyle(.green)
                    } else {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 10))
                    }
                    Text(projectsState.isLoading ? "Scanning..." : projectsState.scanComplete ? "Scan complete" : "Rescan")
                        .font(.system(size: 11))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
            }
            .buttonStyle(.plain)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .disabled(projectsState.isLoading)
        }
        .frame(width: 220)
        .background(Color(red: 0.06, green: 0.06, blue: 0.08))
    }
}

// MARK: - Sidebar Components

struct SidebarSection<Content: View>: View {
    let title: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.tertiary)
                .tracking(0.5)
                .padding(.horizontal, 16)
                .padding(.bottom, 4)
            content
        }
    }
}

struct SidebarNavItem: View {
    let icon: String
    let label: String
    let isActive: Bool
    var badge: Int = 0
    let action: () -> Void

    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 11))
                    .foregroundStyle(isActive ? .white : .secondary)
                    .frame(width: 16)
                Text(label)
                    .font(.system(size: 12))
                    .foregroundStyle(isActive ? .white : .primary)
                Spacer()
                if badge > 0 {
                    Text("\(badge)")
                        .font(.system(size: 9, weight: .medium))
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1)
                        .background(RoundedRectangle(cornerRadius: 3).fill(.white.opacity(0.06)))
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 5)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(isActive ? Color.accentColor.opacity(0.2) : isHovered ? .white.opacity(0.04) : .clear)
            )
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 8)
        .onHover { isHovered = $0 }
    }
}

struct SidebarFilterItem: View {
    let color: Color
    let label: String
    let count: Int
    let isActive: Bool
    var icon: String? = nil
    let action: () -> Void

    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let icon {
                    Image(systemName: icon)
                        .font(.system(size: 9))
                        .foregroundStyle(color)
                        .frame(width: 14)
                } else {
                    Circle()
                        .fill(color)
                        .frame(width: 6, height: 6)
                        .frame(width: 14)
                }
                Text(label)
                    .font(.system(size: 11))
                    .foregroundStyle(isActive ? .white : .primary)
                Spacer()
                Text("\(count)")
                    .font(.system(size: 9))
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 4)
            .background(
                RoundedRectangle(cornerRadius: 5)
                    .fill(isActive ? color.opacity(0.15) : isHovered ? .white.opacity(0.04) : .clear)
            )
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 8)
        .onHover { isHovered = $0 }
    }
}
