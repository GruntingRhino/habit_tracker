import Foundation
import UserNotifications

// Schedules wake alarms with UNUserNotificationCenter.
// Settings come from /api/wake-alarm and are passed in by WakeAlarmPlugin.

@MainActor
final class WakeAlarmManager {

    static let shared = WakeAlarmManager()
    private init() {}

    // MARK: - Public API

    func requestPermission() async -> Bool {
        let center = UNUserNotificationCenter.current()
        do {
            return try await center.requestAuthorization(options: [.alert, .sound, .badge])
        } catch {
            return false
        }
    }

    func scheduleAlarms(from settings: WakeAlarmSettings) async throws {
        cancelAllAlarms()
        guard settings.enabled, !settings.repeatDays.isEmpty else { return }
        try await scheduleWithNotifications(settings)
    }

    func cancelAllAlarms() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(
            withIdentifiers: alarmIdentifiers()
        )
    }

    // MARK: - UNUserNotificationCenter fallback

    private func scheduleWithNotifications(_ settings: WakeAlarmSettings) async throws {
        let center = UNUserNotificationCenter.current()

        for day in settings.repeatDays {
            guard let weekday = weekdayNumber(for: day) else { continue }

            let content = UNMutableNotificationContent()
            content.title = "Wake Alarm"
            content.body = missionDescription(settings)
            content.sound = .default
            content.interruptionLevel = .timeSensitive
            content.userInfo = ["wakeChallenge": true, "kind": "alarm"]

            var components = Calendar.current.dateComponents([.hour, .minute], from: alarmDate(for: settings.time))
            components.weekday = weekday

            let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: true)
            let request = UNNotificationRequest(
                identifier: alarmId(day: day),
                content: content,
                trigger: trigger
            )
            try await center.add(request)
        }
    }

    // MARK: - Helpers

    private func alarmDate(for timeString: String) -> Date {
        let parts = timeString.split(separator: ":").compactMap { Int($0) }
        guard parts.count == 2 else { return Date() }
        var comps = Calendar.current.dateComponents([.year, .month, .day], from: Date())
        comps.hour = parts[0]
        comps.minute = parts[1]
        return Calendar.current.date(from: comps) ?? Date()
    }

    private func alarmId(day: String) -> String { "wake-alarm-\(day)" }

    private func alarmIdentifiers() -> [String] {
        ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map { alarmId(day: $0) }
    }

    private func weekdayNumber(for code: String) -> Int? {
        // Calendar weekday: 1=Sun, 2=Mon, 3=Tue, 4=Wed, 5=Thu, 6=Fri, 7=Sat
        ["sun": 1, "mon": 2, "tue": 3, "wed": 4, "thu": 5, "fri": 6, "sat": 7][code]
    }

    private func missionDescription(_ settings: WakeAlarmSettings) -> String {
        switch settings.missionType {
        case "steps":        return "Walk \(settings.challengeTarget) steps to dismiss"
        case "jumping_jacks": return "Do \(settings.challengeTarget) jumping jacks to dismiss"
        case "push_ups":     return "Do \(settings.challengeTarget) push-ups to dismiss"
        default:             return "Complete your wake mission to dismiss"
        }
    }
}

// MARK: - Settings (mirrors src/lib/wake-alarm.ts WakeAlarmSettings)

struct WakeAlarmSettings: Codable {
    let enabled: Bool
    let time: String
    let repeatDays: [String]
    let missionType: String
    let challengeTarget: Int
    let wakeUpCheckMinutes: Int
    let strictMode: Bool
}
