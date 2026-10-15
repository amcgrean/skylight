import SwiftUI

// MARK: - Cards

struct CardStyle: ViewModifier {
    var fill: Color = Palette.paper
    var bordered = false
    var padding: CGFloat = 16

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(fill, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay {
                if bordered {
                    RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Palette.line, lineWidth: 1)
                }
            }
    }
}

extension View {
    func card(_ fill: Color = Palette.paper, bordered: Bool = false, padding: CGFloat = 16) -> some View {
        modifier(CardStyle(fill: fill, bordered: bordered, padding: padding))
    }
}

// MARK: - Text styles

struct Eyebrow: View {
    let text: String
    var color: Color = Palette.inkSoft
    init(_ text: String, color: Color = Palette.inkSoft) { self.text = text; self.color = color }
    var body: some View {
        Text(text.uppercased())
            .font(AppFont.body(11, .bold, relativeTo: .caption))
            .tracking(1.1)
            .foregroundStyle(color)
    }
}

struct ScreenHeader: View {
    let eyebrow: String
    let title: String
    var trailing: AnyView? = nil

    var body: some View {
        HStack(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 0) {
                Eyebrow(eyebrow)
                Text(title)
                    .font(AppFont.script(28))
                    .foregroundStyle(Palette.mintDeep)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            Spacer(minLength: 8)
            if let trailing { trailing }
        }
    }
}

// MARK: - People

struct Avatar: View {
    let member: Member
    var size: CGFloat = 30
    var outlined = false

    var body: some View {
        ZStack {
            Circle().fill(Color(hex: member.color))
            if member.kind == .pets {
                Image(systemName: "pawprint.fill").font(.system(size: size * 0.42, weight: .bold))
            } else {
                Text(member.initial).font(AppFont.body(size * 0.44, .bold))
            }
        }
        .foregroundStyle(Palette.ink)
        .frame(width: size, height: size)
        .overlay { if outlined { Circle().stroke(Palette.ink, lineWidth: 2) } }
        .accessibilityLabel(member.name)
    }
}

struct AvatarStack: View {
    let members: [Member]
    var body: some View {
        HStack(spacing: -8) {
            ForEach(members) { m in
                Avatar(member: m, size: 30).overlay(Circle().stroke(Palette.cream, lineWidth: 2))
            }
        }
    }
}

struct ColorDot: View {
    let hex: String
    var size: CGFloat = 10
    var body: some View {
        Circle().fill(Color(hex: hex))
            .frame(width: size, height: size)
            .overlay(Circle().stroke(Palette.ink, lineWidth: 1.5))
    }
}

// MARK: - Controls

struct CheckCircle: View {
    let done: Bool
    var fill: Color = Palette.mintDeep
    var square = false
    var size: CGFloat = 24

    var body: some View {
        ZStack {
            let shape = RoundedRectangle(cornerRadius: square ? 6 : size / 2, style: .continuous)
            shape.fill(done ? fill : Color.clear)
            shape.stroke(Palette.ink, lineWidth: 2)
            if done {
                Image(systemName: "checkmark")
                    .font(.system(size: size * 0.5, weight: .heavy))
                    .foregroundStyle(square ? Color.white : Palette.ink)
            }
        }
        .frame(width: size, height: size)
    }
}

/// Rounded chip used for filters, tags and choices.
struct Pill: View {
    let label: String
    var selected = false
    var selectedFill: Color = Palette.ink
    var selectedText: Color = Palette.cream
    var dotHex: String? = nil
    var systemImage: String? = nil
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let dotHex { ColorDot(hex: dotHex, size: 10) }
                Text(label).font(AppFont.body(13, .bold, relativeTo: .subheadline))
                if let systemImage { Image(systemName: systemImage).font(.system(size: 11, weight: .bold)) }
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 38)
            .foregroundStyle(selected ? selectedText : Palette.ink)
            .background(selected ? selectedFill : Palette.paper, in: Capsule())
            .overlay(Capsule().stroke(selected ? Palette.ink : Palette.lineDark, lineWidth: 2))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

struct PrimaryButton: View {
    let title: String
    var fill: Color = Palette.pinkDeep
    var systemImage: String? = nil
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let systemImage { Image(systemName: systemImage) }
                Text(title)
            }
            .font(AppFont.body(16, .bold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(fill, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

struct OutlineButton: View {
    let title: String
    var systemImage: String? = nil
    var action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let systemImage { Image(systemName: systemImage) }
                Text(title)
            }
            .font(AppFont.body(15, .bold))
            .foregroundStyle(Palette.ink)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(Palette.paper, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Palette.ink, lineWidth: 2))
        }
        .buttonStyle(.plain)
    }
}

struct RetroTextField: View {
    let placeholder: String
    @Binding var text: String
    var onSubmit: () -> Void = {}

    var body: some View {
        TextField(placeholder, text: $text)
            .font(AppFont.body(16, .semibold))
            .padding(.horizontal, 12)
            .frame(minHeight: 46)
            .background(Palette.paper, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Palette.ink, lineWidth: 2))
            .submitLabel(.done)
            .onSubmit(onSubmit)
    }
}

/// Simple wrapping layout for chips.
struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxWidth = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, widest: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > 0 && x + s.width > maxWidth { x = 0; y += rowHeight + spacing; rowHeight = 0 }
            x += s.width + spacing
            rowHeight = max(rowHeight, s.height)
            widest = max(widest, x - spacing)
        }
        return CGSize(width: proposal.width ?? widest, height: y + rowHeight)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > bounds.minX && x + s.width > bounds.maxX { x = bounds.minX; y += rowHeight + spacing; rowHeight = 0 }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing
            rowHeight = max(rowHeight, s.height)
        }
    }
}

// MARK: - Toast

struct ToastView: View {
    let text: String
    var body: some View {
        HStack(spacing: 10) {
            Circle().fill(Color(hex: "#EE8FA8")).frame(width: 8, height: 8)
            Text(text).font(AppFont.body(14, .bold)).foregroundStyle(Palette.cream)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .background(Palette.ink, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .shadow(color: .black.opacity(0.2), radius: 12, y: 6)
        .padding(.horizontal, 16)
    }
}
