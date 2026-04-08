import SwiftUI

/// Transient notification overlay
struct ToastOverlay: View {
    let message: String
    let isSuccess: Bool

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: isSuccess ? "checkmark.circle.fill" : "xmark.circle.fill")
                .foregroundStyle(isSuccess ? .green : .red)
            Text(message)
                .font(.system(size: 12))
                .foregroundStyle(.white)
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(.ultraThinMaterial)
                .shadow(color: .black.opacity(0.2), radius: 10, y: 4)
        )
        .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(.white.opacity(0.1), lineWidth: 0.5))
        .transition(.move(edge: .top).combined(with: .opacity))
    }
}

/// Toast state manager
@MainActor
@Observable
class ToastState {
    var message: String? = nil
    var isSuccess = true
    private var dismissTask: Task<Void, Never>?

    func show(_ msg: String, success: Bool = true) {
        message = msg
        isSuccess = success
        dismissTask?.cancel()
        dismissTask = Task {
            try? await Task.sleep(for: .seconds(3))
            if !Task.isCancelled { message = nil }
        }
    }
}
