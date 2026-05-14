import UIKit
import Capacitor
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {}

    func applicationDidEnterBackground(_ application: UIApplication) {}

    func applicationWillEnterForeground(_ application: UIApplication) {}

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Re-sync alarm schedule when returning to foreground in case settings
        // were changed while the web view was backgrounded.
        syncWakeAlarmsIfNeeded()
    }

    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound, .badge])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let identifier = response.notification.request.identifier

        if identifier.hasPrefix("wake-alarm-") || identifier == "wake-alarm-recheck" {
            Task { @MainActor in
                await WakeChallengeManager.shared.handleNotificationActivation()
                completionHandler()
            }
            return
        }

        completionHandler()
    }

    // MARK: - Wake alarm sync

    private func syncWakeAlarmsIfNeeded() {
        guard
            let encoded = UserDefaults.standard.string(forKey: "wakeAlarmSettings"),
            let data = encoded.data(using: .utf8),
            let settings = try? JSONDecoder().decode(WakeAlarmSettings.self, from: data)
        else { return }

        Task { @MainActor in
            try? await WakeAlarmManager.shared.scheduleAlarms(from: settings)
        }
    }
}
