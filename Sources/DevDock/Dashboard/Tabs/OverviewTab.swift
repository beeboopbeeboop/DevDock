import SwiftUI

struct OverviewTab: View {
    let project: DevDockProject

    private var typeColor: Color { ProjectType.color(for: project.type) }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Project info
            DetailRow(label: "Type", value: ProjectType.label(for: project.type), color: typeColor)
            DetailRow(label: "Status", value: project.status.capitalized, color: ProjectStatus.color(for: project.status))
            DetailRow(label: "Path", value: project.path)

            if let priority = project.priority {
                let tier = PriorityTier.tier(from: priority)
                DetailRow(label: "Priority", value: "\(PriorityTier.labels[tier] ?? "P4") \u{2014} \(PriorityTier.descriptions[tier] ?? "")", color: PriorityTier.colors[tier])
            }

            if let desc = project.description, !desc.isEmpty {
                DetailRow(label: "Description", value: desc)
            }

            Divider().opacity(0.2)

            // Dev info
            if let port = project.devPort {
                DetailRow(label: "Dev Port", value: ":\(port)")
            }
            if let cmd = project.devCommand ?? project.detectedDevCommand {
                DetailRow(label: "Dev Command", value: cmd)
            }

            Divider().opacity(0.2)

            // Git info
            if let branch = project.gitBranch {
                DetailRow(label: "Branch", value: branch)
            }
            if project.gitDirty {
                DetailRow(label: "Dirty Files", value: "\(project.gitDirtyCount ?? 0) uncommitted", color: .orange)
            }

            // GitHub
            if let repo = project.githubRepo {
                DetailRow(label: "GitHub", value: repo)
            }

            // Deploy
            if let target = project.deployTarget, target != "none" {
                DetailRow(label: "Deploy Target", value: target.capitalized)
            }
            if let url = project.deployUrl {
                DetailRow(label: "Deploy URL", value: url)
            }

            Divider().opacity(0.2)

            // Tech stack
            if let stack = project.techStack, !stack.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Tech Stack")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(.tertiary)
                    FlowLayout(spacing: 4) {
                        ForEach(stack, id: \.self) { tech in
                            Text(tech)
                                .font(.system(size: 10))
                                .foregroundStyle(.secondary)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 3)
                                .background(RoundedRectangle(cornerRadius: 4).fill(.white.opacity(0.04)))
                        }
                    }
                }
            }

            // Tags
            if let tags = project.tags, !tags.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Tags")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(.tertiary)
                    FlowLayout(spacing: 4) {
                        ForEach(tags, id: \.self) { tag in
                            Text("#\(tag)")
                                .font(.system(size: 10))
                                .foregroundStyle(.blue)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 3)
                                .background(RoundedRectangle(cornerRadius: 4).fill(.blue.opacity(0.08)))
                        }
                    }
                }
            }

            // Aliases
            if !project.aliases.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Aliases")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(.tertiary)
                    Text(project.aliases.joined(separator: ", "))
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(.secondary)
                }
            }
        }
    }
}

struct DetailRow: View {
    let label: String
    let value: String
    var color: Color? = nil

    var body: some View {
        HStack(alignment: .top) {
            Text(label)
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(.tertiary)
                .frame(width: 90, alignment: .trailing)
            Text(value)
                .font(.system(size: 11))
                .foregroundStyle(color ?? .primary)
                .textSelection(.enabled)
        }
    }
}

/// Simple flow layout for tags/badges
struct FlowLayout: Layout {
    var spacing: CGFloat = 4

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = layout(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = layout(proposal: proposal, subviews: subviews)
        for (index, position) in result.positions.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y), proposal: .unspecified)
        }
    }

    private func layout(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, positions: [CGPoint]) {
        let maxWidth = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth && x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            positions.append(CGPoint(x: x, y: y))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
        }

        return (CGSize(width: maxWidth, height: y + rowHeight), positions)
    }
}
