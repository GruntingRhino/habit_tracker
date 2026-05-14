import UIKit

final class WakeChallengeViewController: UIViewController {
    private let titleLabel = UILabel()
    private let messageLabel = UILabel()
    private let progressLabel = UILabel()
    private let progressView = UIProgressView(progressViewStyle: .default)
    private let detailLabel = UILabel()
    private let closeButton = UIButton(type: .system)

    override func viewDidLoad() {
        super.viewDidLoad()
        configureView()
        configureLayout()
        render(snapshot: WakeChallengeManager.shared.currentSnapshot())

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleChallengeUpdate),
            name: .wakeChallengeDidUpdate,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc private func handleChallengeUpdate() {
        render(snapshot: WakeChallengeManager.shared.currentSnapshot())
    }

    @objc private func handleCloseTapped() {
        WakeChallengeManager.shared.dismissChallenge(force: true)
    }

    func render(snapshot: WakeChallengeSnapshot) {
        titleLabel.text = snapshot.completed ? "Wake Check Passed" : "Wake Challenge"
        messageLabel.text = snapshot.message
        progressLabel.text = "\(snapshot.progress) / \(max(snapshot.target, 1))"
        progressView.progress = snapshot.target > 0
            ? Float(snapshot.progress) / Float(snapshot.target)
            : 0

        let verificationLabel =
            snapshot.effectiveMissionType == "steps"
            ? "Verification mode: step count"
            : "Verification mode: motion count"

        detailLabel.text =
            snapshot.completed
            ? "Challenge complete. The app will dismiss this screen automatically."
            : verificationLabel

        closeButton.isHidden = snapshot.strictMode && snapshot.active && !snapshot.completed
        closeButton.setTitle(snapshot.completed ? "Done" : "Dismiss", for: .normal)
        closeButton.backgroundColor = snapshot.completed
            ? UIColor.systemGreen.withAlphaComponent(0.25)
            : UIColor.white.withAlphaComponent(0.12)
    }

    private func configureView() {
        view.backgroundColor = UIColor(red: 0.04, green: 0.07, blue: 0.14, alpha: 1)

        titleLabel.font = .systemFont(ofSize: 32, weight: .bold)
        titleLabel.textColor = .white
        titleLabel.textAlignment = .center

        messageLabel.font = .systemFont(ofSize: 20, weight: .semibold)
        messageLabel.textColor = UIColor(red: 0.89, green: 0.93, blue: 0.98, alpha: 1)
        messageLabel.textAlignment = .center
        messageLabel.numberOfLines = 0

        progressLabel.font = .monospacedDigitSystemFont(ofSize: 28, weight: .bold)
        progressLabel.textColor = UIColor(red: 0.38, green: 0.72, blue: 0.98, alpha: 1)
        progressLabel.textAlignment = .center

        progressView.progressTintColor = UIColor(red: 0.22, green: 0.55, blue: 0.99, alpha: 1)
        progressView.trackTintColor = UIColor.white.withAlphaComponent(0.12)
        progressView.transform = CGAffineTransform(scaleX: 1, y: 6)

        detailLabel.font = .systemFont(ofSize: 15, weight: .medium)
        detailLabel.textColor = UIColor(red: 0.65, green: 0.72, blue: 0.82, alpha: 1)
        detailLabel.textAlignment = .center
        detailLabel.numberOfLines = 0

        closeButton.setTitleColor(.white, for: .normal)
        closeButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        closeButton.layer.cornerRadius = 14
        var configuration = UIButton.Configuration.plain()
        configuration.contentInsets = NSDirectionalEdgeInsets(top: 14, leading: 24, bottom: 14, trailing: 24)
        closeButton.configuration = configuration
        closeButton.addTarget(self, action: #selector(handleCloseTapped), for: .touchUpInside)
    }

    private func configureLayout() {
        let stack = UIStackView(arrangedSubviews: [
            titleLabel,
            messageLabel,
            progressLabel,
            progressView,
            detailLabel,
            closeButton,
        ])

        stack.axis = .vertical
        stack.spacing = 24
        stack.translatesAutoresizingMaskIntoConstraints = false

        view.addSubview(stack)

        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            closeButton.heightAnchor.constraint(greaterThanOrEqualToConstant: 54),
        ])
    }
}
