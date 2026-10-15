import Foundation
import Observation

enum AppTab: Hashable { case home, calendar, chores, lists }

enum AgendaFilter: Hashable {
    case everyone
    case member(UUID)
    case grandparents
}

struct AgendaItem: Identifiable, Hashable {
    enum Kind: Hashable { case event(FamilyEvent), daycare }
    let id: String
    let start: Date?              // nil = all day
    let title: String
    let note: String?
    let tagIDs: [UUID]
    let sourceLabel: String?
    let kind: Kind
}

struct DaycareDay: Hashable {
    let date: Date
    let key: String
    var drop: UUID?
    var pick: UUID?
    var sleepover: UUID?
    var closed: Bool
    var note: String?
    let dropTime: String
    let pickTime: String
}

struct StoreSuggestion {
    let store: GroceryStore
    let trips: Int
    let total: Int
}

struct EventDraft {
    var existing: FamilyEvent?
    var title = ""
    var note = ""
    var day = Date()
    var time = DayKey.at(hour: 18, minute: 0, on: Date())
    var allDay = false
    var tagIDs: Set<UUID> = []
}

/// The whole household's state for the phone, with optimistic updates.
@MainActor
@Observable
final class HouseholdStore {
    let repo: Repository

    var household: Household?
    var me: Member?
    var members: [Member] = []
    var events: [FamilyEvent] = []
    var pattern: [DaycarePattern] = []
    var overrides: [String: DaycareOverride] = [:]
    var chores: [Chore] = []
    var completions: Set<String> = []          // "choreID|yyyy-MM-dd"
    var stores: [GroceryStore] = []
    var groceries: [GroceryItem] = []
    var storeStats: [StoreStat] = []
    var meals: [String: Meal] = [:]

    var hasLoaded = false
    var loadError: String?
    var toast: String?
    var selectedTab: AppTab = .home
    var calendarDay: Date = DayKey.startOfDay(Date())

    @ObservationIgnored private var toastTask: Task<Void, Never>?
    @ObservationIgnored private var listenTask: Task<Void, Never>?
    @ObservationIgnored private var reloadTask: Task<Void, Never>?

    init(repo: Repository) { self.repo = repo }

    var isDemo: Bool { repo.isDemo }

    // MARK: - Loading

    func load() async {
        do {
            let s = try await repo.loadSnapshot()
            apply(s)
            hasLoaded = true
            loadError = nil
        } catch {
            loadError = error.localizedDescription
        }
    }

    func startListening() {
        guard listenTask == nil else { return }
        listenTask = Task { [weak self] in
            guard let stream = self?.repo.changes() else { return }
            for await _ in stream {
                self?.scheduleReload()
            }
        }
    }

    func stopListening() {
        listenTask?.cancel(); listenTask = nil
        reloadTask?.cancel(); reloadTask = nil
    }

