import SwiftUI
import Charts

struct InsightsView: View {
    @State private var snapshots: [[String: Any]] = []
    @State private var latest: [String: Any]? = nil
    @State private var range = "7d"
    @State private var isLoading = true

    private let ranges = ["24h", "7d", "30d", "90d"]

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack(spacing: 12) {
                Text("Insights")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                Spacer()
                HStack(spacing: 4) {
                    ForEach(ranges, id: \.self) { r in
                        FilterPill(label: r, isActive: range == r) {
                            range = r
                            Task { await refresh() }
                        }
                    }
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 10)

            Divider().opacity(0.3)

            if isLoading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    VStack(spacing: 16) {
                        // Stat cards
                        if let latest {
                            HStack(spacing: 12) {
                                StatCard(title: "Projects", value: latest["totalProjects"] as? Int ?? 0, color: .blue)
                                StatCard(title: "Dirty Repos", value: latest["dirtyRepos"] as? Int ?? 0, color: .orange)
                                StatCard(title: "Dirty Files", value: latest["totalDirtyFiles"] as? Int ?? 0, color: .yellow)
                                StatCard(title: "Dependencies", value: latest["totalDependencies"] as? Int ?? 0, color: .purple)
                            }
                            .padding(.horizontal, 16)
                        }

                        // Charts
                        if !snapshots.isEmpty {
                            InsightChart(title: "Projects", snapshots: snapshots, key: "totalProjects", color: .blue)
                            InsightChart(title: "Dirty Repos", snapshots: snapshots, key: "dirtyRepos", color: .orange)
                            InsightChart(title: "Dirty Files", snapshots: snapshots, key: "totalDirtyFiles", color: .yellow)
                        }
                    }
                    .padding(.vertical, 16)
                }
            }
        }
        .task { await refresh() }
    }

    private func refresh() async {
        isLoading = true
        async let s = APIClient.shared.insights(range: range)
        async let l = APIClient.shared.latestSnapshot()
        snapshots = await s
        latest = await l
        isLoading = false
    }
}

struct StatCard: View {
    let title: String
    let value: Int
    let color: Color

    var body: some View {
        VStack(spacing: 4) {
            Text("\(value)")
                .font(.system(size: 22, weight: .bold, design: .rounded))
                .foregroundStyle(color)
            Text(title)
                .font(.system(size: 10))
                .foregroundStyle(.tertiary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(RoundedRectangle(cornerRadius: 8).fill(color.opacity(0.06)))
    }
}

struct InsightChart: View {
    let title: String
    let snapshots: [[String: Any]]
    let key: String
    let color: Color

    private var dataPoints: [(index: Int, value: Int)] {
        snapshots.enumerated().compactMap { index, snap in
            guard let val = snap[key] as? Int else { return nil }
            return (index, val)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(.tertiary)
                .padding(.horizontal, 16)

            Chart(dataPoints, id: \.index) { point in
                LineMark(
                    x: .value("Time", point.index),
                    y: .value(title, point.value)
                )
                .foregroundStyle(color)
                .interpolationMethod(.monotone)

                AreaMark(
                    x: .value("Time", point.index),
                    y: .value(title, point.value)
                )
                .foregroundStyle(color.opacity(0.1))
                .interpolationMethod(.monotone)
            }
            .chartXAxis(.hidden)
            .chartYAxis {
                AxisMarks(position: .leading) { value in
                    AxisValueLabel()
                        .font(.system(size: 8))
                        .foregroundStyle(.quaternary)
                }
            }
            .frame(height: 100)
            .padding(.horizontal, 16)
        }
    }
}
