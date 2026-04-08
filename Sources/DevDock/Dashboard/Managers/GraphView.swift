import SwiftUI

struct GraphView: View {
    @State private var nodes: [[String: Any]] = []
    @State private var edges: [[String: Any]] = []
    @State private var isLoading = true

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Dependency Graph")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(.white)
                Spacer()
                Text("\(nodes.count) nodes")
                    .font(.system(size: 10))
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 16).padding(.vertical, 10)

            Divider().opacity(0.3)

            if isLoading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if nodes.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "point.3.connected.trianglepath.dotted")
                        .font(.system(size: 28)).foregroundStyle(.quaternary)
                    Text("No dependency relationships found")
                        .font(.system(size: 13)).foregroundStyle(.tertiary)
                }.frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                // Canvas-based graph
                GeometryReader { geo in
                    Canvas { context, size in
                        let nodePositions = layoutNodes(nodes: nodes, size: size)

                        // Draw edges
                        for edge in edges {
                            let source = edge["source"] as? String ?? ""
                            let target = edge["target"] as? String ?? ""
                            if let from = nodePositions[source], let to = nodePositions[target] {
                                var path = Path()
                                path.move(to: from)
                                path.addLine(to: to)
                                context.stroke(path, with: .color(.white.opacity(0.1)), lineWidth: 1)
                            }
                        }

                        // Draw nodes
                        for node in nodes {
                            let id = node["id"] as? String ?? ""
                            let name = node["name"] as? String ?? ""
                            let type = node["type"] as? String ?? ""
                            guard let pos = nodePositions[id] else { continue }

                            let color = ProjectType.color(for: type)
                            let rect = CGRect(x: pos.x - 20, y: pos.y - 20, width: 40, height: 40)
                            context.fill(Circle().path(in: rect), with: .color(color.opacity(0.3)))
                            context.stroke(Circle().path(in: rect), with: .color(color.opacity(0.6)), lineWidth: 1.5)

                            // Label
                            let text = Text(name).font(.system(size: 8)).foregroundStyle(.white)
                            context.draw(text, at: CGPoint(x: pos.x, y: pos.y + 28))
                        }
                    }
                }
            }
        }
        .task {
            let result = await APIClient.shared.graphRelationships()
            nodes = result.nodes
            edges = result.edges
            isLoading = false
        }
    }

    private func layoutNodes(nodes: [[String: Any]], size: CGSize) -> [String: CGPoint] {
        var positions: [String: CGPoint] = [:]
        let count = nodes.count
        guard count > 0 else { return positions }

        let cx = size.width / 2
        let cy = size.height / 2
        let radius = min(cx, cy) * 0.7

        for (i, node) in nodes.enumerated() {
            let id = node["id"] as? String ?? ""
            let angle = (Double(i) / Double(count)) * 2 * .pi - .pi / 2
            let x = cx + radius * cos(angle)
            let y = cy + radius * sin(angle)
            positions[id] = CGPoint(x: x, y: y)
        }
        return positions
    }
}
