import SwiftUI

struct ProjectDetailView: View {
    let project: DevDockProject
    let isRunning: Bool
    let onClose: () -> Void

    @State private var selectedTab = "overview"
    @State private var terminalState: TerminalState

    init(project: DevDockProject, isRunning: Bool, onClose: @escaping () -> Void) {
        self.project = project
        self.isRunning = isRunning
        self.onClose = onClose
        self._terminalState = State(initialValue: TerminalState(projectId: project.id))
    }

    private let tabs: [(id: String, label: String, icon: String)] = [
        ("overview", "Overview", "info.circle"),
        ("files", "Files", "folder"),
        ("localhost", "Localhost", "network"),
        ("git", "Git", "arrow.triangle.branch"),
        ("github", "GitHub", "globe"),
        ("deploy", "Deploy", "paperplane"),
        ("deps", "Deps", "shippingbox"),
        ("docker", "Docker", "cube"),
        ("notes", "Notes", "note.text"),
    ]

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(project.name)
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(.white)
                        if project.isFavorite {
                            Image(systemName: "star.fill")
                                .font(.system(size: 10))
                                .foregroundStyle(.yellow)
                        }
                    }
                    Text(ProjectType.label(for: project.type))
                        .font(.system(size: 11))
                        .foregroundStyle(ProjectType.color(for: project.type))
                }

                Spacer()

                // Quick actions
                HStack(spacing: 4) {
                    DetailActionButton(icon: "chevron.left.forwardslash.chevron.right", tooltip: "VS Code") {
                        Task { await APIClient.shared.openEditor(projectId: project.id, editor: "code") }
                    }
                    DetailActionButton(icon: "terminal", tooltip: "Terminal") {
                        Task { await APIClient.shared.openTerminal(projectId: project.id) }
                    }
                    DetailActionButton(icon: "folder", tooltip: "Finder") {
                        Task { await APIClient.shared.openFinder(projectId: project.id) }
                    }
                }

                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.tertiary)
                        .frame(width: 24, height: 24)
                        .background(Circle().fill(.white.opacity(0.06)))
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)

            // Tab bar
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 2) {
                    ForEach(tabs, id: \.id) { tab in
                        DetailTabButton(
                            icon: tab.icon,
                            label: tab.label,
                            isActive: selectedTab == tab.id
                        ) {
                            selectedTab = tab.id
                        }
                    }
                }
                .padding(.horizontal, 12)
            }
            .padding(.bottom, 8)

            Divider().opacity(0.3)

            // Tab content
            ScrollView {
                Group {
                    switch selectedTab {
                    case "overview":
                        OverviewTab(project: project)
                    case "files":
                        FilesTab(project: project)
                    case "localhost":
                        LocalhostTab(project: project, terminalState: terminalState, isRunning: isRunning)
                    case "git":
                        GitTab(project: project)
                    case "github":
                        GitHubTab(project: project)
                    case "deploy":
                        DeployTab(project: project)
                    case "deps":
                        DepsTab(project: project)
                    case "docker":
                        DockerTab(project: project)
                    case "notes":
                        NotesTab(project: project)
                    default:
                        EmptyView()
                    }
                }
                .padding(16)
            }
        }
        .background(Color(red: 0.07, green: 0.07, blue: 0.09))
        .onAppear {
            if isRunning {
                terminalState.start()
            }
        }
        .onDisappear {
            terminalState.stop()
        }
        .onChange(of: project.id) { _, _ in
            terminalState.stop()
        }
    }
}

struct DetailActionButton: View {
    let icon: String
    let tooltip: String
    let action: () -> Void

    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 10))
                .foregroundStyle(isHovered ? .white : .secondary)
                .frame(width: 26, height: 26)
                .background(RoundedRectangle(cornerRadius: 5).fill(isHovered ? .white.opacity(0.1) : .white.opacity(0.04)))
        }
        .buttonStyle(.plain)
        .help(tooltip)
        .onHover { isHovered = $0 }
    }
}

struct DetailTabButton: View {
    let icon: String
    let label: String
    let isActive: Bool
    let action: () -> Void

    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: icon)
                    .font(.system(size: 9))
                Text(label)
                    .font(.system(size: 11))
            }
            .foregroundStyle(isActive ? .white : .secondary)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(
                RoundedRectangle(cornerRadius: 5)
                    .fill(isActive ? .white.opacity(0.1) : isHovered ? .white.opacity(0.04) : .clear)
            )
        }
        .buttonStyle(.plain)
        .onHover { isHovered = $0 }
    }
}

struct PlaceholderTab: View {
    let name: String
    let phase: Int

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "hammer.fill")
                .font(.system(size: 24))
                .foregroundStyle(.quaternary)
            Text("\(name) \u{2014} Phase \(phase)")
                .font(.system(size: 12))
                .foregroundStyle(.tertiary)
        }
        .frame(maxWidth: .infinity, minHeight: 200)
    }
}
