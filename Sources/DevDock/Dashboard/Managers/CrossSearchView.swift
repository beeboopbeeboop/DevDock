import SwiftUI

struct CrossSearchView: View {
    @State private var query = ""
    @State private var results: [[String: Any]] = []
    @State private var isSearching = false
    @State private var typeFilter: String? = nil
    @State private var debounceTask: Task<Void, Never>?

    private let typeFilters = ["All", ".ts", ".tsx", ".css", ".json", ".jsx", ".swift", ".rs"]

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack(spacing: 12) {
                Text("Cross-Project Search")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                Spacer()
            }
            .padding(.horizontal, 16).padding(.vertical, 10)

            // Search bar
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").font(.system(size: 12)).foregroundStyle(.tertiary)
                TextField("Search across all projects...", text: $query)
                    .textFieldStyle(.plain).font(.system(size: 13))
                    .onChange(of: query) { _, _ in debounceSearch() }
                if isSearching { ProgressView().scaleEffect(0.5) }
                if !query.isEmpty {
                    Button(action: { query = ""; results = [] }) {
                        Image(systemName: "xmark.circle.fill").font(.system(size: 12)).foregroundStyle(.tertiary)
                    }.buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 8)

            // Type filter pills
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 4) {
                    ForEach(typeFilters, id: \.self) { ft in
                        FilterPill(
                            label: ft,
                            isActive: (ft == "All" && typeFilter == nil) || typeFilter == ft
                        ) {
                            typeFilter = ft == "All" ? nil : ft
                            debounceSearch()
                        }
                    }
                }.padding(.horizontal, 16)
            }
            .padding(.bottom, 8)

            Divider().opacity(0.3)

            // Results
            ScrollView {
                if results.isEmpty && !query.isEmpty && !isSearching {
                    VStack(spacing: 8) {
                        Image(systemName: "magnifyingglass").font(.system(size: 24)).foregroundStyle(.quaternary)
                        Text("No results").font(.system(size: 12)).foregroundStyle(.tertiary)
                    }.frame(maxWidth: .infinity).padding(.top, 60)
                } else {
                    LazyVStack(alignment: .leading, spacing: 1) {
                        ForEach(Array(results.enumerated()), id: \.offset) { _, result in
                            let file = result["file"] as? String ?? ""
                            let project = result["projectName"] as? String ?? ""
                            let line = result["line"] as? Int ?? 0
                            let text = result["text"] as? String ?? ""

                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 6) {
                                    Text(project)
                                        .font(.system(size: 9, weight: .medium))
                                        .foregroundStyle(.blue)
                                    Text(file)
                                        .font(.system(size: 10, design: .monospaced))
                                        .foregroundStyle(.secondary)
                                        .lineLimit(1)
                                    if line > 0 {
                                        Text(":\(line)")
                                            .font(.system(size: 9, design: .monospaced))
                                            .foregroundStyle(.tertiary)
                                    }
                                    Spacer()
                                }
                                Text(text.trimmingCharacters(in: .whitespaces))
                                    .font(.system(size: 10, design: .monospaced))
                                    .foregroundStyle(.primary)
                                    .lineLimit(2)
                            }
                            .padding(.horizontal, 16).padding(.vertical, 6)
                        }
                    }.padding(.vertical, 8)
                }
            }
        }
    }

    private func debounceSearch() {
        debounceTask?.cancel()
        debounceTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            if Task.isCancelled { return }
            guard query.count >= 2 else { return }
            await search()
        }
    }

    private func search() async {
        isSearching = true
        let glob = typeFilter.map { "*\($0)" }
        results = await APIClient.shared.crossSearch(query: query, glob: glob)
        isSearching = false
    }
}
