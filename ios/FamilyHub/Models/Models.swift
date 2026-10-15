import Foundation

// Mirrors the Supabase tables in supabase/migrations. Dates that are Postgres
// `date` columns are kept as "yyyy-MM-dd" strings (see DayKey) to avoid time-zone drift.

struct Household: Codable, Identifiable, Hashable {
    var id: UUID
    var name: String
    var inviteCode: String
    var timezone: String

    enum CodingKeys: String, CodingKey {
        case id, name, timezone
        case inviteCode = "invite_code"
    }
}

enum MemberKind: String, Codable, Hashable {
    case adult, child, pets, grandparent
}

struct Member: Codable, Identifiable, Hashable {
    var id: UUID
    var householdID: UUID
    var userID: UUID?
    var name: String
    var shortName: String
    var kind: MemberKind
    var color: String
    var email: String?
    var sort: Int

    /// Only adults with an email get calendar invites; everyone else is tag-only.
    var getsInvites: Bool { kind == .adult && !(email ?? "").trimmingCharacters(in: .whitespaces).isEmpty }
    var initial: String { String(name.prefix(1)) }

    enum CodingKeys: String, CodingKey {
        case id, name, kind, color, email, sort
        case householdID = "household_id"
        case userID = "user_id"
        case shortName = "short_name"
    }
}

struct FamilyEvent: Codable, Identifiable, Hashable {
    var id: UUID
    var householdID: UUID
    var title: String
    var note: String?
    var startsAt: Date
    var endsAt: Date?
    var allDay: Bool
    var source: String = "manual"
    var syncStatus: String = "pending"
    var createdBy: UUID?
    /// Filled from event_tags; not a column on `events`.
    var tagIDs: [UUID] = []

    enum CodingKeys: String, CodingKey {
        case id, title, note, source
        case householdID = "household_id"
        case startsAt = "starts_at"
        case endsAt = "ends_at"
        case allDay = "all_day"
        case syncStatus = "sync_status"
        case createdBy = "created_by"
    }
}

struct DaycarePattern: Codable, Hashable {
    var householdID: UUID
    var weekday: Int            // ISO 1 = Monday … 7 = Sunday
    var dropMember: UUID?
    var pickMember: UUID?
    var dropTime: String        // "07:30:00"
    var pickTime: String

    enum CodingKeys: String, CodingKey {
        case weekday
        case householdID = "household_id"
        case dropMember = "drop_member"
        case pickMember = "pick_member"
        case dropTime = "drop_time"
        case pickTime = "pick_time"
    }
}

struct DaycareOverride: Codable, Hashable {
    var householdID: UUID
    var day: String             // yyyy-MM-dd
    var dropMember: UUID?
    var pickMember: UUID?
    var sleepoverMember: UUID?
    var closed: Bool = false
    var note: String?
    var updatedBy: UUID?

    enum CodingKeys: String, CodingKey {
        case day, closed, note
        case householdID = "household_id"
        case dropMember = "drop_member"
        case pickMember = "pick_member"
        case sleepoverMember = "sleepover_member"
        case updatedBy = "updated_by"
    }
}

struct Chore: Codable, Identifiable, Hashable {
    var id: UUID
    var householdID: UUID
    var title: String
    var memberID: UUID
    var points: Int
    var cadence: String         // daily | weekdays | weekly
    var weekday: Int?
    var active: Bool
    var sort: Int

    enum CodingKeys: String, CodingKey {
        case id, title, points, cadence, weekday, active, sort
        case householdID = "household_id"
        case memberID = "member_id"
    }
}

struct ChoreCompletion: Codable, Hashable {
    var choreID: UUID
    var day: String
    var completedBy: UUID?

    enum CodingKeys: String, CodingKey {
        case day
        case choreID = "chore_id"
        case completedBy = "completed_by"
    }
}

struct GroceryStore: Codable, Identifiable, Hashable {
    var id: UUID
    var householdID: UUID
    var name: String
    var color: String
    var sort: Int

