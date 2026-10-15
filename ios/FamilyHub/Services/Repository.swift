import Foundation

/// Data access for the household. Two implementations:
/// - `DemoRepository`: in-memory sample data, used when Secrets.plist is missing.
/// - `SupabaseRepository`: the real backend.
protocol Repository: AnyObject {
    var isDemo: Bool { get }

    func loadSnapshot() async throws -> Snapshot

    func saveEvent(_ event: FamilyEvent, isNew: Bool) async throws
    /// Pushes the event to the family Google Calendar and sends invites.
    func syncEvent(id: UUID) async -> SyncOutcome
    func deleteEvent(_ event: FamilyEvent) async throws

    func upsertOverride(_ override: DaycareOverride) async throws
    func deleteOverride(householdID: UUID, day: String) async throws

    func setChore(_ chore: Chore, day: String, done: Bool, by member: UUID?) async throws

    func addGrocery(_ item: GroceryItem) async throws
    func updateGrocery(_ item: GroceryItem) async throws
    func deleteGroceries(ids: [UUID]) async throws
    func recordStoreTrip(householdID: UUID, productKey: String, storeID: UUID) async throws
    func lookupUPC(_ upc: String) async throws -> ProductInfo

    func upsertMeal(_ meal: Meal) async throws
    func updateMember(_ member: Member) async throws

    /// Emits whenever another phone changes household data.
    func changes() -> AsyncStream<Void>
}
