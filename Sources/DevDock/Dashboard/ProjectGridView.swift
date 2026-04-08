import SwiftUI

struct ProjectGridView: View {
    let projects: [DevDockProject]
    let runningIds: Set<String>
    let focusedIndex: Int
    @Bindable var projectsState: ProjectsState

    private let columns = [
        GridItem(.adaptive(minimum: 320, maximum: 500), spacing: 12)
    ]

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                if projects.isEmpty {
                    EmptyProjectsView(hasFilters: projectsState.hasActiveFilters) {
                        projectsState.clearFilters()
                    }
                } else {
                    LazyVGrid(columns: columns, spacing: 12) {
                        ForEach(Array(projects.enumerated()), id: \.element.id) { index, project in
                            ProjectCardView(
                                project: project,
                                isFocused: index == focusedIndex,
                                isRunning: runningIds.contains(project.id),
                                onSelect: { projectsState.selectProject(project) },
                                onToggleFavorite: { projectsState.toggleFavorite(project.id) }
                            )
                            .id(project.id)
                        }
                    }
                    .padding(16)
                }
            }
            .onChange(of: focusedIndex) { _, newIndex in
                if newIndex < projects.count {
                    withAnimation(.easeOut(duration: 0.15)) {
                        proxy.scrollTo(projects[newIndex].id, anchor: .center)
                    }
                }
            }
        }
    }
}

struct ProjectListView: View {
    let projects: [DevDockProject]
    let runningIds: Set<String>
    let focusedIndex: Int
    @Bindable var projectsState: ProjectsState

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                if projects.isEmpty {
                    EmptyProjectsView(hasFilters: projectsState.hasActiveFilters) {
                        projectsState.clearFilters()
                    }
                } else {
                    LazyVStack(spacing: 1) {
                        ForEach(Array(projects.enumerated()), id: \.element.id) { index, project in
                            ProjectListRow(
                                project: project,
                                isFocused: index == focusedIndex,
                                isRunning: runningIds.contains(project.id),
                                onSelect: { projectsState.selectProject(project) },
                                onToggleFavorite: { projectsState.toggleFavorite(project.id) }
                            )
                            .id(project.id)
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                }
            }
            .onChange(of: focusedIndex) { _, newIndex in
                if newIndex < projects.count {
                    withAnimation(.easeOut(duration: 0.15)) {
                        proxy.scrollTo(projects[newIndex].id, anchor: .center)
                    }
                }
            }
        }
    }
}

struct ProjectListRow: View {
    let project: DevDockProject
    let isFocused: Bool
    let isRunning: Bool
    let onSelect: () -> Void
    let onToggleFavorite: () -> Void

    @State private var isHovered = false
    private var typeColor: Color { ProjectType.color(for: project.type) }

    var body: some View {
        HStack(spacing: 12) {
            // Type indicator
            Circle()
                .fill(typeColor)
                .frame(width: 6, height: 6)

            // Name
            Text(project.name)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.white)
                .frame(minWidth: 120, alignment: .leading)
                .lineLimit(1)

            if project.isFavorite {
                Image(systemName: "star.fill")
                    .font(.system(size: 8))
                    .foregroundStyle(.yellow)
            }

            // Type
            Text(ProjectType.label(for: project.type))
                .font(.system(size: 10))
                .foregroundStyle(typeColor)
                .frame(width: 80, alignment: .leading)

            // Branch
            if let branch = project.gitBranch {
                Text(branch)
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(.tertiary)
                    .frame(width: 100, alignment: .leading)
                    .lineLimit(1)
            } else {
                Spacer().frame(width: 100)
            }

            // Dirty
            if project.gitDirty {
                Circle().fill(.orange).frame(width: 4, height: 4)
            }

            // Running
            if isRunning {
                HStack(spacing: 3) {
                    Circle().fill(.green).frame(width: 4, height: 4)
                    Text(":\(project.devPort ?? 0)")
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundStyle(.green)
                }
            }

            Spacer()

            // Quick actions (on hover)
            if isHovered {
                HStack(spacing: 2) {
                    CardActionButton(icon: "chevron.left.forwardslash.chevron.right", tooltip: "VS Code") {
                        Task { await APIClient.shared.openEditor(projectId: project.id, editor: "code") }
                    }
                    CardActionButton(icon: "terminal", tooltip: "Terminal") {
                        Task { await APIClient.shared.openTerminal(projectId: project.id) }
                    }
                    CardActionButton(icon: "folder", tooltip: "Finder") {
                        Task { await APIClient.shared.openFinder(projectId: project.id) }
                    }
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(isFocused ? typeColor.opacity(0.1) : isHovered ? .white.opacity(0.03) : .clear)
        )
        .contentShape(Rectangle())
        .onTapGesture { onSelect() }
        .onHover { isHovered = $0 }
        .contextMenu { ProjectContextMenu(project: project, onToggleFavorite: onToggleFavorite) }
    }
}

struct EmptyProjectsView: View {
    let hasFilters: Bool
    let onClear: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 28))
                .foregroundStyle(.quaternary)
            Text(hasFilters ? "No matching projects" : "No projects found")
                .font(.system(size: 14))
                .foregroundStyle(.tertiary)
            if hasFilters {
                Button("Clear filters") { onClear() }
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            } else {
                Text("Run a scan to discover projects")
                    .font(.system(size: 11))
                    .foregroundStyle(.quaternary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.top, 100)
    }
}
