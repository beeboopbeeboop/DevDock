import SwiftUI

struct ProjectCardView: View {
    let project: DevDockProject
    let isFocused: Bool
    let isRunning: Bool
    let onSelect: () -> Void
    let onToggleFavorite: () -> Void

    @State private var isHovered = false

    private var typeColor: Color { ProjectType.color(for: project.type) }
    private var typeLabel: String {
        let labels: [String: String] = ["cep-plugin": "Ae", "nextjs": "N", "vite-react": "V", "framer-plugin": "F",
            "cloudflare-worker": "CF", "hono-server": "H", "static-site": "S", "node-package": "np", "swift-app": "Sw"]
        return labels[project.type] ?? "?"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Header
            HStack(spacing: 10) {
                // Type badge
                Text(typeLabel)
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundStyle(typeColor)
                    .frame(width: 32, height: 32)
                    .background(
                        RoundedRectangle(cornerRadius: 8)
                            .fill(typeColor.opacity(0.12))
                            .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(typeColor.opacity(0.18), lineWidth: 1))
                    )

                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 4) {
                        Text(project.name)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                        if project.isFavorite {
                            Image(systemName: "star.fill")
                                .font(.system(size: 8))
                                .foregroundStyle(.yellow)
                        }
                    }

                    Text(project.path.replacingOccurrences(of: FileManager.default.homeDirectoryForCurrentUser.path, with: "~"))
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                }

                Spacer()

                // Status indicators
                HStack(spacing: 6) {
                    if isRunning, let port = project.devPort {
                        HStack(spacing: 3) {
                            Circle().fill(.green).frame(width: 5, height: 5)
                            Text(":\(port)")
                                .font(.system(size: 9, design: .monospaced))
                                .foregroundStyle(.green)
                        }
                        .padding(.horizontal, 5)
                        .padding(.vertical, 2)
                        .background(RoundedRectangle(cornerRadius: 4).fill(.green.opacity(0.1)))
                    }

                    if let priority = project.priority {
                        let tier = PriorityTier.tier(from: priority)
                        let tierColor = PriorityTier.colors[tier] ?? .gray
                        Text(PriorityTier.labels[tier] ?? "P4")
                            .font(.system(size: 8, weight: .bold))
                            .foregroundStyle(tierColor)
                            .padding(.horizontal, 4)
                            .padding(.vertical, 1)
                            .background(RoundedRectangle(cornerRadius: 3).strokeBorder(tierColor.opacity(0.3), lineWidth: 1))
                    }
                }
            }

            // Description
            if let desc = project.description, !desc.isEmpty {
                Text(desc)
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            // Tech badges
            HStack(spacing: 4) {
                Text(ProjectType.label(for: project.type))
                    .font(.system(size: 9, weight: .medium))
                    .foregroundStyle(typeColor)
                    .padding(.horizontal, 5)
                    .padding(.vertical, 2)
                    .background(RoundedRectangle(cornerRadius: 3).fill(typeColor.opacity(0.1)))

                if let stack = project.techStack {
                    ForEach(stack.prefix(3), id: \.self) { tech in
                        Text(tech)
                            .font(.system(size: 9))
                            .foregroundStyle(.tertiary)
                            .padding(.horizontal, 4)
                            .padding(.vertical, 2)
                            .background(RoundedRectangle(cornerRadius: 3).fill(.white.opacity(0.04)))
                    }
                    if stack.count > 3 {
                        Text("+\(stack.count - 3)")
                            .font(.system(size: 9))
                            .foregroundStyle(.quaternary)
                    }
                }
            }

            // Footer
            HStack(spacing: 8) {
                if let branch = project.gitBranch {
                    HStack(spacing: 3) {
                        Image(systemName: "arrow.triangle.branch")
                            .font(.system(size: 8))
                        Text(branch)
                            .font(.system(size: 9))
                    }
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)
                }

                if project.gitDirty, let count = project.gitDirtyCount, count > 0 {
                    HStack(spacing: 2) {
                        Circle().fill(.orange).frame(width: 4, height: 4)
                        Text("\(count)")
                            .font(.system(size: 9))
                            .foregroundStyle(.orange)
                    }
                }

                Spacer()

                // Quick actions
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
                    if project.devPort != nil {
                        CardActionButton(icon: "play.fill", tooltip: "Start Dev") {
                            Task { _ = await APIClient.shared.startDev(projectId: project.id) }
                        }
                    }
                }
                .opacity(isHovered ? 1 : 0)
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(Color.white.opacity(isFocused ? 0.06 : isHovered ? 0.04 : 0.02))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .strokeBorder(isFocused ? typeColor.opacity(0.4) : .white.opacity(0.06), lineWidth: 1)
        )
        .contentShape(Rectangle())
        .onTapGesture { onSelect() }
        .onHover { isHovered = $0 }
        .contextMenu { ProjectContextMenu(project: project, onToggleFavorite: onToggleFavorite) }
    }
}

struct CardActionButton: View {
    let icon: String
    let tooltip: String
    let action: () -> Void

    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: 9))
                .foregroundStyle(isHovered ? Color.white : Color.gray)
                .frame(width: 22, height: 22)
                .background(RoundedRectangle(cornerRadius: 4).fill(isHovered ? .white.opacity(0.1) : .clear))
        }
        .buttonStyle(.plain)
        .help(tooltip)
        .onHover { isHovered = $0 }
    }
}

struct ProjectContextMenu: View {
    let project: DevDockProject
    let onToggleFavorite: () -> Void

    var body: some View {
        Group {
            Menu("Open In...") {
                Button("VS Code") { Task { await APIClient.shared.openEditor(projectId: project.id, editor: "code") } }
                Button("Cursor") { Task { await APIClient.shared.openEditor(projectId: project.id, editor: "cursor") } }
                Button("Terminal") { Task { await APIClient.shared.openTerminal(projectId: project.id) } }
                Button("Finder") { Task { await APIClient.shared.openFinder(projectId: project.id) } }
            }

            if let port = project.devPort {
                Button("Open Localhost :\(port)") {
                    if let url = URL(string: "http://localhost:\(port)") {
                        NSWorkspace.shared.open(url)
                    }
                }
            }

            if let url = project.githubUrl {
                Button("Open on GitHub") {
                    if let u = URL(string: url) { NSWorkspace.shared.open(u) }
                }
            }

            if let url = project.deployUrl {
                Button("Open Deploy URL") {
                    if let u = URL(string: url) { NSWorkspace.shared.open(u) }
                }
            }

            Divider()

            Button(project.isFavorite ? "Remove from Favorites" : "Add to Favorites") {
                onToggleFavorite()
            }

            Button("Copy Path") {
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(project.path, forType: .string)
            }

            Divider()

            if project.hasGit ?? false {
                Button("Git Pull") {
                    Task { await APIClient.shared.gitPull(path: project.path) }
                }
            }

            if project.devCommand != nil || project.detectedDevCommand != nil {
                Button("Start Dev Server") {
                    Task { _ = await APIClient.shared.startDev(projectId: project.id) }
                }
            }
        }
    }
}
