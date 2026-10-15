import SwiftUI

struct ChoresView: View {
    @Environment(HouseholdStore.self) private var store
    private let tints = [Palette.mint, Palette.pink, Palette.butter, Palette.sky]

    var body: some View {
        let today = store.choresDue(on: Date())
        Page {
            ScreenHeader(eyebrow: DayKey.headerDate.string(from: Date()), title: "Chores")

            ForEach(Array(store.family.enumerated()), id: \.element.id) { index, m in
                let mine = today.filter { $0.memberID == m.id }
                if !mine.isEmpty {
                    let points = mine.filter { store.isDone($0) }.reduce(0) { $0 + $1.points }
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 10) {
                            Avatar(member: m, size: 30, outlined: true)
                            Text(m.name).font(AppFont.body(16, .bold))
                            Spacer()
                            Text("\(points) pts").font(AppFont.body(13)).foregroundStyle(Palette.inkMid)
                        }
                        .padding(.bottom, 6)

                        ForEach(mine) { chore in
                            let done = store.isDone(chore)
                            Button { Task { await store.toggle(chore) } } label: {
                                HStack(spacing: 12) {
                                    CheckCircle(done: done, fill: Color(hex: m.color))
                                    Text(chore.title)
                                        .font(AppFont.body(16))
                                        .strikethrough(done)
                                        .opacity(done ? 0.5 : 1)
                                    Spacer()
                                    Text("+\(chore.points)").font(AppFont.body(12, .bold)).foregroundStyle(Palette.inkMid)
                                }
                                .foregroundStyle(Palette.ink)
                                .frame(minHeight: 46)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityValue(done ? "Done" : "Not done")
                        }
                    }
                    .card(tints[index % tints.count], padding: 14)
                }
            }

            if today.isEmpty {
                Text("No chores today.").font(AppFont.body(15, .bold)).foregroundStyle(Palette.inkSoft)
            }
        }
    }
}
