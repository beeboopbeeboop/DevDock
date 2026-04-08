import SwiftUI

struct BatchBar: View {
    let selectedIds: Set<String>
    let onDeselect: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Text("\(selectedIds.count) selected")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(.white)

            Divider().frame(height: 16)

            BatchButton(icon: "arrow.down.circle", label: "Git Pull") {
                Task { await APIClient.shared.postFire("/actions/batch", body: ["action": "pull", "projectIds": Array(selectedIds)]) }
            }
            BatchButton(icon: "chevron.left.forwardslash.chevron.right", label: "VS Code") {
                Task { await APIClient.shared.postFire("/actions/batch", body: ["action": "open-vscode", "projectIds": Array(selectedIds)]) }
            }
            BatchButton(icon: "terminal", label: "Terminal") {
                Task { await APIClient.shared.postFire("/actions/batch", body: ["action": "open-terminal", "projectIds": Array(selectedIds)]) }
            }

            Spacer()

            Button(action: onDeselect) {
                Text("Deselect All")
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
            }.buttonStyle(.plain)
        }
        .padding(.horizontal, 16).padding(.vertical, 8)
        .background(Color(red: 0.1, green: 0.1, blue: 0.14))
        .overlay(Divider(), alignment: .top)
    }
}

struct BatchButton: View {
    let icon: String
    let label: String
    let action: () -> Void

    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 4) {
                Image(systemName: icon).font(.system(size: 9))
                Text(label).font(.system(size: 10))
            }
            .foregroundStyle(isHovered ? .white : .secondary)
            .padding(.horizontal, 8).padding(.vertical, 4)
            .background(RoundedRectangle(cornerRadius: 4).fill(isHovered ? .white.opacity(0.08) : .white.opacity(0.03)))
        }
        .buttonStyle(.plain)
        .onHover { isHovered = $0 }
    }
}