    enum CodingKeys: String, CodingKey {
        case id, name, color, sort
        case householdID = "household_id"
    }
}

struct GroceryItem: Codable, Identifiable, Hashable {
    var id: UUID
    var householdID: UUID
    var name: String
    var productKey: String
    var upc: String?
    var storeID: UUID?
    var checked: Bool
    var checkedAt: Date?
    var addedBy: UUID?

    enum CodingKeys: String, CodingKey {
        case id, name, upc, checked
        case householdID = "household_id"
        case productKey = "product_key"
        case storeID = "store_id"
        case checkedAt = "checked_at"
        case addedBy = "added_by"
    }

    static func key(for name: String) -> String {
        name.lowercased()
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }
}

struct StoreStat: Codable, Hashable {
    var householdID: UUID
    var productKey: String
    var storeID: UUID
    var trips: Int

    enum CodingKeys: String, CodingKey {
        case trips
        case householdID = "household_id"
        case productKey = "product_key"
        case storeID = "store_id"
    }
}

struct Meal: Codable, Hashable {
    var householdID: UUID
    var day: String
    var title: String
    var cookMember: UUID?
    var cookLabel: String?

    enum CodingKeys: String, CodingKey {
        case day, title
        case householdID = "household_id"
        case cookMember = "cook_member"
        case cookLabel = "cook_label"
    }
}

// Write nil as JSON null so clearing a field (note, sleepover, cook, store…) actually clears it
// on update/upsert. The synthesized encoder would omit nil keys and leave old values in place.
extension FamilyEvent {
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id); try c.encode(householdID, forKey: .householdID)
        try c.encode(title, forKey: .title); try c.encode(note, forKey: .note)
        try c.encode(startsAt, forKey: .startsAt); try c.encode(endsAt, forKey: .endsAt)
        try c.encode(allDay, forKey: .allDay); try c.encode(source, forKey: .source)
        try c.encode(syncStatus, forKey: .syncStatus); try c.encode(createdBy, forKey: .createdBy)
    }
}

extension DaycareOverride {
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(householdID, forKey: .householdID); try c.encode(day, forKey: .day)
        try c.encode(dropMember, forKey: .dropMember); try c.encode(pickMember, forKey: .pickMember)
        try c.encode(sleepoverMember, forKey: .sleepoverMember); try c.encode(closed, forKey: .closed)
        try c.encode(note, forKey: .note); try c.encode(updatedBy, forKey: .updatedBy)
    }
}

extension GroceryItem {
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id); try c.encode(householdID, forKey: .householdID)
        try c.encode(name, forKey: .name); try c.encode(productKey, forKey: .productKey)
        try c.encode(upc, forKey: .upc); try c.encode(storeID, forKey: .storeID)
        try c.encode(checked, forKey: .checked); try c.encode(checkedAt, forKey: .checkedAt)
        try c.encode(addedBy, forKey: .addedBy)
    }
}

extension Meal {
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(householdID, forKey: .householdID); try c.encode(day, forKey: .day)
        try c.encode(title, forKey: .title); try c.encode(cookMember, forKey: .cookMember)
        try c.encode(cookLabel, forKey: .cookLabel)
    }
}

struct ProductInfo: Codable, Hashable {
    var upc: String
    var name: String?
    var brand: String?
    var found: Bool
}

/// Everything the phone needs, loaded in one go.
struct Snapshot {
    var household: Household
    var me: Member?
    var members: [Member] = []
    var events: [FamilyEvent] = []
    var pattern: [DaycarePattern] = []
    var overrides: [DaycareOverride] = []
    var chores: [Chore] = []
    var completions: [ChoreCompletion] = []
    var stores: [GroceryStore] = []
    var groceries: [GroceryItem] = []
    var storeStats: [StoreStat] = []
    var meals: [Meal] = []
}

enum SyncOutcome: Equatable {
    case synced(invited: [String])
    case skipped
    case failed(String)
}
