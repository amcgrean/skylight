import Foundation
import Supabase

enum HubError: LocalizedError {
    case notLinked
    case message(String)

    var errorDescription: String? {
        switch self {
        case .notLinked: return "This account isn't linked to a family member yet."
        case .message(let m): return m
        }
    }
}

/// Live backend. Every query runs as the signed-in user, so row-level security
/// keeps it to their household.
final class SupabaseRepository: Repository {
    let isDemo = false
    let client: SupabaseClient
    private var householdID: UUID?

    init(client: SupabaseClient) { self.client = client }

    // MARK: Load

    func loadSnapshot() async throws -> Snapshot {
        let userID = try await client.auth.session.user.id
        let mine: [Member] = try await client.from("members").select()
            .eq("user_id", value: userID.uuidString).limit(1).execute().value
        guard let me = mine.first else { throw HubError.notLinked }
        let hid = me.householdID
        householdID = hid
        let h = hid.uuidString

        let today = DayKey.startOfDay(Date())
        let from = DayKey.startOfWeek(DayKey.addDays(-35, to: today))
        let to = DayKey.addDays(180, to: today)
        let fromKey = DayKey.key(from)
        let toKey = DayKey.key(to)

        async let household: Household = client.from("households").select().eq("id", value: h).single().execute().value
        async let members: [Member] = client.from("members").select().eq("household_id", value: h).order("sort").execute().value
        async let events: [EventWire] = client.from("events").select("*, event_tags(member_id)")
            .eq("household_id", value: h)
            .gte("starts_at", value: from.ISO8601Format())
            .lt("starts_at", value: to.ISO8601Format())
            .order("starts_at").execute().value
        async let pattern: [DaycarePattern] = client.from("daycare_pattern").select().eq("household_id", value: h).execute().value
        async let overrides: [DaycareOverride] = client.from("daycare_overrides").select()
            .eq("household_id", value: h).gte("day", value: fromKey).lte("day", value: toKey).execute().value
        async let chores: [Chore] = client.from("chores").select()
            .eq("household_id", value: h).eq("active", value: true).order("sort").execute().value
        async let completions: [ChoreCompletion] = client.from("chore_completions")
            .select("chore_id, day, completed_by, chores!inner(household_id)")
            .eq("chores.household_id", value: h).gte("day", value: DayKey.key(DayKey.addDays(-7, to: today)))
            .execute().value
        async let stores: [GroceryStore] = client.from("stores").select().eq("household_id", value: h).order("sort").execute().value
        async let groceries: [GroceryItem] = client.from("grocery_items").select()
            .eq("household_id", value: h).order("created_at").execute().value
        async let stats: [StoreStat] = client.from("store_stats").select().eq("household_id", value: h).execute().value
        async let meals: [Meal] = client.from("meals").select()
            .eq("household_id", value: h).gte("day", value: fromKey).lte("day", value: toKey).execute().value

        return try await Snapshot(
            household: household, me: me, members: members,
            events: events.map(\.event), pattern: pattern, overrides: overrides,
            chores: chores, completions: completions, stores: stores, groceries: groceries,
            storeStats: stats, meals: meals)
    }

    // MARK: Events

    func saveEvent(_ event: FamilyEvent, isNew: Bool) async throws {
        if isNew {
            try await client.from("events").insert(event).execute()
        } else {
            try await client.from("events").update(event).eq("id", value: event.id.uuidString).execute()
            try await client.from("event_tags").delete().eq("event_id", value: event.id.uuidString).execute()
        }
        if !event.tagIDs.isEmpty {
            let rows = event.tagIDs.map { EventTagRow(eventID: event.id, memberID: $0) }
            try await client.from("event_tags").insert(rows).execute()
        }
    }

    func syncEvent(id: UUID) async -> SyncOutcome {
        do {
            let res: SyncResponse = try await client.functions.invoke(
                "google-calendar-sync",
                options: FunctionInvokeOptions(body: SyncRequest(eventID: id, action: "upsert")))
            switch res.status {
            case "synced": return .synced(invited: res.invited ?? [])
            case "skipped": return .skipped
            default: return .failed(res.error ?? "Calendar sync failed")
            }
        } catch {
            return .failed(error.localizedDescription)
        }
    }

    func deleteEvent(_ event: FamilyEvent) async throws {
        // The function removes it from Google (and notifies invitees) and deletes the row.
        do {
            let _: SyncResponse = try await client.functions.invoke(
                "google-calendar-sync",
                options: FunctionInvokeOptions(body: SyncRequest(eventID: event.id, action: "delete")))
        } catch {
            // Function not deployed or Google unreachable: still delete locally.
            try await client.from("events").delete().eq("id", value: event.id.uuidString).execute()
        }
    }

