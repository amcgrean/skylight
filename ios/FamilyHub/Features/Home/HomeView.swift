import SwiftUI

struct HomeView: View {
    @Environment(HouseholdStore.self) private var store
    @Environment(AuthService.self) private var auth
    @State private var showSettings = false

    var body: some View {
        Page {
            ScreenHeader(
                eyebrow: DayKey.headerDate.string(from: Date()),
                title: "Hey, \(store.me?.name ?? "there")",
                trailing: AnyView(
                    HStack(spacing: 12) {
                        AvatarStack(members: Array(store.family.prefix(4)))
                        Button { showSettings = true } label: {
                            Image(systemName: "gearshape.fill")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(Palette.inkMid)
                                .frame(width: 44, height: 44)
                        }
                        .accessibilityLabel("Settings")
                    }
                )
            )
            Text(store.family.map(\.name).joined(separator: " · "))
                .font(AppFont.body(13)).foregroundStyle(Palette.inkSoft)
                .padding(.top, -8)

            if store.isDemo {
                HStack(spacing: 10) {
                    Image(systemName: "sparkles")
                    Text("Demo mode — sample data on this phone only. Add Secrets.plist to go live.")
                        .font(AppFont.body(13))
                }
                .foregroundStyle(Palette.butterText)
                .card(Palette.butter, padding: 12)
            }

            DaycareTodayCard()
            UpNextCard()
            ChoreSummaryCard()
            DinnerCard()
        }
        .sheet(isPresented: $showSettings) { SettingsView().environment(store).environment(auth) }
    }
}

private struct DaycareTodayCard: View {
    @Environment(HouseholdStore.self) private var store

    var body: some View {
        if let child = store.child, let d = store.daycare(on: Date()) {
            Button {
                store.calendarDay = DayKey.startOfDay(Date())
                store.selectedTab = .calendar
            } label: {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("\(child.name)'s day").font(AppFont.body(16, .bold))
                        Spacer()
                        Eyebrow("Daycare", color: Palette.butterText)
                    }
                    if d.closed {
                        Text("Daycare is closed today\(d.note.map { " · \($0)" } ?? "")")
                            .font(AppFont.body(15, .bold)).foregroundStyle(Palette.butterText)
                    } else {
                        HStack(spacing: 10) {
                            runTile("Drop-off \(DayKey.clock.string(from: DayKey.at(d.dropTime, on: d.date)))", d.drop)
                            runTile("Pickup \(DayKey.clock.string(from: DayKey.at(d.pickTime, on: d.date)))", d.pick)
                        }
                        if let s = store.member(d.sleepover) {
                            Text("Sleepover at \(s.name)’s tonight")
                                .font(AppFont.body(13, .bold)).foregroundStyle(Palette.butterText)
                        }
                    }
                }
                .foregroundStyle(Palette.ink)
                .card(Palette.butter)
            }
            .buttonStyle(.plain)
        }
    }

    private func runTile(_ label: String, _ id: UUID?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Eyebrow(label)
            HStack(spacing: 6) {
                if let m = store.member(id) { ColorDot(hex: m.color, size: 16) }
                Text(store.member(id)?.name ?? "Nobody yet").font(AppFont.body(15, .bold))
                    .lineLimit(1).minimumScaleFactor(0.8)
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.paper, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

private struct UpNextCard: View {
    @Environment(HouseholdStore.self) private var store

    var body: some View {
        HStack(spacing: 14) {
            if let next = store.upNext(), let start = next.start {
                VStack(spacing: 0) {
                    Text(DayKey.clock.string(from: start)).font(AppFont.body(15, .bold))
                    Text(DayKey.ampm.string(from: start)).font(AppFont.body(10, .bold))
                }
                .frame(width: 58, height: 58)
                .background(Palette.paper, in: Circle())
                .overlay(Circle().stroke(Palette.ink, lineWidth: 2))
                VStack(alignment: .leading, spacing: 2) {
                    Eyebrow("Up next · \(Self.until(start))", color: Palette.pinkText)
                    Text(next.title).font(AppFont.body(18, .bold))
                    Text(store.names(next.tagIDs)).font(AppFont.body(13)).foregroundStyle(Palette.pinkText)
                }
            } else {
                VStack(alignment: .leading, spacing: 2) {
                    Eyebrow("Up next", color: Palette.pinkText)
                    Text("Nothing else today").font(AppFont.body(18, .bold))
                }
            }
            Spacer(minLength: 0)
        }
        .foregroundStyle(Palette.ink)
        .card(Palette.pink)
    }

    static func until(_ date: Date) -> String {
        let mins = Int(date.timeIntervalSinceNow / 60)
        if mins <= 0 { return "now" }
        if mins < 60 { return "in \(mins)m" }
        return "in \(mins / 60)h \(mins % 60)m"
    }
}

private struct ChoreSummaryCard: View {
    @Environment(HouseholdStore.self) private var store

    var body: some View {
        let today = store.choresDue(on: Date())
        let done = today.filter { store.isDone($0) }.count
        Button { store.selectedTab = .chores } label: {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Today's chores").font(AppFont.body(16, .bold))
                    Spacer()
                    Text("\(done) of \(today.count) done").font(AppFont.body(13)).foregroundStyle(Palette.mintText)
                }
                ForEach(store.family) { m in
                    let mine = today.filter { $0.memberID == m.id }
                    if !mine.isEmpty {
                        let n = mine.filter { store.isDone($0) }.count
                        HStack(spacing: 10) {
                            Avatar(member: m, size: 26)
                            Text(m.name).font(AppFont.body(14)).frame(width: 62, alignment: .leading)
                            ProgressBar(value: Double(n) / Double(mine.count), color: Color(hex: m.color))
                            Text("\(n)/\(mine.count)").font(AppFont.body(13)).foregroundStyle(Palette.mintText)
                                .frame(width: 32, alignment: .trailing)
                        }
                    }
                }
            }
            .foregroundStyle(Palette.ink)
            .card(Palette.mint)
        }
        .buttonStyle(.plain)
    }
}

