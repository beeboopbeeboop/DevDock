import SwiftUI
import AppKit

// MARK: - Command Output Panel
// Aesthetic, terminal-like display for shell command results.
// Inspired by VS Code / Claude Code inline code blocks.

struct CommandOutputPanel: View {
    let command: String?
    let output: String
    let success: Bool
    let onClose: () -> Void

    @State private var copied = false

    private var statusColor: Color { success ? .green : .red }
    private var statusIcon: String { success ? "checkmark.circle.fill" : "xmark.circle.fill" }
    private var lineCount: Int { output.split(separator: "\n", omittingEmptySubsequences: false).count }

    var body: some View {
        VStack(spacing: 0) {
            // Header — command + status + actions
            HStack(spacing: 8) {
                Image(systemName: statusIcon)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(statusColor)

                if let cmd = command {
                    Text(cmd)
                        .font(.system(size: 11, weight: .medium, design: .monospaced))
                        .foregroundStyle(.white.opacity(0.85))
                        .lineLimit(1)
                        .truncationMode(.middle)
                } else {
                    Text(success ? "Done" : "Failed")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(.white.opacity(0.85))
                }

                Spacer()

                // Line count badge
                if lineCount > 1 {
                    Text("\(lineCount) lines")
                        .font(.system(size: 9, weight: .medium))
                        .foregroundStyle(.tertiary)
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(RoundedRectangle(cornerRadius: 3).fill(.white.opacity(0.06)))
                }

                // Copy button
                Button(action: copyOutput) {
                    Image(systemName: copied ? "checkmark" : "doc.on.doc")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(copied ? .green : .secondary)
                        .frame(width: 20, height: 20)
                        .background(RoundedRectangle(cornerRadius: 4).fill(.white.opacity(0.06)))
                }
                .buttonStyle(.plain)
                .help("Copy output")

                // Close button
                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(.secondary)
                        .frame(width: 20, height: 20)
                        .background(RoundedRectangle(cornerRadius: 4).fill(.white.opacity(0.06)))
                }
                .buttonStyle(.plain)
                .help("Dismiss")
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                LinearGradient(
                    colors: [statusColor.opacity(0.10), statusColor.opacity(0.04)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )

            // Output body — monospace, scrollable, copy-friendly
            ScrollView {
                HStack(alignment: .top, spacing: 0) {
                    Text(output)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(.white.opacity(0.9))
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                }
            }
            .frame(maxHeight: outputHeight)
            .background(
                Color.black.opacity(0.25)
            )
        }
        .overlay(
            Rectangle()
                .frame(height: 1)
                .foregroundStyle(statusColor.opacity(0.3)),
            alignment: .top
        )
    }

    /// Adaptive height — small for short output, larger for long output, capped
    private var outputHeight: CGFloat {
        let count = lineCount
        if count <= 1 { return 36 }
        if count <= 6 { return CGFloat(count) * 18 + 20 }
        return 180  // scrollable cap
    }

    private func copyOutput() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(output, forType: .string)
        copied = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            copied = false
        }
    }
}
