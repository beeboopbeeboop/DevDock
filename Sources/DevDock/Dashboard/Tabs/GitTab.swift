import SwiftUI

struct GitTab: View {
    let project: DevDockProject

    @State private var staged: [APIClient.GitStatusFile] = []
    @State private var unstaged: [APIClient.GitStatusFile] = []
    @State private var commits: [APIClient.GitLogEntry] = []
    @State private var branches: [String] = []
    @State private var currentBranch = ""
    @State private var commitMessage = ""
    @State private var diffText = ""
    @State private var selectedFile: String? = nil
    @State private var isLoading = true
    @State private var actionResult: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Branch info
            HStack {
                Image(systemName: "arrow.triangle.branch")
                    .font(.system(size: 11))
                    .foregroundStyle(.tertiary)
                Text(currentBranch)
                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                    .foregroundStyle(.white)
                Spacer()

                // Push / Pull
                Button(action: { Task { await push() } }) {
                    HStack(spacing: 3) {
                        Image(systemName: "arrow.up")
                            .font(.system(size: 9))
                        Text("Push")
                            .font(.system(size: 10))
                    }
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(RoundedRectangle(cornerRadius: 4).fill(.white.opacity(0.04)))
                }
                .buttonStyle(.plain)

                Button(action: { Task { await pull() } }) {
                    HStack(spacing: 3) {
                        Image(systemName: "arrow.down")
                            .font(.system(size: 9))
                        Text("Pull")
                            .font(.system(size: 10))
                    }
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(RoundedRectangle(cornerRadius: 4).fill(.white.opacity(0.04)))
                }
                .buttonStyle(.plain)
            }

            // Result banner
            if let result = actionResult {
                HStack {
                    Text(result)
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button(action: { actionResult = nil }) {
                        Image(systemName: "xmark").font(.system(size: 8)).foregroundStyle(.tertiary)
                    }.buttonStyle(.plain)
                }
                .padding(8)
                .background(RoundedRectangle(cornerRadius: 4).fill(.green.opacity(0.06)))
            }

            if isLoading {
                ProgressView().frame(maxWidth: .infinity, minHeight: 100)
            } else {
                // Staged files
                if !staged.isEmpty {
                    GitFileSection(title: "STAGED (\(staged.count))", files: staged, color: .green) { file in
                        Task {
                            _ = await APIClient.shared.gitStage(path: project.path, files: [file.path], unstage: true)
                            await refreshStatus()
                        }
                    } onSelect: { file in
                        Task { await loadDiff(file: file.path, staged: true) }
                    }
                }

                // Unstaged files
                if !unstaged.isEmpty {
                    GitFileSection(title: "UNSTAGED (\(unstaged.count))", files: unstaged, color: .orange) { file in
                        Task {
                            _ = await APIClient.shared.gitStage(path: project.path, files: [file.path])
                            await refreshStatus()
                        }
                    } onSelect: { file in
                        Task { await loadDiff(file: file.path, staged: false) }
                    }
                }

                // Commit
                if !staged.isEmpty {
                    VStack(spacing: 8) {
                        TextField("Commit message...", text: $commitMessage)
                            .textFieldStyle(.plain)
                            .font(.system(size: 11))
                            .padding(8)
                            .background(RoundedRectangle(cornerRadius: 6).fill(.white.opacity(0.04)))

                        Button(action: { Task { await commit() } }) {
                            HStack {
                                Image(systemName: "checkmark.circle")
                                    .font(.system(size: 10))
                                Text("Commit")
                                    .font(.system(size: 11, weight: .medium))
                            }
                            .foregroundStyle(.green)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 6)
                            .background(RoundedRectangle(cornerRadius: 6).fill(.green.opacity(0.1)))
                        }
                        .buttonStyle(.plain)
                        .disabled(commitMessage.isEmpty)
                    }
                }

                // Diff viewer
                if !diffText.isEmpty {
                    DiffView(diff: diffText)
                }

                Divider().opacity(0.2)

                // Recent commits
                if !commits.isEmpty {
                    Text("RECENT COMMITS")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.tertiary)
                        .tracking(0.5)

