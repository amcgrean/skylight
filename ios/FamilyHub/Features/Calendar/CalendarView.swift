import SwiftUI

struct CalendarView: View {
    @Environment(HouseholdStore.self) private var store
    @State private var filter: AgendaFilter = .everyone
    @State private var editor: EditorBox?

    var body: some View {
        let day = store.calendarDay
        let items = store.agenda(on: day, filter: filter)
        Page {
            ScreenHeader(eyebrow: DayKey.headerDate.string(from: day), title: "Family calendar")

            WeekStrip(filter: filter)
            FilterChips(filter: $filter)

            HStack(alignment: .firstTextBaseline) {
                Text(DayKey.isSameDay(day, Date()) ? "Today" : DayKey.weekdayLong.string(from: day))
                    .font(AppFont.body(18, .bold))
                Spacer()
                Text("\(items.count) \(items.count == 1 ? "plan" : "plans")")
                    .font(AppFont.body(13, .bold)).foregroundStyle(Palette.inkSoft)
            }
            .padding(.horizontal, 2)

            VStack(spacing: 8) {
                ForEach(items) { item in
                    AgendaRow(item: item) {
                        if case .event(let e) = item.kind { editor = EditorBox(draft: draft(for: e)) }
                    }
                }
                if items.isEmpty {
                    Text("Nothing here — room to breathe.")
                        .font(AppFont.body(14, .bold)).foregroundStyle(Palette.inkSoft)
                        .frame(maxWidth: .infinity, minHeight: 64)
                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Palette.line, style: StrokeStyle(lineWidth: 2, dash: [6, 4])))
                }
            }

            PrimaryButton(title: "Add a family event", systemImage: "plus") {
                var d = EventDraft()
                d.day = day
                if let me = store.me { d.tagIDs = [me.id] }
                editor = EditorBox(draft: d)
            }

            DaycareRunsCard()
            CalendarSourcesCard()
        }
        .sheet(item: $editor) { box in
            EventEditor(draft: box.draft).environment(store)
        }
    }

    private func draft(for e: FamilyEvent) -> EventDraft {
        var d = EventDraft()
        d.existing = e
        d.title = e.title
        d.note = e.note ?? ""
        d.day = e.startsAt
        d.time = e.startsAt
        d.allDay = e.allDay
        d.tagIDs = Set(e.tagIDs)
        return d
    }
}

/// Identifiable wrapper so a draft can drive `.sheet(item:)`.
struct EditorBox: Identifiable {
    let id = UUID()
    let draft: EventDraft
}

private struct WeekStrip: View {
    @Environment(HouseholdStore.self) private var store
    let filter: AgendaFilter

