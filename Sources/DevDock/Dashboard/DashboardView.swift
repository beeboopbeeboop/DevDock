import SwiftUI

/// Root dashboard view — sidebar + content + detail panel.
struct DashboardView: View {
    @State private var appState = AppState.shared
    @State private var projectsState = ProjectsState()
    @State private var toastState = ToastState()
    @State private var appView = Preferences.lastAppView
    @State private var settingsOpen = false

    private var runningIds: Set<String> {
        Set(appState.processes.map(\.projectId))
    }

    var body: some View {
        HStack(spacing: 0) {
            // Sidebar
            SidebarView(
                projectsState: projectsState,
                appState: appState,
                appView: $appView
            )

            Divider().opacity(0.3)

            // Main content
            MainContentView(
                appView: appView,
                projectsState: projectsState,
                runningIds: runningIds
            )

            // Detail panel
            DetailPanelContainer(projectsState: projectsState, runningIds: runningIds)
        }
        .animation(.easeOut(duration: 0.2), value: projectsState.selectedProject?.id)
        .modifier(DashboardOverlays(
            projectsState: projectsState,
            toastState: toastState,
            settingsOpen: $settingsOpen
        ))
        .task {
            appState.startPolling()
            await projectsState.refresh()
        }
        .onChange(of: appView) { _, newValue in
            Preferences.lastAppView = newValue
        }
        .focusable()
        .modifier(DashboardKeyboard(
            appView: $appView,
            settingsOpen: $settingsOpen,
            projectsState: projectsState
        ))
    }
}

// MARK: - Detail Panel Container

struct DetailPanelContainer: View {
    @Bindable var projectsState: ProjectsState
    let runningIds: Set<String>

    var body: some View {
        if let project = projectsState.selectedProject {
            Divider().opacity(0.3)
            ProjectDetailView(
                project: project,
                isRunning: runningIds.contains(project.id),
                onClose: { projectsState.selectProject(nil) }
            )
            .frame(width: 400)
            .transition(.move(edge: .trailing))
        }
    }
}

// MARK: - Main Content

struct MainContentView: View {
    let appView: String
    @Bindable var projectsState: ProjectsState
    let runningIds: Set<String>

    var body: some View {
        ZStack {
            Color(red: 0.08, green: 0.08, blue: 0.10)
                .ignoresSafeArea()

            VStack(spacing: 0) {
                if appView == "projects" || appView == "archive" {
                    ProjectsTopbar(projectsState: projectsState, appView: appView)
                }

                mainView
            }
        }
    }

    @ViewBuilder
    private var mainView: some View {
        switch appView {
        case "projects":
            if projectsState.viewMode == "grid" {
                ProjectGridView(projects: projectsState.filteredProjects, runningIds: runningIds, focusedIndex: projectsState.focusedIndex, projectsState: projectsState)
            } else {
                ProjectListView(projects: projectsState.filteredProjects, runningIds: runningIds, focusedIndex: projectsState.focusedIndex, projectsState: projectsState)
            }
        case "archive":
            ProjectGridView(projects: projectsState.archivedProjects, runningIds: runningIds, focusedIndex: 0, projectsState: projectsState)
        case "ports":
            PortManagerView()
        case "docker":
            DockerManagerView()
        case "search":
            CrossSearchView()
        case "env":
            EnvSyncView()
        case "insights":
            InsightsView()
        case "graph":
            GraphView()
        default:
            EmptyView()
        }
    }
}

// MARK: - Projects Topbar

struct ProjectsTopbar: View {
    @Bindable var projectsState: ProjectsState
    let appView: String

