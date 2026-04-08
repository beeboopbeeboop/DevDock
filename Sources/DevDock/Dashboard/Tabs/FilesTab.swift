import SwiftUI

struct FilesTab: View {
    let project: DevDockProject
    @State private var files: [FileEntry] = []
    @State private var isLoading = true

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 100)
            } else if files.isEmpty {
                Text("No files found")
                    .font(.system(size: 12))
                    .foregroundStyle(.tertiary)
                    .frame(maxWidth: .infinity, minHeight: 100)
            } else {
                ForEach(files) { file in
                    FileRow(file: file, depth: 0)
                }
            }
        }
        .task {
            await loadFiles()
        }
    }

    private func loadFiles() async {
        guard let url = URL(string: "\(APIClient.shared.baseURL)/actions/files?path=\(project.path.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")") else { return }
        do {
            let config = URLSessionConfiguration.default
            config.timeoutIntervalForRequest = 5
            let session = URLSession(configuration: config)
            let (data, _) = try await session.data(from: url)
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let fileList = json["files"] as? [[String: Any]] {
                files = fileList.compactMap { FileEntry.from($0) }
            }
        } catch {}
        isLoading = false
    }
}

struct FileEntry: Identifiable {
    let id: String
    let name: String
    let isDir: Bool
    let size: Int?
    let children: [FileEntry]

    static func from(_ dict: [String: Any]) -> FileEntry? {
        guard let name = dict["name"] as? String else { return nil }
        let isDir = dict["isDir"] as? Bool ?? false
        let size = dict["size"] as? Int
        let childDicts = dict["children"] as? [[String: Any]] ?? []
        let children = childDicts.compactMap { FileEntry.from($0) }
        return FileEntry(id: name, name: name, isDir: isDir, size: size, children: children)
    }
}

struct FileRow: View {
    let file: FileEntry
    let depth: Int

    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 4) {
                if file.isDir {
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                        .font(.system(size: 8))
                        .foregroundStyle(.tertiary)
                        .frame(width: 12)
                } else {
                    Spacer().frame(width: 12)
                }

                Image(systemName: file.isDir ? "folder.fill" : "doc")
                    .font(.system(size: 10))
                    .foregroundStyle(file.isDir ? Color.blue : Color.gray)

                Text(file.name)
                    .font(.system(size: 11))
                    .foregroundStyle(.primary)
                    .lineLimit(1)

                Spacer()

                if let size = file.size, !file.isDir {
                    Text(formatSize(size))
                        .font(.system(size: 9, design: .monospaced))
                        .foregroundStyle(.quaternary)
                }
            }
            .padding(.leading, CGFloat(depth) * 16)
            .padding(.vertical, 3)
            .contentShape(Rectangle())
            .onTapGesture {
                if file.isDir { isExpanded.toggle() }
            }

            if isExpanded {
                ForEach(file.children) { child in
                    FileRow(file: child, depth: depth + 1)
                }
            }
        }
    }

    private func formatSize(_ bytes: Int) -> String {
        if bytes < 1024 { return "\(bytes) B" }
        if bytes < 1024 * 1024 { return "\(bytes / 1024) KB" }
        return String(format: "%.1f MB", Double(bytes) / 1024 / 1024)
    }
}
