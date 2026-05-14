import Foundation
import UIKit
import UserNotifications
import CoreMotion

extension Notification.Name {
    static let wakeChallengeDidUpdate = Notification.Name("wakeChallengeDidUpdate")
}

struct WakeChallengeSnapshot: Codable {
    let active: Bool
    let completed: Bool
    let missionType: String
    let effectiveMissionType: String
    let target: Int
    let progress: Int
    let strictMode: Bool
    let message: String
    let startedAt: Date?
    let completedAt: Date?
}

@MainActor
final class WakeChallengeManager: NSObject {
    static let shared = WakeChallengeManager()

    private let pedometer = CMPedometer()
    private let motionManager = CMMotionManager()
    private let challengeStateKey = "wakeChallengeState"
    private let wakeCheckNotificationId = "wake-alarm-recheck"
    private var currentSettings: WakeAlarmSettings?
    private var motionProgress = 0
    private var lastMotionPeakAt: Date?
    private weak var presentedController: WakeChallengeViewController?

    private(set) var snapshot = WakeChallengeSnapshot(
        active: false,
        completed: false,
        missionType: "steps",
        effectiveMissionType: "steps",
        target: 0,
        progress: 0,
        strictMode: false,
        message: "No wake challenge active.",
        startedAt: nil,
        completedAt: nil
    )

    private override init() {
        super.init()
        restoreSnapshot()
    }

    func startChallenge(from settings: WakeAlarmSettings) async throws -> WakeChallengeSnapshot {
        stopSensors()
        currentSettings = settings
        motionProgress = 0
        lastMotionPeakAt = nil

        let effectiveMissionType = effectiveMissionType(for: settings.missionType)

        switch effectiveMissionType {
        case "steps":
            guard CMPedometer.isStepCountingAvailable() else {
                throw NSError(
                    domain: "WakeChallenge",
                    code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "Step counting is not available on this device."]
                )
            }
        default:
            guard motionManager.isDeviceMotionAvailable else {
                throw NSError(
                    domain: "WakeChallenge",
                    code: 2,
                    userInfo: [NSLocalizedDescriptionKey: "Motion tracking is not available on this device."]
                )
            }
        }

        snapshot = WakeChallengeSnapshot(
            active: true,
            completed: false,
            missionType: settings.missionType,
            effectiveMissionType: effectiveMissionType,
            target: settings.challengeTarget,
            progress: 0,
            strictMode: settings.strictMode,
            message: challengeMessage(
                missionType: settings.missionType,
                effectiveMissionType: effectiveMissionType,
                target: settings.challengeTarget
            ),
            startedAt: Date(),
            completedAt: nil
        )

        persistSnapshot()
        presentChallengeIfNeeded()

        switch effectiveMissionType {
        case "steps":
            pedometer.startUpdates(from: Date()) { [weak self] data, _ in
                guard let self, let steps = data?.numberOfSteps.intValue else { return }
                Task { @MainActor in
                    self.updateProgress(steps)
                }
            }
        default:
            motionManager.deviceMotionUpdateInterval = 0.12
            motionManager.startDeviceMotionUpdates(to: .main) { [weak self] motion, _ in
                guard let self, let motion else { return }
                Task { @MainActor in
                    self.processMotionSample(motion)
                }
            }
        }

