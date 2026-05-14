import Foundation
import Capacitor

let wakeAlarmSettingsDefaultsKey = "wakeAlarmSettings"

// Capacitor plugin that bridges the JS wake-alarm settings to WakeAlarmManager.
// JS interface:
//   WakeAlarmPlugin.requestPermission() → { granted: boolean }
//   WakeAlarmPlugin.scheduleAlarms({ settings: WakeAlarmSettings }) → { scheduled: boolean }
//   WakeAlarmPlugin.cancelAlarms() → void
//   WakeAlarmPlugin.getPermissionStatus() → { status: "granted"|"denied"|"notDetermined" }

@objc(WakeAlarmPlugin)
@preconcurrency
public class WakeAlarmPlugin: CAPPlugin, CAPBridgedPlugin {
    public nonisolated let identifier = "WakeAlarmPlugin"
    public nonisolated let jsName = "WakeAlarmPlugin"
    public nonisolated let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scheduleAlarms", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelAlarms", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPermissionStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startChallenge", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getChallengeStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "dismissChallenge", returnType: CAPPluginReturnPromise),
    ]

    @objc func requestPermission(_ call: CAPPluginCall) {
        Task { @MainActor in
            let granted = await WakeAlarmManager.shared.requestPermission()
            call.resolve(["granted": granted])
        }
    }

    @objc func scheduleAlarms(_ call: CAPPluginCall) {
        guard let settingsDict = call.getObject("settings") else {
            call.reject("settings object is required")
            return
        }

        do {
            let data = try JSONSerialization.data(withJSONObject: settingsDict)
            let settings = try JSONDecoder().decode(WakeAlarmSettings.self, from: data)
            UserDefaults.standard.set(String(data: data, encoding: .utf8), forKey: wakeAlarmSettingsDefaultsKey)

            Task { @MainActor in
                do {
                    try await WakeAlarmManager.shared.scheduleAlarms(from: settings)
                    call.resolve(["scheduled": true])
                } catch {
                    call.reject("Failed to schedule alarms: \(error.localizedDescription)")
                }
            }
        } catch {
            call.reject("Invalid settings: \(error.localizedDescription)")
        }
    }

    @objc func cancelAlarms(_ call: CAPPluginCall) {
        Task { @MainActor in
            UserDefaults.standard.removeObject(forKey: wakeAlarmSettingsDefaultsKey)
            WakeAlarmManager.shared.cancelAllAlarms()
            call.resolve()
        }
    }

    @objc func getPermissionStatus(_ call: CAPPluginCall) {
        Task {
            let settings = await UNUserNotificationCenter.current().notificationSettings()
            let status: String
            switch settings.authorizationStatus {
            case .authorized, .ephemeral, .provisional: status = "granted"
            case .denied: status = "denied"
            default: status = "notDetermined"
            }
            call.resolve(["status": status])
        }
    }

    @objc func startChallenge(_ call: CAPPluginCall) {
        guard let settingsDict = call.getObject("settings") else {
            call.reject("settings object is required")
            return
        }

        do {
            let data = try JSONSerialization.data(withJSONObject: settingsDict)
            let settings = try JSONDecoder().decode(WakeAlarmSettings.self, from: data)

            Task { @MainActor in
                do {
                    let snapshot = try await WakeChallengeManager.shared.startChallenge(from: settings)
                    call.resolve(["status": serialise(snapshot: snapshot)])
                } catch {
                    call.reject("Failed to start challenge: \(error.localizedDescription)")
                }
            }
        } catch {
            call.reject("Invalid settings: \(error.localizedDescription)")
        }
    }

    @objc func getChallengeStatus(_ call: CAPPluginCall) {
        Task { @MainActor in
            let snapshot = WakeChallengeManager.shared.currentSnapshot()
            call.resolve(["status": serialise(snapshot: snapshot)])
        }
    }

    @objc func dismissChallenge(_ call: CAPPluginCall) {
        Task { @MainActor in
            WakeChallengeManager.shared.dismissChallenge(force: true)
            call.resolve()
        }
    }

    private func serialise(snapshot: WakeChallengeSnapshot) -> [String: Any] {
        [
            "active": snapshot.active,
            "completed": snapshot.completed,
            "missionType": snapshot.missionType,
            "effectiveMissionType": snapshot.effectiveMissionType,
            "target": snapshot.target,
            "progress": snapshot.progress,
            "strictMode": snapshot.strictMode,
            "message": snapshot.message,
            "startedAt": snapshot.startedAt?.ISO8601Format() as Any,
            "completedAt": snapshot.completedAt?.ISO8601Format() as Any,
        ]
    }
}
