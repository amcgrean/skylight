import SwiftUI

/// 1950s mid-century palette: cream paper, bubblegum pink, mint, butter yellow.
enum Palette {
    static let cream = Color(hex: "#FBF3E4")
    static let paper = Color(hex: "#FFFDF8")
    static let ink = Color(hex: "#2E2A26")
    static let inkSoft = Color(hex: "#6B6157")
    static let inkMid = Color(hex: "#4A433C")
    static let line = Color(hex: "#EADFCB")
    static let lineDark = Color(hex: "#C9BBA3")
    static let sand = Color(hex: "#F1E8D8")

    static let pink = Color(hex: "#F8D7DE")
    static let pinkDeep = Color(hex: "#B83E61")
    static let pinkText = Color(hex: "#5E3A45")

    static let mint = Color(hex: "#D5EEE2")
    static let mintMid = Color(hex: "#9FD3BC")
    static let mintDeep = Color(hex: "#2F6B5A")
    static let mintText = Color(hex: "#2F5248")

    static let butter = Color(hex: "#FCEBC0")
    static let butterText = Color(hex: "#5C4A1E")

    static let sky = Color(hex: "#D3EEF2")
    static let skyText = Color(hex: "#1F4A52")
}

enum AppFont {
    static func body(_ size: CGFloat, _ weight: Weight = .semibold, relativeTo style: Font.TextStyle = .body) -> Font {
        Font.custom(weight.name, size: size, relativeTo: style)
    }

    static func script(_ size: CGFloat) -> Font {
        Font.custom("Pacifico-Regular", size: size, relativeTo: .largeTitle)
    }

    enum Weight {
        case regular, semibold, bold
        var name: String {
            switch self {
            case .regular: return "JosefinSans-Regular"
            case .semibold: return "JosefinSans-SemiBold"
            case .bold: return "JosefinSans-Bold"
            }
        }
    }
}

extension Color {
    init(hex: String) {
        let s = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        var v: UInt64 = 0
        Scanner(string: s).scanHexInt64(&v)
        let r, g, b: Double
        if s.count == 6 {
            r = Double((v >> 16) & 0xFF) / 255
            g = Double((v >> 8) & 0xFF) / 255
            b = Double(v & 0xFF) / 255
        } else {
            r = 0.5; g = 0.5; b = 0.5
        }
        self = Color(red: r, green: g, blue: b)
    }

    /// Light tint used behind a member's event cards.
    static func memberTint(_ hex: String) -> Color { Color(hex: hex).opacity(0.28) }
}
