import SwiftUI

struct EnvSyncView: View {
    @State private var issues: [APIClient.EnvIssue] = []
    @State private var isLoading = true
    @State private var filter = "all"

    private var filteredIssues: [APIClient.EnvIssue] {
        if filter == "all" { return issues }
        return issues.filter { $0.severity == filter }
    }

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack(spacing: 12) {
                Text("Environment Sync")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)

                let errorCount = issues.filter { $0.severity == "error" }.count
                let warnCount = issues.filter { $0.severity == "warning" }.count
                if errorCount > 0 {
                    Text("\(errorCount) errors")
                        .font(.system(size: 10)).foregroundStyle(.red)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(RoundedRectangle(cornerRadius: 4).fill(.red.opacity(0.08)))
                }
                if warnCount > 0 {
                    Text("\(warnCount) warnings")
                        .font(.system(size: 10)).foregroundStyle(.orange)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(RoundedRectangle(cornerRadius: 4).fill(.orange.opacity(0.08)))
                }

                Spacer()

                HStack(spacing: 4) {
                    FilterPill(label: "All", isActive: filter == "all") { filter = "all" }
                    FilterPill(label: "Errors", isActive: filter == "error") { filter = "error" }
                    FilterPill(label: "Warnings", isActive: filter == "warning") { filter = "warning" }
                }

                Button(action: { Task { await refresh() } }) {
                    Image(systemName: "arrow.clockwise").font(.system(size: 10)).foregroundStyle(.secondary)
                }.buttonStyle(.plain)
            }
            .padding(.horizontal, 16).padding(.vertical, 10)

            Divider().opacity(0.3)

            if isLoading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if issues.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "checkmark.shield").font(.system(size: 28)).foregroundStyle(.green)
                    Text("No environment issues found").font(.system(size: 13)).foregroundStyle(.tertiary)
                }.frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    LazyVStack(spacing: 1) {
                        ForEach(filteredIssues) { issue in
                            HStack(spacing: 10) {
                                Circle()
                                    .fill(severityColor(issue.severity))
                                    .frame(width: 6, height: 6)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(issue.projectName)
                                        .font(.system(size: 11, weight: .medium))
                                    Text(issue.issue)
                                        .font(.system(size: 10))
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text(issue.detail)
                                    .font(.system(size: 9))
                                    .foregroundStyle(.tertiary)
                                    .lineLimit(1)
                                    .frame(maxWidth: 200, alignment: .trailing)
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
        issues = await APIClient.shared.envAudit()
        isLoading = false
    }

    private func severityColor(_ severity: String) -> Color {
        switch severity {
        case "error": return .red
        case "warning": return .orange
        default: return .blue
        }
    }
}
