import Foundation

/// Date helpers. The family lives in one time zone, so the phone's calendar is the source of truth.
enum DayKey {
    static var calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.firstWeekday = 2 // Monday
        c.timeZone = .current
        return c
    }()

    private static let keyFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func key(_ date: Date) -> String { keyFormatter.string(from: date) }
    static func date(_ key: String) -> Date? { keyFormatter.date(from: key) }

    static func startOfDay(_ date: Date) -> Date { calendar.startOfDay(for: date) }

    static func addDays(_ n: Int, to date: Date) -> Date {
        calendar.date(byAdding: .day, value: n, to: date) ?? date
    }

    /// ISO weekday: 1 = Monday … 7 = Sunday.
    static func isoWeekday(_ date: Date) -> Int {
        let w = calendar.component(.weekday, from: date) // 1 = Sunday
        return w == 1 ? 7 : w - 1
    }

    static func startOfWeek(_ date: Date) -> Date {
        addDays(-(isoWeekday(date) - 1), to: startOfDay(date))
    }

    static func week(containing date: Date) -> [Date] {
        let start = startOfWeek(date)
        return (0..<7).map { addDays($0, to: start) }
    }

    static func isSameDay(_ a: Date, _ b: Date) -> Bool { calendar.isDate(a, inSameDayAs: b) }

    /// Combines a day with a Postgres time string like "07:30:00".
    static func at(_ time: String, on day: Date) -> Date {
        let parts = time.split(separator: ":").compactMap { Int($0) }
        return calendar.date(bySettingHour: parts.first ?? 0, minute: parts.count > 1 ? parts[1] : 0,
                             second: 0, of: day) ?? day
    }

    static func at(hour: Int, minute: Int, on day: Date) -> Date {
        calendar.date(bySettingHour: hour, minute: minute, second: 0, of: day) ?? day
    }

    // Display formatters
    static let weekdayShort: DateFormatter = make("EEE")
    static let weekdayLong: DateFormatter = make("EEEE")
    static let dayNumber: DateFormatter = make("d")
    static let monthDay: DateFormatter = make("MMM d")
    static let headerDate: DateFormatter = make("EEEE, MMM d")
    static let clock: DateFormatter = make("h:mm")
    static let ampm: DateFormatter = make("a")

    private static func make(_ format: String) -> DateFormatter {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US")
        f.dateFormat = format
        return f
    }
}
