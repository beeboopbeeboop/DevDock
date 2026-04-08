import SwiftUI

struct NotesTab: View {
    let project: DevDockProject

    @State private var notes = ""
    @State private var isLoading = true
    @State private var isSaving = false
    @State private var saved = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("PROJECT NOTES")
                    .font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(.tertiary)
                    .tracking(0.5)
                Spacer()
                if isSaving {
                    ProgressView().scaleEffect(0.4)
                } else if saved {
                    HStack(spacing: 3) {
                        Image(systemName: "checkmark").font(.system(size: 8))
                        Text("Saved").font(.system(size: 9))
                    }.foregroundStyle(.green)
                }
                Button(action: { Task { await save() } }) {
                    Text("Save")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundStyle(.blue)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(RoundedRectangle(cornerRadius: 4).fill(.blue.opacity(0.1)))
                }
                .buttonStyle(.plain)
            }

            if isLoading {
                ProgressView().frame(maxWidth: .infinity, minHeight: 100)
            } else {
                TextEditor(text: $notes)
                    .font(.system(size: 12, design: .monospaced))
                    .scrollContentBackground(.hidden)
                    .padding(8)
                    .background(RoundedRectangle(cornerRadius: 6).fill(.white.opacity(0.03)))
                    .overlay(RoundedRectangle(cornerRadius: 6).strokeBorder(.white.opacity(0.06), lineWidth: 1))
                    .frame(minHeight: 300)
            }
        }
        .task { await loadNotes() }
    }

    private func loadNotes() async {
        guard let url = URL(string: "\(APIClient.shared.baseURL)/actions/notes/\(project.id)") else {
            isLoading = false; return
        }
        do {
            let config = URLSessionConfiguration.default
            config.timeoutIntervalForRequest = 3
            let session = URLSession(configuration: config)
            let (data, _) = try await session.data(from: url)
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                notes = json["notes"] as? String ?? ""
            }
        } catch {}
        isLoading = false
    }

    private func save() async {
        isSaving = true
        saved = false
        await APIClient.shared.postFire("/actions/save-notes", body: ["projectId": project.id, "notes": notes])
        isSaving = false
        saved = true
        try? await Task.sleep(for: .seconds(2))
        saved = false
    }
}