    // MARK: Daycare

    func upsertOverride(_ override: DaycareOverride) async throws {
        try await client.from("daycare_overrides").upsert(override, onConflict: "household_id,day").execute()
    }

    func deleteOverride(householdID: UUID, day: String) async throws {
        try await client.from("daycare_overrides").delete()
            .eq("household_id", value: householdID.uuidString).eq("day", value: day).execute()
    }

    // MARK: Chores

    func setChore(_ chore: Chore, day: String, done: Bool, by member: UUID?) async throws {
        if done {
            try await client.from("chore_completions")
                .upsert(ChoreCompletion(choreID: chore.id, day: day, completedBy: member), onConflict: "chore_id,day")
                .execute()
        } else {
            try await client.from("chore_completions").delete()
                .eq("chore_id", value: chore.id.uuidString).eq("day", value: day).execute()
        }
    }

    // MARK: Groceries

    func addGrocery(_ item: GroceryItem) async throws {
        try await client.from("grocery_items").insert(item).execute()
    }

    func updateGrocery(_ item: GroceryItem) async throws {
        try await client.from("grocery_items").update(item).eq("id", value: item.id.uuidString).execute()
    }

    func deleteGroceries(ids: [UUID]) async throws {
        guard !ids.isEmpty else { return }
        try await client.from("grocery_items").delete().in("id", values: ids.map(\.uuidString)).execute()
    }

    func recordStoreTrip(householdID: UUID, productKey: String, storeID: UUID) async throws {
        try await client.rpc("record_store_trip",
                             params: StoreTripParams(household: householdID, productKey: productKey, store: storeID))
            .execute()
    }

    func lookupUPC(_ upc: String) async throws -> ProductInfo {
        try await client.functions.invoke("upc-lookup", options: FunctionInvokeOptions(body: ["upc": upc]))
    }

    // MARK: Meals & members

    func upsertMeal(_ meal: Meal) async throws {
        try await client.from("meals").upsert(meal, onConflict: "household_id,day").execute()
    }

    func updateMember(_ member: Member) async throws {
        try await client.from("members").update(MemberEmailUpdate(email: member.email))
            .eq("id", value: member.id.uuidString).execute()
    }

    // MARK: Realtime

    func changes() -> AsyncStream<Void> {
        let client = self.client
        let name = "household-\(householdID?.uuidString ?? "all")"
        return AsyncStream { continuation in
            let task = Task {
                let channel = client.channel(name)
                let stream = channel.postgresChange(AnyAction.self, schema: "public")
                try? await channel.subscribeWithError()
                for await _ in stream {
                    continuation.yield(())
                }
                continuation.finish()
            }
            continuation.onTermination = { _ in
                task.cancel()
                Task { await client.removeAllChannels() }
            }
        }
    }
}

// MARK: - Wire types

private struct EventWire: Decodable {
    let event: FamilyEvent

    private enum Keys: String, CodingKey { case eventTags = "event_tags" }
    private struct TagRef: Decodable {
        let memberID: UUID
        enum CodingKeys: String, CodingKey { case memberID = "member_id" }
    }

    init(from decoder: Decoder) throws {
        var e = try FamilyEvent(from: decoder)
        let c = try decoder.container(keyedBy: Keys.self)
        e.tagIDs = (try c.decodeIfPresent([TagRef].self, forKey: .eventTags) ?? []).map(\.memberID)
        event = e
    }
}

private struct EventTagRow: Encodable {
    let eventID: UUID
    let memberID: UUID
    enum CodingKeys: String, CodingKey {
        case eventID = "event_id"
        case memberID = "member_id"
    }
}

private struct SyncRequest: Encodable {
    let eventID: UUID
    let action: String
    enum CodingKeys: String, CodingKey {
        case eventID = "event_id"
        case action
    }
}

private struct SyncResponse: Decodable {
    let status: String
    let invited: [String]?
    let error: String?
}

private struct StoreTripParams: Encodable {
    let household: UUID
    let productKey: String
    let store: UUID
    enum CodingKeys: String, CodingKey {
        case household = "p_household"
        case productKey = "p_product_key"
        case store = "p_store"
    }
}

private struct MemberEmailUpdate: Encodable {
    let email: String?
    // Encode nil as an explicit null so clearing an email works.
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(email, forKey: .email)
    }
    enum CodingKeys: String, CodingKey { case email }
}