        return snapshot
    }

    func currentSnapshot() -> WakeChallengeSnapshot {
        snapshot
    }

    func dismissChallenge(force: Bool = false) {
        if snapshot.active && snapshot.strictMode && !snapshot.completed && !force {
            return
        }

        stopSensors()
        snapshot = WakeChallengeSnapshot(
            active: false,
            completed: snapshot.completed,
            missionType: snapshot.missionType,
            effectiveMissionType: snapshot.effectiveMissionType,
            target: snapshot.target,
            progress: snapshot.progress,
            strictMode: snapshot.strictMode,
            message: snapshot.completed ? "Wake challenge complete." : "Wake challenge dismissed.",
            startedAt: snapshot.startedAt,
            completedAt: snapshot.completedAt
        )
        persistSnapshot()
        dismissPresentedController()
    }

    func handleNotificationActivation() async {
        guard
            let encoded = UserDefaults.standard.string(forKey: wakeAlarmSettingsDefaultsKey),
            let data = encoded.data(using: String.Encoding.utf8),
            let settings = try? JSONDecoder().decode(WakeAlarmSettings.self, from: data)
        else { return }

        try? await startChallenge(from: settings)
    }

    private func updateProgress(_ nextProgress: Int) {
        let clampedProgress = min(snapshot.target, max(0, nextProgress))
        snapshot = WakeChallengeSnapshot(
            active: !snapshot.completed,
            completed: snapshot.completed,
            missionType: snapshot.missionType,
            effectiveMissionType: snapshot.effectiveMissionType,
            target: snapshot.target,
            progress: clampedProgress,
            strictMode: snapshot.strictMode,
            message: snapshot.message,
            startedAt: snapshot.startedAt,
            completedAt: snapshot.completedAt
        )
        persistSnapshot()

        if clampedProgress >= snapshot.target {
            completeChallenge()
        }
    }

    private func completeChallenge() {
        stopSensors()

        snapshot = WakeChallengeSnapshot(
            active: false,
            completed: true,
            missionType: snapshot.missionType,
            effectiveMissionType: snapshot.effectiveMissionType,
            target: snapshot.target,
            progress: snapshot.target,
            strictMode: snapshot.strictMode,
            message: "Wake challenge complete.",
            startedAt: snapshot.startedAt,
            completedAt: Date()
        )
        persistSnapshot()
        scheduleWakeCheckIfNeeded()

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in
            self?.dismissPresentedController()
        }
    }

    private func presentChallengeIfNeeded() {
        if let controller = presentedController {
            controller.render(snapshot: snapshot)
            return
        }

        guard let presenter = topViewController() else { return }

        let controller = WakeChallengeViewController()
        controller.modalPresentationStyle = .fullScreen
        presentedController = controller
        presenter.present(controller, animated: true)
    }

    private func dismissPresentedController() {
        let controller = presentedController
        presentedController = nil
        controller?.dismiss(animated: true)
    }

    private func stopSensors() {
        pedometer.stopUpdates()
        motionManager.stopDeviceMotionUpdates()
    }

    private func persistSnapshot() {
        if let encoded = try? JSONEncoder().encode(snapshot) {
            UserDefaults.standard.set(encoded, forKey: challengeStateKey)
        }
        NotificationCenter.default.post(name: .wakeChallengeDidUpdate, object: nil)
    }

    private func restoreSnapshot() {
        guard
            let data = UserDefaults.standard.data(forKey: challengeStateKey),
            let decoded = try? JSONDecoder().decode(WakeChallengeSnapshot.self, from: data)
        else { return }
        snapshot = decoded
    }

    private func scheduleWakeCheckIfNeeded() {
        guard let settings = currentSettings else { return }
        guard settings.wakeUpCheckMinutes > 0 else { return }

        let content = UNMutableNotificationContent()
        content.title = "Wake-Up Check"
        content.body = "Stay awake. Confirm with another \(followUpChallengeLabel(for: settings.missionType))."
        content.sound = .default
        content.interruptionLevel = .timeSensitive
        content.userInfo = ["wakeChallenge": true, "kind": "recheck"]

        let trigger = UNTimeIntervalNotificationTrigger(
            timeInterval: TimeInterval(settings.wakeUpCheckMinutes * 60),
            repeats: false
        )

        let request = UNNotificationRequest(
            identifier: wakeCheckNotificationId,
            content: content,
            trigger: trigger
        )

        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [wakeCheckNotificationId])
        UNUserNotificationCenter.current().add(request)
    }

    private func effectiveMissionType(for missionType: String) -> String {
        switch missionType {
        case "steps":
            return "steps"
        default:
            return "motion"
        }
    }

    private func challengeMessage(
        missionType: String,
        effectiveMissionType: String,
        target: Int
    ) -> String {
        if effectiveMissionType == "steps" {
            return "Walk \(target) steps to verify you are awake."
        }

        switch missionType {
        case "jumping_jacks":
            return "Complete \(target) jumping jacks with the phone moving with you."
        case "push_ups":
            return "Complete \(target) push-ups with the phone moving with you."
        default:
            return "Complete \(target) strong motion reps to verify you are awake."
        }
    }

    private func followUpChallengeLabel(for missionType: String) -> String {
        switch missionType {
        case "steps":
            return "step challenge"
        case "jumping_jacks":
            return "jumping jack challenge"
        case "push_ups":
            return "push-up challenge"
        default:
            return "wake challenge"
        }
    }

    private func processMotionSample(_ motion: CMDeviceMotion) {
        let acceleration = motion.userAcceleration
        let magnitude = sqrt(
            acceleration.x * acceleration.x +
            acceleration.y * acceleration.y +
            acceleration.z * acceleration.z
        )

        let now = Date()
        let threshold = 1.05
        let debounce: TimeInterval = 0.7

        guard magnitude >= threshold else { return }
        guard lastMotionPeakAt == nil || now.timeIntervalSince(lastMotionPeakAt!) >= debounce else { return }

        lastMotionPeakAt = now
        motionProgress += 1
        updateProgress(motionProgress)
    }

    private func topViewController(base: UIViewController? = nil) -> UIViewController? {
        let root =
            base ??
            UIApplication.shared
                .connectedScenes
                .compactMap { $0 as? UIWindowScene }
                .flatMap(\.windows)
                .first(where: \.isKeyWindow)?
                .rootViewController

        if let navigation = root as? UINavigationController {
            return topViewController(base: navigation.visibleViewController)
        }

        if let tab = root as? UITabBarController, let selected = tab.selectedViewController {
            return topViewController(base: selected)
        }

        if let presented = root?.presentedViewController {
            return topViewController(base: presented)
        }

        return root
    }
}
