import SwiftUI

/// Terminal output view with ANSI color support and auto-scroll.
struct TerminalView: View {
    let lines: [AttributedString]
    let isConnected: Bool

    @State private var autoScroll = true

    var body: some View {
        VStack(spacing: 0) {
            // Terminal header
            HStack {
                Circle()
                    .fill(isConnected ? Color.green : Color.gray)
                    .frame(width: 6, height: 6)
                Text(isConnected ? "Connected" : "Disconnected")
                    .font(.system(size: 9))
                    .foregroundStyle(.tertiary)
                Spacer()
                Text("\(lines.count) lines")
                    .font(.system(size: 9, design: .monospaced))
                    .foregroundStyle(.quaternary)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Color(red: 0.06, green: 0.06, blue: 0.08))

            // Terminal output
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(lines.enumerated()), id: \.offset) { index, line in
                            Text(line)
                                .font(.system(size: 11, design: .monospaced))
                                .textSelection(.enabled)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 1)
                                .id(index)
                        }
                    }
                }
                .onChange(of: lines.count) { _, _ in
                    if autoScroll, let last = lines.indices.last {
                        withAnimation(.none) {
                            proxy.scrollTo(last, anchor: .bottom)
                        }
                    }
                }
            }
            .background(Color(red: 0.04, green: 0.04, blue: 0.06))
        }
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .overlay(
            RoundedRectangle(cornerRadius: 6)
                .strokeBorder(.white.opacity(0.06), lineWidth: 1)
        )
    }
}
