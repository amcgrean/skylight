import SwiftUI

/// The week's daycare runs. Tap a name to cycle who's doing it; tap the moon for a
/// sleepover (once for the first grandparents, twice for the second, again to clear).
/// Long-press a day to mark daycare closed.
struct DaycareRunsCard: View {
    @Environment(HouseholdStore.self) private var store

    var body: some View {
        let days = DayKey.week(containing: store.calendarDay).filter { store.daycare(on: $0) != nil }
        if let child = store.child, !days.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    Text("\(child.name)'s daycare runs").font(AppFont.body(16, .bold))
                    Spacer()
                    Text("Tap a name to swap").font(AppFont.body(12)).foregroundStyle(Palette.butterText)
                }
                .padding(.bottom, 2)

                VStack(spacing: 6) {
                    HStack(spacing: 6) {
                        Color.clear.frame(width: 40, height: 1)
                        Eyebrow("Drop-off", color: Palette.butterText).frame(maxWidth: .infinity, alignment: .leading)
                        Eyebrow("Pickup", color: Palette.butterText).frame(maxWidth: .infinity, alignment: .leading)
                        Eyebrow("Stay", color: Palette.butterText).frame(width: 46)
                    }
                    ForEach(days, id: \.self) { day in
                        if let d = store.daycare(on: day) {
                            DaycareRow(day: d)
                        }
                    }
                }

                Text(footnote).font(AppFont.body(12)).foregroundStyle(Palette.butterText).padding(.top, 2)
            }
            .card(Palette.butter, padding: 14)
        }
    }

    private var footnote: String {
        let g = store.grandparents.map(\.name)
        let order = g.count >= 2 ? "once for \(g[0]), twice for \(g[1])" : (g.first.map { "for \($0)" } ?? "")
        return "Moon = sleepover (\(order)). The hosts get that night's pickup and the next drop-off — tagged only, no invites. Long-press a day to mark daycare closed."
    }
}

private struct DaycareRow: View {
    @Environment(HouseholdStore.self) private var store
    let day: DaycareDay

    var body: some View {
        let selected = DayKey.isSameDay(day.date, store.calendarDay)
        HStack(spacing: 6) {
            VStack(spacing: 0) {
                Text(DayKey.weekdayShort.string(from: day.date)).font(AppFont.body(11, .bold)).foregroundStyle(Palette.inkSoft)
                Text(DayKey.dayNumber.string(from: day.date)).font(AppFont.body(17, .bold))
            }
            .frame(width: 40)
            .contentShape(Rectangle())
            .onLongPressGesture { Task { await store.toggleClosed(day.date) } }
            .accessibilityAction(named: day.closed ? "Mark daycare open" : "Mark daycare closed") {
                Task { await store.toggleClosed(day.date) }
            }

            if day.closed {
                Text("Daycare closed\(day.note.map { " · \($0)" } ?? "")")
                    .font(AppFont.body(14, .bold)).foregroundStyle(Palette.inkSoft)
                    .frame(maxWidth: .infinity, minHeight: 42, alignment: .leading)
                    .onLongPressGesture { Task { await store.toggleClosed(day.date) } }
            } else {
                runButton(day.drop, label: "drop-off") { Task { await store.cycleDrop(day.date) } }
                runButton(day.pick, label: "pickup") { Task { await store.cyclePick(day.date) } }
                Button { Task { await store.cycleSleepover(day.date) } } label: {
                    Image(systemName: "moon.fill")
                        .font(.system(size: 16, weight: .bold))
                        .frame(width: 46, height: 42)
                        .foregroundStyle(day.sleepover == nil ? Palette.inkSoft : Palette.ink)
                        .background(store.member(day.sleepover).map { Color(hex: $0.color) } ?? Palette.paper,
                                    in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(day.sleepover == nil ? Palette.lineDark : Palette.ink, lineWidth: 2))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(store.member(day.sleepover).map { "Sleepover at \($0.name)'s" } ?? "No sleepover")
            }
        }
        .padding(4)
        .background(selected ? Palette.paper.opacity(0.7) : .clear, in: RoundedRectangle(cornerRadius: 14))
    }

    private func runButton(_ id: UUID?, label: String, action: @escaping () -> Void) -> some View {
        let m = store.member(id)
        return Button(action: action) {
            HStack(spacing: 6) {
                Circle().fill(Palette.paper).frame(width: 12, height: 12).overlay(Circle().stroke(Palette.ink, lineWidth: 1.5))
                Text(m?.shortName ?? "—").font(AppFont.body(13, .bold)).lineLimit(1).minimumScaleFactor(0.75)
                Spacer(minLength: 0)
            }
            .foregroundStyle(Palette.ink)
            .padding(.horizontal, 8)
            .frame(maxWidth: .infinity, minHeight: 42)
            .background(m.map { Color(hex: $0.color) } ?? Palette.paper, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Palette.ink, lineWidth: 2))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(label): \(m?.name ?? "nobody"). Tap to change.")
    }
}