                    ForEach(commits) { entry in
                        HStack(alignment: .top, spacing: 8) {
                            Text(entry.short)
                                .font(.system(size: 10, design: .monospaced))
                                .foregroundStyle(.blue)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(entry.message)
                                    .font(.system(size: 11))
                                    .foregroundStyle(.primary)
                                    .lineLimit(1)
                                HStack(spacing: 6) {
                                    Text(entry.author)
                                        .font(.system(size: 9))
                                        .foregroundStyle(.tertiary)
                                    Text(entry.ago)
                                        .font(.system(size: 9))
                                        .foregroundStyle(.quaternary)
                                    if let ins = entry.insertions, let del = entry.deletions {
                                        Text("+\(ins)")
                                            .font(.system(size: 9))
                                            .foregroundStyle(.green)
                                        Text("-\(del)")
                                            .font(.system(size: 9))
                                            .foregroundStyle(.red)
                                    }
                                }
                            }
                            Spacer()
                        }
                        .padding(.vertical, 2)
                    }
                }

                // Branches
                if branches.count > 1 {
                    Divider().opacity(0.2)
                    Text("BRANCHES")
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundStyle(.tertiary)
                        .tracking(0.5)

                    ForEach(branches.filter { $0 != currentBranch }, id: \.self) { branch in
                        HStack {
                            Text(branch)
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundStyle(.secondary)
                            Spacer()
                            Button("Checkout") {
                                Task {
                                    _ = await APIClient.shared.gitCheckout(path: project.path, branch: branch)
                                    await refreshAll()
                                }
                            }
                            .font(.system(size: 9))
                            .foregroundStyle(.blue)
                            .buttonStyle(.plain)
                        }
                        .padding(.vertical, 1)
                    }
                }
            }
        }
        .task { await refreshAll() }
    }

    private func refreshAll() async {
        isLoading = true
        async let s = APIClient.shared.gitStatus(path: project.path)
        async let c = APIClient.shared.gitLog(path: project.path)
        async let b = APIClient.shared.gitBranches(path: project.path)
        let status = await s
        staged = status.staged
        unstaged = status.unstaged
        commits = await c
        let branchInfo = await b
        currentBranch = branchInfo.current
        branches = branchInfo.branches
        isLoading = false
    }

    private func refreshStatus() async {
        let status = await APIClient.shared.gitStatus(path: project.path)
        staged = status.staged
        unstaged = status.unstaged
    }

    private func loadDiff(file: String, staged: Bool) async {
        diffText = await APIClient.shared.gitDiff(path: project.path, file: file, staged: staged)
    }

    private func commit() async {
        let result = await APIClient.shared.gitCommit(path: project.path, message: commitMessage)
        if result.ok {
            commitMessage = ""
            actionResult = "Committed \(result.hash ?? "")"
            await refreshAll()
        }
    }

    private func push() async {
        let result = await APIClient.shared.gitPush(path: project.path)
        actionResult = result.ok ? "Pushed" : "Push failed"
    }

    private func pull() async {
        await APIClient.shared.gitPull(path: project.path)
        actionResult = "Pulled"
        await refreshAll()
    }
}

struct GitFileSection: View {
    let title: String
    let files: [APIClient.GitStatusFile]
    let color: Color
    let onAction: (APIClient.GitStatusFile) -> Void
    let onSelect: (APIClient.GitStatusFile) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(color)
                .tracking(0.5)

            ForEach(files) { file in
                HStack(spacing: 6) {
                    Text(file.status)
                        .font(.system(size: 9, weight: .bold, design: .monospaced))
                        .foregroundStyle(color)
                        .frame(width: 16)
                    Text(file.path)
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    Spacer()
                    Button(action: { onAction(file) }) {
                        Image(systemName: color == .green ? "minus.circle" : "plus.circle")
                            .font(.system(size: 10))
                            .foregroundStyle(.tertiary)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.vertical, 2)
                .contentShape(Rectangle())
                .onTapGesture { onSelect(file) }
            }
        }
    }
}
