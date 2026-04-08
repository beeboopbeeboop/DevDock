import Foundation
import SwiftUI

/// Strips ANSI escape codes and returns a plain AttributedString with basic coloring.
/// Handles common codes: colors (30-37, 90-97), bold, reset.
enum ANSIParser {
    // Basic ANSI color mapping
    private static let colorMap: [Int: Color] = [
        30: .init(white: 0.3),     // black
        31: .red,                   // red
        32: .green,                 // green
        33: .yellow,                // yellow
        34: .blue,                  // blue
        35: .purple,                // magenta
        36: .cyan,                  // cyan
        37: .white,                 // white
        90: .gray,                  // bright black
        91: .init(red: 1, green: 0.4, blue: 0.4),  // bright red
        92: .init(red: 0.4, green: 1, blue: 0.4),  // bright green
        93: .init(red: 1, green: 1, blue: 0.4),     // bright yellow
        94: .init(red: 0.4, green: 0.6, blue: 1),   // bright blue
        95: .init(red: 1, green: 0.4, blue: 1),     // bright magenta
        96: .init(red: 0.4, green: 1, blue: 1),     // bright cyan
        97: .white,                 // bright white
    ]

    // ESC character
    private static let esc = "\u{1B}"

    /// Parse ANSI text into an AttributedString with colors
    static func parse(_ input: String) -> AttributedString {
        let regex = try! NSRegularExpression(pattern: "\u{1B}\\[([0-9;]*)m")
        let nsInput = input as NSString
        let matches = regex.matches(in: input, range: NSRange(location: 0, length: nsInput.length))

        if matches.isEmpty {
            var attr = AttributedString(input)
            attr.foregroundColor = .init(white: 0.85)
            attr.font = .system(size: 11, design: .monospaced)
            return attr
        }

        var result = AttributedString()
        var currentColor: Color = .init(white: 0.85)
        var isBold = false
        var lastEnd = 0

        for match in matches {
            // Text before this match
            if match.range.location > lastEnd {
                let beforeRange = NSRange(location: lastEnd, length: match.range.location - lastEnd)
                let beforeText = nsInput.substring(with: beforeRange)
                var attr = AttributedString(beforeText)
                attr.foregroundColor = currentColor
                attr.font = .system(size: 11, weight: isBold ? .bold : .regular, design: .monospaced)
                result.append(attr)
            }

            // Parse the codes
            let codesRange = match.range(at: 1)
            if codesRange.location != NSNotFound {
                let codesStr = nsInput.substring(with: codesRange)
                let codes = codesStr.split(separator: ";").compactMap { Int($0) }
                for code in codes {
                    switch code {
                    case 0:
                        currentColor = .init(white: 0.85)
                        isBold = false
                    case 1:
                        isBold = true
                    case 22:
                        isBold = false
                    case 30...37, 90...97:
                        currentColor = colorMap[code] ?? .init(white: 0.85)
                    default:
                        break
                    }
                }
            }

            lastEnd = match.range.location + match.range.length
        }

        // Remaining text
        if lastEnd < nsInput.length {
            let remaining = nsInput.substring(from: lastEnd)
            var attr = AttributedString(remaining)
            attr.foregroundColor = currentColor
            attr.font = .system(size: 11, weight: isBold ? .bold : .regular, design: .monospaced)
            result.append(attr)
        }

        return result
    }

    /// Strip all ANSI codes and return plain text
    static func strip(_ input: String) -> String {
        let regex = try! NSRegularExpression(pattern: "\u{1B}\\[[0-9;]*m")
        return regex.stringByReplacingMatches(in: input, range: NSRange(location: 0, length: (input as NSString).length), withTemplate: "")
    }
}