    var body: some View {
        HStack(spacing: 12) {
            // Title + count
            Text(appView == "archive" ? "Archive" : "Projects")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(.white)

            Text("\(appView == "archive" ? projectsState.archivedProjects.count : projectsState.filteredProjects.count)")
                .font(.system(size: 11))
                .foregroundStyle(.tertiary)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(RoundedRectangle(cornerRadius: 4).fill(.white.opacity(0.04)))

            if projectsState.isLoading {
                ProgressView()
                    .scaleEffect(0.5)
            } else if projectsState.scanComplete {
                Image(systemName: "checkmark")
                    .font(.system(size: 10))
                    .foregroundStyle(.green)
            }

            Spacer()

            if appView == "projects" {
                // Search
                HStack(spacing: 6) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 10))
                        .foregroundStyle(.tertiary)
                    TextField("Filter...", text: $projectsState.searchQuery)
                        .textFieldStyle(.plain)
                        .font(.system(size: 11))
                        .frame(width: 120)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(RoundedRectangle(cornerRadius: 6).fill(.white.opacity(0.04)))

                // Sort
                Menu {
                    Button("Priority") { projectsState.setSortMode("priority") }
                    Button("Name") { projectsState.setSortMode("name") }
                    Button("Last Modified") { projectsState.setSortMode("lastModified") }
                    Button("Type") { projectsState.setSortMode("type") }
                } label: {
                    HStack(spacing: 3) {
                        Image(systemName: "arrow.up.arrow.down")
                            .font(.system(size: 9))
                        Text(projectsState.sortMode.capitalized)
                            .font(.system(size: 10))
                    }
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(RoundedRectangle(cornerRadius: 6).fill(.white.opacity(0.04)))
                }

                // View toggle
                HStack(spacing: 0) {
                    TopbarViewButton(icon: "square.grid.2x2", isActive: projectsState.viewMode == "grid") {
                        projectsState.setViewMode("grid")
                    }
                    TopbarViewButton(icon: "list.bullet", isActive: projectsState.viewMode == "list") {
                        projectsState.setViewMode("list")
                    }
                }
                .background(RoundedRectangle(cornerRadius: 6).fill(.white.opacity(0.04)))
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Color(red: 0.08, green: 0.08, blue: 0.10))
    }
}

struct TopbarViewButton: View {
    let icon: String
    let isActive: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 10))
                .foregroundStyle(isActive ? Color.white : Color.gray)
                .frame(width: 28, height: 24)
                .background(isActive ? Color.white.opacity(0.08) : .clear)
        }
        .buttonStyle(.plain)
    }
}

/// Extracted overlays to help the compiler with type-checking
struct DashboardOverlays: ViewModifier {
    let projectsState: ProjectsState
    let toastState: ToastState
    @Binding var settingsOpen: Bool

    func body(content: Content) -> some View {
        content
            .overlay(alignment: .bottom) {
                if projectsState.batchMode && !projectsState.selectedIds.isEmpty {
                    BatchBar(
                        selectedIds: projectsState.selectedIds,
                        onDeselect: { projectsState.selectedIds.removeAll(); projectsState.batchMode = false }
                    )
                }
            }
            .overlay(alignment: .top) {
                if let msg = toastState.message {
                    ToastOverlay(message: msg, isSuccess: toastState.isSuccess)
                        .padding(.top, 12)
                }
            }
            .sheet(isPresented: $settingsOpen) {
                SettingsView(isPresented: $settingsOpen)
            }
            .onReceive(NotificationCenter.default.publisher(for: .devdockOpenSettings)) { _ in
                settingsOpen = true
            }
    }
}

extension Notification.Name {
    /// Posted to ask the dashboard to open its Settings sheet (e.g. from the
    /// command palette gear button).
    static let devdockOpenSettings = Notification.Name("DevDockOpenSettings")
}

/// Keyboard shortcuts via NSEvent local monitor (works with modifier keys)
struct DashboardKeyboard: ViewModifier {
    @Binding var appView: String
    @Binding var settingsOpen: Bool
    let projectsState: ProjectsState

    func body(content: Content) -> some View {
        content
            .onKeyPress(.escape) { handleEscape() }
            .onKeyPress(.upArrow) {
                guard appView == "projects" else { return .ignored }
                projectsState.moveUp(); return .handled
            }
            .onKeyPress(.downArrow) {
                guard appView == "projects" else { return .ignored }
                projectsState.moveDown(); return .handled
            }
            .onKeyPress(.return) {
                guard appView == "projects" else { return .ignored }
                projectsState.selectFocused(); return .handled
            }
            .onAppear { installKeyMonitor() }
    }

    private func handleEscape() -> KeyPress.Result {
        if settingsOpen { settingsOpen = false; return .handled }
        if projectsState.selectedProject != nil {
            projectsState.selectProject(nil)
            return .handled
        }
        return .ignored
    }

    private func installKeyMonitor() {
        NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
            guard event.modifierFlags.contains(.command) else { return event }
            switch event.charactersIgnoringModifiers {
            case "k": CommandPaletteWindowController.shared.toggle(); return nil
            case "b":
                projectsState.batchMode.toggle()
                if !projectsState.batchMode { projectsState.selectedIds.removeAll() }
                return nil
            case ",": settingsOpen.toggle(); return nil
            case "1": appView = "projects"; return nil
            case "2": appView = "ports"; return nil
            case "3": appView = "docker"; return nil
            case "4": appView = "graph"; return nil
            case "5": appView = "search"; return nil
            default: return event
            }
        }
    }
}
