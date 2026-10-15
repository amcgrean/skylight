import Foundation

/// In-memory household with sample data so the app is usable before Supabase is set up.
final class DemoRepository: Repository {
    let isDemo = true
    private var snap: Snapshot

    init() { snap = DemoRepository.sample() }

    func loadSnapshot() async throws -> Snapshot { snap }

    func saveEvent(_ event: FamilyEvent, isNew: Bool) async throws {
        if let i = snap.events.firstIndex(where: { $0.id == event.id }) { snap.events[i] = event }
        else { snap.events.append(event) }
    }

    func syncEvent(id: UUID) async -> SyncOutcome {
        guard let e = snap.events.first(where: { $0.id == id }) else { return .skipped }
        let invited = snap.members.filter { e.tagIDs.contains($0.id) && $0.getsInvites }.compactMap(\.email)
        return invited.isEmpty ? .skipped : .synced(invited: invited)
    }

    func deleteEvent(_ event: FamilyEvent) async throws { snap.events.removeAll { $0.id == event.id } }

    func upsertOverride(_ override: DaycareOverride) async throws {
        snap.overrides.removeAll { $0.day == override.day }
        snap.overrides.append(override)
    }

    func deleteOverride(householdID: UUID, day: String) async throws { snap.overrides.removeAll { $0.day == day } }

    func setChore(_ chore: Chore, day: String, done: Bool, by member: UUID?) async throws {
        snap.completions.removeAll { $0.choreID == chore.id && $0.day == day }
        if done { snap.completions.append(ChoreCompletion(choreID: chore.id, day: day, completedBy: member)) }
    }

    func addGrocery(_ item: GroceryItem) async throws { snap.groceries.append(item) }

    func updateGrocery(_ item: GroceryItem) async throws {
        if let i = snap.groceries.firstIndex(where: { $0.id == item.id }) { snap.groceries[i] = item }
    }

    func deleteGroceries(ids: [UUID]) async throws { snap.groceries.removeAll { ids.contains($0.id) } }

    func recordStoreTrip(householdID: UUID, productKey: String, storeID: UUID) async throws {
        if let i = snap.storeStats.firstIndex(where: { $0.productKey == productKey && $0.storeID == storeID }) {
            snap.storeStats[i].trips += 1
        } else {
            snap.storeStats.append(StoreStat(householdID: householdID, productKey: productKey, storeID: storeID, trips: 1))
        }
    }

    func lookupUPC(_ upc: String) async throws -> ProductInfo {
        try? await Task.sleep(nanoseconds: 400_000_000)
        let known: [String: (String, String)] = [
            "036000411287": ("Diapers, size 5", "Huggies"),
            "0036000411287": ("Diapers, size 5", "Huggies"),
            "051500725306": ("Creamy peanut butter, 40 oz", "Jif"),
            "0051500725306": ("Creamy peanut butter, 40 oz", "Jif"),
        ]
        if let k = known[upc] { return ProductInfo(upc: upc, name: k.0, brand: k.1, found: true) }
        return ProductInfo(upc: upc, name: nil, brand: nil, found: false)
    }

    func upsertMeal(_ meal: Meal) async throws {
        snap.meals.removeAll { $0.day == meal.day }
        snap.meals.append(meal)
    }

    func updateMember(_ member: Member) async throws {
        if let i = snap.members.firstIndex(where: { $0.id == member.id }) { snap.members[i] = member }
    }

    func changes() -> AsyncStream<Void> { AsyncStream { _ in } }

    // MARK: - Sample household