    var body: some View {
        let week = DayKey.week(containing: store.calendarDay)
        VStack(spacing: 8) {
            HStack {
                Button { shift(-7) } label: { Image(systemName: "chevron.left").frame(width: 44, height: 32) }
                    .accessibilityLabel("Previous week")
                Spacer()
                Text("\(DayKey.monthDay.string(from: week[0])) – \(DayKey.monthDay.string(from: week[6]))")
                    .font(AppFont.body(14, .bold))
                Spacer()
                Button { shift(7) } label: { Image(systemName: "chevron.right").frame(width: 44, height: 32) }
                    .accessibilityLabel("Next week")
            }
            .foregroundStyle(Palette.inkMid)

            HStack(spacing: 4) {
                ForEach(week, id: \.self) { d in
                    let selected = DayKey.isSameDay(d, store.calendarDay)
                    let isToday = DayKey.isSameDay(d, Date())
                    let has = !store.agenda(on: d, filter: filter).isEmpty
                    Button { store.calendarDay = d } label: {
                        VStack(spacing: 3) {
                            Text(DayKey.weekdayShort.string(from: d).uppercased())
                                .font(AppFont.body(11, .bold)).tracking(0.6)
                            Text(DayKey.dayNumber.string(from: d)).font(AppFont.body(19, .bold))
                            Circle().fill(has ? (selected ? Palette.cream : Palette.ink) : .clear).frame(width: 5, height: 5)
                        }
                        .foregroundStyle(selected ? Palette.cream : Palette.ink)
                        .frame(maxWidth: .infinity, minHeight: 64)
                        .background(selected ? Palette.mintDeep : (isToday ? Palette.pink : Palette.paper),
                                    in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .gesture(DragGesture(minimumDistance: 30).onEnded { v in
            if v.translation.width < -60 { shift(7) } else if v.translation.width > 60 { shift(-7) }
        })
    }

    private func shift(_ days: Int) {
        store.calendarDay = DayKey.addDays(days, to: store.calendarDay)
    }
}

private struct FilterChips: View {
    @Environment(HouseholdStore.self) private var store
    @Binding var filter: AgendaFilter

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                Pill(label: "Everyone", selected: filter == .everyone, dotHex: "#F08A6C") { filter = .everyone }
                ForEach(store.family) { m in
                    Pill(label: m.name, selected: filter == .member(m.id), dotHex: m.color) { filter = .member(m.id) }
                }
                if !store.grandparents.isEmpty {
                    Pill(label: "Grands", selected: filter == .grandparents, dotHex: store.grandparents[0].color) {
                        filter = .grandparents
                    }
                }
            }
            .padding(.horizontal, 16)
        }
        .padding(.horizontal, -16)
    }
}

struct AgendaRow: View {
    @Environment(HouseholdStore.self) private var store
    let item: AgendaItem
    var onTap: () -> Void = {}

    var body: some View {
        let lead = store.leadColor(item.tagIDs)
        let past = (item.start.map { $0 < Date() } ?? false) && DayKey.isSameDay(item.start ?? Date(), Date())
        Button(action: onTap) {
            HStack(alignment: .top, spacing: 10) {
                VStack(alignment: .leading, spacing: 0) {
                    if let s = item.start {
                        Text(DayKey.clock.string(from: s)).font(AppFont.body(14, .bold))
                        Text(DayKey.ampm.string(from: s)).font(AppFont.body(11, .bold)).foregroundStyle(Palette.inkSoft)
                    } else {
                        Text("All day").font(AppFont.body(12, .bold))
                    }
                }
                .frame(width: 52, alignment: .leading)
                .padding(.top, 12)

                VStack(alignment: .leading, spacing: 4) {
                    Text(item.title).font(AppFont.body(16, .bold)).multilineTextAlignment(.leading)
                    if let note = item.note, !note.isEmpty {
                        Text(note).font(AppFont.body(13)).foregroundStyle(Palette.inkMid).multilineTextAlignment(.leading)
                    }
                    HStack(spacing: 6) {
                        ColorDot(hex: lead, size: 9)
                        Text(store.names(item.tagIDs)).font(AppFont.body(12, .bold)).foregroundStyle(Palette.inkMid)
                        if let src = item.sourceLabel {
                            Text(src)
                                .font(AppFont.body(11, .bold)).foregroundStyle(Palette.inkMid)
                                .padding(.horizontal, 8).padding(.vertical, 3)
                                .background(Palette.paper, in: Capsule())
                        }
                    }
                    .padding(.top, 2)
                }
                .padding(.horizontal, 14).padding(.vertical, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.memberTint(lead), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .foregroundStyle(Palette.ink)
            .opacity(past ? 0.5 : 1)
        }
        .buttonStyle(.plain)
        .disabled(item.kind == .daycare)
    }
}

private struct CalendarSourcesCard: View {
    @Environment(HouseholdStore.self) private var store

    var body: some View {
        let manual = store.events.filter { $0.source == "manual" }
        let synced = manual.contains { $0.syncStatus == "synced" }
        let failed = manual.contains { $0.syncStatus == "error" }
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Connected calendars").font(AppFont.body(16, .bold))
                Text("Events you add land on the family Google Calendar, and tagged adults get an invite by email. Grandparents, kids and pets are tagged only.")
                    .font(AppFont.body(13)).foregroundStyle(Palette.inkSoft)
            }
            sourceRow(dot: "#5DB894", name: "Family Google Calendar",
                      status: store.isDemo ? "Demo" : (failed ? "Check setup" : (synced ? "Connected" : "Waiting for first event")))
            sourceRow(dot: "#6CC0CF", name: "Family inbox", status: "Phase 3")
            sourceRow(dot: "#EE8FA8", name: "Personal calendars", status: "Phase 3")
        }
        .card(Palette.paper, bordered: true)
    }

    private func sourceRow(dot: String, name: String, status: String) -> some View {
        HStack(spacing: 12) {
            Circle().fill(Color(hex: dot)).frame(width: 12, height: 12)
            Text(name).font(AppFont.body(15, .bold))
            Spacer()
            Text(status).font(AppFont.body(12, .bold)).foregroundStyle(Palette.inkSoft)
        }
    }
}
