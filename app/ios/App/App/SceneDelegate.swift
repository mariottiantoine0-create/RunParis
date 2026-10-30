import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        // RunParis (D-86) : fond de carte du design system derrière la page pendant son chargement, pour éviter un flash blanc
        let mapBg = UIColor { trait in
            trait.userInterfaceStyle == .dark
                ? UIColor(red: 0x12 / 255.0, green: 0x14 / 255.0, blue: 0x17 / 255.0, alpha: 1)
                : UIColor(red: 0xF4 / 255.0, green: 0xF4 / 255.0, blue: 0xF2 / 255.0, alpha: 1)
        }
        window = UIWindow(windowScene: windowScene)
        window?.backgroundColor = mapBg
        window?.rootViewController = MainViewController() // PerfectRun : enregistre le plugin de l’Activité en direct (D-100)
        window?.makeKeyAndVisible()
        if let webView = (window?.rootViewController as? CAPBridgeViewController)?.webView {
            webView.backgroundColor = mapBg
            webView.scrollView.backgroundColor = mapBg
        }

        // PerfectRun (retour du 29/10) : capture d'écran pendant qu'une sortie est affichée, la page propose l'image à partager
        NotificationCenter.default.addObserver(forName: UIApplication.userDidTakeScreenshotNotification, object: nil, queue: .main) { [weak self] _ in
            (self?.window?.rootViewController as? CAPBridgeViewController)?.webView?.evaluateJavaScript("window.prShot && window.prShot()", completionHandler: nil)
        }

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    // PerfectRun (retour du 26/10) : la feuille de partage reste ouverte quand on part dans Instagram, WhatsApp…
    // Si on a quitté l'app pendant qu'elle était affichée, on la ferme au retour et on prévient la page.
    private var sharedAway = false
    private func topController() -> UIViewController? {
        var c = window?.rootViewController
        while let p = c?.presentedViewController { c = p }
        return c
    }
    func sceneDidEnterBackground(_ scene: UIScene) {
        sharedAway = topController() is UIActivityViewController
    }
    func sceneDidBecomeActive(_ scene: UIScene) {
        guard sharedAway else { return }
        sharedAway = false
        if let sheet = topController() as? UIActivityViewController {
            sheet.dismiss(animated: true) {
                (self.window?.rootViewController as? CAPBridgeViewController)?.webView?.evaluateJavaScript("window.prShared && window.prShared()", completionHandler: nil)
            }
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