    private static func sample() -> Snapshot {
        let hid = UUID()
        let household = Household(id: hid, name: "Home", inviteCode: "DEMO42", timezone: TimeZone.current.identifier)

        func m(_ name: String, _ short: String, _ kind: MemberKind, _ color: String, _ email: String? = nil, _ sort: Int) -> Member {
            Member(id: UUID(), householdID: hid, userID: nil, name: name, shortName: short, kind: kind,
                   color: color, email: email, sort: sort)
        }
        let aaron = m("Aaron", "Aaron", .adult, "#5DB894", "aaron@example.com", 0)
        let makala = m("Makala", "Makala", .adult, "#EE8FA8", "makala@example.com", 1)
        let patrick = m("Patrick", "Patrick", .child, "#F2C14E", nil, 2)
        let pets = m("Pets", "Pets", .pets, "#6CC0CF", nil, 3)
        let jay = m("Jay & Peggy", "Jay/Peggy", .grandparent, "#B4A3FF", nil, 4)
        let ron = m("Ron & Autumn", "Ron/Autumn", .grandparent, "#A9C46C", nil, 5)
        let members = [aaron, makala, patrick, pets, jay, ron]

        let week = DayKey.week(containing: Date())
        func ev(_ day: Int, _ h: Int, _ min: Int, _ title: String, _ tags: [Member], note: String? = nil,
                source: String = "manual", allDay: Bool = false) -> FamilyEvent {
            let start = allDay ? week[day] : DayKey.at(hour: h, minute: min, on: week[day])
            return FamilyEvent(id: UUID(), householdID: hid, title: title, note: note, startsAt: start,
                               endsAt: nil, allDay: allDay, source: source, syncStatus: "synced",
                               createdBy: aaron.id, tagIDs: tags.map(\.id))
        }
        let today = DayKey.isoWeekday(Date()) - 1
        let events: [FamilyEvent] = [
            ev(today, 10, 0, "Sprint review", [aaron], source: "google"),
            ev(today, 12, 30, "Nap time", [patrick], note: "Sound machine on, blackout curtains"),
            ev(today, 15, 0, "Vet checkup for the dog", [pets, aaron], note: "Annual shots — bring the vaccine card", source: "inbox"),
            ev(today, 19, 0, "Bath, books & bedtime", [patrick], note: "Pajamas, two stories & a cuddle"),
            ev(1, 9, 30, "Toddler swim", [patrick, makala], note: "Swim diaper + towel"),
            ev(1, 19, 0, "Date night", [aaron, makala], note: "Sitter: Jay & Peggy"),
            ev(2, 8, 0, "Flea meds for all three", [pets]),
            ev(3, 10, 0, "Library story time", [patrick, makala]),
            ev(5, 9, 0, "Farmers market", [aaron, makala, patrick], note: "Bring the wagon"),
            ev(6, 10, 0, "Brunch with Jay & Peggy", [aaron, makala, patrick, jay]),
        ]

        let pattern = (1...5).map {
            DaycarePattern(householdID: hid, weekday: $0, dropMember: aaron.id, pickMember: makala.id,
                           dropTime: "07:30:00", pickTime: "17:15:00")
        }
        let overrides = [
            DaycareOverride(householdID: hid, day: DayKey.key(week[2]), dropMember: aaron.id, pickMember: jay.id),
            DaycareOverride(householdID: hid, day: DayKey.key(week[4]), closed: true, note: "Teacher in-service day"),
        ]

        func chore(_ title: String, _ who: Member, _ pts: Int, _ sort: Int) -> Chore {
            Chore(id: UUID(), householdID: hid, title: title, memberID: who.id, points: pts,
                  cadence: "daily", weekday: nil, active: true, sort: sort)
        }
        let chores = [
            chore("Take out trash", aaron, 2, 0), chore("Mow front yard", aaron, 5, 1),
            chore("Start laundry", makala, 2, 2), chore("Pay water bill", makala, 1, 3),
            chore("Toys in the bin", patrick, 1, 4), chore("Brush teeth", patrick, 1, 5),
            chore("Walk the dog", pets, 2, 6), chore("Feed the dog", pets, 1, 7),
            chore("Feed both cats", pets, 1, 8), chore("Scoop litter box", pets, 2, 9),
        ]
        let todayKey = DayKey.key(Date())
        let completions = [chores[0], chores[2], chores[4], chores[6]].map {
            ChoreCompletion(choreID: $0.id, day: todayKey, completedBy: aaron.id)
        }

        let store = { (name: String, color: String, sort: Int) in
            GroceryStore(id: UUID(), householdID: hid, name: name, color: color, sort: sort)
        }
        let hyvee = store("Hy-Vee", "#E07A5F", 0), costco = store("Costco", "#3F6FA8", 1)
        let target = store("Target", "#B83E61", 2), aldi = store("Aldi", "#F2C14E", 3)

        func g(_ name: String, _ s: GroceryStore?, _ checked: Bool = false) -> GroceryItem {
            GroceryItem(id: UUID(), householdID: hid, name: name, productKey: GroceryItem.key(for: name),
                        upc: nil, storeID: s?.id, checked: checked, checkedAt: nil, addedBy: aaron.id)
        }
        let groceries = [
            g("Diapers, size 5", costco), g("Dog food", costco), g("Cat litter", target),
            g("Applesauce pouches", aldi), g("Whole milk", hyvee), g("Tortillas", hyvee),
            g("Avocados", aldi), g("Coffee beans", costco, true), g("Bananas", aldi),
        ]
        func stat(_ key: String, _ s: GroceryStore, _ n: Int) -> StoreStat {
            StoreStat(householdID: hid, productKey: key, storeID: s.id, trips: n)
        }
        let stats = [
            stat("diapers, size 5", costco, 3), stat("dog food", costco, 2), stat("dog food", target, 1),
            stat("cat litter", target, 2), stat("applesauce pouches", aldi, 2), stat("applesauce pouches", hyvee, 1),
            stat("whole milk", hyvee, 3), stat("avocados", aldi, 2), stat("coffee beans", costco, 2),
            stat("bananas", aldi, 3), stat("peanut butter", costco, 1),
        ]

        let meals = [
            Meal(householdID: hid, day: todayKey, title: "Taco night", cookMember: makala.id, cookLabel: nil),
            Meal(householdID: hid, day: DayKey.key(DayKey.addDays(1, to: Date())), title: "Sheet-pan chicken",
                 cookMember: aaron.id, cookLabel: nil),
        ]

        return Snapshot(household: household, me: aaron, members: members, events: events, pattern: pattern,
                        overrides: overrides, chores: chores, completions: completions,
                        stores: [hyvee, costco, target, aldi], groceries: groceries, storeStats: stats, meals: meals)
    }
}