    private func scheduleReload() {
        reloadTask?.cancel()
        reloadTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 600_000_000)
            guard !Task.isCancelled else { return }
            await self?.load()
        }
    }

    private func apply(_ s: Snapshot) {
        household = s.household
        me = s.me
        members = s.members.sorted { $0.sort < $1.sort }
        events = s.events
        pattern = s.pattern
        overrides = Dictionary(s.overrides.map { ($0.day, $0) }, uniquingKeysWith: { _, b in b })
        chores = s.chores.sorted { $0.sort < $1.sort }
        completions = Set(s.completions.map { "\($0.choreID.uuidString)|\($0.day)" })
        stores = s.stores.sorted { $0.sort < $1.sort }
        groceries = s.groceries
        storeStats = s.storeStats
        meals = Dictionary(s.meals.map { ($0.day, $0) }, uniquingKeysWith: { _, b in b })
    }

    func flash(_ message: String) {
        toastTask?.cancel()
        toast = message
        toastTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 2_600_000_000)
            guard !Task.isCancelled else { return }
            self?.toast = nil
        }
    }

    @discardableResult
    private func attempt(_ what: String, _ op: () async throws -> Void) async -> Bool {
        do {
            try await op()
            return true
        } catch {
            flash("Couldn't \(what) — \(error.localizedDescription)")
            await load()
            return false
        }
    }

    // MARK: - People

    func member(_ id: UUID?) -> Member? {
        guard let id else { return nil }
        return members.first { $0.id == id }
    }

    var family: [Member] { members.filter { $0.kind != .grandparent } }
    var adults: [Member] { members.filter { $0.kind == .adult } }
    var grandparents: [Member] { members.filter { $0.kind == .grandparent } }
    var child: Member? { members.first { $0.kind == .child } }
    var runners: [Member] { adults + grandparents }

    func names(_ ids: [UUID]) -> String {
        let people = ids.compactMap { member($0) }
        guard let child, people.count > 1, people.contains(where: { $0.id == child.id }) else {
            return people.map(\.name).joined(separator: " + ")
        }
        let others = people.filter { $0.id != child.id }.map(\.name).joined(separator: " + ")
        return "\(others) · \(child.name)"
    }

    func leadColor(_ ids: [UUID]) -> String {
        let people = ids.compactMap { member($0) }
        if let child, people.count > 1, let other = people.first(where: { $0.id != child.id }) { return other.color }
        return people.first?.color ?? "#F08A6C"
    }

    // MARK: - Calendar

    func agenda(on day: Date, filter: AgendaFilter = .everyone) -> [AgendaItem] {
        var items: [AgendaItem] = events
            .filter { DayKey.isSameDay($0.startsAt, day) }
            .map { e in
                AgendaItem(id: e.id.uuidString, start: e.allDay ? nil : e.startsAt, title: e.title,
                           note: e.note, tagIDs: e.tagIDs, sourceLabel: sourceLabel(e), kind: .event(e))
            }

        if let d = daycare(on: day) {
            let kid = child.map { [$0.id] } ?? []
            if d.closed {
                items.append(AgendaItem(id: "dc-closed-\(d.key)", start: nil, title: "Daycare closed",
                                        note: d.note, tagIDs: kid, sourceLabel: "Daycare", kind: .daycare))
            } else {
                if let drop = d.drop {
                    items.append(AgendaItem(id: "dc-drop-\(d.key)", start: DayKey.at(d.dropTime, on: day),
                                            title: "Daycare drop-off", note: nil, tagIDs: [drop] + kid,
                                            sourceLabel: "Daycare run", kind: .daycare))
                }
                if let pick = d.pick {
                    let note = d.sleepover.flatMap { member($0) }.map { "Straight to \($0.name)’s" }
                    items.append(AgendaItem(id: "dc-pick-\(d.key)", start: DayKey.at(d.pickTime, on: day),
                                            title: "Daycare pickup", note: note, tagIDs: [pick] + kid,
                                            sourceLabel: "Daycare run", kind: .daycare))
                }
                if let s = d.sleepover, let who = member(s) {
                    items.append(AgendaItem(id: "dc-sleep-\(d.key)", start: DayKey.at(hour: 18, minute: 30, on: day),
                                            title: "Sleepover at \(who.name)’s", note: "Overnight bag + favorite blanket",
                                            tagIDs: [s] + kid, sourceLabel: "Daycare run", kind: .daycare))
                }
            }
        }

        let filtered = items.filter { matches($0, filter) }
        return filtered.sorted { a, b in
            switch (a.start, b.start) {
            case (nil, nil): return a.title < b.title
            case (nil, _): return true
            case (_, nil): return false
            case let (x?, y?): return x == y ? a.title < b.title : x < y
            }
        }
    }

    private func matches(_ item: AgendaItem, _ filter: AgendaFilter) -> Bool {
        switch filter {
        case .everyone: return true
        case .member(let id): return item.tagIDs.contains(id)
        case .grandparents: return item.tagIDs.contains { id in grandparents.contains { $0.id == id } }
        }
    }

    private func sourceLabel(_ e: FamilyEvent) -> String? {
        switch e.source {
        case "inbox": return "Auto · family inbox"
        case "google": return "Google Calendar"
        case "icloud": return "iCloud"
        default:
            switch e.syncStatus {
            case "error": return "Calendar sync failed"
            case "synced":
                let invited = e.tagIDs.compactMap { member($0) }.filter(\.getsInvites).map(\.name)
                return invited.isEmpty ? "On family calendar" : "Invited: " + invited.joined(separator: ", ")
            default: return nil
            }
        }
    }

    func upNext(after now: Date = Date()) -> AgendaItem? {
        agenda(on: now).first { ($0.start ?? .distantPast) >= now }
    }

    func saveEvent(_ draft: EventDraft) async {
        guard let hid = household?.id else { return }
        let title = draft.title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { flash("Give the event a name first"); return }

        let start: Date
        if draft.allDay {
            start = DayKey.startOfDay(draft.day)
        } else {
            let c = DayKey.calendar.dateComponents([.hour, .minute], from: draft.time)
            start = DayKey.at(hour: c.hour ?? 18, minute: c.minute ?? 0, on: draft.day)
        }
        let tags = draft.tagIDs.isEmpty ? family.map(\.id) : Array(draft.tagIDs)
        let note = draft.note.trimmingCharacters(in: .whitespacesAndNewlines)
        let isNew = draft.existing == nil

        var event = draft.existing ?? FamilyEvent(id: UUID(), householdID: hid, title: title, note: nil,
                                                  startsAt: start, endsAt: nil, allDay: draft.allDay,
                                                  createdBy: me?.id)
        event.title = title
        event.note = note.isEmpty ? nil : note
        event.startsAt = start
        event.allDay = draft.allDay
        event.tagIDs = tags.sorted { (member($0)?.sort ?? 0) < (member($1)?.sort ?? 0) }
        event.syncStatus = "pending"
        let saved = event

        if let i = events.firstIndex(where: { $0.id == saved.id }) { events[i] = saved } else { events.append(saved) }

        do {
            try await repo.saveEvent(saved, isNew: isNew)
        } catch {
            flash("Couldn't save — \(error.localizedDescription)")
            await load()
            return
        }

        let outcome = await repo.syncEvent(id: saved.id)
        if let i = events.firstIndex(where: { $0.id == saved.id }) {
            switch outcome {
            case .synced: events[i].syncStatus = "synced"
            case .skipped: events[i].syncStatus = "skipped"
            case .failed: events[i].syncStatus = "error"
            }
        }
        let dayName = DayKey.isSameDay(start, Date()) ? "today" : DayKey.weekdayLong.string(from: start)
        switch outcome {
        case .synced(let emails):
            let invited = members.filter { m in m.email.map { emails.contains($0) } ?? false }.map(\.name)
            flash(invited.isEmpty ? "Added to \(dayName)" : "Added — invites sent to \(invited.joined(separator: " & "))")
        case .skipped:
            flash(isDemo ? "Added to \(dayName)" : "Added — Google Calendar isn't connected yet")
        case .failed:
            flash("Saved, but the calendar invite didn't go out")
        }
    }

    func deleteEvent(_ event: FamilyEvent) async {
        events.removeAll { $0.id == event.id }
        guard await attempt("delete the event", { try await repo.deleteEvent(event) }) else { return }
        flash("Event removed")
    }

    // MARK: - Daycare

    func daycare(on day: Date) -> DaycareDay? {
        let key = DayKey.key(day)
        let p = pattern.first { $0.weekday == DayKey.isoWeekday(day) }
        let o = overrides[key]
        guard p != nil || o != nil else { return nil }
        return DaycareDay(date: DayKey.startOfDay(day), key: key,
                          drop: o != nil ? o!.dropMember : p?.dropMember,
                          pick: o != nil ? o!.pickMember : p?.pickMember,
                          sleepover: o?.sleepoverMember,
                          closed: o?.closed ?? false,
                          note: o?.note,
                          dropTime: p?.dropTime ?? "07:30:00",
                          pickTime: p?.pickTime ?? "17:15:00")
    }

    @discardableResult
    private func save(_ d: DaycareDay) async -> Bool {
        guard let hid = household?.id else { return false }
        let p = pattern.first { $0.weekday == DayKey.isoWeekday(d.date) }
        let matchesPattern = !d.closed && d.sleepover == nil && d.note == nil
            && d.drop == p?.dropMember && d.pick == p?.pickMember && p != nil
        if matchesPattern {
            overrides[d.key] = nil
            return await attempt("update daycare", { try await repo.deleteOverride(householdID: hid, day: d.key) })
        } else {
            let o = DaycareOverride(householdID: hid, day: d.key, dropMember: d.drop, pickMember: d.pick,
                                    sleepoverMember: d.sleepover, closed: d.closed, note: d.note, updatedBy: me?.id)
            overrides[d.key] = o
            return await attempt("update daycare", { try await repo.upsertOverride(o) })
        }
    }

    private func nextRunner(after id: UUID?) -> UUID? {
        let r = runners
        guard !r.isEmpty else { return nil }
        guard let id, let i = r.firstIndex(where: { $0.id == id }) else { return r.first?.id }
        return r[(i + 1) % r.count].id
    }

    func cycleDrop(_ day: Date) async {
        guard var d = daycare(on: day) else { return }
        d.drop = nextRunner(after: d.drop)
        guard await save(d) else { return }
        flash("\(DayKey.weekdayShort.string(from: day)) drop-off: \(member(d.drop)?.name ?? "nobody")\(taggedOnly(d.drop))")
    }

    func cyclePick(_ day: Date) async {
        guard var d = daycare(on: day) else { return }
        d.pick = nextRunner(after: d.pick)
        guard await save(d) else { return }
        flash("\(DayKey.weekdayShort.string(from: day)) pickup: \(member(d.pick)?.name ?? "nobody")\(taggedOnly(d.pick))")
    }

    private func taggedOnly(_ id: UUID?) -> String {
        member(id)?.kind == .grandparent ? " (tagged, no invite)" : ""
    }

    /// Off → first grandparents → second grandparents → off. The sleepover hosts
    /// take that night's pickup and the next morning's drop-off.
    func cycleSleepover(_ day: Date) async {
        guard var d = daycare(on: day) else { return }
        let grands = grandparents.map(\.id)
        let next: UUID?
        if let cur = d.sleepover, let i = grands.firstIndex(of: cur) {
            next = i + 1 < grands.count ? grands[i + 1] : nil
        } else {
            next = grands.first
        }
        let p = pattern.first { $0.weekday == DayKey.isoWeekday(day) }
        let prev = d.sleepover
        d.sleepover = next
        // Only move the pickup when the host changes; never wipe a manual swap.
        if let next { d.pick = next } else if d.pick == prev { d.pick = p?.pickMember }
        guard await save(d) else { return }

        let tomorrow = DayKey.addDays(1, to: day)
        if var n = daycare(on: tomorrow), !n.closed {
            let np = pattern.first { $0.weekday == DayKey.isoWeekday(tomorrow) }
            if let next {
                n.drop = next
                await save(n)
            } else if let prev, n.drop == prev {
                n.drop = np?.dropMember
                await save(n)
            }
        }

        if let next, let who = member(next) {
            flash("Sleepover \(DayKey.weekdayShort.string(from: day)) night at \(who.name)’s")
        } else {
            flash("Sleepover removed")
        }
    }

    func toggleClosed(_ day: Date) async {
        guard var d = daycare(on: day) else { return }
        d.closed.toggle()
        if !d.closed { d.note = nil }
        guard await save(d) else { return }
        flash(d.closed ? "Daycare marked closed" : "Daycare open again")
    }

    // MARK: - Chores

    func choresDue(on day: Date) -> [Chore] {
        let wd = DayKey.isoWeekday(day)
        return chores.filter { c in
            switch c.cadence {
            case "weekdays": return wd <= 5
            case "weekly": return c.weekday == wd
            default: return true
            }
        }
    }

    func isDone(_ chore: Chore, on day: Date = Date()) -> Bool {
        completions.contains("\(chore.id.uuidString)|\(DayKey.key(day))")
    }

    func toggle(_ chore: Chore, on day: Date = Date()) async {
        let key = "\(chore.id.uuidString)|\(DayKey.key(day))"
        let done = !completions.contains(key)
        if done { completions.insert(key) } else { completions.remove(key) }
        await attempt("update the chore") {
            try await repo.setChore(chore, day: DayKey.key(day), done: done, by: me?.id)
        }
    }

    // MARK: - Groceries

    func store(_ id: UUID?) -> GroceryStore? {
        guard let id else { return nil }
        return stores.first { $0.id == id }
    }

    func suggestion(for productKey: String) -> StoreSuggestion? {
        let rows = storeStats.filter { $0.productKey == productKey }
        guard let best = rows.max(by: { $0.trips < $1.trips }), let s = store(best.storeID) else { return nil }
        return StoreSuggestion(store: s, trips: best.trips, total: rows.reduce(0) { $0 + $1.trips })
    }

    private func learn(_ key: String, _ storeID: UUID) async {
        guard let hid = household?.id else { return }
        if let i = storeStats.firstIndex(where: { $0.productKey == key && $0.storeID == storeID }) {
            storeStats[i].trips += 1
        } else {
            storeStats.append(StoreStat(householdID: hid, productKey: key, storeID: storeID, trips: 1))
        }
        try? await repo.recordStoreTrip(householdID: hid, productKey: key, storeID: storeID)
    }

    /// Adds an item. If `storeID` is nil the learned store is used; an explicit store teaches the app.
    func addGrocery(name: String, upc: String? = nil, storeID: UUID? = nil) async {
        guard let hid = household?.id else { return }
        let clean = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        let key = upc.map { "upc:\($0)" } ?? GroceryItem.key(for: clean)

        if let existing = groceries.first(where: { $0.productKey == key && !$0.checked }) {
            if let storeID, existing.storeID != storeID {
                await setStore(existing, storeID)
            }
            flash("\(existing.name) is already on the list")
            return
        }

        let learned = suggestion(for: key)
        let chosen = storeID ?? learned?.store.id
        let item = GroceryItem(id: UUID(), householdID: hid, name: clean, productKey: key, upc: upc,
                               storeID: chosen, checked: false, checkedAt: nil, addedBy: me?.id)
        groceries.append(item)
        guard await attempt("add the item", { try await repo.addGrocery(item) }) else { return }
        if let storeID {
            // Only an explicit choice that differs from what was learned teaches the app;
            // the purchase itself is counted when the checked item is cleared.
            if storeID != learned?.store.id { await learn(key, storeID) }
            flash("\(clean) added to \(store(storeID)?.name ?? "the list")")
        } else if let learned {
            flash("\(clean) → \(learned.store.name) (learned)")
        } else {
            flash("\(clean) added — tap its store to teach me")
        }
    }

    func setStore(_ item: GroceryItem, _ storeID: UUID) async {
        guard item.storeID != storeID, let i = groceries.firstIndex(where: { $0.id == item.id }) else { return }
        groceries[i].storeID = storeID
        let updated = groceries[i]
        guard await attempt("move the item", { try await repo.updateGrocery(updated) }) else { return }
        await learn(item.productKey, storeID)
        flash("Got it — \(item.name) usually from \(store(storeID)?.name ?? "there")")
    }

    func toggle(_ item: GroceryItem) async {
        guard let i = groceries.firstIndex(where: { $0.id == item.id }) else { return }
        groceries[i].checked.toggle()
        groceries[i].checkedAt = groceries[i].checked ? Date() : nil
        let updated = groceries[i]
        await attempt("update the item") { try await repo.updateGrocery(updated) }
    }

    /// Removes checked items; each one with a store counts as a trip there.
    func clearChecked() async {
        let done = groceries.filter(\.checked)
        guard !done.isEmpty else { return }
        groceries.removeAll(where: \.checked)
        guard await attempt("clear the list", { try await repo.deleteGroceries(ids: done.map(\.id)) }) else { return }
        for item in done { if let s = item.storeID { await learn(item.productKey, s) } }
        flash("Cleared \(done.count) item\(done.count == 1 ? "" : "s")")
    }

    func lookup(upc: String) async -> ProductInfo? {
        do { return try await repo.lookupUPC(upc) } catch {
            flash("Barcode lookup failed — type a name instead")
            return nil
        }
    }

    var groceriesLeft: Int { groceries.filter { !$0.checked }.count }

    // MARK: - Meals

    func meal(on day: Date) -> Meal? { meals[DayKey.key(day)] }

    func cookLabel(_ meal: Meal?) -> String {
        guard let meal else { return "Nothing planned yet" }
        if let m = member(meal.cookMember) { return "\(m.name) cooks" }
        return meal.cookLabel ?? ""
    }

    func setMeal(on day: Date, title: String, cook: UUID?, label: String?) async {
        guard let hid = household?.id else { return }
        let clean = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        let meal = Meal(householdID: hid, day: DayKey.key(day), title: clean, cookMember: cook, cookLabel: label)
        meals[meal.day] = meal
        guard await attempt("save dinner", { try await repo.upsertMeal(meal) }) else { return }
        flash("Dinner: \(clean)")
    }

    // MARK: - Members

    @discardableResult
    func updateEmail(_ member: Member, _ email: String) async -> Bool {
        guard let i = members.firstIndex(where: { $0.id == member.id }) else { return false }
        let clean = email.trimmingCharacters(in: .whitespacesAndNewlines)
        members[i].email = clean.isEmpty ? nil : clean
        let updated = members[i]
        return await attempt("save the email", { try await repo.updateMember(updated) })
    }
}