struct ProgressBar: View {
    let value: Double
    let color: Color
    var track: Color = Palette.paper

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(track)
                Capsule().fill(color).frame(width: max(0, min(1, value)) * geo.size.width)
            }
        }
        .frame(height: 8)
        .accessibilityValue("\(Int(value * 100)) percent")
    }
}

private struct DinnerCard: View {
    @Environment(HouseholdStore.self) private var store
    @State private var editing = false
    @State private var draft = ""
    @State private var cook: UUID?
    @State private var takeout = false

    var body: some View {
        let meal = store.meal(on: Date())
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Eyebrow("What's for dinner")
                    Text(meal?.title ?? "Not planned yet").font(AppFont.body(19, .bold))
                    Text(store.cookLabel(meal)).font(AppFont.body(13)).foregroundStyle(Palette.inkSoft)
                }
                Spacer()
                Button { store.selectedTab = .lists } label: {
                    Text("\(store.groceriesLeft) to buy")
                        .font(AppFont.body(13, .bold)).foregroundStyle(Palette.ink)
                        .padding(.horizontal, 12).frame(minHeight: 38)
                        .overlay(Capsule().stroke(Palette.ink, lineWidth: 2))
                }
                .buttonStyle(.plain)
            }

            if editing {
                RetroTextField(placeholder: "Tonight's dinner", text: $draft) { save() }
                FlowLayout(spacing: 6) {
                    ForEach(store.adults) { a in
                        Pill(label: a.name, selected: !takeout && cook == a.id) { cook = a.id; takeout = false }
                    }
                    Pill(label: "Takeout", selected: takeout) { takeout = true; cook = nil }
                }
                HStack(spacing: 8) {
                    OutlineButton(title: "Cancel") { editing = false }
                    PrimaryButton(title: "Save", fill: Palette.mintDeep) { save() }
                }
            } else {
                PrimaryButton(title: meal == nil ? "Plan tonight's dinner" : "Edit tonight's dinner",
                              fill: Palette.mintDeep) {
                    draft = meal?.title ?? ""
                    cook = meal?.cookMember ?? store.me?.id
                    takeout = meal?.cookLabel == "Takeout"
                    editing = true
                }
            }
        }
        .foregroundStyle(Palette.ink)
        .card(Palette.paper, bordered: true)
    }

    private func save() {
        let title = draft
        let who = takeout ? nil : cook
        let label = takeout ? "Takeout" : nil
        editing = false
        Task { await store.setMeal(on: Date(), title: title, cook: who, label: label) }
    }
}
