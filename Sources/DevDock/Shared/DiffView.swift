import SwiftUI

/// Syntax-highlighted git diff viewer
struct DiffView: View {
    let diff: String

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("DIFF")
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.tertiary)
                .tracking(0.5)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(red: 0.06, green: 0.06, blue: 0.08))

            ScrollView(.horizontal, showsIndicators: false) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(diff.split(separator: "\n", omittingEmptySubsequences: false).enumerated()), id: \.offset) { _, line in
                            let lineStr = String(line)
                            HStack(spacing: 0) {
                                Text(lineStr)
                                    .font(.system(size: 10, design: .monospaced))
                                    .foregroundStyle(colorForLine(lineStr))
                                    .textSelection(.enabled)
                                Spacer(minLength: 0)
                            }
                            .padding(.horizontal, 10)
                            .padding(.vertical, 1)
                            .background(bgForLine(lineStr))
                        }
                    }
                }
            }
            .background(Color(red: 0.04, green: 0.04, blue: 0.06))
        }
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(.white.opacity(0.06), lineWidth: 1))
        .frame(maxHeight: 300)
    }

    private func colorForLine(_ line: String) -> Color {
        if line.hasPrefix("+") && !line.hasPrefix("+++") { return .green }
        if line.hasPrefix("-") && !line.hasPrefix("---") { return .red }
        if line.hasPrefix("@@") { return .cyan }
        return Color(white: 0.7)
    }

    private func bgForLine(_ line: String) -> Color {
        if line.hasPrefix("+") && !line.hasPrefix("+++") { return .green.opacity(0.05) }
        if line.hasPrefix("-") && !line.hasPrefix("---") { return .red.opacity(0.05) }
        return .clear
    }
}
