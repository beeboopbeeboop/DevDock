import SwiftUI

struct GitHubTab: View {
    let project: DevDockProject

    @State private var workflows: [APIClient.GitHubWorkflowRun] = []
    @State private var prs: [APIClient.GitHubPRDetail] = []
    @State private var issues: [APIClient.GitHubIssue] = []
    @State private var isLoading = true

    private var ownerRepo: (String, String)? {
        guard let repo = project.githubRepo else { return nil }
        let parts = repo.split(separator: "/")
        guard parts.count == 2 else { return nil }
        return (String(parts[0]), String(parts[1]))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if project.githubRepo == nil {
                VStack(spacing: 8) {
                    Image(systemName: "globe")
                        .font(.system(size: 24))
                        .foregroundStyle(.quaternary)
                    Text("No GitHub repo linked")
                        .font(.system(size: 12))
                        .foregroundStyle(.tertiary)
                }
                .frame(maxWidth: .infinity, minHeight: 150)
            } else if isLoading {
                ProgressView().frame(maxWidth: .infinity, minHeight: 100)
            } else {
                // CI / Workflow Runs
                if !workflows.isEmpty {
                    Text("WORKFLOW RUNS")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.tertiary)
                        .tracking(0.5)

                    ForEach(workflows) { run in
                        HStack(spacing: 8) {
                            Circle()
                                .fill(ciColor(run.conclusion ?? run.status))
                                .frame(width: 7, height: 7)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(run.displayTitle)
                                    .font(.system(size: 11))
                                    .lineLimit(1)
                                HStack(spacing: 6) {
                                    Text(run.headBranch ?? "")
                                        .font(.system(size: 9, design: .monospaced))
                                        .foregroundStyle(.tertiary)
                                    Text(run.status)
                                        .font(.system(size: 9))
                                        .foregroundStyle(.quaternary)
                                }
                            }
                            Spacer()
                        }
                        .padding(.vertical, 2)
                    }
                }

                // Pull Requests
                if !prs.isEmpty {
                    Divider().opacity(0.2)
                    Text("PULL REQUESTS (\(prs.count))")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.tertiary)
                        .tracking(0.5)

                    ForEach(prs) { pr in
                        HStack(spacing: 8) {
                            Image(systemName: "arrow.triangle.pull")
                                .font(.system(size: 10))
                                .foregroundStyle(.green)
                            VStack(alignment: .leading, spacing: 1) {
                                Text("#\(pr.number) \(pr.title)")
                                    .font(.system(size: 11))
                                    .lineLimit(1)
                                HStack(spacing: 6) {
                                    Text(pr.author?.login ?? "")
                                        .font(.system(size: 9))
                                        .foregroundStyle(.tertiary)
                                    if let review = pr.reviewDecision {
                                        Text(review.replacingOccurrences(of: "_", with: " ").lowercased())
                                            .font(.system(size: 9))
                                            .foregroundStyle(review == "APPROVED" ? .green : .orange)
                                    }
                                }
                            }
                            Spacer()
                            if let url = project.githubUrl {
                                Button(action: {
                                    if let u = URL(string: "\(url)/pull/\(pr.number)") {
                                        NSWorkspace.shared.open(u)
                                    }
                                }) {
                                    Image(systemName: "arrow.up.right.square")
                                        .font(.system(size: 9))
                                        .foregroundStyle(.tertiary)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.vertical, 2)
                    }
                }

                // Issues
                if !issues.isEmpty {
                    Divider().opacity(0.2)
                    Text("ISSUES (\(issues.count))")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.tertiary)
                        .tracking(0.5)

                    ForEach(issues) { issue in
                        HStack(spacing: 8) {
                            Image(systemName: issue.state == "open" ? "circle.dotted" : "checkmark.circle")
                                .font(.system(size: 10))
                                .foregroundStyle(issue.state == "open" ? .green : .purple)
                            Text("#\(issue.number) \(issue.title)")
                                .font(.system(size: 11))
                                .lineLimit(1)
                            Spacer()
                        }
                        .padding(.vertical, 2)
                    }
                }
            }
        }
        .task { await loadData() }
    }

    private func loadData() async {
        guard let (owner, repo) = ownerRepo else { isLoading = false; return }
        async let w = APIClient.shared.githubActions(owner: owner, repo: repo)
        async let p = APIClient.shared.githubPRs(owner: owner, repo: repo)
        async let i = APIClient.shared.githubIssues(owner: owner, repo: repo)
        workflows = await w
        prs = await p
        issues = await i
        isLoading = false
    }

    private func ciColor(_ status: String) -> Color {
        switch status {
        case "success": return .green
        case "failure": return .red
        case "in_progress", "queued": return .yellow
        default: return .gray
        }
    }
}
