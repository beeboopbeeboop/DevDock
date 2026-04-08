import SwiftUI

struct DepsTab: View {
    let project: DevDockProject

    @State private var packages: [[String: Any]] = []
    @State private var isLoading = true

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if isLoading {
                ProgressView().frame(maxWidth: .infinity, minHeight: 100)
            } else if packages.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "shippingbox")
                        .font(.system(size: 24))
                        .foregroundStyle(.quaternary)
                    Text("All dependencies up to date")
                        .font(.system(size: 12))
                        .foregroundStyle(.tertiary)
                }
                .frame(maxWidth: .infinity, minHeight: 150)
            } else {
                Text("OUTDATED PACKAGES (\(packages.count))")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(.tertiary)
                    .tracking(0.5)

                ForEach(Array(packages.enumerated()), id: \.offset) { _, pkg in
                    let name = pkg["name"] as? String ?? ""
                    let current = pkg["current"] as? String ?? ""
                    let latest = pkg["latest"] as? String ?? ""
                    let severity = pkg["type"] as? String ?? "patch"

                    HStack(spacing: 8) {
                        Circle()
                            .fill(severityColor(severity))
                            .frame(width: 6, height: 6)
                        Text(name)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(.primary)
                            .lineLimit(1)
                        Spacer()
                        Text(current)
                            .font(.system(size: 9, design: .monospaced))
                            .foregroundStyle(.tertiary)
                        Image(systemName: "arrow.right")
                            .font(.system(size: 7))
                            .foregroundStyle(.quaternary)
                        Text(latest)
                            .font(.system(size: 9, design: .monospaced))
                            .foregroundStyle(severityColor(severity))
                    }
                    .padding(.vertical, 2)
                }
            }
        }
        .task {
            packages = await APIClient.shared.depsOutdated(path: project.path)
            isLoading = false
        }
    }

    private func severityColor(_ type: String) -> Color {
        switch type {
        case "major": return .red
        case "minor": return .orange
        default: return .blue
        }
    }
}
